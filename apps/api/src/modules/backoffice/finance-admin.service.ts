import { Inject, Injectable } from '@nestjs/common';
import { Decimal, money } from '../../common/money';
import { decodeCursor, encodeCursor } from '../../common/pagination';
import type { RequestContext } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { PAYMENT_PROVIDER, PaymentProvider } from '../payments/payment-provider';
import { DAY_MS, staffNames } from './backoffice.common';
import type { LedgerQueryDto } from './backoffice.dto';

interface ReconciliationCheck {
  code: string;
  label: string;
  status: 'OK' | 'EXCEPTION';
  count: number;
  details: Record<string, unknown>[];
}

/**
 * Supervision financière (cahier §8.4) : lecture du ledger et contrôles de cohérence.
 * Aucune écriture n'est modifiée d'ici ; une correction passe par une contre-passation contrôlée.
 */
@Injectable()
export class FinanceAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  async overview() {
    const now = Date.now();
    const [trial, systemAccounts, memberTotals, inconsistent, pending, stalePending, webhookErrors, succeededWithoutLedger, lastRun] =
      await Promise.all([
        this.ledger.trialBalance(),
        this.prisma.ledgerAccount.findMany({ where: { ownerUserId: null }, orderBy: { code: 'asc' } }),
        this.prisma.ledgerAccount.groupBy({
          by: ['purpose'],
          where: { purpose: { in: ['MEMBER_AVAILABLE', 'MEMBER_RESERVED'] } },
          _sum: { balance: true },
          _count: true,
        }),
        this.inconsistentAccounts(20),
        this.prisma.paymentIntent.count({ where: { status: 'PENDING' } }),
        this.prisma.paymentIntent.count({ where: { status: 'PENDING', createdAt: { lt: new Date(now - 30 * 60_000) } } }),
        this.prisma.paymentWebhookEvent.count({ where: { processingError: { not: null }, receivedAt: { gte: new Date(now - 7 * DAY_MS) } } }),
        this.prisma.paymentIntent.count({ where: { status: 'SUCCEEDED', ledgerTransactionId: null } }),
        this.prisma.auditLog.findFirst({ where: { action: 'finance.reconciliation.run' }, orderBy: { createdAt: 'desc' } }),
      ]);
    const memberTotal = (purpose: string) => {
      const row = memberTotals.find((r) => r.purpose === purpose);
      return { accounts: row?._count ?? 0, balance: money(row?._sum.balance ?? 0) };
    };
    return {
      trialBalance: { debits: money(trial.debits), credits: money(trial.credits), balanced: trial.balanced },
      systemAccounts: systemAccounts.map((account) => ({
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        purpose: account.purpose,
        balance: money(account.balance, account.currency),
      })),
      memberWallets: { available: memberTotal('MEMBER_AVAILABLE'), reserved: memberTotal('MEMBER_RESERVED') },
      inconsistentAccounts: inconsistent,
      provider: {
        code: this.provider.code,
        testMode: this.provider.testMode,
        pendingPayments: pending,
        stalePendingPayments: stalePending,
        webhookErrorsLast7Days: webhookErrors,
        succeededWithoutLedger,
      },
      lastReconciliation: lastRun ? { ranAt: lastRun.createdAt, actorId: lastRun.actorId, summary: lastRun.metadata } : null,
    };
  }

  async transactions(query: LedgerQueryDto) {
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const accountFilter =
      query.accountCode || query.userId
        ? { entries: { some: { account: { ...(query.accountCode ? { code: { contains: query.accountCode } } : {}), ...(query.userId ? { ownerUserId: query.userId } : {}) } } } }
        : {};
    const rows = await this.prisma.ledgerTransaction.findMany({
      where: {
        ...(query.reference ? { reference: { contains: query.reference } } : {}),
        type: query.type,
        postedAt: { gte: query.from, lte: query.to },
        ...accountFilter,
        ...(after ? { OR: [{ postedAt: { lt: after.createdAt } }, { postedAt: after.createdAt, id: { lt: after.id } }] } : {}),
      },
      orderBy: [{ postedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: {
        entries: {
          orderBy: { createdAt: 'asc' },
          include: { account: { select: { code: true, name: true, type: true, ownerUserId: true } } },
        },
      },
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map((tx) => ({
        id: tx.id,
        reference: tx.reference,
        type: tx.type,
        description: tx.description,
        currency: tx.currency,
        postedAt: tx.postedAt,
        reversalOfId: tx.reversalOfId,
        createdById: tx.createdById,
        metadata: tx.metadata,
        amount: money(
          tx.entries.filter((e) => e.direction === 'DEBIT').reduce((sum, e) => sum.plus(e.amount), new Decimal(0)),
          tx.currency,
        ),
        entries: tx.entries.map((entry) => ({
          id: entry.id,
          direction: entry.direction,
          amount: money(entry.amount, entry.currency),
          balanceAfter: money(entry.balanceAfter, entry.currency),
          account: entry.account,
        })),
      })),
      nextCursor: hasMore && last ? encodeCursor({ createdAt: last.postedAt, id: last.id }) : null,
    };
  }

  /** Contrôles de cohérence du ledger et des paiements ; le résultat est conservé dans le journal d'audit. */
  async runReconciliation(ctx: RequestContext) {
    const clearingCode = `system:provider_clearing:${this.provider.code}`;
    const [trial, inconsistent, unbalanced, succeededWithoutLedger, orphanDeposits, clearing, succeededTotal] = await Promise.all([
      this.ledger.trialBalance(),
      this.inconsistentAccounts(50),
      this.prisma.$queryRaw<{ id: string; reference: string; debits: string; credits: string }[]>`
        SELECT t.id, t.reference,
               COALESCE(SUM(e.amount) FILTER (WHERE e.direction = 'DEBIT'), 0)::text AS debits,
               COALESCE(SUM(e.amount) FILTER (WHERE e.direction = 'CREDIT'), 0)::text AS credits
        FROM ledger_transactions t LEFT JOIN ledger_entries e ON e.transaction_id = t.id
        GROUP BY t.id
        HAVING COALESCE(SUM(e.amount) FILTER (WHERE e.direction = 'DEBIT'), 0)
            <> COALESCE(SUM(e.amount) FILTER (WHERE e.direction = 'CREDIT'), 0)
        LIMIT 50`,
      this.prisma.paymentIntent.findMany({
        where: { status: 'SUCCEEDED', ledgerTransactionId: null },
        take: 50,
        select: { id: true, amount: true, confirmedAt: true },
      }),
      this.prisma.$queryRaw<{ id: string; reference: string; status: string | null }[]>`
        SELECT t.id, t.reference, p.status::text AS status
        FROM ledger_transactions t
        LEFT JOIN payment_intents p ON t.reference = 'payment:' || p.id::text
        WHERE t.type = 'DEPOSIT' AND t.reference LIKE 'payment:%' AND (p.id IS NULL OR p.status <> 'SUCCEEDED')
        LIMIT 50`,
      this.prisma.ledgerAccount.findUnique({ where: { code: clearingCode }, select: { balance: true } }),
      this.prisma.paymentIntent.aggregate({ where: { provider: this.provider.code, status: 'SUCCEEDED' }, _sum: { amount: true } }),
    ]);

    const expectedClearing = new Decimal(succeededTotal._sum.amount ?? 0);
    const clearingBalance = new Decimal(clearing?.balance ?? 0);
    const check = (code: string, label: string, details: Record<string, unknown>[]): ReconciliationCheck => ({
      code,
      label,
      status: details.length === 0 ? 'OK' : 'EXCEPTION',
      count: details.length,
      details,
    });
    const checks: ReconciliationCheck[] = [
      check('TRIAL_BALANCE', 'Balance générale équilibrée (total des débits = total des crédits)', trial.balanced ? [] : [{ debits: trial.debits.toString(), credits: trial.credits.toString() }]),
      check('ACCOUNT_BALANCES', 'Soldes des comptes conformes aux écritures', inconsistent),
      check('BALANCED_TRANSACTIONS', 'Chaque transaction est équilibrée', unbalanced),
      check(
        'PAYMENTS_POSTED',
        'Chaque paiement confirmé est comptabilisé',
        succeededWithoutLedger.map((p) => ({ paymentId: p.id, amount: p.amount.toFixed(0), confirmedAt: p.confirmedAt })),
      ),
      check('DEPOSITS_BACKED', 'Chaque dépôt comptabilisé correspond à un paiement confirmé', orphanDeposits),
      check(
        'CLEARING_MATCHES_PAYMENTS',
        `Compte de compensation ${this.provider.code} = total des paiements confirmés`,
        clearingBalance.equals(expectedClearing) ? [] : [{ clearingBalance: clearingBalance.toFixed(0), confirmedPayments: expectedClearing.toFixed(0) }],
      ),
    ];
    const status = checks.every((c) => c.status === 'OK') ? 'BALANCED' : 'EXCEPTIONS';
    const ranAt = new Date();
    await this.audit.record(
      {
        action: 'finance.reconciliation.run',
        resourceType: 'ledger',
        metadata: { status, checks: checks.map((c) => ({ code: c.code, status: c.status, count: c.count })) },
      },
      ctx,
    );
    return { ranAt, status, provider: { code: this.provider.code, testMode: this.provider.testMode }, checks };
  }

  async reconciliationHistory() {
    const runs = await this.prisma.auditLog.findMany({
      where: { action: 'finance.reconciliation.run' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
    });
    const names = await staffNames(this.prisma, runs.map((run) => run.actorId));
    return {
      items: runs.map((run) => ({
        id: run.id,
        ranAt: run.createdAt,
        actorId: run.actorId,
        actorName: run.actorId ? (names.get(run.actorId) ?? null) : null,
        summary: run.metadata,
      })),
    };
  }

  /** Comptes dont le solde en cache diffère de la somme de leurs écritures. */
  private async inconsistentAccounts(limit: number) {
    return this.prisma.$queryRaw<{ id: string; code: string; name: string; cached: string; computed: string }[]>`
      WITH computed AS (
        SELECT a.id, a.code, a.name, a.balance,
               CASE WHEN a.type::text IN ('ASSET', 'EXPENSE')
                 THEN COALESCE(SUM(CASE WHEN e.direction = 'DEBIT' THEN e.amount ELSE -e.amount END), 0)
                 ELSE COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE -e.amount END), 0)
               END AS computed
        FROM ledger_accounts a LEFT JOIN ledger_entries e ON e.account_id = a.id
        GROUP BY a.id
      )
      SELECT id, code, name, balance::text AS cached, computed::text AS computed
      FROM computed WHERE balance <> computed ORDER BY code LIMIT ${limit}`;
  }
}
