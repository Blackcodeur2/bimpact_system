import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma, RiskCaseStatus, UserStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app-exception';
import { money } from '../../common/money';
import { afterCursor, toPage } from '../../common/pagination';
import type { RequestContext } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DAY_MS, fullName, requireActor, staffNames } from './backoffice.common';
import type { MemberNoteDto, MembersQueryDto, MemberStatusDto } from './backoffice.dto';

export const OPEN_RISK_STATUSES: RiskCaseStatus[] = ['NEW', 'INVESTIGATING', 'ESCALATED'];

/** Transitions de statut autorisées depuis le back-office. */
const STATUS_TRANSITIONS: Partial<Record<UserStatus, UserStatus[]>> = {
  ACTIVE: ['SUSPENDED'],
  LOCKED: ['ACTIVE', 'SUSPENDED'],
  SUSPENDED: ['ACTIVE'],
};

/** Gestion des conducteurs (cahier §8.2) : recherche, fiche, suspension, notes internes. */
@Injectable()
export class MembersAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: MembersQueryDto) {
    const q = query.q;
    const digits = q?.replace(/\D/g, '') ?? '';
    const profileFilter: Prisma.ProfileWhereInput = {
      ...(query.kycStatus ? { kycStatus: query.kycStatus } : {}),
      ...(query.city ? { city: { equals: query.city, mode: 'insensitive' } } : {}),
    };
    const rows = await this.prisma.user.findMany({
      where: {
        kind: 'MEMBER',
        status: query.status,
        ...(Object.keys(profileFilter).length > 0 ? { profile: profileFilter } : {}),
        ...(q
          ? {
              AND: [
                {
                  OR: [
                    ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
                    { profile: { firstName: { contains: q, mode: 'insensitive' as const } } },
                    { profile: { lastName: { contains: q, mode: 'insensitive' as const } } },
                  ],
                },
              ],
            }
          : {}),
        ...afterCursor(query.cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: { profile: true },
    });

    const ids = rows.slice(0, query.limit).map((row) => row.id);
    const since = new Date(Date.now() - 30 * DAY_MS);
    const [accounts, paid, risks] = await Promise.all([
      this.prisma.ledgerAccount.findMany({
        where: { ownerUserId: { in: ids }, purpose: 'MEMBER_AVAILABLE' },
        select: { ownerUserId: true, balance: true, currency: true },
      }),
      this.prisma.contribution.groupBy({ by: ['userId'], where: { userId: { in: ids }, paidAt: { gte: since } }, _count: true }),
      this.prisma.riskCase.groupBy({ by: ['userId'], where: { userId: { in: ids }, status: { in: OPEN_RISK_STATUSES } }, _count: true }),
    ]);
    const balances = new Map(accounts.map((a) => [a.ownerUserId, money(a.balance, a.currency)]));
    const paidDays = new Map(paid.map((p) => [p.userId, p._count]));
    const openRisks = new Map(risks.map((r) => [r.userId, r._count]));
    const now = Date.now();

    return toPage(rows, query.limit, (row) => ({
      id: row.id,
      name: fullName(row.profile),
      phone: row.phone,
      city: row.profile?.city ?? null,
      zone: row.profile?.zone ?? null,
      status: row.status,
      kycStatus: row.profile?.kycStatus ?? 'NOT_STARTED',
      balance: balances.get(row.id) ?? null,
      paidDaysLast30: paidDays.get(row.id) ?? 0,
      openRiskCases: openRisks.get(row.id) ?? 0,
      locked: Boolean(row.lockedUntil && row.lockedUntil.getTime() > now),
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
    }));
  }

  async get(id: string, ctx: RequestContext) {
    const user = await this.prisma.user.findFirst({
      where: { id, kind: 'MEMBER' },
      include: {
        profile: true,
        kycProfile: { select: { id: true, status: true, submittedAt: true, reviewedAt: true, riskFlags: true, lastDecisionReason: true } },
        contributionPlan: true,
        beneficiary: { include: { draw: { select: { id: true, code: true, title: true } } } },
        solidarityMembership: true,
      },
    });
    if (!user) throw notFound();
    const now = new Date();
    const since = new Date(now.getTime() - 30 * DAY_MS);

    const [
      accounts,
      paidDaysLast30,
      contributionTotals,
      certificate,
      projects,
      accidents,
      tickets,
      completedLessons,
      devices,
      activeSessions,
      notes,
      payments,
      riskCases,
    ] = await Promise.all([
      this.prisma.ledgerAccount.findMany({ where: { ownerUserId: id }, select: { purpose: true, balance: true, currency: true } }),
      this.prisma.contribution.count({ where: { userId: id, paidAt: { gte: since } } }),
      this.prisma.contribution.aggregate({ where: { userId: id }, _count: true, _sum: { amount: true } }),
      this.prisma.certification.findFirst({ where: { userId: id }, orderBy: { issuedAt: 'desc' } }),
      this.prisma.project.findMany({ where: { userId: id }, orderBy: { updatedAt: 'desc' }, take: 5, select: { id: true, title: true, status: true, updatedAt: true } }),
      this.prisma.accidentClaim.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, reference: true, status: true, createdAt: true } }),
      this.prisma.supportTicket.findMany({ where: { userId: id }, orderBy: { lastMessageAt: 'desc' }, take: 5, select: { id: true, reference: true, subject: true, status: true, lastMessageAt: true } }),
      this.prisma.userLessonProgress.count({ where: { userId: id, isCompleted: true } }),
      this.prisma.device.findMany({ where: { userId: id }, orderBy: { lastSeenAt: 'desc' }, take: 10 }),
      this.prisma.session.count({ where: { userId: id, revokedAt: null, expiresAt: { gt: now } } }),
      this.prisma.memberNote.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.paymentIntent.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 5 }),
      this.prisma.riskCase.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, reference: true, status: true, signalType: true, createdAt: true },
      }),
    ]);
    const authors = await staffNames(this.prisma, notes.map((note) => note.authorId));
    const balance = (purpose: string) => {
      const account = accounts.find((a) => a.purpose === purpose);
      return account ? money(account.balance, account.currency) : null;
    };

    // Consulter la fiche complète d'un membre (téléphone, appareils, finances) est tracé.
    await this.audit.record({ action: 'member.viewed', resourceType: 'user', resourceId: id }, ctx);

    return {
      id: user.id,
      phone: user.phone,
      status: user.status,
      lockedUntil: user.lockedUntil && user.lockedUntil > now ? user.lockedUntil : null,
      failedLoginCount: user.failedLoginCount,
      phoneVerifiedAt: user.phoneVerifiedAt,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      profile: {
        firstName: user.profile?.firstName ?? null,
        lastName: user.profile?.lastName ?? null,
        city: user.profile?.city ?? null,
        zone: user.profile?.zone ?? null,
      },
      kyc: user.kycProfile
        ? { ...user.kycProfile }
        : { id: null, status: user.profile?.kycStatus ?? 'NOT_STARTED', submittedAt: null, reviewedAt: null, riskFlags: [], lastDecisionReason: null },
      wallet: { available: balance('MEMBER_AVAILABLE'), reserved: balance('MEMBER_RESERVED') },
      contributions: {
        plan: user.contributionPlan
          ? { status: user.contributionPlan.status, autoDebit: user.contributionPlan.autoDebit, amount: money(user.contributionPlan.amount), startedOn: user.contributionPlan.startedOn }
          : null,
        paidDaysLast30,
        totalCount: contributionTotals._count,
        totalAmount: money(contributionTotals._sum.amount ?? 0),
      },
      program: {
        beneficiary: user.beneficiary
          ? { id: user.beneficiary.id, status: user.beneficiary.status, mentorName: user.beneficiary.mentorName, selectedAt: user.beneficiary.selectedAt, draw: user.beneficiary.draw }
          : null,
        completedLessons,
        certificate: certificate
          ? { id: certificate.id, certificateNumber: certificate.certificateNumber, issuedAt: certificate.issuedAt, revokedAt: certificate.revokedAt }
          : null,
        solidarity: user.solidarityMembership
          ? { status: user.solidarityMembership.status, joinedAt: user.solidarityMembership.joinedAt, leftAt: user.solidarityMembership.leftAt }
          : null,
      },
      projects,
      accidents,
      tickets,
      payments: payments.map((payment) => ({
        id: payment.id,
        status: payment.status,
        channel: payment.channel,
        amount: money(payment.amount, payment.currency),
        createdAt: payment.createdAt,
      })),
      security: {
        activeSessions,
        devices: devices.map((device) => ({
          id: device.id,
          platform: device.platform,
          model: device.model,
          appVersion: device.appVersion,
          lastSeenAt: device.lastSeenAt,
          revokedAt: device.revokedAt,
        })),
      },
      riskCases,
      notes: notes.map((note) => ({ id: note.id, body: note.body, authorId: note.authorId, authorName: authors.get(note.authorId) ?? null, createdAt: note.createdAt })),
    };
  }

  async setStatus(id: string, dto: MemberStatusDto, ctx: RequestContext) {
    requireActor(ctx);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
      const user = await tx.user.findFirst({ where: { id, kind: 'MEMBER' }, select: { status: true } });
      if (!user) throw notFound();
      if (user.status === dto.status) return;
      if (!STATUS_TRANSITIONS[user.status]?.includes(dto.status)) {
        throw new AppException(HttpStatus.CONFLICT, 'MEMBER_INVALID_STATUS', 'Changement de statut impossible pour ce compte.', {
          from: user.status,
          to: dto.status,
        });
      }
      await tx.user.update({
        where: { id },
        data: { status: dto.status, ...(dto.status === 'ACTIVE' ? { lockedUntil: null, failedLoginCount: 0 } : {}) },
      });
      let revokedSessions = 0;
      if (dto.status === 'SUSPENDED') {
        revokedSessions = (
          await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'ADMIN' } })
        ).count;
      }
      await this.audit.record(
        {
          action: 'member.status.changed',
          resourceType: 'user',
          resourceId: id,
          before: { status: user.status },
          after: { status: dto.status },
          metadata: { reason: dto.reason, revokedSessions },
        },
        ctx,
        tx,
      );
    });
    return this.get(id, ctx);
  }

  async unlock(id: string, ctx: RequestContext) {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({ where: { id, kind: 'MEMBER' }, select: { lockedUntil: true, status: true } });
      if (!user) throw notFound();
      await tx.user.update({
        where: { id },
        data: { lockedUntil: null, failedLoginCount: 0, ...(user.status === 'LOCKED' ? { status: 'ACTIVE' } : {}) },
      });
      await this.audit.record({ action: 'member.unlocked', resourceType: 'user', resourceId: id, before: { lockedUntil: user.lockedUntil, status: user.status } }, ctx, tx);
    });
    return this.get(id, ctx);
  }

  async addNote(id: string, dto: MemberNoteDto, ctx: RequestContext) {
    const authorId = requireActor(ctx);
    const member = await this.prisma.user.findFirst({ where: { id, kind: 'MEMBER' }, select: { id: true } });
    if (!member) throw notFound();
    await this.prisma.$transaction(async (tx) => {
      const note = await tx.memberNote.create({ data: { userId: id, authorId, body: dto.body } });
      // Le contenu reste dans member_notes (immuable) ; l'audit ne duplique pas un texte potentiellement sensible.
      await this.audit.record(
        { action: 'member.note.added', resourceType: 'member_note', resourceId: note.id, metadata: { userId: id, length: dto.body.length } },
        ctx,
        tx,
      );
    });
    const notes = await this.prisma.memberNote.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 50 });
    const authors = await staffNames(this.prisma, notes.map((note) => note.authorId));
    return { items: notes.map((note) => ({ id: note.id, body: note.body, authorId: note.authorId, authorName: authors.get(note.authorId) ?? null, createdAt: note.createdAt })) };
  }
}

function notFound() {
  return new AppException(HttpStatus.NOT_FOUND, 'MEMBER_NOT_FOUND', 'Conducteur introuvable.');
}
