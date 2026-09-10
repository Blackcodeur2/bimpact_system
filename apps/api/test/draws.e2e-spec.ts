import { randomUUID } from 'node:crypto';
import { TokenService } from '../src/modules/auth/token.service';
import { ContributionsService } from '../src/modules/contributions/contributions.service';
import { verifyDraw } from '../src/modules/draws/draw.algorithm';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { bearer, createTestApp, registerMember, RegisteredMember, TestContext, uniquePhone } from './support/app';

describe('Tirages vérifiables, bénéficiaires et parcours (E2E)', () => {
  let ctx: TestContext;
  let compliance: string;
  let secondCompliance: string;
  let program: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    compliance = await staffToken('COMPLIANCE');
    secondCompliance = await staffToken('COMPLIANCE');
    program = await staffToken('PROGRAM');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function staffToken(roleCode: string): Promise<string> {
    const role = await ctx.prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    const staff = await ctx.prisma.user.create({
      data: {
        phone: uniquePhone(),
        kind: 'STAFF',
        status: 'ACTIVE',
        profile: { create: { firstName: 'Agent', lastName: roleCode, city: 'Yaoundé' } },
        roles: { create: { roleId: role.id } },
      },
    });
    const session = await ctx.prisma.$transaction((tx) =>
      ctx.app.get(TokenService).issueSession(tx, { userId: staff.id, kind: 'STAFF' }, {}),
    );
    return session.accessToken;
  }

  /** Membre vérifié ayant payé sa contribution du jour. */
  async function contributor(): Promise<RegisteredMember> {
    const member = await registerMember(ctx);
    await ctx.prisma.profile.update({ where: { userId: member.user.id }, data: { kycStatus: 'APPROVED' } });
    const wallet = await ctx.prisma.wallet.findUniqueOrThrow({ where: { userId: member.user.id } });
    const clearing = await ctx.prisma.ledgerAccount.findUniqueOrThrow({ where: { code: 'system:provider_clearing:sandbox' } });
    await ctx.app.get(LedgerService).post({
      reference: `test:fund:${randomUUID()}`,
      type: 'DEPOSIT',
      entries: [
        { accountId: clearing.id, direction: 'DEBIT', amount: '1000' },
        { accountId: wallet.availableAccountId, direction: 'CREDIT', amount: '1000' },
      ],
    });
    await ctx.app.get(ContributionsService).pay(member.user.id, {}, {});
    return member;
  }

  function createDraw(token: string, body: Record<string, unknown>) {
    return ctx.http().post('/v1/admin/draws').set(bearer(token)).send(body);
  }

  const tomorrow = () => new Date(Date.now() + 24 * 3600_000).toISOString();

  it('valide la création d’un tirage et exige des participants éligibles pour le figer', async () => {
    expect((await createDraw(compliance, { title: 'Tirage passé', scheduledAt: '2020-01-01T10:00:00Z', winnerCount: 1 }).expect(422)).body.code).toBe(
      'DRAW_DATE_IN_PAST',
    );
    const impossible = await createDraw(compliance, { title: 'Tirage impossible', scheduledAt: tomorrow(), winnerCount: 1, minPaidDays: 365, windowDays: 365 }).expect(201);
    const frozen = await ctx.http().post(`/v1/admin/draws/${impossible.body.id}/freeze`).set(bearer(compliance)).expect(422);
    expect(frozen.body.code).toBe('DRAW_NO_ELIGIBLE_PARTICIPANTS');
    await ctx.http().post(`/v1/admin/draws/${impossible.body.id}/cancel`).set(bearer(compliance)).send({ reason: 'Critères trop stricts (test)' }).expect(200);
  });

  it('déroule un tirage complet, vérifiable publiquement et soumis aux quatre yeux', async () => {
    const eligible = [await contributor(), await contributor(), await contributor()];
    const notContributing = await registerMember(ctx);
    await ctx.prisma.profile.update({ where: { userId: notContributing.user.id }, data: { kycStatus: 'APPROVED' } });

    const member = eligible[0]!;
    expect((await createDraw(member.tokens.accessToken, { title: 'Pirate', scheduledAt: tomorrow(), winnerCount: 1 }).expect(403)).body.code).toBe('FORBIDDEN');

    const created = await createDraw(compliance, { title: 'Tirage de septembre', scheduledAt: tomorrow(), winnerCount: 2, minPaidDays: 1, windowDays: 7 }).expect(201);
    const drawId: string = created.body.id;
    expect(created.body).toMatchObject({ status: 'DRAFT', winnerCount: 2, minPaidDays: 1, windowDays: 7 });

    const next = await ctx.http().get('/v1/draws/next').set(bearer(member.tokens.accessToken)).expect(200);
    expect(next.body.eligibility).toMatchObject({ eligible: true, paidDays: 1 });
    const nextOther = await ctx.http().get('/v1/draws/next').set(bearer(notContributing.tokens.accessToken)).expect(200);
    expect(nextOther.body.eligibility.reasons).toContain('NOT_ENOUGH_CONTRIBUTIONS');

    // Gel : liste figée, empreinte et engagement publiés, graine cachée.
    const frozen = await ctx.http().post(`/v1/admin/draws/${drawId}/freeze`).set(bearer(compliance)).expect(200);
    expect(frozen.body).toMatchObject({ status: 'FROZEN', seedRevealed: null });
    expect(frozen.body.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(frozen.body.seedCommitment).toMatch(/^[0-9a-f]{64}$/);
    expect((await ctx.http().post(`/v1/admin/draws/${drawId}/freeze`).set(bearer(compliance)).expect(409)).body.code).toBe('DRAW_INVALID_STATUS');

    const auditBefore = await ctx.http().get(`/v1/draws/${drawId}/audit`).expect(200);
    expect(auditBefore.body.seed).toBeNull();
    expect(auditBefore.body.participants).toHaveLength(frozen.body.eligibleCount);
    expect(JSON.stringify(auditBefore.body)).not.toContain(member.phone);

    for (const participant of eligible) {
      const mine = await ctx.http().get(`/v1/draws/${drawId}`).set(bearer(participant.tokens.accessToken)).expect(200);
      expect(mine.body.myResult).toMatchObject({ included: true, selected: null });
    }
    const excluded = await ctx.http().get(`/v1/draws/${drawId}`).set(bearer(notContributing.tokens.accessToken)).expect(200);
    expect(excluded.body.myResult.included).toBe(false);

    // Exécution puis publication par un second administrateur.
    const executed = await ctx.http().post(`/v1/admin/draws/${drawId}/execute`).set(bearer(compliance)).expect(200);
    expect(executed.body.status).toBe('EXECUTED');
    expect((await ctx.http().get(`/v1/draws/${drawId}/results`).set(bearer(member.tokens.accessToken)).expect(409)).body.code).toBe('DRAW_NOT_PUBLISHED');
    expect((await ctx.http().post(`/v1/admin/draws/${drawId}/publish`).set(bearer(compliance)).expect(403)).body.code).toBe('DRAW_FOUR_EYES_REQUIRED');
    const published = await ctx.http().post(`/v1/admin/draws/${drawId}/publish`).set(bearer(secondCompliance)).expect(200);
    expect(published.body.status).toBe('PUBLISHED');
    expect(published.body.seedRevealed).toMatch(/^[0-9a-f]{64}$/);

    // Chacun peut recalculer le tirage à partir des données publiques.
    const audit = await ctx.http().get(`/v1/draws/${drawId}/audit`).expect(200);
    expect(audit.body.winners).toHaveLength(2);
    expect(audit.body.verification.valid).toBe(true);
    expect(verifyDraw({ ...audit.body, winners: audit.body.winners }).valid).toBe(true);
    expect(JSON.stringify(audit.body)).not.toContain(member.phone);

    const results = await ctx.http().get(`/v1/draws/${drawId}/results`).set(bearer(member.tokens.accessToken)).expect(200);
    expect(results.body.winners.map((w: { rank: number }) => w.rank)).toEqual([1, 2]);

    // Les gagnants deviennent bénéficiaires et sont prévenus ; les autres participants aussi.
    const winnerUserIds = (
      await ctx.prisma.drawWinner.findMany({ where: { drawId }, include: { entry: { select: { userId: true } } } })
    ).map((w) => w.entry.userId);
    expect(await ctx.prisma.beneficiary.count({ where: { drawId } })).toBe(2);
    for (const participant of eligible) {
      const isWinner = winnerUserIds.includes(participant.user.id);
      const notification = await ctx.prisma.notification.findFirst({
        where: { userId: participant.user.id, type: isWinner ? 'DRAW_SELECTED' : 'DRAW_RESULT' },
      });
      expect(notification).not.toBeNull();
      const mine = await ctx.http().get(`/v1/draws/${drawId}`).set(bearer(participant.tokens.accessToken)).expect(200);
      expect(mine.body.myResult.selected).toBe(isWinner);
    }

    await expect(ctx.prisma.$executeRaw`UPDATE draw_winners SET rank = rank + 10 WHERE draw_id = ${drawId}::uuid`).rejects.toThrow(/IMMUTABLE_RECORD/);
    expect((await ctx.http().post(`/v1/admin/draws/${drawId}/cancel`).set(bearer(compliance)).send({ reason: 'Trop tard (test)' }).expect(409)).body.code).toBe(
      'DRAW_NOT_CANCELLABLE',
    );
    expect((await ctx.http().get('/v1/draws').set(bearer(member.tokens.accessToken)).expect(200)).body.items.some((d: { id: string }) => d.id === drawId)).toBe(true);
  });

  it('fait évoluer le parcours d’un bénéficiaire selon le workflow et l’exclut des tirages suivants', async () => {
    const winner = await contributor();
    const created = await createDraw(compliance, { title: 'Tirage individuel', scheduledAt: tomorrow(), winnerCount: 1000, minPaidDays: 1, windowDays: 7 }).expect(201);
    await ctx.http().post(`/v1/admin/draws/${created.body.id}/freeze`).set(bearer(compliance)).expect(200);
    await ctx.http().post(`/v1/admin/draws/${created.body.id}/execute`).set(bearer(compliance)).expect(200);
    await ctx.http().post(`/v1/admin/draws/${created.body.id}/publish`).set(bearer(secondCompliance)).expect(200);

    const programSelected = await ctx.http().get('/v1/program/me').set(bearer(winner.tokens.accessToken)).expect(200);
    expect(programSelected.body.beneficiary).toMatchObject({ status: 'SELECTED', drawTitle: 'Tirage individuel' });
    const milestone = (code: string) => programSelected.body.milestones.find((m: { code: string }) => m.code === code);
    expect(milestone('KYC').status).toBe('DONE');
    expect(milestone('SELECTION').status).toBe('DONE');
    expect(milestone('TRAINING').status).toBe('TODO');

    const next = await ctx.http().get('/v1/draws/next').set(bearer(winner.tokens.accessToken)).expect(200);
    expect(next.body.eligibility.reasons).toContain('ALREADY_BENEFICIARY');

    const list = await ctx.http().get('/v1/admin/beneficiaries').query({ limit: 100 }).set(bearer(program)).expect(200);
    const record = list.body.items.find((b: { member: { userId: string } }) => b.member.userId === winner.user.id);
    expect(record.allowedTransitions).toEqual(['TRAINING', 'WITHDRAWN']);

    const invalid = await ctx.http().patch(`/v1/admin/beneficiaries/${record.id}`).set(bearer(program)).send({ status: 'ENTREPRENEUR' }).expect(422);
    expect(invalid.body.code).toBe('BENEFICIARY_INVALID_TRANSITION');
    await ctx.http().patch(`/v1/admin/beneficiaries/${record.id}`).set(bearer(program)).send({ status: 'TRAINING', mentorName: 'Mme Ngo Biyong' }).expect(200);
    expect((await ctx.http().patch(`/v1/admin/beneficiaries/${record.id}`).set(bearer(winner.tokens.accessToken)).send({ status: 'CERTIFIED' }).expect(403)).body.code).toBe('FORBIDDEN');

    const programTraining = await ctx.http().get('/v1/program/me').set(bearer(winner.tokens.accessToken)).expect(200);
    expect(programTraining.body.beneficiary.mentorName).toBe('Mme Ngo Biyong');
    expect(programTraining.body.milestones.find((m: { code: string }) => m.code === 'TRAINING').status).toBe('IN_PROGRESS');
    expect(await ctx.prisma.notification.count({ where: { userId: winner.user.id, type: 'PROGRAM_STATUS_CHANGED' } })).toBe(1);

    const dashboard = await ctx.http().get('/v1/me/dashboard').set(bearer(winner.tokens.accessToken)).expect(200);
    expect(dashboard.body.features.draws).toBe(true);
    expect(dashboard.body.eligibility.reasons).toContain('ALREADY_BENEFICIARY');
  });
});
