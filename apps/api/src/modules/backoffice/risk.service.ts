import { HttpStatus, Injectable } from '@nestjs/common';
import type { RiskCaseStatus } from '@prisma/client';
import { randomCode, withUniqueRetry } from '../../common/codes';
import { AppException } from '../../common/errors/app-exception';
import { afterCursor, toPage } from '../../common/pagination';
import type { RequestContext } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DAY_MS, fullName, maskIdentifier, requireActor, staffNames } from './backoffice.common';
import type { OpenRiskCaseDto, RiskCaseActionDto, RiskCasesQueryDto } from './backoffice.dto';
import { OPEN_RISK_STATUSES } from './members-admin.service';

/** Règles de détection : calculées à la demande sur les données réelles, sans score opaque. */
export const RISK_RULES = [
  {
    code: 'SHARED_DEVICE',
    label: 'Appareil partagé',
    description: 'Une même installation de l’application est utilisée par plusieurs comptes membres.',
    threshold: '≥ 2 comptes',
  },
  {
    code: 'DUPLICATE_ID_DOCUMENT',
    label: 'Pièce d’identité réutilisée',
    description: 'Le même numéro de pièce figure dans les dossiers d’identité de plusieurs comptes.',
    threshold: '≥ 2 comptes',
  },
  {
    code: 'REPEATED_LOCKOUTS',
    label: 'Verrouillages répétés',
    description: 'Le compte a été verrouillé plusieurs fois après des codes PIN erronés.',
    threshold: '≥ 2 verrouillages en 30 jours',
  },
  {
    code: 'PAYMENT_FAILURES',
    label: 'Échecs de paiement répétés',
    description: 'Plusieurs rechargements Mobile Money échoués pour le même compte.',
    threshold: '≥ 3 échecs en 7 jours',
  },
] as const;

const TRANSITIONS: Record<RiskCaseStatus, RiskCaseStatus[]> = {
  NEW: ['INVESTIGATING', 'ESCALATED', 'RESOLVED', 'FALSE_POSITIVE'],
  INVESTIGATING: ['ESCALATED', 'RESOLVED', 'FALSE_POSITIVE'],
  ESCALATED: ['INVESTIGATING', 'RESOLVED', 'FALSE_POSITIVE'],
  RESOLVED: [],
  FALSE_POSITIVE: [],
};

const ACTION_TARGET: Partial<Record<RiskCaseActionDto['action'], RiskCaseStatus>> = {
  INVESTIGATE: 'INVESTIGATING',
  ESCALATE: 'ESCALATED',
  RESOLVE: 'RESOLVED',
  FALSE_POSITIVE: 'FALSE_POSITIVE',
};

interface SignalRow {
  key: string;
  user_ids: string[];
  count: number;
  last_seen: Date;
}

/** Fraude & risque (cahier §8.14) : signaux, dossiers et chronologie documentée. */
@Injectable()
export class RiskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  rules() {
    return { items: RISK_RULES };
  }

  async signals() {
    const now = Date.now();
    const [sharedDevices, duplicateIds, lockouts, paymentFailures] = await Promise.all([
      this.prisma.$queryRaw<SignalRow[]>`
        SELECT d.installation_id AS key, array_agg(DISTINCT d.user_id::text) AS user_ids,
               COUNT(DISTINCT d.user_id)::int AS count, MAX(d.last_seen_at) AS last_seen
        FROM devices d JOIN users u ON u.id = d.user_id
        WHERE u.kind = 'MEMBER'
        GROUP BY d.installation_id HAVING COUNT(DISTINCT d.user_id) > 1
        ORDER BY last_seen DESC LIMIT 50`,
      this.prisma.$queryRaw<SignalRow[]>`
        SELECT upper(k.id_document_number) AS key, array_agg(DISTINCT k.user_id::text) AS user_ids,
               COUNT(DISTINCT k.user_id)::int AS count, MAX(k.updated_at) AS last_seen
        FROM kyc_profiles k
        WHERE k.id_document_number IS NOT NULL AND k.id_document_number <> ''
        GROUP BY upper(k.id_document_number) HAVING COUNT(DISTINCT k.user_id) > 1
        ORDER BY last_seen DESC LIMIT 50`,
      this.prisma.$queryRaw<SignalRow[]>`
        SELECT a.resource_id AS key, ARRAY[a.resource_id] AS user_ids, COUNT(*)::int AS count, MAX(a.created_at) AS last_seen
        FROM audit_logs a
        WHERE a.action = 'auth.login.locked' AND a.resource_id IS NOT NULL
          AND a.created_at >= ${new Date(now - 30 * DAY_MS).toISOString()}::timestamp
        GROUP BY a.resource_id HAVING COUNT(*) >= 2
        ORDER BY last_seen DESC LIMIT 50`,
      this.prisma.$queryRaw<SignalRow[]>`
        SELECT p.user_id::text AS key, ARRAY[p.user_id::text] AS user_ids, COUNT(*)::int AS count, MAX(p.created_at) AS last_seen
        FROM payment_intents p
        WHERE p.status = 'FAILED' AND p.created_at >= ${new Date(now - 7 * DAY_MS).toISOString()}::timestamp
        GROUP BY p.user_id HAVING COUNT(*) >= 3
        ORDER BY last_seen DESC LIMIT 50`,
    ]);

    const userIds = [...new Set([sharedDevices, duplicateIds, lockouts, paymentFailures].flat().flatMap((row) => row.user_ids))];
    const [members, openCases] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, phone: true, status: true, profile: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.riskCase.findMany({
        where: { userId: { in: userIds }, status: { in: OPEN_RISK_STATUSES } },
        select: { id: true, reference: true, status: true, userId: true, signalType: true },
      }),
    ]);
    const memberById = new Map(members.map((member) => [member.id, member]));

    const toItems = (type: string, rows: SignalRow[], maskKey = false) =>
      rows.map((row) => ({
        type,
        key: maskKey ? maskIdentifier(row.key) : row.key,
        count: row.count,
        lastSeenAt: row.last_seen,
        members: row.user_ids.map((id) => {
          const member = memberById.get(id);
          return { userId: id, name: fullName(member?.profile), phone: member?.phone ?? null, status: member?.status ?? null };
        }),
        openCases: openCases
          .filter((c) => row.user_ids.includes(c.userId) && c.signalType === type)
          .map((c) => ({ id: c.id, reference: c.reference, status: c.status, userId: c.userId })),
      }));

    return {
      generatedAt: new Date(now),
      items: [
        ...toItems('SHARED_DEVICE', sharedDevices),
        ...toItems('DUPLICATE_ID_DOCUMENT', duplicateIds, true),
        ...toItems('REPEATED_LOCKOUTS', lockouts),
        ...toItems('PAYMENT_FAILURES', paymentFailures),
      ],
    };
  }

  async cases(query: RiskCasesQueryDto) {
    const rows = await this.prisma.riskCase.findMany({
      where: { status: query.status, ...afterCursor(query.cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: { user: { select: { id: true, phone: true, profile: { select: { firstName: true, lastName: true } } } } },
    });
    const names = await staffNames(this.prisma, rows.map((row) => row.assignedToId));
    return toPage(rows, query.limit, (row) => ({
      id: row.id,
      reference: row.reference,
      signalType: row.signalType,
      summary: row.summary,
      status: row.status,
      member: { userId: row.user.id, name: fullName(row.user.profile), phone: row.user.phone },
      assignedToId: row.assignedToId,
      assignedToName: row.assignedToId ? (names.get(row.assignedToId) ?? null) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      closedAt: row.closedAt,
    }));
  }

  async case(id: string) {
    const riskCase = await this.prisma.riskCase.findUnique({
      where: { id },
      include: {
        events: { orderBy: { createdAt: 'asc' } },
        user: { select: { id: true, phone: true, status: true, profile: { select: { firstName: true, lastName: true, city: true } } } },
      },
    });
    if (!riskCase) throw caseNotFound();
    const names = await staffNames(this.prisma, [riskCase.assignedToId, riskCase.createdById, ...riskCase.events.map((event) => event.actorId)]);
    return {
      id: riskCase.id,
      reference: riskCase.reference,
      signalType: riskCase.signalType,
      summary: riskCase.summary,
      status: riskCase.status,
      resolution: riskCase.resolution,
      member: {
        userId: riskCase.user.id,
        name: fullName(riskCase.user.profile),
        phone: riskCase.user.phone,
        status: riskCase.user.status,
        city: riskCase.user.profile?.city ?? null,
      },
      assignedToId: riskCase.assignedToId,
      assignedToName: riskCase.assignedToId ? (names.get(riskCase.assignedToId) ?? null) : null,
      createdById: riskCase.createdById,
      createdByName: names.get(riskCase.createdById) ?? null,
      createdAt: riskCase.createdAt,
      updatedAt: riskCase.updatedAt,
      closedAt: riskCase.closedAt,
      allowedTransitions: TRANSITIONS[riskCase.status],
      events: riskCase.events.map((event) => ({
        id: event.id,
        type: event.type,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        note: event.note,
        actorId: event.actorId,
        actorName: names.get(event.actorId) ?? null,
        createdAt: event.createdAt,
      })),
    };
  }

  async open(dto: OpenRiskCaseDto, ctx: RequestContext) {
    const actorId = requireActor(ctx);
    const member = await this.prisma.user.findFirst({ where: { id: dto.userId, kind: 'MEMBER' }, select: { id: true } });
    if (!member) throw new AppException(HttpStatus.NOT_FOUND, 'MEMBER_NOT_FOUND', 'Conducteur introuvable.');
    const existing = await this.prisma.riskCase.findFirst({
      where: { userId: dto.userId, signalType: dto.signalType, status: { in: OPEN_RISK_STATUSES } },
      select: { id: true, reference: true },
    });
    if (existing && dto.signalType !== 'MANUAL') {
      throw new AppException(HttpStatus.CONFLICT, 'RISK_CASE_ALREADY_OPEN', `Un dossier est déjà ouvert pour ce signal (${existing.reference}).`, {
        caseId: existing.id,
      });
    }
    const created = await withUniqueRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const riskCase = await tx.riskCase.create({
          data: {
            reference: `RSK-${new Date().getFullYear()}-${randomCode(6)}`,
            userId: dto.userId,
            signalType: dto.signalType,
            summary: dto.summary,
            createdById: actorId,
          },
        });
        await tx.riskCaseEvent.create({ data: { caseId: riskCase.id, type: 'OPENED', toStatus: 'NEW', note: dto.summary, actorId } });
        await this.audit.record(
          { action: 'risk.case.opened', resourceType: 'risk_case', resourceId: riskCase.id, after: { userId: dto.userId, signalType: dto.signalType } },
          ctx,
          tx,
        );
        return riskCase;
      }),
    );
    return this.case(created.id);
  }

  async act(id: string, dto: RiskCaseActionDto, ctx: RequestContext) {
    const actorId = requireActor(ctx);
    const target = ACTION_TARGET[dto.action];
    if (dto.action !== 'ASSIGN_SELF' && dto.action !== 'INVESTIGATE' && !dto.note) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'NOTE_REQUIRED', 'Documentez cette action par une note.', {
        fields: { note: ['Note obligatoire pour cette action.'] },
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM risk_cases WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.riskCase.findUnique({ where: { id } });
      if (!current) throw caseNotFound();
      if (TRANSITIONS[current.status].length === 0) {
        throw new AppException(HttpStatus.CONFLICT, 'RISK_CASE_CLOSED', 'Ce dossier est clôturé.');
      }
      if (target && !TRANSITIONS[current.status].includes(target)) {
        throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'RISK_CASE_INVALID_TRANSITION', 'Action impossible dans l’état actuel du dossier.', {
          status: current.status,
          allowed: TRANSITIONS[current.status],
        });
      }
      const closing = target === 'RESOLVED' || target === 'FALSE_POSITIVE';
      await tx.riskCase.update({
        where: { id },
        data: {
          ...(target ? { status: target } : {}),
          ...(dto.action === 'ASSIGN_SELF' || (target === 'INVESTIGATING' && !current.assignedToId) ? { assignedToId: actorId } : {}),
          ...(closing ? { closedAt: new Date(), resolution: dto.note ?? null } : {}),
        },
      });
      await tx.riskCaseEvent.create({
        data: {
          caseId: id,
          type: target ? 'STATUS_CHANGED' : dto.action === 'ASSIGN_SELF' ? 'ASSIGNED' : 'NOTE',
          fromStatus: target ? current.status : null,
          toStatus: target ?? null,
          note: dto.note ?? null,
          actorId,
        },
      });
      await this.audit.record(
        {
          action: `risk.case.${dto.action.toLowerCase()}`,
          resourceType: 'risk_case',
          resourceId: id,
          before: { status: current.status, assignedToId: current.assignedToId },
          after: { status: target ?? current.status },
        },
        ctx,
        tx,
      );
    });
    return this.case(id);
  }
}

function caseNotFound() {
  return new AppException(HttpStatus.NOT_FOUND, 'RISK_CASE_NOT_FOUND', 'Dossier de risque introuvable.');
}
