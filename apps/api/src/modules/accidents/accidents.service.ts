import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { AccidentClaim, AccidentClaimStatus, AccidentDocType, Prisma } from '@prisma/client';
import { randomCode, withUniqueRetry } from '../../common/codes';
import { AppException } from '../../common/errors/app-exception';
import { Decimal, formatXaf, money } from '../../common/money';
import { afterCursor, toPage } from '../../common/pagination';
import type { RequestContext } from '../../common/request-context';
import { PrismaService, Tx } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationInput, NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { SolidarityService } from '../solidarity/solidarity.service';
import type { UploadedFileLike } from '../storage/file-types';
import { PrivateUploadService } from '../storage/private-upload.service';
import type {
  AdminClaimsQueryDto,
  ApproveClaimDto,
  ClaimMessageDto,
  ClaimReasonDto,
  CloseClaimDto,
  InvestigateClaimDto,
  ReportAccidentDto,
} from './accidents.dto';

const DAY_MS = 86_400_000;
/** Délai maximum pour déclarer un accident. */
export const MAX_REPORT_AGE_DAYS = 90;
/** Le membre peut compléter son dossier tant que le comité n'a pas décidé. */
const MEMBER_EDITABLE: AccidentClaimStatus[] = ['SUBMITTED', 'DOCUMENTS_PENDING', 'INVESTIGATING'];

export const DOCUMENT_LABELS: Record<AccidentDocType, string> = {
  BULLETIN_ENTREE: 'bulletin d’entrée à l’hôpital',
  ORDONNANCE: 'ordonnance',
  FACTURE_HOPITAL: 'facture',
  CONSTAT_POLICE: 'constat de police',
  PHOTO_MOTO: 'photo de la moto',
  AUTRE: 'autre justificatif',
};

const claimInclude = {
  documents: { orderBy: { createdAt: 'asc' } },
  events: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.AccidentClaimInclude;
type ClaimWithRelations = Prisma.AccidentClaimGetPayload<{ include: typeof claimInclude }>;

/**
 * Déclarations d'accident et décisions du comité (cahier §7.21-7.22, §8.13).
 * Une déclaration ne vaut jamais accord : l'aide éventuelle est décidée par le comité puis versée
 * par le fonds de solidarité volontaire quand le membre y était couvert et que les collectes sont activées.
 */
@Injectable()
export class AccidentsService {
  private readonly logger = new Logger(AccidentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly uploads: PrivateUploadService,
    private readonly notifications: NotificationsService,
    private readonly solidarity: SolidarityService,
    private readonly settings: SettingsService,
  ) {}

  // ───────────────────────────── Membre ─────────────────────────────

  async listMine(userId: string) {
    const claims = await this.prisma.accidentClaim.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { _count: { select: { documents: true } } },
    });
    return {
      items: claims.map((claim) => ({ ...summaryView(claim), documentsCount: claim._count.documents })),
    };
  }

  async getMine(id: string, userId: string) {
    const claim = await this.prisma.accidentClaim.findFirst({ where: { id, userId }, include: claimInclude });
    if (!claim) throw notFound();
    return this.memberView(claim);
  }

  async report(userId: string, dto: ReportAccidentDto, ctx: RequestContext) {
    const now = Date.now();
    if (dto.date.getTime() > now + 5 * 60_000) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'ACCIDENT_DATE_IN_FUTURE', 'La date de l’accident ne peut pas être dans le futur.');
    }
    if (dto.date.getTime() < now - MAX_REPORT_AGE_DAYS * DAY_MS) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'ACCIDENT_TOO_OLD',
        `Un accident doit être déclaré dans les ${MAX_REPORT_AGE_DAYS} jours.`,
      );
    }
    const solidarityEligible = await this.solidarity.isCoveredAt(userId, dto.date);

    const claim = await withUniqueRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const created = await tx.accidentClaim.create({
          data: {
            userId,
            reference: `ACC-${new Date().getFullYear()}-${randomCode(6)}`,
            date: dto.date,
            location: dto.location,
            severity: dto.severity,
            thirdPartyInvolved: dto.thirdPartyInvolved ?? false,
            hospitalName: dto.hospitalName || null,
            description: dto.description,
            requestedAmount: dto.requestedAmount,
            solidarityEligible,
          },
        });
        await addEvent(tx, created.id, { type: 'SUBMITTED', status: 'SUBMITTED', actorType: 'MEMBER', actorId: userId, message: 'Déclaration enregistrée.' });
        await this.audit.record(
          {
            action: 'accident.reported',
            resourceType: 'accident_claim',
            resourceId: created.id,
            after: { reference: created.reference, severity: created.severity, requestedAmount: dto.requestedAmount, solidarityEligible },
          },
          ctx,
          tx,
        );
        return created;
      }),
    );

    await this.notify(userId, {
      type: 'ACCIDENT_REPORTED',
      title: 'Déclaration reçue',
      body: `Votre déclaration ${claim.reference} est enregistrée. Ajoutez vos justificatifs pour faciliter l’examen du dossier.`,
      deepLink: `/accidents/${claim.id}`,
    });
    return this.getMine(claim.id, userId);
  }

  async uploadDocument(id: string, userId: string, type: AccidentDocType, file: UploadedFileLike | undefined, ctx: RequestContext) {
    const claim = await this.prisma.accidentClaim.findFirst({ where: { id, userId } });
    if (!claim) throw notFound();
    assertMemberEditable(claim.status);
    const stored = await this.uploads.store(file, ['image/jpeg', 'image/png', 'application/pdf']);

    await this.prisma.$transaction(async (tx) => {
      const current = await lock(tx, id);
      assertMemberEditable(current.status);
      const document = await tx.claimDocument.create({ data: { claimId: id, type, ...stored, uploadedById: userId } });
      const reopened = current.status === 'DOCUMENTS_PENDING';
      if (reopened) await tx.accidentClaim.update({ where: { id }, data: { status: 'SUBMITTED' } });
      await addEvent(tx, id, {
        type: 'DOCUMENT_ADDED',
        status: reopened ? 'SUBMITTED' : null,
        actorType: 'MEMBER',
        actorId: userId,
        message: `Pièce ajoutée : ${DOCUMENT_LABELS[type]}.`,
      });
      await this.audit.record(
        {
          action: 'accident.document.uploaded',
          resourceType: 'claim_document',
          resourceId: document.id,
          metadata: { claimId: id, type, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes, sha256: stored.sha256, scanStatus: stored.scanStatus },
        },
        ctx,
        tx,
      );
    });
    return this.getMine(id, userId);
  }

  async addMessage(id: string, userId: string, dto: ClaimMessageDto, ctx: RequestContext) {
    await this.prisma.$transaction(async (tx) => {
      const current = await lock(tx, id);
      if (current.userId !== userId) throw notFound();
      assertMemberEditable(current.status);
      const reopened = current.status === 'DOCUMENTS_PENDING';
      if (reopened) await tx.accidentClaim.update({ where: { id }, data: { status: 'SUBMITTED' } });
      await addEvent(tx, id, { type: 'MEMBER_MESSAGE', status: reopened ? 'SUBMITTED' : null, actorType: 'MEMBER', actorId: userId, message: dto.message });
      await this.audit.record({ action: 'accident.message.added', resourceType: 'accident_claim', resourceId: id }, ctx, tx);
    });
    return this.getMine(id, userId);
  }

  // ───────────────────────────── Comité ─────────────────────────────

  async adminList(query: AdminClaimsQueryDto) {
    const rows = await this.prisma.accidentClaim.findMany({
      where: { ...(query.status ? { status: query.status } : {}), ...afterCursor(query.cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: {
        _count: { select: { documents: true } },
        user: { select: { phone: true, profile: { select: { firstName: true, lastName: true, city: true } } } },
      },
    });
    return toPage(rows, query.limit, (claim) => ({
      ...summaryView(claim),
      documentsCount: claim._count.documents,
      solidarityEligible: claim.solidarityEligible,
      member: {
        userId: claim.userId,
        phone: claim.user.phone,
        firstName: claim.user.profile?.firstName ?? null,
        lastName: claim.user.profile?.lastName ?? null,
        city: claim.user.profile?.city ?? null,
      },
    }));
  }

  async adminGet(id: string, ctx?: RequestContext) {
    const claim = await this.prisma.accidentClaim.findUnique({
      where: { id },
      include: {
        ...claimInclude,
        user: {
          select: {
            phone: true,
            profile: { select: { firstName: true, lastName: true, city: true, kycStatus: true } },
            solidarityMembership: { select: { status: true, joinedAt: true, leftAt: true } },
          },
        },
      },
    });
    if (!claim) throw notFound();
    if (ctx) {
      await this.audit.record({ action: 'accident.claim.viewed', resourceType: 'accident_claim', resourceId: id }, ctx);
    }
    return {
      ...this.memberView(claim),
      internalNotes: claim.internalNotes,
      decidedById: claim.decidedById,
      decidedAt: claim.decidedAt,
      member: {
        userId: claim.userId,
        phone: claim.user.phone,
        firstName: claim.user.profile?.firstName ?? null,
        lastName: claim.user.profile?.lastName ?? null,
        city: claim.user.profile?.city ?? null,
        kycStatus: claim.user.profile?.kycStatus ?? null,
        solidarityMembership: claim.user.solidarityMembership,
      },
    };
  }

  async requestDocuments(id: string, dto: ClaimReasonDto, ctx: RequestContext) {
    const claim = await this.transition(id, ['SUBMITTED', 'INVESTIGATING'], ctx, (current, actorId) => ({
      data: { status: 'DOCUMENTS_PENDING', reviewNotes: dto.reason },
      event: { type: 'DOCUMENTS_REQUESTED', status: 'DOCUMENTS_PENDING', actorType: 'STAFF', actorId, message: dto.reason },
      action: 'accident.documents_requested',
    }));
    await this.notify(claim.userId, {
      type: 'ACCIDENT_DOCUMENTS_REQUESTED',
      title: 'Justificatifs demandés',
      body: `Dossier ${claim.reference} : ${dto.reason}`,
      deepLink: `/accidents/${id}`,
    });
    return this.adminGet(id);
  }

  async investigate(id: string, dto: InvestigateClaimDto, ctx: RequestContext) {
    const claim = await this.transition(id, ['SUBMITTED', 'DOCUMENTS_PENDING'], ctx, (current, actorId) => ({
      data: { status: 'INVESTIGATING', internalNotes: appendNote(current.internalNotes, dto.internalNote, actorId) },
      event: { type: 'INVESTIGATION_STARTED', status: 'INVESTIGATING', actorType: 'STAFF', actorId, message: 'Votre dossier est en cours d’examen.' },
      action: 'accident.investigation_started',
    }));
    await this.notify(claim.userId, {
      type: 'ACCIDENT_UNDER_REVIEW',
      title: 'Dossier en cours d’examen',
      body: `Le comité examine votre dossier ${claim.reference}.`,
      deepLink: `/accidents/${id}`,
    });
    return this.adminGet(id);
  }

  async approve(id: string, dto: ApproveClaimDto, ctx: RequestContext) {
    const approvedAmount = new Decimal(dto.approvedAmount);
    const maxAssistance = await this.settings.amount('solidarity.max_assistance_amount');
    const claim = await this.transition(id, ['SUBMITTED', 'INVESTIGATING'], ctx, (current, actorId) => {
      if (approvedAmount.gt(current.requestedAmount)) {
        throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'ACCIDENT_AMOUNT_ABOVE_REQUEST', 'Le montant accordé dépasse le montant demandé.');
      }
      if (approvedAmount.gt(maxAssistance)) {
        throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'ACCIDENT_AMOUNT_ABOVE_CAP', 'Le montant accordé dépasse le plafond d’aide.', {
          maxAssistance: money(maxAssistance),
        });
      }
      return {
        data: {
          status: 'APPROVED',
          approvedAmount,
          reviewNotes: dto.reason,
          internalNotes: appendNote(current.internalNotes, dto.internalNote, actorId),
          decidedById: actorId,
          decidedAt: new Date(),
        },
        event: {
          type: 'APPROVED',
          status: 'APPROVED',
          actorType: 'STAFF',
          actorId,
          message: `Aide accordée : ${formatXaf(approvedAmount)}. ${dto.reason}`,
        },
        action: 'accident.approved',
      };
    });
    await this.notify(claim.userId, {
      type: 'ACCIDENT_APPROVED',
      title: 'Aide accordée',
      body: `Le comité a accordé ${formatXaf(approvedAmount)} pour votre dossier ${claim.reference}.`,
      deepLink: `/accidents/${id}`,
    });

    const rules = await this.solidarity.rules();
    if (claim.solidarityEligible && rules.collectionsEnabled) {
      try {
        return await this.disburse(id, ctx);
      } catch (error) {
        // La décision reste acquise ; le versement pourra être relancé par le comité.
        this.logger.error({ err: error, claimId: id }, 'Versement solidaire non effectué après approbation');
      }
    }
    return this.adminGet(id);
  }

  /** Versement par le fonds de solidarité ; peut être relancé sans double versement. */
  async disburse(id: string, ctx: RequestContext) {
    requireActor(ctx);
    const claim = await this.prisma.accidentClaim.findUnique({ where: { id } });
    if (!claim) throw notFound();
    if (claim.status === 'DISBURSED') return this.adminGet(id);
    if (claim.status !== 'APPROVED') throw invalidStatus(claim.status);
    if (!claim.solidarityEligible) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'SOLIDARITY_NOT_APPLICABLE',
        'Le membre n’était pas couvert par le fonds de solidarité à la date de l’accident.',
      );
    }

    const result = await this.solidarity.fundAssistance(
      { id: claim.id, reference: claim.reference, userId: claim.userId, approvedAmount: claim.approvedAmount!, decidedAt: claim.decidedAt! },
      ctx,
    );
    const disbursed = new Decimal(result.disbursed.amount);
    const partial = disbursed.lt(claim.approvedAmount!);

    await this.prisma.$transaction(async (tx) => {
      const current = await lock(tx, id);
      if (current.status !== 'APPROVED') return;
      if (disbursed.gt(0)) {
        await tx.accidentClaim.update({ where: { id }, data: { status: 'DISBURSED', disbursedAmount: disbursed } });
        await addEvent(tx, id, {
          type: 'DISBURSED',
          status: 'DISBURSED',
          actorType: 'SYSTEM',
          actorId: null,
          message: `${formatXaf(disbursed)} versés sur votre portefeuille par le fonds de solidarité.${partial ? ' Le fonds ne permettait pas de verser la totalité de l’aide accordée.' : ''}`,
        });
      } else {
        await addEvent(tx, id, {
          type: 'DISBURSEMENT_PENDING',
          status: null,
          actorType: 'SYSTEM',
          actorId: null,
          message: 'Le fonds de solidarité ne dispose pas encore des montants nécessaires : le versement sera effectué dès que possible.',
        });
      }
      await this.audit.record(
        { action: 'accident.disbursement', resourceType: 'accident_claim', resourceId: id, metadata: { ...result } },
        ctx,
        tx,
      );
    });

    if (disbursed.gt(0)) {
      await this.notify(claim.userId, {
        type: 'ACCIDENT_DISBURSED',
        title: 'Aide versée',
        body: `${formatXaf(disbursed)} ont été versés sur votre portefeuille (dossier ${claim.reference}).`,
        deepLink: `/accidents/${id}`,
      });
    }
    return this.adminGet(id);
  }

  async reject(id: string, dto: ClaimReasonDto, ctx: RequestContext) {
    const claim = await this.transition(id, ['SUBMITTED', 'DOCUMENTS_PENDING', 'INVESTIGATING'], ctx, (current, actorId) => ({
      data: { status: 'REJECTED', reviewNotes: dto.reason, decidedById: actorId, decidedAt: new Date() },
      event: { type: 'REJECTED', status: 'REJECTED', actorType: 'STAFF', actorId, message: dto.reason },
      action: 'accident.rejected',
    }));
    await this.notify(claim.userId, {
      type: 'ACCIDENT_REJECTED',
      title: 'Dossier non retenu',
      body: `Dossier ${claim.reference} : ${dto.reason}`,
      deepLink: `/accidents/${id}`,
    });
    return this.adminGet(id);
  }

  async close(id: string, dto: CloseClaimDto, ctx: RequestContext) {
    await this.transition(id, ['APPROVED', 'DISBURSED', 'REJECTED'], ctx, (current, actorId) => ({
      data: { status: 'CLOSED' },
      event: { type: 'CLOSED', status: 'CLOSED', actorType: 'STAFF', actorId, message: dto.reason ?? 'Dossier clôturé.' },
      action: 'accident.closed',
    }));
    return this.adminGet(id);
  }

  // ───────────────────────────── Interne ─────────────────────────────

  /** Transition verrouillée : statut attendu, pas de décision sur son propre dossier, évènement et audit dans la même transaction. */
  private async transition(
    id: string,
    from: AccidentClaimStatus[],
    ctx: RequestContext,
    build: (
      current: AccidentClaim,
      actorId: string,
    ) => { data: Prisma.AccidentClaimUpdateInput & { status: AccidentClaimStatus }; event: EventInput; action: string },
  ): Promise<AccidentClaim> {
    const actorId = requireActor(ctx);
    return this.prisma.$transaction(async (tx) => {
      const current = await lock(tx, id);
      if (!from.includes(current.status)) throw invalidStatus(current.status, from);
      if (current.userId === actorId) {
        throw new AppException(HttpStatus.FORBIDDEN, 'ACCIDENT_SELF_DECISION', 'Vous ne pouvez pas traiter votre propre dossier.');
      }
      const { data, event, action } = build(current, actorId);
      const updated = await tx.accidentClaim.update({ where: { id }, data });
      await addEvent(tx, id, event);
      await this.audit.record(
        {
          action,
          resourceType: 'accident_claim',
          resourceId: id,
          before: { status: current.status },
          after: { status: updated.status, approvedAmount: updated.approvedAmount },
        },
        ctx,
        tx,
      );
      return updated;
    });
  }

  private memberView(claim: ClaimWithRelations) {
    return {
      ...summaryView(claim),
      thirdPartyInvolved: claim.thirdPartyInvolved,
      hospitalName: claim.hospitalName,
      description: claim.description,
      decisionReason: claim.reviewNotes,
      solidarityEligible: claim.solidarityEligible,
      canAddDocuments: MEMBER_EDITABLE.includes(claim.status),
      documents: claim.documents.map((document) => this.uploads.view(document)),
      timeline: claim.events.map((event) => ({
        id: event.id,
        type: event.type,
        status: event.status,
        message: event.message,
        actorType: event.actorType,
        createdAt: event.createdAt,
      })),
    };
  }

  private async notify(userId: string, input: NotificationInput) {
    await this.notifications
      .notify(userId, input)
      .catch((error: unknown) => this.logger.warn({ err: error, userId, type: input.type }, 'Notification accident non envoyée'));
  }
}

interface EventInput {
  type: string;
  status: AccidentClaimStatus | null;
  actorType: 'MEMBER' | 'STAFF' | 'SYSTEM';
  actorId: string | null;
  message: string | null;
}

function summaryView(claim: AccidentClaim) {
  return {
    id: claim.id,
    reference: claim.reference,
    date: claim.date,
    location: claim.location,
    severity: claim.severity,
    status: claim.status,
    requestedAmount: money(claim.requestedAmount),
    approvedAmount: claim.approvedAmount ? money(claim.approvedAmount) : null,
    disbursedAmount: claim.disbursedAmount ? money(claim.disbursedAmount) : null,
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt,
  };
}

async function lock(tx: Tx, id: string): Promise<AccidentClaim> {
  await tx.$queryRaw`SELECT id FROM accident_claims WHERE id = ${id}::uuid FOR UPDATE`;
  const claim = await tx.accidentClaim.findUnique({ where: { id } });
  if (!claim) throw notFound();
  return claim;
}

function addEvent(tx: Tx, claimId: string, event: EventInput) {
  return tx.accidentClaimEvent.create({ data: { claimId, ...event } });
}

function appendNote(existing: string | null, note: string | undefined, actorId: string): string | null {
  if (!note) return existing;
  const line = `[${new Date().toISOString()}] ${actorId} : ${note}`;
  return existing ? `${existing}\n${line}` : line;
}

function assertMemberEditable(status: AccidentClaimStatus) {
  if (!MEMBER_EDITABLE.includes(status)) {
    throw new AppException(HttpStatus.CONFLICT, 'ACCIDENT_CLAIM_LOCKED', 'Ce dossier a déjà été traité et ne peut plus être complété.', { status });
  }
}

function invalidStatus(status: AccidentClaimStatus, expected?: AccidentClaimStatus[]) {
  return new AppException(HttpStatus.CONFLICT, 'ACCIDENT_INVALID_STATUS', 'Action impossible dans l’état actuel du dossier.', { status, expected });
}

function notFound() {
  return new AppException(HttpStatus.NOT_FOUND, 'CLAIM_NOT_FOUND', 'Dossier introuvable.');
}

function requireActor(ctx: RequestContext): string {
  const actor = ctx.auth?.userId;
  if (!actor) throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Authentification requise.');
  return actor;
}
