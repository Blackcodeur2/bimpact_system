import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Contribution, ContributionSource, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app-exception';
import { Decimal, money, MoneyView } from '../../common/money';
import { decodeCursor, encodeCursor } from '../../common/pagination';
import type { RequestContext } from '../../common/request-context';
import { AppConfig } from '../../config/app-config';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { parseCalendarDate } from '../kyc/kyc.rules';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AdminContributionsQueryDto, ContributionSettingsDto, PayContributionDto } from './contributions.dto';
import {
  addDays,
  currentStreak,
  DayStatus,
  dayStatus,
  expectedDaysThisMonth,
  formatDay,
  localDay,
  localHour,
  payabilityError,
  payableDays,
} from './contributions.rules';

const CALENDAR_LENGTH = 30;
const CONTRIBUTION_POOL = 'system:contribution_pool';

export interface ContributionView {
  id: string;
  date: string;
  amount: MoneyView;
  source: ContributionSource;
  paidAt: Date;
  ledgerTransactionId: string;
}

export interface ContributionEligibility {
  eligible: boolean;
  /** KYC_NOT_APPROVED, WALLET_NOT_ACTIVE */
  reasons: string[];
}

export interface ContributionOverview {
  eligibility: ContributionEligibility;
  dailyAmount: MoneyView;
  plan: { status: string; autoDebit: boolean; startedOn: string; frequency: string } | null;
  today: { date: string; status: DayStatus; paidAt: Date | null };
  streak: number;
  month: { paidDays: number; expectedDays: number; totalPaid: MoneyView };
  totalPaid: MoneyView;
  calendar: { date: string; status: DayStatus }[];
  payableDates: string[];
  nextDueDate: string;
  autoDebitHour: number;
  recent: ContributionView[];
}

export interface ContributionSummary {
  eligible: boolean;
  enrolled: boolean;
  dailyAmount: MoneyView;
  todayStatus: DayStatus;
  streak: number;
  autoDebit: boolean;
}

/** Contribution programmée de 200 FCFA par jour (cahier §7.10). Débit du portefeuille vers le fonds commun via le ledger. */
@Injectable()
export class ContributionsService {
  private readonly logger = new Logger(ContributionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly config: AppConfig,
  ) {}

  async eligibility(userId: string): Promise<ContributionEligibility> {
    const [profile, wallet] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId }, select: { kycStatus: true } }),
      this.prisma.wallet.findUnique({ where: { userId }, select: { status: true } }),
    ]);
    const reasons: string[] = [];
    if (profile?.kycStatus !== 'APPROVED') reasons.push('KYC_NOT_APPROVED');
    if (wallet?.status !== 'ACTIVE') reasons.push('WALLET_NOT_ACTIVE');
    return { eligible: reasons.length === 0, reasons };
  }

  async overview(userId: string, now = new Date()): Promise<ContributionOverview> {
    const today = localDay(now);
    const [eligibility, plan, totals] = await Promise.all([
      this.eligibility(userId),
      this.prisma.contributionPlan.findUnique({ where: { userId } }),
      this.prisma.contribution.aggregate({ where: { userId }, _sum: { amount: true } }),
    ]);
    const since = addDays(today, -Math.max(CALENDAR_LENGTH, 31));
    const contributions = await this.prisma.contribution.findMany({
      where: { userId, periodDate: { gte: since } },
      orderBy: { periodDate: 'desc' },
    });

    const paid = new Set(contributions.map((c) => formatDay(c.periodDate)));
    const startedOn = plan?.startedOn ?? null;
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const monthContributions = contributions.filter((c) => c.periodDate >= monthStart);
    const todayContribution = contributions.find((c) => c.periodDate.getTime() === today.getTime());
    const dailyAmount = plan?.amount ?? new Decimal(this.config.contributions.dailyAmount);

    return {
      eligibility,
      dailyAmount: money(dailyAmount),
      plan: plan
        ? { status: plan.status, autoDebit: plan.autoDebit, startedOn: formatDay(plan.startedOn), frequency: plan.frequency }
        : null,
      today: { date: formatDay(today), status: dayStatus(today, today, today, paid), paidAt: todayContribution?.paidAt ?? null },
      streak: currentStreak(today, paid),
      month: {
        paidDays: monthContributions.length,
        expectedDays: expectedDaysThisMonth(today, startedOn),
        totalPaid: money(monthContributions.reduce((sum, c) => sum.plus(c.amount), new Decimal(0))),
      },
      totalPaid: money(totals._sum.amount ?? 0),
      calendar: Array.from({ length: CALENDAR_LENGTH }, (_, i) => {
        const day = addDays(today, i - (CALENDAR_LENGTH - 1));
        return { date: formatDay(day), status: dayStatus(day, today, startedOn, paid) };
      }),
      payableDates: eligibility.eligible ? payableDays(today, startedOn, paid).map(formatDay) : [],
      nextDueDate: formatDay(paid.has(formatDay(today)) ? addDays(today, 1) : today),
      autoDebitHour: this.config.contributions.autoDebitHour,
      recent: contributions.slice(0, 10).map(toView),
    };
  }

  async summary(userId: string, now = new Date()): Promise<ContributionSummary> {
    const today = localDay(now);
    const [eligibility, plan, todayContribution, recent] = await Promise.all([
      this.eligibility(userId),
      this.prisma.contributionPlan.findUnique({ where: { userId } }),
      this.prisma.contribution.findUnique({ where: { userId_periodDate: { userId, periodDate: today } } }),
      this.prisma.contribution.findMany({
        where: { userId, periodDate: { gte: addDays(today, -60) } },
        select: { periodDate: true },
      }),
    ]);
    const paid = new Set(recent.map((c) => formatDay(c.periodDate)));
    return {
      eligible: eligibility.eligible,
      enrolled: plan !== null,
      dailyAmount: money(plan?.amount ?? this.config.contributions.dailyAmount),
      todayStatus: todayContribution ? 'PAID' : 'DUE',
      streak: currentStreak(today, paid),
      autoDebit: plan?.autoDebit ?? false,
    };
  }

  /**
   * Paie la contribution d'un jour. Idempotent par construction :
   * verrou du plan + référence de ledger unique + contrainte (membre, jour) unique.
   */
  async pay(
    userId: string,
    dto: PayContributionDto,
    ctx: RequestContext,
    source: ContributionSource = 'MANUAL',
    now = new Date(),
  ): Promise<{ contribution: ContributionView; replayed: boolean }> {
    const today = localDay(now);
    const day = dto.periodDate ? parseCalendarDate(dto.periodDate) : today;
    if (!day) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Certaines informations sont invalides.', {
        fields: { periodDate: ['Date inexistante.'] },
      });
    }

    const eligibility = await this.eligibility(userId);
    if (!eligibility.eligible) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'CONTRIBUTION_NOT_ELIGIBLE',
        eligibility.reasons.includes('KYC_NOT_APPROVED')
          ? 'Votre identité doit être vérifiée avant de contribuer.'
          : 'Votre portefeuille doit être actif pour contribuer.',
        { reasons: eligibility.reasons },
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Création atomique du plan au premier paiement : deux requêtes simultanées ne peuvent pas entrer en conflit.
      await tx.$executeRaw`
        INSERT INTO contribution_plans (id, user_id, amount, started_on, updated_at)
        VALUES (${randomUUID()}::uuid, ${userId}::uuid, ${String(this.config.contributions.dailyAmount)}::numeric, ${formatDay(today)}::date, now())
        ON CONFLICT (user_id) DO NOTHING`;
      // Sérialise les paiements d'un même membre (double clic, prélèvement automatique simultané).
      await tx.$queryRaw`SELECT id FROM contribution_plans WHERE user_id = ${userId}::uuid FOR UPDATE`;
      const plan = await tx.contributionPlan.findUniqueOrThrow({ where: { userId } });

      const existing = await tx.contribution.findUnique({ where: { userId_periodDate: { userId, periodDate: day } } });
      if (existing) return { contribution: existing, replayed: true };

      const error = payabilityError(day, today, plan.startedOn);
      if (error) throw payabilityException(error);
      if (plan.status === 'PAUSED' && source === 'AUTO') {
        throw new AppException(HttpStatus.CONFLICT, 'CONTRIBUTION_PLAN_PAUSED', 'Le plan de contribution est en pause.');
      }

      const [wallet, pool] = await Promise.all([
        tx.wallet.findUniqueOrThrow({ where: { userId } }),
        tx.ledgerAccount.findUniqueOrThrow({ where: { code: CONTRIBUTION_POOL } }),
      ]);

      let ledgerTransactionId: string;
      try {
        const posted = await this.ledger.post(
          {
            reference: `contribution:${userId}:${formatDay(day)}`,
            type: 'CONTRIBUTION',
            currency: plan.currency,
            description: `Contribution du ${formatDay(day).split('-').reverse().join('/')}`,
            entries: [
              { accountId: wallet.availableAccountId, direction: 'DEBIT', amount: plan.amount },
              { accountId: pool.id, direction: 'CREDIT', amount: plan.amount },
            ],
            metadata: { periodDate: formatDay(day), source },
            createdById: userId,
          },
          ctx,
          tx,
        );
        ledgerTransactionId = posted.transaction.id;
      } catch (error) {
        if (error instanceof AppException && error.code === 'INSUFFICIENT_FUNDS') {
          throw new AppException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'INSUFFICIENT_FUNDS',
            `Solde insuffisant : rechargez au moins ${plan.amount.toFixed(0)} FCFA pour contribuer.`,
            { required: money(plan.amount) },
          );
        }
        throw error;
      }

      const contribution = await tx.contribution.create({
        data: { userId, planId: plan.id, periodDate: day, amount: plan.amount, currency: plan.currency, source, ledgerTransactionId },
      });
      await this.audit.record(
        {
          action: 'contribution.paid',
          resourceType: 'contribution',
          resourceId: contribution.id,
          actorId: source === 'AUTO' ? null : userId,
          actorType: source === 'AUTO' ? 'SYSTEM' : 'MEMBER',
          after: { periodDate: formatDay(day), amount: contribution.amount, source, ledgerTransactionId },
        },
        ctx,
        tx,
      );
      return { contribution, replayed: false };
    });

    if (!result.replayed) {
      await this.notifications
        .notify(userId, {
          type: 'CONTRIBUTION_CONFIRMED',
          title: 'Contribution enregistrée',
          body: `Votre contribution de ${result.contribution.amount.toFixed(0)} FCFA du ${formatDay(day).split('-').reverse().join('/')} est confirmée.`,
          deepLink: '/contributions',
        })
        .catch((error: unknown) => this.logger.warn({ err: error }, 'Notification de contribution non envoyée'));
    }
    return { contribution: toView(result.contribution), replayed: result.replayed };
  }

  async updateSettings(userId: string, dto: ContributionSettingsDto, ctx: RequestContext) {
    const plan = await this.prisma.contributionPlan.findUnique({ where: { userId } });
    if (!plan) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'CONTRIBUTION_PLAN_NOT_STARTED',
        'Payez votre première contribution pour activer le prélèvement automatique.',
      );
    }
    if (dto.autoDebit && !(await this.eligibility(userId)).eligible) {
      throw new AppException(HttpStatus.FORBIDDEN, 'CONTRIBUTION_NOT_ELIGIBLE', 'Vous n’êtes pas éligible à la contribution.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.contributionPlan.update({ where: { id: plan.id }, data: { autoDebit: dto.autoDebit } });
      await this.audit.record(
        {
          action: 'contribution.settings.updated',
          resourceType: 'contribution_plan',
          resourceId: plan.id,
          before: { autoDebit: plan.autoDebit },
          after: { autoDebit: dto.autoDebit },
        },
        ctx,
        tx,
      );
    });
    return this.overview(userId);
  }

  /** Prélèvement automatique du jour, une fois l'heure configurée passée (heure du Cameroun). */
  async runAutoDebit(now = new Date()): Promise<{ processed: number; succeeded: number; failed: number } | null> {
    const today = localDay(now);
    if (localHour(now) < this.config.contributions.autoDebitHour) return null;
    const run = await this.startRun(today, 'AUTO_DEBIT');
    if (!run) return null;

    const plans = await this.prisma.contributionPlan.findMany({
      where: { status: 'ACTIVE', autoDebit: true, contributions: { none: { periodDate: today } } },
      select: { userId: true, amount: true },
      take: 5000,
    });
    let succeeded = 0;
    let failed = 0;
    for (const plan of plans) {
      try {
        await this.pay(plan.userId, {}, { requestId: `job-auto-debit-${formatDay(today)}` }, 'AUTO', now);
        succeeded += 1;
      } catch (error) {
        failed += 1;
        const code = error instanceof AppException ? error.code : 'UNEXPECTED';
        await this.notifications
          .notify(plan.userId, {
            type: 'CONTRIBUTION_AUTO_DEBIT_FAILED',
            title: 'Prélèvement automatique non effectué',
            body:
              code === 'INSUFFICIENT_FUNDS'
                ? `Solde insuffisant pour la contribution du jour (${plan.amount.toFixed(0)} FCFA). Rechargez puis contribuez.`
                : 'La contribution du jour n’a pas pu être prélevée. Vous pouvez la payer depuis l’application.',
            deepLink: '/contributions',
          })
          .catch(() => undefined);
      }
    }
    await this.finishRun(run.id, plans.length, succeeded, failed);
    return { processed: plans.length, succeeded, failed };
  }

  /** Rappel du soir pour les membres inscrits qui n'ont pas encore contribué. */
  async runReminders(now = new Date()): Promise<number | null> {
    const today = localDay(now);
    if (localHour(now) < this.config.contributions.reminderHour) return null;
    const run = await this.startRun(today, 'REMINDER');
    if (!run) return null;

    const plans = await this.prisma.contributionPlan.findMany({
      where: { status: 'ACTIVE', contributions: { none: { periodDate: today } } },
      select: { userId: true, amount: true },
      take: 5000,
    });
    for (const plan of plans) {
      await this.notifications
        .notify(plan.userId, {
          type: 'CONTRIBUTION_DUE',
          title: 'Contribution du jour',
          body: `N’oubliez pas votre contribution de ${plan.amount.toFixed(0)} FCFA avant minuit.`,
          deepLink: '/contributions',
        })
        .catch(() => undefined);
    }
    await this.finishRun(run.id, plans.length, plans.length, 0);
    return plans.length;
  }

  async adminList(query: AdminContributionsQueryDto) {
    const date = query.date ? parseCalendarDate(query.date) : null;
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.prisma.contribution.findMany({
      where: {
        ...(date ? { periodDate: date } : {}),
        ...(after ? { OR: [{ paidAt: { lt: after.createdAt } }, { paidAt: after.createdAt, id: { lt: after.id } }] } : {}),
      },
      orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: { user: { select: { phone: true, profile: { select: { firstName: true, lastName: true, city: true } } } } },
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map((row) => ({
        ...toView(row),
        member: {
          userId: row.userId,
          phone: row.user.phone,
          firstName: row.user.profile?.firstName ?? null,
          lastName: row.user.profile?.lastName ?? null,
          city: row.user.profile?.city ?? null,
        },
      })),
      nextCursor: hasMore && last ? encodeCursor({ createdAt: last.paidAt, id: last.id }) : null,
    };
  }

  async adminMetrics(now = new Date()) {
    const today = localDay(now);
    const from = addDays(today, -29);
    const [activePlans, autoDebitPlans, todayTotals, series] = await Promise.all([
      this.prisma.contributionPlan.count({ where: { status: 'ACTIVE' } }),
      this.prisma.contributionPlan.count({ where: { status: 'ACTIVE', autoDebit: true } }),
      this.prisma.contribution.aggregate({ where: { periodDate: today }, _count: true, _sum: { amount: true } }),
      this.prisma.contribution.groupBy({
        by: ['periodDate'],
        where: { periodDate: { gte: from } },
        _count: true,
        _sum: { amount: true },
      }),
    ]);
    const byDay = new Map(series.map((s) => [formatDay(s.periodDate), s]));
    return {
      date: formatDay(today),
      activePlans,
      autoDebitPlans,
      paidToday: todayTotals._count,
      amountToday: money(todayTotals._sum.amount ?? 0),
      /** Part des plans actifs ayant contribué aujourd'hui. */
      todayRate: activePlans === 0 ? 0 : Math.round((todayTotals._count / activePlans) * 1000) / 10,
      last30Days: Array.from({ length: 30 }, (_, i) => {
        const day = formatDay(addDays(from, i));
        const entry = byDay.get(day);
        return { date: day, count: entry?._count ?? 0, amount: money(entry?._sum.amount ?? 0) };
      }),
    };
  }

  private async startRun(periodDate: Date, kind: string) {
    try {
      return await this.prisma.contributionRun.create({ data: { periodDate, kind } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
      throw error;
    }
  }

  private async finishRun(id: string, processed: number, succeeded: number, failed: number) {
    await this.prisma.contributionRun.update({
      where: { id },
      data: { finishedAt: new Date(), processed, succeeded, failed },
    });
  }
}

function toView(contribution: Contribution): ContributionView {
  return {
    id: contribution.id,
    date: formatDay(contribution.periodDate),
    amount: money(contribution.amount, contribution.currency),
    source: contribution.source,
    paidAt: contribution.paidAt,
    ledgerTransactionId: contribution.ledgerTransactionId,
  };
}

function payabilityException(code: string) {
  const messages: Record<string, string> = {
    CONTRIBUTION_DATE_IN_FUTURE: 'Vous ne pouvez pas payer une contribution à l’avance.',
    CONTRIBUTION_TOO_OLD: 'Ce jour est trop ancien pour être rattrapé (7 jours maximum).',
    CONTRIBUTION_BEFORE_START: 'Ce jour précède le début de votre plan de contribution.',
  };
  return new AppException(HttpStatus.UNPROCESSABLE_ENTITY, code, messages[code] ?? 'Jour non payable.');
}
