import { randomUUID } from 'node:crypto';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { bearer, createTestApp, registerMember, RegisteredMember, TestContext } from './support/app';
import { approveKyc, fundWallet, JPEG, staffToken } from './support/staff';

describe('Accidents et solidarité volontaire (E2E)', () => {
  let ctx: TestContext;
  let claims: string;
  let superAdmin: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    claims = (await staffToken(ctx, 'CLAIMS')).token;
    superAdmin = (await staffToken(ctx, 'SUPER_ADMIN')).token;
  });

  afterAll(async () => {
    // Paramètres partagés par les autres suites : retour aux valeurs prudentes.
    await ctx.http().patch('/v1/admin/settings').set(bearer(superAdmin)).send({ values: { 'solidarity.enabled': 'false', 'solidarity.waiting_days': '30' } });
    await ctx.app.close();
  });

  const auth = (member: RegisteredMember) => bearer(member.tokens.accessToken);

  function report(member: RegisteredMember, body: Record<string, unknown>, key: string | null = randomUUID()) {
    const req = ctx.http().post('/v1/accidents').set(auth(member));
    if (key) req.set('Idempotency-Key', key);
    return req.send(body);
  }

  const accident = (overrides: Record<string, unknown> = {}) => ({
    date: new Date().toISOString(),
    location: 'Douala, carrefour Ndokoti',
    severity: 'MODERATE',
    thirdPartyInvolved: true,
    hospitalName: 'Hôpital Laquintinie',
    description: 'Chute après un freinage brusque, entorse au poignet.',
    requestedAmount: '1000',
    ...overrides,
  });

  async function balance(member: RegisteredMember) {
    return (await ctx.http().get('/v1/wallet').set(auth(member)).expect(200)).body.availableBalance.amount as string;
  }

  it('publie une configuration mobile sans contact inventé ni collecte activée par défaut', async () => {
    const config = await ctx.http().get('/v1/config/mobile').expect(200);
    expect(config.body).toMatchObject({
      maintenance: { enabled: false, message: null },
      features: { solidarityCollections: false, paymentsTestMode: true },
      support: { phone: null, whatsapp: null, emergencyPhone: null },
      contribution: { dailyAmount: { amount: '200', currency: 'XAF' } },
    });
  });

  it('exige une identité vérifiée et le règlement en vigueur pour adhérer ; l’adhésion est résiliable', async () => {
    const member = await registerMember(ctx);
    const status = await ctx.http().get('/v1/solidarity/me').set(auth(member)).expect(200);
    expect(status.body).toMatchObject({ membership: null, covered: false, canJoin: false, rules: { collectionsEnabled: false, rulesVersion: '2026-09' } });
    expect(status.body.rulesText.join(' ')).toContain('pas une assurance');

    expect((await ctx.http().post('/v1/solidarity/join').set(auth(member)).send({ rulesVersion: '2026-09' }).expect(403)).body.code).toBe(
      'SOLIDARITY_KYC_REQUIRED',
    );
    await approveKyc(ctx, member);
    expect((await ctx.http().post('/v1/solidarity/join').set(auth(member)).send({ rulesVersion: '2025-01' }).expect(409)).body.code).toBe(
      'SOLIDARITY_RULES_OUTDATED',
    );

    const joined = await ctx.http().post('/v1/solidarity/join').set(auth(member)).send({ rulesVersion: '2026-09' }).expect(200);
    expect(joined.body).toMatchObject({ membership: { status: 'ACTIVE', rulesUpToDate: true }, covered: false, reasons: ['WAITING_PERIOD'] });
    expect(await ctx.prisma.consent.count({ where: { userId: member.user.id, type: 'SOLIDARITY_RULES' } })).toBe(1);

    const left = await ctx.http().post('/v1/solidarity/leave').set(auth(member)).expect(200);
    expect(left.body).toMatchObject({ membership: { status: 'LEFT' }, reasons: ['NOT_MEMBER'] });
    expect((await ctx.http().post('/v1/solidarity/leave').set(auth(member)).expect(409)).body.code).toBe('SOLIDARITY_NOT_MEMBER');
  });

  it('suit un dossier : déclaration idempotente, justificatifs, demande de pièces, décision motivée', async () => {
    const member = await registerMember(ctx);
    expect((await report(member, accident(), null).expect(400)).body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect((await report(member, accident({ date: new Date(Date.now() + 86_400_000).toISOString() })).expect(422)).body.code).toBe(
      'ACCIDENT_DATE_IN_FUTURE',
    );
    expect((await report(member, accident({ requestedAmount: '12.5' })).expect(400)).body.code).toBe('VALIDATION_FAILED');

    const key = randomUUID();
    const body = accident();
    const created = await report(member, body, key).expect(201);
    expect(created.body).toMatchObject({
      status: 'SUBMITTED',
      requestedAmount: { amount: '1000', currency: 'XAF' },
      solidarityEligible: false,
      canAddDocuments: true,
      timeline: [{ type: 'SUBMITTED', status: 'SUBMITTED' }],
    });
    expect(created.body.reference).toMatch(/^ACC-\d{4}-[A-Z2-9]{6}$/);
    const replay = await report(member, body, key).expect(201);
    expect(replay.body.id).toBe(created.body.id);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    const claimId: string = created.body.id;

    const upload = (type: string, content: Buffer) =>
      ctx.http().post(`/v1/accidents/${claimId}/documents`).set(auth(member)).field('type', type).attach('file', content, { filename: 'piece.jpg', contentType: 'image/jpeg' });
    expect((await upload('ORDONNANCE', Buffer.from('pas une image')).expect(415)).body.code).toBe('DOCUMENT_INVALID_TYPE');
    const withDocument = await upload('ORDONNANCE', JPEG).expect(201);
    expect(withDocument.body.documents).toHaveLength(1);
    expect(withDocument.body.documents[0].url).toMatch(/^\/v1\/files\//);

    const other = await registerMember(ctx);
    await ctx.http().get(`/v1/accidents/${claimId}`).set(auth(other)).expect(404);
    expect((await ctx.http().post(`/v1/admin/accidents/${claimId}/approve`).set(auth(member)).send({ approvedAmount: '500', reason: 'Tentative' }).expect(403)).body.code).toBe(
      'FORBIDDEN',
    );

    await ctx.http().post(`/v1/admin/accidents/${claimId}/request-documents`).set(bearer(claims)).send({ reason: 'Merci d’ajouter la facture de l’hôpital.' }).expect(200);
    const pending = await ctx.http().get(`/v1/accidents/${claimId}`).set(auth(member)).expect(200);
    expect(pending.body).toMatchObject({ status: 'DOCUMENTS_PENDING', decisionReason: 'Merci d’ajouter la facture de l’hôpital.' });

    const answered = await ctx.http().post(`/v1/accidents/${claimId}/messages`).set(auth(member)).send({ message: 'Facture ajoutée ce matin.' }).expect(200);
    expect(answered.body.status).toBe('SUBMITTED');

    await ctx.http().post(`/v1/admin/accidents/${claimId}/investigate`).set(bearer(claims)).send({ internalNote: 'Appeler l’hôpital.' }).expect(200);
    expect((await ctx.http().post(`/v1/admin/accidents/${claimId}/approve`).set(bearer(claims)).send({ approvedAmount: '5000', reason: 'Montant trop élevé' }).expect(422)).body.code).toBe(
      'ACCIDENT_AMOUNT_ABOVE_REQUEST',
    );
    const approved = await ctx.http().post(`/v1/admin/accidents/${claimId}/approve`).set(bearer(claims)).send({ approvedAmount: '800', reason: 'Frais justifiés.' }).expect(200);
    // Non couvert par le fonds : décision acquise, aucun mouvement d'argent.
    expect(approved.body).toMatchObject({ status: 'APPROVED', approvedAmount: { amount: '800' }, disbursedAmount: null });
    expect((await ctx.http().post(`/v1/admin/accidents/${claimId}/disburse`).set(bearer(claims)).expect(409)).body.code).toBe('SOLIDARITY_NOT_APPLICABLE');

    const memberView = await ctx.http().get(`/v1/accidents/${claimId}`).set(auth(member)).expect(200);
    expect(memberView.body.internalNotes).toBeUndefined();
    expect(memberView.body.canAddDocuments).toBe(false);
    expect(memberView.body.timeline.map((e: { type: string }) => e.type)).toEqual([
      'SUBMITTED',
      'DOCUMENT_ADDED',
      'DOCUMENTS_REQUESTED',
      'MEMBER_MESSAGE',
      'INVESTIGATION_STARTED',
      'APPROVED',
    ]);
    await expect(ctx.prisma.$executeRaw`UPDATE accident_claim_events SET message = 'x' WHERE claim_id = ${claimId}::uuid`).rejects.toThrow(/IMMUTABLE_RECORD/);
  });

  it('collecte uniquement auprès des adhérents, verse l’aide dans la limite du fonds et reste rejouable', async () => {
    await ctx
      .http()
      .patch('/v1/admin/settings')
      .set(bearer(superAdmin))
      .send({ values: { 'solidarity.enabled': 'true', 'solidarity.waiting_days': '0', 'solidarity.contribution_amount': '500' } })
      .expect(200);

    const makeMember = async (funds: string | null, join: boolean) => {
      const member = await registerMember(ctx);
      await approveKyc(ctx, member);
      if (funds) await fundWallet(ctx, member, funds);
      if (join) await ctx.http().post('/v1/solidarity/join').set(auth(member)).send({ rulesVersion: '2026-09' }).expect(200);
      return member;
    };
    const claimant = await makeMember(null, true);
    const payerA = await makeMember('1000', true);
    const payerB = await makeMember('1000', true);
    const broke = await makeMember(null, true);
    const outsider = await makeMember('1000', false);
    const poolBefore = (await ctx.prisma.ledgerAccount.findUniqueOrThrow({ where: { code: 'system:solidarity_pool' } })).balance.toString();

    const created = await report(claimant, accident({ requestedAmount: '200000' })).expect(201);
    expect(created.body.solidarityEligible).toBe(true);
    const claimId: string = created.body.id;

    // Plafond par défaut : 150 000 FCFA.
    const cap = await ctx.http().post(`/v1/admin/accidents/${claimId}/approve`).set(bearer(claims)).send({ approvedAmount: '160000', reason: 'Test plafond' }).expect(422);
    expect(cap.body.code).toBe('ACCIDENT_AMOUNT_ABOVE_CAP');

    const approved = await ctx
      .http()
      .post(`/v1/admin/accidents/${claimId}/approve`)
      .set(bearer(claims))
      .send({ approvedAmount: '5000', reason: 'Hospitalisation justifiée.' })
      .expect(200);
    const collectedHere = 1000; // deux adhérents solvables × 500
    const disbursed = Math.min(5000, Number(poolBefore) + collectedHere);
    expect(approved.body).toMatchObject({ status: 'DISBURSED', disbursedAmount: { amount: String(disbursed) } });

    expect(await balance(payerA)).toBe('500');
    expect(await balance(payerB)).toBe('500');
    expect(await balance(broke)).toBe('0');
    expect(await balance(outsider)).toBe('1000');
    expect(await balance(claimant)).toBe(String(disbursed));
    expect(await ctx.prisma.notification.count({ where: { userId: payerA.user.id, type: 'SOLIDARITY_CONTRIBUTION' } })).toBe(1);
    expect(await ctx.prisma.notification.count({ where: { userId: outsider.user.id, type: 'SOLIDARITY_CONTRIBUTION' } })).toBe(0);

    // Relance du versement : aucun nouveau prélèvement ni double aide.
    await ctx.http().post(`/v1/admin/accidents/${claimId}/disburse`).set(bearer(claims)).expect(200);
    expect(await balance(payerA)).toBe('500');
    expect(await balance(claimant)).toBe(String(disbursed));

    const timeline = (await ctx.http().get(`/v1/accidents/${claimId}`).set(auth(claimant)).expect(200)).body.timeline;
    expect(timeline.at(-1)).toMatchObject({ type: 'DISBURSED', status: 'DISBURSED' });
    expect((await ctx.app.get(LedgerService).trialBalance()).balanced).toBe(true);

    await ctx.http().post(`/v1/admin/accidents/${claimId}/close`).set(bearer(claims)).send({}).expect(200);
    expect((await ctx.http().post(`/v1/accidents/${claimId}/messages`).set(auth(claimant)).send({ message: 'Merci' }).expect(409)).body.code).toBe(
      'ACCIDENT_CLAIM_LOCKED',
    );
  });
});
