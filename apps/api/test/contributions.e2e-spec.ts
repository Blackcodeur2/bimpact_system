import { randomUUID } from 'node:crypto';
import { addDays, formatDay, localDay } from '../src/modules/contributions/contributions.rules';
import { ContributionsService } from '../src/modules/contributions/contributions.service';
import { TokenService } from '../src/modules/auth/token.service';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { bearer, createTestApp, registerMember, RegisteredMember, TestContext, uniquePhone } from './support/app';

describe('Contributions quotidiennes (E2E)', () => {
  let ctx: TestContext;
  let ledger: LedgerService;
  let service: ContributionsService;
  let clearingId: string;
  let poolId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    ledger = ctx.app.get(LedgerService);
    service = ctx.app.get(ContributionsService);
    clearingId = (await ctx.prisma.ledgerAccount.findUniqueOrThrow({ where: { code: 'system:provider_clearing:sandbox' } })).id;
    poolId = (await ctx.prisma.ledgerAccount.findUniqueOrThrow({ where: { code: 'system:contribution_pool' } })).id;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  /** Membre dont l'identité est vérifiée (le circuit KYC lui-même est couvert par sa propre suite). */
  async function eligibleMember(funds = '0'): Promise<RegisteredMember> {
    const member = await registerMember(ctx);
    await ctx.prisma.profile.update({ where: { userId: member.user.id }, data: { kycStatus: 'APPROVED' } });
    if (funds !== '0') await fund(member, funds);
    return member;
  }

  async function fund(member: RegisteredMember, amount: string) {
    const wallet = await ctx.prisma.wallet.findUniqueOrThrow({ where: { userId: member.user.id } });
    await ledger.post({
      reference: `test:fund:${member.user.id}:${randomUUID()}`,
      type: 'DEPOSIT',
      entries: [
        { accountId: clearingId, direction: 'DEBIT', amount },
        { accountId: wallet.availableAccountId, direction: 'CREDIT', amount },
      ],
    });
  }

  function pay(member: RegisteredMember, body: Record<string, unknown> = {}, key = randomUUID()) {
    return ctx.http().post('/v1/contributions').set(bearer(member.tokens.accessToken)).set('Idempotency-Key', key).send(body);
  }

  async function balance(member: RegisteredMember) {
    return (await ctx.http().get('/v1/wallet').set(bearer(member.tokens.accessToken)).expect(200)).body.availableBalance.amount;
  }

  it('refuse la contribution tant que l’identité n’est pas vérifiée', async () => {
    const member = await registerMember(ctx);
    const overview = await ctx.http().get('/v1/contributions').set(bearer(member.tokens.accessToken)).expect(200);
    expect(overview.body).toMatchObject({
      eligibility: { eligible: false, reasons: ['KYC_NOT_APPROVED'] },
      plan: null,
      dailyAmount: { amount: '200', currency: 'XAF' },
      payableDates: [],
    });
    expect((await pay(member).expect(403)).body.code).toBe('CONTRIBUTION_NOT_ELIGIBLE');
  });

  it('refuse sans solde suffisant, sans rien écrire', async () => {
    const member = await eligibleMember();
    const res = await pay(member).expect(422);
    expect(res.body).toMatchObject({ code: 'INSUFFICIENT_FUNDS', details: { required: { amount: '200' } } });
    expect(await ctx.prisma.contributionPlan.count({ where: { userId: member.user.id } })).toBe(0);
    expect(await ctx.prisma.contribution.count({ where: { userId: member.user.id } })).toBe(0);
  });

  it('débite 200 FCFA vers le fonds commun, une seule fois par jour', async () => {
    const member = await eligibleMember('1000');
    const poolBefore = (await ctx.prisma.ledgerAccount.findUniqueOrThrow({ where: { id: poolId } })).balance;

    const key = randomUUID();
    const first = await pay(member, {}, key).expect(201);
    expect(first.body).toMatchObject({
      replayed: false,
      contribution: { date: formatDay(localDay()), amount: { amount: '200' }, source: 'MANUAL' },
      overview: { today: { status: 'PAID' }, streak: 1, plan: { autoDebit: false, status: 'ACTIVE' } },
    });
    expect(await balance(member)).toBe('800');

    const replay = await pay(member, {}, key).expect(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    const sameDay = await pay(member).expect(201);
    expect(sameDay.body.replayed).toBe(true);
    expect(await balance(member)).toBe('800');

    const poolAfter = (await ctx.prisma.ledgerAccount.findUniqueOrThrow({ where: { id: poolId } })).balance;
    expect(poolAfter.minus(poolBefore).toString()).toBe('200');

    const history = await ctx.http().get('/v1/wallet/transactions').set(bearer(member.tokens.accessToken)).expect(200);
    expect(history.body.items[0]).toMatchObject({ type: 'CONTRIBUTION', direction: 'OUT', amount: { amount: '200' } });
  });

  it('ne débite qu’une fois pour des paiements simultanés du même jour', async () => {
    const member = await eligibleMember('1000');
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => pay(member)));
    expect(results.every((r) => r.status === 'fulfilled' && r.value.status === 201)).toBe(true);
    expect(await ctx.prisma.contribution.count({ where: { userId: member.user.id } })).toBe(1);
    expect(await balance(member)).toBe('800');
  });

  it('permet le rattrapage des 7 derniers jours depuis l’adhésion et montre les jours manqués', async () => {
    const member = await eligibleMember('2000');
    await pay(member).expect(201);
    const today = localDay();
    await ctx.prisma.contributionPlan.update({ where: { userId: member.user.id }, data: { startedOn: addDays(today, -3) } });

    await pay(member, { periodDate: formatDay(addDays(today, -1)) }).expect(201);
    expect((await pay(member, { periodDate: formatDay(addDays(today, 1)) }).expect(422)).body.code).toBe('CONTRIBUTION_DATE_IN_FUTURE');
    expect((await pay(member, { periodDate: formatDay(addDays(today, -10)) }).expect(422)).body.code).toBe('CONTRIBUTION_TOO_OLD');
    expect((await pay(member, { periodDate: formatDay(addDays(today, -5)) }).expect(422)).body.code).toBe('CONTRIBUTION_BEFORE_START');

    const overview = await ctx.http().get('/v1/contributions').set(bearer(member.tokens.accessToken)).expect(200);
    const status = (offset: number) =>
      overview.body.calendar.find((d: { date: string }) => d.date === formatDay(addDays(today, offset))).status;
    expect(status(0)).toBe('PAID');
    expect(status(-1)).toBe('PAID');
    expect(status(-2)).toBe('MISSED');
    expect(status(-5)).toBe('NOT_STARTED');
    expect(overview.body.streak).toBe(2);
    expect(overview.body.payableDates).toEqual([formatDay(addDays(today, -3)), formatDay(addDays(today, -2))]);
    expect(await balance(member)).toBe('1600');
  });

  it('prélève automatiquement les membres qui l’ont activé et prévient en cas de solde insuffisant', async () => {
    const funded = await eligibleMember('1000');
    const empty = await eligibleMember('200');
    for (const member of [funded, empty]) {
      await pay(member, { periodDate: formatDay(localDay()) }).expect(201);
      const settings = await ctx
        .http()
        .patch('/v1/contributions/settings')
        .set(bearer(member.tokens.accessToken))
        .send({ autoDebit: true })
        .expect(200);
      expect(settings.body.plan.autoDebit).toBe(true);
    }

    // Jour suivant, 07 h 30 au Cameroun : le funded a encore 800 FCFA, l'autre 0.
    const tomorrow = addDays(localDay(), 1);
    const at0730 = new Date(tomorrow.getTime() + 6.5 * 3600_000);
    const run = await service.runAutoDebit(at0730);
    expect(run).not.toBeNull();
    expect(await service.runAutoDebit(at0730)).toBeNull();

    const fundedTomorrow = await ctx.prisma.contribution.findUnique({
      where: { userId_periodDate: { userId: funded.user.id, periodDate: tomorrow } },
    });
    expect(fundedTomorrow?.source).toBe('AUTO');
    expect(await balance(funded)).toBe('600');

    const failure = await ctx.prisma.notification.findFirst({
      where: { userId: empty.user.id, type: 'CONTRIBUTION_AUTO_DEBIT_FAILED' },
    });
    expect(failure?.body).toMatch(/Solde insuffisant/);
  });

  it('envoie un rappel du soir aux membres qui n’ont pas contribué', async () => {
    const member = await eligibleMember('1000');
    await pay(member).expect(201);
    const inTwoDays = addDays(localDay(), 2);
    const at1900 = new Date(inTwoDays.getTime() + 18 * 3600_000);
    expect(await service.runReminders(at1900)).toBeGreaterThanOrEqual(1);
    expect(await ctx.prisma.notification.count({ where: { userId: member.user.id, type: 'CONTRIBUTION_DUE' } })).toBe(1);
  });

  it('affiche la contribution sur le tableau de bord et interdit de modifier une contribution', async () => {
    const member = await eligibleMember('1000');
    await pay(member).expect(201);
    const dashboard = await ctx.http().get('/v1/me/dashboard').set(bearer(member.tokens.accessToken)).expect(200);
    expect(dashboard.body.features.contributions).toBe(true);
    expect(dashboard.body.contribution).toMatchObject({
      eligible: true,
      enrolled: true,
      todayStatus: 'PAID',
      streak: 1,
      dailyAmount: { amount: '200' },
    });

    await expect(
      ctx.prisma.$executeRaw`UPDATE contributions SET amount = 1 WHERE user_id = ${member.user.id}::uuid`,
    ).rejects.toThrow(/IMMUTABLE_RECORD/);
  });

  it('réserve la supervision au back-office', async () => {
    const member = await eligibleMember('1000');
    await pay(member).expect(201);
    expect((await ctx.http().get('/v1/admin/contributions').set(bearer(member.tokens.accessToken)).expect(403)).body.code).toBe(
      'FORBIDDEN',
    );

    const role = await ctx.prisma.role.findUniqueOrThrow({ where: { code: 'FINANCE' } });
    const staff = await ctx.prisma.user.create({
      data: {
        phone: uniquePhone(),
        kind: 'STAFF',
        status: 'ACTIVE',
        profile: { create: { firstName: 'Fabrice', lastName: 'Tchoua', city: 'Douala' } },
        roles: { create: { roleId: role.id } },
      },
    });
    const { accessToken } = await ctx.prisma.$transaction((tx) =>
      ctx.app.get(TokenService).issueSession(tx, { userId: staff.id, kind: 'STAFF' }, {}),
    );

    const list = await ctx.http().get('/v1/admin/contributions').query({ date: formatDay(localDay()), limit: 100 }).set(bearer(accessToken)).expect(200);
    expect(list.body.items.some((i: { member: { userId: string } }) => i.member.userId === member.user.id)).toBe(true);
    const metrics = await ctx.http().get('/v1/admin/contributions/metrics').set(bearer(accessToken)).expect(200);
    expect(metrics.body.paidToday).toBeGreaterThanOrEqual(1);
    expect(metrics.body.last30Days).toHaveLength(30);

    expect((await ledger.trialBalance()).balanced).toBe(true);
  });
});
