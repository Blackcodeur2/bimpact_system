import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { money } from '../../common/money';
import { PrismaService } from '../../database/prisma.service';
import { DAY_MS, dailyBuckets, dayKeys, localDayBounds, localDayKey } from './backoffice.common';
import { OPEN_RISK_STATUSES } from './members-admin.service';

export interface DashboardAlert {
  level: 'info' | 'warning' | 'critical';
  code: string;
  message: string;
  count: number;
  link: string;
}

/** Tableau de bord administrateur (cahier §8.1) : uniquement des agrégats calculés sur les données réelles. */
@Injectable()
export class DashboardAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(days: number, now = new Date()) {
    const lastDay = localDayKey(now);
    const firstDay = localDayKey(new Date(now.getTime() - (days - 1) * DAY_MS));
    const from = localDayBounds(firstDay).start;
    const stale48h = new Date(now.getTime() - 48 * 3_600_000);
    const stale30min = new Date(now.getTime() - 30 * 60_000);

    const [
      membersTotal,
      activeInPeriod,
      newInPeriod,
      kycPending,
      kycStale,
      contributions,
      payments,
      paymentsFailed,
      stalePayments,
      webhookErrors,
      beneficiaries,
      certificates,
      accidentsOpen,
      accidentsToDisburse,
      supportOpen,
      supportStale,
      riskOpen,
      riskNew,
      membersByCity,
      registrations,
      contributionSeries,
      paymentSeries,
      recentActivity,
    ] = await Promise.all([
      this.prisma.user.count({ where: { kind: 'MEMBER', status: { not: 'PENDING_VERIFICATION' } } }),
      this.prisma.user.count({ where: { kind: 'MEMBER', lastLoginAt: { gte: from } } }),
      this.prisma.user.count({ where: { kind: 'MEMBER', phoneVerifiedAt: { gte: from } } }),
      this.prisma.kycProfile.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
      this.prisma.kycProfile.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] }, submittedAt: { lt: stale48h } } }),
      this.prisma.contribution.aggregate({ where: { paidAt: { gte: from } }, _count: true, _sum: { amount: true } }),
      this.prisma.paymentIntent.aggregate({ where: { status: 'SUCCEEDED', confirmedAt: { gte: from } }, _count: true, _sum: { amount: true } }),
      this.prisma.paymentIntent.count({ where: { status: 'FAILED', createdAt: { gte: from } } }),
      this.prisma.paymentIntent.count({ where: { status: 'PENDING', createdAt: { lt: stale30min } } }),
      this.prisma.paymentWebhookEvent.count({ where: { processingError: { not: null }, receivedAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } } }),
      this.prisma.beneficiary.groupBy({ by: ['status'], _count: true }),
      this.prisma.certification.count({ where: { revokedAt: null } }),
      this.prisma.accidentClaim.count({ where: { status: { in: ['SUBMITTED', 'DOCUMENTS_PENDING', 'INVESTIGATING', 'APPROVED'] } } }),
      this.prisma.accidentClaim.count({ where: { status: 'APPROVED' } }),
      this.prisma.supportTicket.count({ where: { status: 'OPEN' } }),
      this.prisma.supportTicket.count({ where: { status: 'OPEN', lastMessageAt: { lt: stale48h } } }),
      this.prisma.riskCase.count({ where: { status: { in: OPEN_RISK_STATUSES } } }),
      this.prisma.riskCase.count({ where: { status: 'NEW' } }),
      this.prisma.$queryRaw<{ city: string; members: number }[]>`
        SELECT p.city, COUNT(*)::int AS members
        FROM profiles p JOIN users u ON u.id = p.user_id
        WHERE u.kind = 'MEMBER' AND u.status = 'ACTIVE'
        GROUP BY p.city ORDER BY members DESC, p.city LIMIT 10`,
      dailyBuckets(this.prisma, { table: 'users', column: 'phone_verified_at', from, to: now, where: Prisma.sql`kind = 'MEMBER'` }),
      dailyBuckets(this.prisma, { table: 'contributions', column: 'paid_at', from, to: now, sumColumn: 'amount' }),
      dailyBuckets(this.prisma, { table: 'payment_intents', column: 'confirmed_at', from, to: now, sumColumn: 'amount', where: Prisma.sql`status = 'SUCCEEDED'` }),
      this.prisma.auditLog.findMany({
        where: { NOT: [{ action: { startsWith: 'auth.' } }, { action: { endsWith: '.viewed' } }, { action: 'ledger.transaction.posted' }] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 12,
        select: { id: true, action: true, actorType: true, resourceType: true, resourceId: true, createdAt: true },
      }),
    ]);

    const byStatus = Object.fromEntries(beneficiaries.map((row) => [row.status, row._count])) as Record<string, number>;
    const beneficiariesTotal = beneficiaries.reduce((sum, row) => sum + row._count, 0);
    const inProgram = beneficiariesTotal - (byStatus.WITHDRAWN ?? 0);
    const trained = (byStatus.CERTIFIED ?? 0) + (byStatus.ENTREPRENEUR ?? 0);

    const alerts: DashboardAlert[] = [];
    const push = (condition: boolean, alert: DashboardAlert) => condition && alerts.push(alert);
    push(kycStale > 0, { level: 'warning', code: 'KYC_BACKLOG', message: 'Dossiers d’identité en attente depuis plus de 48 h', count: kycStale, link: '/kyc' });
    push(stalePayments > 0, { level: 'critical', code: 'PAYMENTS_STUCK', message: 'Paiements en attente chez l’opérateur depuis plus de 30 min', count: stalePayments, link: '/payments?status=PENDING' });
    push(webhookErrors > 0, { level: 'critical', code: 'WEBHOOK_ERRORS', message: 'Webhooks de paiement en erreur (7 jours)', count: webhookErrors, link: '/finance' });
    push(accidentsToDisburse > 0, { level: 'warning', code: 'ACCIDENTS_TO_DISBURSE', message: 'Aides approuvées non encore versées', count: accidentsToDisburse, link: '/accidents?status=APPROVED' });
    push(supportStale > 0, { level: 'warning', code: 'SUPPORT_BACKLOG', message: 'Demandes de support sans réponse depuis plus de 48 h', count: supportStale, link: '/support' });
    push(riskNew > 0, { level: 'info', code: 'RISK_NEW', message: 'Dossiers de risque à prendre en charge', count: riskNew, link: '/fraud' });

    return {
      period: { days, from: firstDay, to: lastDay },
      kpis: {
        members: { total: membersTotal, activeInPeriod, newInPeriod },
        kycPending,
        contributions: { count: contributions._count, amount: money(contributions._sum.amount ?? 0) },
        payments: { count: payments._count, amount: money(payments._sum.amount ?? 0), failed: paymentsFailed },
        beneficiaries: { total: beneficiariesTotal, byStatus },
        /** Part des bénéficiaires encore dans le programme ayant validé la formation ; null sans bénéficiaire. */
        trainingRate: inProgram > 0 ? Math.round((trained / inProgram) * 1000) / 10 : null,
        certificates,
        accidentsOpen,
        supportOpen,
        riskOpen,
      },
      series: dayKeys(firstDay, lastDay).map((date) => ({
        date,
        registrations: registrations.get(date)?.count ?? 0,
        contributions: { count: contributionSeries.get(date)?.count ?? 0, amount: money(contributionSeries.get(date)?.sum ?? 0) },
        payments: { count: paymentSeries.get(date)?.count ?? 0, amount: money(paymentSeries.get(date)?.sum ?? 0) },
      })),
      membersByCity,
      alerts,
      recentActivity,
    };
  }
}
