import { randomUUID } from 'node:crypto';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { SandboxPaymentProvider } from '../src/modules/payments/sandbox-payment.provider';
import { bearer, createTestApp, registerMember, RegisteredMember, TestContext } from './support/app';

describe('Paiements — rechargement par fournisseur sandbox (E2E)', () => {
  let ctx: TestContext;
  let sandbox: SandboxPaymentProvider;

  beforeAll(async () => {
    ctx = await createTestApp();
    sandbox = ctx.app.get(SandboxPaymentProvider);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  function createIntent(member: RegisteredMember, body: Record<string, unknown>, key: string | null = randomUUID()) {
    const req = ctx.http().post('/v1/payments/intents').set(bearer(member.tokens.accessToken));
    if (key) req.set('Idempotency-Key', key);
    return req.send(body);
  }

  function sendWebhook(externalReference: string, status: 'SUCCEEDED' | 'FAILED') {
    const { rawBody, headers } = sandbox.buildWebhook(externalReference, status);
    return { rawBody, request: () => postRaw(rawBody, headers) };
  }

  function postRaw(rawBody: Buffer, headers: Record<string, string>) {
    return ctx
      .http()
      .post('/v1/payments/webhooks/sandbox')
      .set(headers)
      .set('Content-Type', 'application/json')
      .send(rawBody.toString('utf8'));
  }

  async function availableBalance(member: RegisteredMember) {
    const res = await ctx.http().get('/v1/wallet').set(bearer(member.tokens.accessToken)).expect(200);
    return res.body.availableBalance.amount as string;
  }

  it('annonce clairement le mode test et les moyens de paiement', async () => {
    const member = await registerMember(ctx);
    const res = await ctx.http().get('/v1/payments/methods').set(bearer(member.tokens.accessToken)).expect(200);
    expect(res.body).toMatchObject({
      provider: 'sandbox',
      testMode: true,
      currency: 'XAF',
      minAmount: { amount: '500' },
      channels: [
        { code: 'MTN_MOMO', label: 'MTN Mobile Money' },
        { code: 'ORANGE_MONEY', label: 'Orange Money' },
      ],
    });
  });

  it('exige une clé d’idempotence et valide le montant', async () => {
    const member = await registerMember(ctx);
    expect((await createIntent(member, { amount: '5000', channel: 'MTN_MOMO' }, null).expect(400)).body.code).toBe(
      'IDEMPOTENCY_KEY_REQUIRED',
    );
    expect((await createIntent(member, { amount: '100', channel: 'MTN_MOMO' }).expect(422)).body.code).toBe(
      'PAYMENT_AMOUNT_OUT_OF_RANGE',
    );
    expect((await createIntent(member, { amount: '12.5', channel: 'MTN_MOMO' }).expect(400)).body.code).toBe(
      'VALIDATION_FAILED',
    );
  });

  it('ne crédite rien à l’initiation, puis crédite une seule fois à la confirmation', async () => {
    const member = await registerMember(ctx);
    const key = randomUUID();
    const created = await createIntent(member, { amount: '5000', channel: 'MTN_MOMO' }, key).expect(201);
    expect(created.body).toMatchObject({
      status: 'PENDING',
      testMode: true,
      amount: { amount: '5000', currency: 'XAF' },
      payerPhone: member.phone,
      ledgerTransactionId: null,
    });
    expect(created.body.payerInstructions).toMatch(/Mode test/);

    // Même clé, même requête : même intention, rejouée.
    const replay = await createIntent(member, { amount: '5000', channel: 'MTN_MOMO' }, key).expect(201);
    expect(replay.body.id).toBe(created.body.id);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    // Même clé, requête différente : refusée.
    expect((await createIntent(member, { amount: '9000', channel: 'MTN_MOMO' }, key).expect(422)).body.code).toBe(
      'IDEMPOTENCY_KEY_REUSED',
    );

    expect(await availableBalance(member)).toBe('0');

    const webhook = sendWebhook(created.body.externalReference, 'SUCCEEDED');
    expect((await webhook.request().expect(200)).body).toEqual({ received: true, duplicate: false });

    const confirmed = await ctx.http().get(`/v1/payments/${created.body.id}`).set(bearer(member.tokens.accessToken)).expect(200);
    expect(confirmed.body.status).toBe('SUCCEEDED');
    expect(confirmed.body.ledgerTransactionId).toEqual(expect.any(String));
    expect(await availableBalance(member)).toBe('5000');

    // Le même webhook rejoué ne crédite pas deux fois.
    const duplicate = await postRaw(webhook.rawBody, sandbox.buildWebhook('x', 'SUCCEEDED').headers).expect(401);
    expect(duplicate.body.code).toBe('WEBHOOK_SIGNATURE_INVALID');
    const { rawBody, headers } = sandbox.buildWebhook(created.body.externalReference, 'SUCCEEDED');
    await postRaw(rawBody, headers).expect(200);
    expect((await postRaw(rawBody, headers).expect(200)).body).toEqual({ received: true, duplicate: true });
    expect(await availableBalance(member)).toBe('5000');

    const history = await ctx.http().get('/v1/wallet/transactions').set(bearer(member.tokens.accessToken)).expect(200);
    expect(history.body.items).toHaveLength(1);
    expect(history.body.items[0]).toMatchObject({ type: 'DEPOSIT', direction: 'IN', amount: { amount: '5000' } });

    const notifications = await ctx.http().get('/v1/notifications').set(bearer(member.tokens.accessToken)).expect(200);
    expect(notifications.body.items[0]).toMatchObject({ type: 'PAYMENT_SUCCEEDED', readAt: null });
    expect((await ctx.http().get('/v1/notifications/unread-count').set(bearer(member.tokens.accessToken)).expect(200)).body.count).toBe(1);
    await ctx.http().post('/v1/notifications/read-all').set(bearer(member.tokens.accessToken)).expect(200);
    expect((await ctx.http().get('/v1/notifications/unread-count').set(bearer(member.tokens.accessToken)).expect(200)).body.count).toBe(0);
  });

  it('refuse un webhook dont la signature est invalide', async () => {
    const { rawBody } = sandbox.buildWebhook('sbx_inconnu', 'SUCCEEDED');
    const res = await postRaw(rawBody, { 'x-sandbox-signature': 'f'.repeat(64) }).expect(401);
    expect(res.body.code).toBe('WEBHOOK_SIGNATURE_INVALID');
  });

  it('enregistre un échec sans créditer', async () => {
    const member = await registerMember(ctx);
    const failingPhone = `${member.phone.slice(0, -4)}0000`;
    const created = await createIntent(member, { amount: '2000', channel: 'ORANGE_MONEY', payerPhone: failingPhone }).expect(201);
    await sendWebhook(created.body.externalReference, 'FAILED').request().expect(200);

    const failed = await ctx.http().get(`/v1/payments/${created.body.id}`).set(bearer(member.tokens.accessToken)).expect(200);
    expect(failed.body).toMatchObject({ status: 'FAILED', failure: { code: 'INSUFFICIENT_FUNDS' } });
    expect(await availableBalance(member)).toBe('0');
  });

  it('confirme par interrogation de l’opérateur quand le webhook n’arrive pas', async () => {
    const member = await registerMember(ctx);
    const created = await createIntent(member, { amount: '1500', channel: 'MTN_MOMO' }).expect(201);
    await ctx.prisma.paymentIntent.update({ where: { id: created.body.id }, data: { createdAt: new Date(Date.now() - 120_000) } });

    const polled = await ctx.http().get(`/v1/payments/${created.body.id}`).set(bearer(member.tokens.accessToken)).expect(200);
    expect(polled.body.status).toBe('SUCCEEDED');
    expect(await availableBalance(member)).toBe('1500');
  });

  it('annule, expire, et crédite quand même un paiement confirmé tardivement', async () => {
    const member = await registerMember(ctx);
    const auth = bearer(member.tokens.accessToken);

    const toCancel = await createIntent(member, { amount: '1000', channel: 'MTN_MOMO' }).expect(201);
    expect((await ctx.http().post(`/v1/payments/${toCancel.body.id}/cancel`).set(auth).expect(200)).body.status).toBe('CANCELLED');
    expect((await ctx.http().post(`/v1/payments/${toCancel.body.id}/cancel`).set(auth).expect(409)).body.code).toBe(
      'PAYMENT_NOT_CANCELLABLE',
    );
    await sendWebhook(toCancel.body.externalReference, 'SUCCEEDED').request().expect(200);
    expect((await ctx.http().get(`/v1/payments/${toCancel.body.id}`).set(auth).expect(200)).body.status).toBe('SUCCEEDED');
    expect(await availableBalance(member)).toBe('1000');
    const late = await ctx.prisma.auditLog.findFirst({ where: { resourceId: toCancel.body.id, action: 'payment.succeeded.late' } });
    expect(late).not.toBeNull();

    const pendingPhone = `${member.phone.slice(0, -4)}1111`;
    const stuck = await createIntent(member, { amount: '800', channel: 'MTN_MOMO', payerPhone: pendingPhone }).expect(201);
    await ctx.prisma.paymentIntent.update({ where: { id: stuck.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await ctx.app.get(PaymentsService).expireStale()).toBeGreaterThanOrEqual(1);
    expect((await ctx.http().get(`/v1/payments/${stuck.body.id}`).set(auth).expect(200)).body.status).toBe('EXPIRED');
  });

  it('ne crée qu’une intention pour des requêtes simultanées avec la même clé', async () => {
    const member = await registerMember(ctx);
    const key = randomUUID();
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => createIntent(member, { amount: '3000', channel: 'MTN_MOMO' }, key)),
    );
    const ids = new Set(
      results.flatMap((r) => (r.status === 'fulfilled' && r.value.status === 201 ? [r.value.body.id as string] : [])),
    );
    expect(ids.size).toBe(1);
    expect(await ctx.prisma.paymentIntent.count({ where: { userId: member.user.id } })).toBe(1);
  });

  it('garde la balance générale équilibrée', async () => {
    expect((await ctx.app.get(LedgerService).trialBalance()).balanced).toBe(true);
  });
});
