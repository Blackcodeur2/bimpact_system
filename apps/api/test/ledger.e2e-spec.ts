import { Prisma } from '@prisma/client';
import { AppException } from '../src/common/errors/app-exception';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { bearer, createTestApp, registerMember, RegisteredMember, TestContext } from './support/app';

const CLEARING = 'system:provider_clearing:sandbox';

describe('Ledger en partie double et portefeuille (intégration PostgreSQL)', () => {
  let ctx: TestContext;
  let ledger: LedgerService;
  let clearingId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    ledger = ctx.app.get(LedgerService);
    clearingId = (await ctx.prisma.ledgerAccount.findUniqueOrThrow({ where: { code: CLEARING } })).id;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function walletOf(member: RegisteredMember) {
    return ctx.prisma.wallet.findUniqueOrThrow({ where: { userId: member.user.id } });
  }

  function deposit(reference: string, availableAccountId: string, amount: string) {
    return ledger.post({
      reference,
      type: 'DEPOSIT',
      description: 'Rechargement (test)',
      entries: [
        { accountId: clearingId, direction: 'DEBIT', amount },
        { accountId: availableAccountId, direction: 'CREDIT', amount },
      ],
    });
  }

  function withdraw(reference: string, availableAccountId: string, amount: string) {
    return ledger.post({
      reference,
      type: 'WITHDRAWAL',
      entries: [
        { accountId: availableAccountId, direction: 'DEBIT', amount },
        { accountId: clearingId, direction: 'CREDIT', amount },
      ],
    });
  }

  async function errorCode(promise: Promise<unknown>): Promise<string> {
    try {
      await promise;
    } catch (error) {
      if (error instanceof AppException) return error.code;
      throw error;
    }
    throw new Error('une erreur était attendue');
  }

  it('poste un dépôt équilibré et l’expose dans le portefeuille et l’historique', async () => {
    const member = await registerMember(ctx);
    const wallet = await walletOf(member);

    const { transaction, replayed } = await deposit(`test:deposit:${member.user.id}`, wallet.availableAccountId, '25400');
    expect(replayed).toBe(false);
    expect(transaction.entries).toHaveLength(2);

    const res = await ctx.http().get('/v1/wallet').set(bearer(member.tokens.accessToken)).expect(200);
    expect(res.body.availableBalance).toEqual({ amount: '25400', currency: 'XAF' });

    const history = await ctx.http().get('/v1/wallet/transactions').set(bearer(member.tokens.accessToken)).expect(200);
    expect(history.body.items).toHaveLength(1);
    expect(history.body.items[0]).toMatchObject({
      type: 'DEPOSIT',
      direction: 'IN',
      amount: { amount: '25400', currency: 'XAF' },
      balanceAfter: { amount: '25400', currency: 'XAF' },
      bucket: 'AVAILABLE',
      status: 'POSTED',
    });
  });

  it('pagine l’historique par curseur sans doublon ni trou', async () => {
    const member = await registerMember(ctx);
    const wallet = await walletOf(member);
    for (let i = 1; i <= 5; i++) {
      await deposit(`test:page:${member.user.id}:${i}`, wallet.availableAccountId, `${i * 100}`);
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const query: Record<string, string | number> = { limit: 2 };
      if (cursor) query.cursor = cursor;
      const page = await ctx.http().get('/v1/wallet/transactions').query(query).set(bearer(member.tokens.accessToken)).expect(200);
      seen.push(...page.body.items.map((item: { id: string }) => item.id));
      cursor = page.body.nextCursor;
    } while (cursor);

    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it('est idempotent sur la référence et refuse une référence réutilisée pour un autre montant', async () => {
    const member = await registerMember(ctx);
    const wallet = await walletOf(member);
    const reference = `test:idem:${member.user.id}`;

    const first = await deposit(reference, wallet.availableAccountId, '1000');
    const again = await deposit(reference, wallet.availableAccountId, '1000');
    expect(again.replayed).toBe(true);
    expect(again.transaction.id).toBe(first.transaction.id);

    expect(await errorCode(deposit(reference, wallet.availableAccountId, '5000'))).toBe('LEDGER_REFERENCE_CONFLICT');

    const account = await ctx.prisma.ledgerAccount.findUniqueOrThrow({ where: { id: wallet.availableAccountId } });
    expect(account.balance.toString()).toBe('1000');
  });

  it('ne crée qu’un seul mouvement quand la même référence arrive en parallèle', async () => {
    const member = await registerMember(ctx);
    const wallet = await walletOf(member);
    const reference = `test:parallel-idem:${member.user.id}`;

    const results = await Promise.all(Array.from({ length: 6 }, () => deposit(reference, wallet.availableAccountId, '700')));
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(await ctx.prisma.ledgerTransaction.count({ where: { reference } })).toBe(1);

    const account = await ctx.prisma.ledgerAccount.findUniqueOrThrow({ where: { id: wallet.availableAccountId } });
    expect(account.balance.toString()).toBe('700');
  });

  it('refuse un retrait supérieur au solde sans rien écrire', async () => {
    const member = await registerMember(ctx);
    const wallet = await walletOf(member);
    await deposit(`test:funds:${member.user.id}`, wallet.availableAccountId, '500');

    const reference = `test:overdraft:${member.user.id}`;
    expect(await errorCode(withdraw(reference, wallet.availableAccountId, '600'))).toBe('INSUFFICIENT_FUNDS');
    expect(await ctx.prisma.ledgerTransaction.count({ where: { reference } })).toBe(0);
  });

  it('garde un solde exact sous retraits concurrents (verrouillage des comptes)', async () => {
    const member = await registerMember(ctx);
    const wallet = await walletOf(member);
    await deposit(`test:concurrency-funds:${member.user.id}`, wallet.availableAccountId, '5000');

    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) => withdraw(`test:concurrency:${member.user.id}:${i}`, wallet.availableAccountId, '1000')),
    );
    const succeeded = attempts.filter((a) => a.status === 'fulfilled');
    const failed = attempts.filter((a): a is PromiseRejectedResult => a.status === 'rejected');
    expect(succeeded).toHaveLength(5);
    expect(failed.every((f) => f.reason instanceof AppException && f.reason.code === 'INSUFFICIENT_FUNDS')).toBe(true);

    const check = await ledger.verifyAccountBalance(wallet.availableAccountId);
    expect(check.computed.toString()).toBe('0');
    expect(check.consistent).toBe(true);
  });

  it('contre-passe une transaction une seule fois', async () => {
    const member = await registerMember(ctx);
    const wallet = await walletOf(member);
    const { transaction } = await deposit(`test:reverse:${member.user.id}`, wallet.availableAccountId, '3000');

    const reversal = await ledger.reverse(transaction.id, { reference: `test:reverse:${member.user.id}:r1`, reason: 'Erreur de saisie (test)' });
    expect(reversal.transaction.reversalOfId).toBe(transaction.id);
    expect((await ctx.prisma.ledgerAccount.findUniqueOrThrow({ where: { id: wallet.availableAccountId } })).balance.toString()).toBe('0');

    const replay = await ledger.reverse(transaction.id, { reference: `test:reverse:${member.user.id}:r1`, reason: 'Erreur de saisie (test)' });
    expect(replay.replayed).toBe(true);
    expect(
      await errorCode(ledger.reverse(transaction.id, { reference: `test:reverse:${member.user.id}:r2`, reason: 'Doublon' })),
    ).toBe('LEDGER_ALREADY_REVERSED');

    const history = await ctx.http().get('/v1/wallet/transactions').set(bearer(member.tokens.accessToken)).expect(200);
    expect(history.body.items.map((i: { direction: string; isReversal: boolean }) => [i.direction, i.isReversal])).toEqual([
      ['OUT', true],
      ['IN', false],
    ]);
  });

  describe('garanties appliquées par PostgreSQL', () => {
    it('interdit la modification et la suppression des écritures et de l’audit', async () => {
      const member = await registerMember(ctx);
      const wallet = await walletOf(member);
      const { transaction } = await deposit(`test:immutable:${member.user.id}`, wallet.availableAccountId, '100');

      await expect(
        ctx.prisma.$executeRaw`UPDATE ledger_entries SET amount = 1000000 WHERE transaction_id = ${transaction.id}::uuid`,
      ).rejects.toThrow(/IMMUTABLE_RECORD/);
      await expect(
        ctx.prisma.$executeRaw`DELETE FROM ledger_transactions WHERE id = ${transaction.id}::uuid`,
      ).rejects.toThrow(/IMMUTABLE_RECORD/);
      await expect(ctx.prisma.$executeRaw`DELETE FROM audit_logs`).rejects.toThrow(/IMMUTABLE_RECORD/);
    });

    it('refuse au COMMIT une transaction déséquilibrée insérée hors du service', async () => {
      const member = await registerMember(ctx);
      const wallet = await walletOf(member);

      await expect(
        ctx.prisma.$transaction(async (tx) => {
          const t = await tx.ledgerTransaction.create({ data: { reference: `test:raw:${member.user.id}`, type: 'HACK', currency: 'XAF' } });
          await tx.ledgerEntry.create({
            data: { transactionId: t.id, accountId: wallet.availableAccountId, direction: 'CREDIT', amount: new Prisma.Decimal(1_000_000), currency: 'XAF', balanceAfter: new Prisma.Decimal(1_000_000) },
          });
        }),
      ).rejects.toThrow(/LEDGER_UNBALANCED/);
      expect(await ctx.prisma.ledgerTransaction.count({ where: { reference: `test:raw:${member.user.id}` } })).toBe(0);
    });

    it('garde la balance générale équilibrée et les soldes en cache vérifiables', async () => {
      const trial = await ledger.trialBalance();
      expect(trial.balanced).toBe(true);

      const accounts = await ctx.prisma.ledgerAccount.findMany({ select: { id: true } });
      for (const { id } of accounts) {
        expect((await ledger.verifyAccountBalance(id)).consistent).toBe(true);
      }
    });
  });
});
