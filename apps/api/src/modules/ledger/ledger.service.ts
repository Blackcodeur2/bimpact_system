import { HttpStatus, Injectable } from '@nestjs/common';
import { EntryDirection, LedgerAccountType, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app-exception';
import { Decimal, parsePositiveAmount } from '../../common/money';
import type { RequestContext } from '../../common/request-context';
import { PrismaService, Tx } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface LedgerEntryInput {
  accountId: string;
  direction: EntryDirection;
  amount: Prisma.Decimal | string;
}

export interface PostTransactionInput {
  /** Référence métier unique : reposter la même référence renvoie la transaction existante. */
  reference: string;
  type: string;
  currency?: string;
  description?: string;
  entries: LedgerEntryInput[];
  metadata?: Record<string, unknown>;
  createdById?: string | null;
  reversalOfId?: string;
}

const transactionInclude = { entries: { orderBy: { createdAt: 'asc' } } } satisfies Prisma.LedgerTransactionInclude;
export type PostedTransaction = Prisma.LedgerTransactionGetPayload<{ include: typeof transactionInclude }>;

export interface PostResult {
  transaction: PostedTransaction;
  /** true si la référence existait déjà : aucun nouveau mouvement n'a été créé. */
  replayed: boolean;
}

interface NormalizedEntry {
  accountId: string;
  direction: EntryDirection;
  amount: Prisma.Decimal;
}

interface LockedAccount {
  id: string;
  type: LedgerAccountType;
  currency: string;
  balance: string;
  allowNegative: boolean;
}

/** Un compte d'actif ou de charge augmente au débit ; passif, capitaux et produits augmentent au crédit. */
export function increasesOnDebit(type: LedgerAccountType): boolean {
  return type === 'ASSET' || type === 'EXPENSE';
}

function ledgerError(status: HttpStatus, code: string, message: string, details: Record<string, unknown> = {}) {
  return new AppException(status, code, message, details);
}

/**
 * Ledger en partie double — source de vérité financière (cahier §10).
 * - chaque transaction est équilibrée (vérifié ici ET par trigger PostgreSQL différé) ;
 * - aucune écriture n'est modifiée ou supprimée (trigger) : les corrections sont des contre-passations ;
 * - les comptes touchés sont verrouillés (FOR UPDATE, ordre stable) pour éviter les soldes concurrents incohérents ;
 * - la référence est idempotente (verrou consultatif + contrainte unique).
 */
@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createAccount(
    tx: Tx,
    data: {
      code: string;
      name: string;
      type: LedgerAccountType;
      purpose: string;
      currency?: string;
      ownerUserId?: string;
      allowNegative?: boolean;
    },
  ) {
    return tx.ledgerAccount.create({ data: { ...data, currency: data.currency ?? 'XAF' } });
  }

  async post(input: PostTransactionInput, ctx: RequestContext = {}, tx?: Tx): Promise<PostResult> {
    const currency = input.currency ?? 'XAF';
    const entries = this.validate(input, currency);
    const run = (client: Tx) => this.postInTx(client, input, currency, entries, ctx);
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /** Contre-passe intégralement une transaction (écritures inversées), une seule fois. */
  async reverse(
    transactionId: string,
    params: { reference: string; reason: string; createdById?: string | null },
    ctx: RequestContext = {},
    tx?: Tx,
  ): Promise<PostResult> {
    const run = async (client: Tx) => {
      const original = await client.ledgerTransaction.findUnique({
        where: { id: transactionId },
        include: { entries: true, reversedBy: { select: { reference: true } } },
      });
      if (!original) {
        throw ledgerError(HttpStatus.NOT_FOUND, 'LEDGER_TRANSACTION_NOT_FOUND', 'Transaction introuvable.');
      }
      if (original.reversalOfId) {
        throw ledgerError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'LEDGER_CANNOT_REVERSE_REVERSAL',
          'Une contre-passation ne peut pas être elle-même contre-passée.',
        );
      }
      if (original.reversedBy && original.reversedBy.reference !== params.reference) {
        throw ledgerError(HttpStatus.CONFLICT, 'LEDGER_ALREADY_REVERSED', 'Cette transaction a déjà été contre-passée.');
      }
      return this.post(
        {
          reference: params.reference,
          type: 'REVERSAL',
          currency: original.currency,
          description: params.reason,
          reversalOfId: original.id,
          createdById: params.createdById,
          metadata: { reason: params.reason, originalReference: original.reference },
          entries: original.entries.map((entry) => ({
            accountId: entry.accountId,
            direction: entry.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT',
            amount: entry.amount,
          })),
        },
        ctx,
        client,
      );
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /** Recalcule le solde d'un compte depuis ses écritures et le compare au cache. */
  async verifyAccountBalance(accountId: string) {
    const [row] = await this.prisma.$queryRaw<{ type: LedgerAccountType; cached: string; debits: string; credits: string }[]>`
      SELECT a.type::text AS type,
             a.balance::text AS cached,
             COALESCE(SUM(e.amount) FILTER (WHERE e.direction = 'DEBIT'), 0)::text AS debits,
             COALESCE(SUM(e.amount) FILTER (WHERE e.direction = 'CREDIT'), 0)::text AS credits
      FROM ledger_accounts a
      LEFT JOIN ledger_entries e ON e.account_id = a.id
      WHERE a.id = ${accountId}::uuid
      GROUP BY a.id`;
    if (!row) throw ledgerError(HttpStatus.NOT_FOUND, 'LEDGER_ACCOUNT_NOT_FOUND', 'Compte introuvable.');
    const debits = new Decimal(row.debits);
    const credits = new Decimal(row.credits);
    const computed = increasesOnDebit(row.type) ? debits.minus(credits) : credits.minus(debits);
    const cached = new Decimal(row.cached);
    return { cached, computed, consistent: cached.equals(computed) };
  }

  /** Balance générale : la somme de tous les débits doit égaler la somme de tous les crédits. */
  async trialBalance() {
    const [row] = await this.prisma.$queryRaw<{ debits: string; credits: string }[]>`
      SELECT COALESCE(SUM(amount) FILTER (WHERE direction = 'DEBIT'), 0)::text AS debits,
             COALESCE(SUM(amount) FILTER (WHERE direction = 'CREDIT'), 0)::text AS credits
      FROM ledger_entries`;
    const debits = new Decimal(row?.debits ?? 0);
    const credits = new Decimal(row?.credits ?? 0);
    return { debits, credits, balanced: debits.equals(credits) };
  }

  private validate(input: PostTransactionInput, currency: string): NormalizedEntry[] {
    if (!input.reference || input.reference.length > 128) {
      throw ledgerError(HttpStatus.UNPROCESSABLE_ENTITY, 'LEDGER_INVALID_REFERENCE', 'Référence de transaction invalide.');
    }
    if (input.entries.length < 2) {
      throw ledgerError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'LEDGER_UNBALANCED',
        'Une transaction nécessite au moins un débit et un crédit.',
      );
    }
    const entries = input.entries.map((entry) => ({
      accountId: entry.accountId,
      direction: entry.direction,
      amount: parsePositiveAmount(entry.amount, currency),
    }));
    const sum = (direction: EntryDirection) =>
      entries.filter((e) => e.direction === direction).reduce((acc, e) => acc.plus(e.amount), new Decimal(0));
    const debits = sum('DEBIT');
    const credits = sum('CREDIT');
    if (debits.isZero() || credits.isZero() || !debits.equals(credits)) {
      throw ledgerError(HttpStatus.UNPROCESSABLE_ENTITY, 'LEDGER_UNBALANCED', 'Transaction déséquilibrée.', {
        debits: debits.toString(),
        credits: credits.toString(),
      });
    }
    return entries;
  }

  private async postInTx(
    tx: Tx,
    input: PostTransactionInput,
    currency: string,
    entries: NormalizedEntry[],
    ctx: RequestContext,
  ): Promise<PostResult> {
    // Sérialise les tentatives concurrentes sur une même référence.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.reference}::text, 0))`;

    const existing = await tx.ledgerTransaction.findUnique({
      where: { reference: input.reference },
      include: transactionInclude,
    });
    if (existing) {
      if (!this.sameMovement(existing, input.type, currency, entries)) {
        throw ledgerError(
          HttpStatus.CONFLICT,
          'LEDGER_REFERENCE_CONFLICT',
          'Cette référence est déjà utilisée par un mouvement différent.',
          { reference: input.reference },
        );
      }
      return { transaction: existing, replayed: true };
    }

    const accountIds = [...new Set(entries.map((e) => e.accountId))].sort();
    const accounts = await tx.$queryRaw<LockedAccount[]>`
      SELECT id::text AS id, type::text AS type, currency, balance::text AS balance, allow_negative AS "allowNegative"
      FROM ledger_accounts
      WHERE id = ANY(${accountIds}::uuid[])
      ORDER BY id
      FOR UPDATE`;
    if (accounts.length !== accountIds.length) {
      throw ledgerError(HttpStatus.UNPROCESSABLE_ENTITY, 'LEDGER_ACCOUNT_NOT_FOUND', 'Compte du ledger introuvable.');
    }

    const state = new Map(accounts.map((a) => [a.id, { ...a, balance: new Decimal(a.balance) }]));
    for (const account of state.values()) {
      if (account.currency !== currency) {
        throw ledgerError(HttpStatus.UNPROCESSABLE_ENTITY, 'LEDGER_CURRENCY_MISMATCH', 'Devise incohérente.', {
          accountId: account.id,
        });
      }
    }

    const rows = entries.map((entry) => {
      const account = state.get(entry.accountId)!;
      const increases = increasesOnDebit(account.type) === (entry.direction === 'DEBIT');
      account.balance = increases ? account.balance.plus(entry.amount) : account.balance.minus(entry.amount);
      return { ...entry, currency, balanceAfter: account.balance };
    });

    for (const account of state.values()) {
      if (!account.allowNegative && account.balance.isNegative()) {
        throw ledgerError(HttpStatus.UNPROCESSABLE_ENTITY, 'INSUFFICIENT_FUNDS', 'Solde insuffisant.', {
          accountId: account.id,
        });
      }
    }

    const transaction = await tx.ledgerTransaction.create({
      data: {
        reference: input.reference,
        type: input.type,
        currency,
        description: input.description,
        reversalOfId: input.reversalOfId,
        createdById: input.createdById ?? ctx.auth?.userId ?? null,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        entries: { create: rows },
      },
      include: transactionInclude,
    });

    for (const account of state.values()) {
      await tx.ledgerAccount.update({ where: { id: account.id }, data: { balance: account.balance } });
    }

    await this.audit.record(
      {
        action: 'ledger.transaction.posted',
        resourceType: 'ledger_transaction',
        resourceId: transaction.id,
        after: {
          reference: transaction.reference,
          type: transaction.type,
          currency,
          reversalOfId: transaction.reversalOfId,
          entries: rows.map((r) => ({ accountId: r.accountId, direction: r.direction, amount: r.amount })),
        },
      },
      ctx,
      tx,
    );

    return { transaction, replayed: false };
  }

  private sameMovement(existing: PostedTransaction, type: string, currency: string, entries: NormalizedEntry[]) {
    const signature = (list: { accountId: string; direction: string; amount: Prisma.Decimal }[]) =>
      list
        .map((e) => `${e.accountId}|${e.direction}|${e.amount.toFixed(2)}`)
        .sort()
        .join(';');
    return existing.type === type && existing.currency === currency && signature(existing.entries) === signature(entries);
  }
}
