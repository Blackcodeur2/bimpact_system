import { randomBytes } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Draw, DrawStatus, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app-exception';
import { decodeCursor, encodeCursor } from '../../common/pagination';
import type { RequestContext } from '../../common/request-context';
import { AppConfig } from '../../config/app-config';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { addDays, formatDay, localDay } from '../contributions/contributions.rules';
import { NotificationsService } from '../notifications/notifications.service';
import {
  DRAW_ALGORITHM_VERSION,
  participantToken,
  rankWinners,
  resultHash,
  seedCommitment,
  snapshotHash,
  verifyDraw,
} from './draw.algorithm';
import type { CancelDrawDto, CreateDrawDto, DrawsQueryDto } from './draws.dto';

export interface DrawEligibility {
  eligible: boolean;
  paidDays: number;
  requiredDays: number;
  windowDays: number;
  /** KYC_NOT_APPROVED, NOT_ENOUGH_CONTRIBUTIONS, ALREADY_BENEFICIARY */
  reasons: string[];
}

export interface PublicDrawView {
  id: string;
  code: string;
  title: string;
  status: DrawStatus;
  scheduledAt: Date;
  winnerCount: number;
  minPaidDays: number;
  windowDays: number;
  eligibleCount: number | null;
  snapshotAt: Date | null;
  snapshotHash: string | null;
  seedCommitment: string | null;
  executedAt: Date | null;
  publishedAt: Date | null;
  cancelledAt: Date | null;
}

const OPEN_STATUSES: DrawStatus[] = ['DRAFT', 'FROZEN', 'EXECUTED'];

/**
 * Tirages sécurisés et auditables (cahier §7.11, §8.7, §11).
 * La graine n'est générée qu'au gel (source cryptographique), engagée par son empreinte, et révélée à la publication.
 */
@Injectable()
export class DrawsService {
  private readonly logger = new Logger(DrawsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly config: AppConfig,
  ) {}

  // ───────────────────────────── Membre ─────────────────────────────

  async eligibilityFor(userId: string, rule: { minPaidDays: number; windowDays: number }, asOf = new Date()): Promise<DrawEligibility> {
    const today = localDay(asOf);
    const [profile, beneficiary, paidDays] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId }, select: { kycStatus: true } }),
      this.prisma.beneficiary.findUnique({ where: { userId }, select: { status: true } }),
      this.prisma.contribution.count({
        where: { userId, periodDate: { gte: addDays(today, -(rule.windowDays - 1)), lte: today } },
      }),
    ]);
    const reasons: string[] = [];
    if (profile?.kycStatus !== 'APPROVED') reasons.push('KYC_NOT_APPROVED');
    if (paidDays < rule.minPaidDays) reasons.push('NOT_ENOUGH_CONTRIBUTIONS');
    if (beneficiary && beneficiary.status !== 'WITHDRAWN') reasons.push('ALREADY_BENEFICIARY');
    return { eligible: reasons.length === 0, paidDays, requiredDays: rule.minPaidDays, windowDays: rule.windowDays, reasons };
  }

  async nextForMember(userId: string) {
    const draw = await this.prisma.draw.findFirst({
      where: { status: { in: OPEN_STATUSES } },
      orderBy: { scheduledAt: 'asc' },
    });
    const rule = draw ?? this.defaultRule();
    const [eligibility, entry] = await Promise.all([
      this.eligibilityFor(userId, rule),
      draw ? this.prisma.drawEntry.findUnique({ where: { drawId_userId: { drawId: draw.id, userId } } }) : null,
    ]);
    return {
      draw: draw ? toPublicView(draw) : null,
      eligibility,
      /** Au gel, la liste des participants est figée : `included` indique si le membre en fait partie. */
      participation: draw && draw.status !== 'DRAFT' ? { included: entry !== null, participantToken: entry?.participantToken ?? null } : null,
    };
  }

  async nextSummary(userId: string) {
    const next = await this.nextForMember(userId);
    return {
      nextDraw: next.draw
        ? { id: next.draw.id, code: next.draw.code, title: next.draw.title, scheduledAt: next.draw.scheduledAt, winnerCount: next.draw.winnerCount, status: next.draw.status }
        : null,
      eligibility: next.eligibility,
    };
  }

  async listPublished(query: DrawsQueryDto) {
    return this.page({ status: { in: ['PUBLISHED'] } }, query);
  }

  async getForMember(id: string, userId: string) {
    const draw = await this.findOrThrow(id);
    const entry = await this.prisma.drawEntry.findUnique({
      where: { drawId_userId: { drawId: id, userId } },
      include: { winner: true },
    });
    const published = draw.status === 'PUBLISHED';
    return {
      draw: toPublicView(draw),
      myResult: {
        included: entry !== null,
        participantToken: entry?.participantToken ?? null,
        selected: published ? Boolean(entry?.winner) : null,
        rank: published ? (entry?.winner?.rank ?? null) : null,
      },
    };
  }

  /** Résultats publiés : jetons anonymes des gagnants (aucune donnée personnelle). */
  async results(id: string) {
    const draw = await this.findOrThrow(id);
    if (draw.status !== 'PUBLISHED') {
      throw new AppException(HttpStatus.CONFLICT, 'DRAW_NOT_PUBLISHED', 'Les résultats de ce tirage ne sont pas encore publiés.');
    }
    const winners = await this.prisma.drawWinner.findMany({
      where: { drawId: id },
      orderBy: { rank: 'asc' },
      include: { entry: { select: { participantToken: true } } },
    });
    return {
      draw: toPublicView(draw),
      winners: winners.map((w) => ({ rank: w.rank, participantToken: w.entry.participantToken, score: w.score })),
    };
  }

  /** Données d'audit publiques et vérification recalculée par le serveur. */
  async auditReport(id: string) {
    const draw = await this.findOrThrow(id);
    if (draw.status === 'DRAFT' || draw.status === 'CANCELLED') {
      throw new AppException(HttpStatus.CONFLICT, 'DRAW_NOT_AUDITABLE', 'Ce tirage n’a pas encore de données d’audit.');
    }
    const [entries, winners] = await Promise.all([
      this.prisma.drawEntry.findMany({ where: { drawId: id }, select: { participantToken: true } }),
      this.prisma.drawWinner.findMany({ where: { drawId: id }, orderBy: { rank: 'asc' }, include: { entry: { select: { participantToken: true } } } }),
    ]);
    const participants = entries.map((e) => e.participantToken).sort();
    const published = draw.status === 'PUBLISHED';
    const rankedWinners = winners.map((w) => ({ rank: w.rank, token: w.entry.participantToken, score: w.score }));
    return {
      algorithmVersion: draw.algorithmVersion,
      method:
        'Empreinte = SHA-256 des jetons triés (un par ligne). Engagement = SHA-256 de la graine. ' +
        'Score = SHA-256(graine hex + ":" + jeton). Gagnants = plus petits scores, départagés par jeton.',
      code: draw.code,
      status: draw.status,
      snapshotAt: draw.snapshotAt,
      eligibleCount: draw.eligibleCount,
      winnerCount: draw.winnerCount,
      snapshotHash: draw.snapshotHash,
      seedCommitment: draw.seedCommitment,
      seed: published ? draw.seed : null,
      resultHash: published ? draw.resultHash : null,
      participants,
      winners: published ? rankedWinners : [],
      verification:
        published && draw.seed && draw.snapshotHash && draw.seedCommitment && draw.resultHash
          ? verifyDraw({
              snapshotHash: draw.snapshotHash,
              seedCommitment: draw.seedCommitment,
              seed: draw.seed,
              resultHash: draw.resultHash,
              winnerCount: draw.winnerCount,
              participants,
              winners: rankedWinners,
            })
          : null,
    };
  }

  // ───────────────────────────── Administration ─────────────────────────────

  async create(dto: CreateDrawDto, ctx: RequestContext) {
    const actorId = requireActor(ctx);
    if (dto.scheduledAt.getTime() <= Date.now()) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'DRAW_DATE_IN_PAST', 'La date du tirage doit être dans le futur.');
    }
    const rule = this.defaultRule();
    const draw = await this.prisma.$transaction(async (tx) => {
      const created = await tx.draw.create({
        data: {
          code: `TIRAGE-${formatDay(localDay(dto.scheduledAt))}-${randomBytes(3).toString('hex').toUpperCase()}`,
          title: dto.title,
          scheduledAt: dto.scheduledAt,
          winnerCount: dto.winnerCount,
          minPaidDays: dto.minPaidDays ?? rule.minPaidDays,
          windowDays: dto.windowDays ?? rule.windowDays,
          algorithmVersion: DRAW_ALGORITHM_VERSION,
          createdById: actorId,
        },
      });
      if (created.minPaidDays > created.windowDays) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'DRAW_RULE_INVALID',
          'Le nombre de jours requis ne peut pas dépasser la période observée.',
        );
      }
      await this.audit.record({ action: 'draw.created', resourceType: 'draw', resourceId: created.id, after: toPublicView(created) }, ctx, tx);
      return created;
    });
    return toAdminView(draw);
  }

  async adminList(query: DrawsQueryDto) {
    return this.page(query.status ? { status: query.status } : {}, query, toAdminView);
  }

  async adminGet(id: string) {
    const draw = await this.findOrThrow(id);
    const winners =
      draw.status === 'EXECUTED' || draw.status === 'PUBLISHED'
        ? await this.prisma.drawWinner.findMany({
            where: { drawId: id },
            orderBy: { rank: 'asc' },
            include: {
              entry: {
                select: {
                  participantToken: true,
                  paidDays: true,
                  user: { select: { id: true, phone: true, profile: { select: { firstName: true, lastName: true, city: true } } } },
                },
              },
            },
          })
        : [];
    return {
      ...toAdminView(draw),
      winners: winners.map((w) => ({
        rank: w.rank,
        participantToken: w.entry.participantToken,
        paidDays: w.entry.paidDays,
        member: {
          userId: w.entry.user.id,
          phone: w.entry.user.phone,
          firstName: w.entry.user.profile?.firstName ?? null,
          lastName: w.entry.user.profile?.lastName ?? null,
          city: w.entry.user.profile?.city ?? null,
        },
      })),
    };
  }

  /** Fige la liste des éligibles et s'engage sur une graine secrète. */
  async freeze(id: string, ctx: RequestContext, asOf = new Date()) {
    const actorId = requireActor(ctx);
    const { draw, participants } = await this.prisma.$transaction(
      async (tx) => {
        const current = await this.lock(tx, id);
        assertStatus(current, 'DRAFT', 'Seul un tirage en préparation peut être figé.');

        const today = localDay(asOf);
        const from = addDays(today, -(current.windowDays - 1));
        const eligible = await tx.$queryRaw<{ user_id: string; paid_days: number }[]>`
          SELECT c.user_id::text AS user_id, COUNT(*)::int AS paid_days
          FROM contributions c
          JOIN profiles p ON p.user_id = c.user_id AND p.kyc_status = 'APPROVED'
          LEFT JOIN beneficiaries b ON b.user_id = c.user_id AND b.status <> 'WITHDRAWN'
          WHERE c.period_date BETWEEN ${formatDay(from)}::date AND ${formatDay(today)}::date
            AND b.id IS NULL
          GROUP BY c.user_id
          HAVING COUNT(*) >= ${current.minPaidDays}`;
        if (eligible.length === 0) {
          throw new AppException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'DRAW_NO_ELIGIBLE_PARTICIPANTS',
            'Aucun membre ne remplit les conditions de ce tirage.',
          );
        }

        const secret = this.config.draws.tokenSecret;
        const entries = eligible.map((e) => ({
          drawId: id,
          userId: e.user_id,
          paidDays: e.paid_days,
          participantToken: participantToken(secret, id, e.user_id),
        }));
        await tx.drawEntry.createMany({ data: entries });

        const seed = randomBytes(32).toString('hex');
        const frozen = await tx.draw.update({
          where: { id },
          data: {
            status: 'FROZEN',
            snapshotAt: asOf,
            eligibleCount: entries.length,
            snapshotHash: snapshotHash(entries.map((e) => e.participantToken)),
            seed,
            seedCommitment: seedCommitment(seed),
            frozenById: actorId,
          },
        });
        await this.audit.record(
          {
            action: 'draw.frozen',
            resourceType: 'draw',
            resourceId: id,
            after: { eligibleCount: frozen.eligibleCount, snapshotHash: frozen.snapshotHash, seedCommitment: frozen.seedCommitment },
          },
          ctx,
          tx,
        );
        return { draw: frozen, participants: entries.map((e) => e.userId) };
      },
      { timeout: 60_000 },
    );

    await this.notifyMany(participants, {
      type: 'DRAW_ENTERED',
      title: 'Vous participez au tirage',
      body: `Vous faites partie des ${draw.eligibleCount} participants au tirage « ${draw.title} ».`,
      deepLink: `/draws/${draw.id}`,
    });
    return toAdminView(draw);
  }

  /** Classe les participants selon la graine engagée. Les résultats restent confidentiels jusqu'à la publication. */
  async execute(id: string, ctx: RequestContext) {
    const actorId = requireActor(ctx);
    const draw = await this.prisma.$transaction(
      async (tx) => {
        const current = await this.lock(tx, id);
        assertStatus(current, 'FROZEN', 'Seul un tirage figé peut être exécuté.');
        const entries = await tx.drawEntry.findMany({ where: { drawId: id }, select: { id: true, participantToken: true } });
        const byToken = new Map(entries.map((e) => [e.participantToken, e.id]));
        const winners = rankWinners(current.seed!, entries.map((e) => e.participantToken), current.winnerCount);

        await tx.drawWinner.createMany({
          data: winners.map((w) => ({ drawId: id, entryId: byToken.get(w.token)!, rank: w.rank, score: w.score })),
        });
        const executed = await tx.draw.update({
          where: { id },
          data: { status: 'EXECUTED', executedAt: new Date(), executedById: actorId, resultHash: resultHash(winners) },
        });
        await this.audit.record(
          { action: 'draw.executed', resourceType: 'draw', resourceId: id, after: { winners: winners.length, resultHash: executed.resultHash } },
          ctx,
          tx,
        );
        return executed;
      },
      { timeout: 60_000 },
    );
    return toAdminView(draw);
  }

  /** Publication par un administrateur différent de celui qui a exécuté (principe des quatre yeux). */
  async publish(id: string, ctx: RequestContext) {
    const actorId = requireActor(ctx);
    const outcome = await this.prisma.$transaction(
      async (tx) => {
        const current = await this.lock(tx, id);
        assertStatus(current, 'EXECUTED', 'Seul un tirage exécuté peut être publié.');
        if (current.executedById === actorId) {
          throw new AppException(
            HttpStatus.FORBIDDEN,
            'DRAW_FOUR_EYES_REQUIRED',
            'La publication doit être validée par un autre administrateur que celui qui a exécuté le tirage.',
          );
        }
        const [winners, entries] = await Promise.all([
          tx.drawWinner.findMany({ where: { drawId: id }, include: { entry: { select: { userId: true } } } }),
          tx.drawEntry.findMany({ where: { drawId: id }, select: { userId: true } }),
        ]);
        const winnerIds = winners.map((w) => w.entry.userId);
        const created = await tx.beneficiary.createMany({
          data: winnerIds.map((userId) => ({ userId, drawId: id })),
          skipDuplicates: true,
        });
        const published = await tx.draw.update({
          where: { id },
          data: { status: 'PUBLISHED', publishedAt: new Date(), publishedById: actorId },
        });
        await this.audit.record(
          {
            action: 'draw.published',
            resourceType: 'draw',
            resourceId: id,
            after: { seed: published.seed, resultHash: published.resultHash, beneficiariesCreated: created.count },
          },
          ctx,
          tx,
        );
        return { draw: published, winnerIds, participantIds: entries.map((e) => e.userId) };
      },
      { timeout: 60_000 },
    );

    const winners = new Set(outcome.winnerIds);
    await this.notifyMany(outcome.winnerIds, {
      type: 'DRAW_SELECTED',
      title: 'Félicitations, vous êtes sélectionné !',
      body: `Vous faites partie des bénéficiaires du tirage « ${outcome.draw.title} ». Votre parcours entrepreneurial commence.`,
      deepLink: '/program',
    });
    await this.notifyMany(
      outcome.participantIds.filter((userId) => !winners.has(userId)),
      {
        type: 'DRAW_RESULT',
        title: 'Résultats du tirage publiés',
        body: `Les résultats du tirage « ${outcome.draw.title} » sont publiés. Continuez vos contributions pour le prochain tirage.`,
        deepLink: `/draws/${outcome.draw.id}`,
      },
    );
    return toAdminView(outcome.draw);
  }

  async cancel(id: string, dto: CancelDrawDto, ctx: RequestContext) {
    requireActor(ctx);
    const draw = await this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, id);
      if (current.status !== 'DRAFT' && current.status !== 'FROZEN') {
        throw new AppException(HttpStatus.CONFLICT, 'DRAW_NOT_CANCELLABLE', 'Un tirage exécuté ou publié ne peut plus être annulé.', {
          status: current.status,
        });
      }
      const cancelled = await tx.draw.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: dto.reason },
      });
      await this.audit.record(
        { action: 'draw.cancelled', resourceType: 'draw', resourceId: id, before: { status: current.status }, after: { reason: dto.reason } },
        ctx,
        tx,
      );
      return cancelled;
    });
    return toAdminView(draw);
  }

  // ───────────────────────────── Interne ─────────────────────────────

  private defaultRule() {
    return { minPaidDays: this.config.draws.defaultMinPaidDays, windowDays: this.config.draws.defaultWindowDays };
  }

  private async findOrThrow(id: string): Promise<Draw> {
    const draw = await this.prisma.draw.findUnique({ where: { id } });
    if (!draw) throw new AppException(HttpStatus.NOT_FOUND, 'DRAW_NOT_FOUND', 'Tirage introuvable.');
    return draw;
  }

  private async lock(tx: Prisma.TransactionClient, id: string): Promise<Draw> {
    await tx.$queryRaw`SELECT id FROM draws WHERE id = ${id}::uuid FOR UPDATE`;
    const draw = await tx.draw.findUnique({ where: { id } });
    if (!draw) throw new AppException(HttpStatus.NOT_FOUND, 'DRAW_NOT_FOUND', 'Tirage introuvable.');
    return draw;
  }

  private async page<T>(
    where: Prisma.DrawWhereInput,
    query: DrawsQueryDto,
    map: (draw: Draw) => T = toPublicView as unknown as (draw: Draw) => T,
  ) {
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.prisma.draw.findMany({
      where: {
        ...where,
        ...(after ? { OR: [{ scheduledAt: { lt: after.createdAt } }, { scheduledAt: after.createdAt, id: { lt: after.id } }] } : {}),
      },
      orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const last = pageRows[pageRows.length - 1];
    return {
      items: pageRows.map(map),
      nextCursor: hasMore && last ? encodeCursor({ createdAt: last.scheduledAt, id: last.id }) : null,
    };
  }

  private async notifyMany(userIds: string[], input: { type: string; title: string; body: string; deepLink: string }) {
    for (const userId of userIds) {
      await this.notifications
        .notify(userId, input)
        .catch((error: unknown) => this.logger.warn({ err: error, userId }, 'Notification de tirage non envoyée'));
    }
  }
}

function requireActor(ctx: RequestContext): string {
  const actor = ctx.auth?.userId;
  if (!actor) throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Authentification requise.');
  return actor;
}

function assertStatus(draw: Draw, expected: DrawStatus, message: string) {
  if (draw.status !== expected) {
    throw new AppException(HttpStatus.CONFLICT, 'DRAW_INVALID_STATUS', message, { status: draw.status, expected });
  }
}

export function toPublicView(draw: Draw): PublicDrawView {
  return {
    id: draw.id,
    code: draw.code,
    title: draw.title,
    status: draw.status,
    scheduledAt: draw.scheduledAt,
    winnerCount: draw.winnerCount,
    minPaidDays: draw.minPaidDays,
    windowDays: draw.windowDays,
    eligibleCount: draw.eligibleCount,
    snapshotAt: draw.snapshotAt,
    snapshotHash: draw.snapshotHash,
    seedCommitment: draw.seedCommitment,
    executedAt: draw.executedAt,
    publishedAt: draw.publishedAt,
    cancelledAt: draw.cancelledAt,
  };
}

function toAdminView(draw: Draw) {
  return {
    ...toPublicView(draw),
    resultHash: draw.resultHash,
    seedRevealed: draw.status === 'PUBLISHED' ? draw.seed : null,
    cancelReason: draw.cancelReason,
    createdById: draw.createdById,
    frozenById: draw.frozenById,
    executedById: draw.executedById,
    publishedById: draw.publishedById,
  };
}
