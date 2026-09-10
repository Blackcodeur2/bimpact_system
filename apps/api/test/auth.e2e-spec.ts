import { TokenService } from '../src/modules/auth/token.service';
import {
  bearer,
  createTestApp,
  newDevice,
  registerMember,
  TEST_PIN,
  TestContext,
  uniquePhone,
} from './support/app';

describe('Auth, sessions et RBAC (E2E)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('socle HTTP', () => {
    it('expose /health et /ready sans authentification', async () => {
      await ctx.http().get('/health').expect(200, { status: 'ok' });
      const ready = await ctx.http().get('/ready').expect(200);
      expect(ready.body.checks.database).toBe('up');
    });

    it('renvoie le format d’erreur stable et un X-Request-Id', async () => {
      const res = await ctx.http().get('/v1/me').expect(401);
      expect(res.body).toEqual({ code: 'UNAUTHENTICATED', message: expect.any(String), details: {} });
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('renvoie 404 structuré pour une route inconnue', async () => {
      const res = await ctx.http().get('/v1/inexistant').expect(404);
      expect(res.body).toEqual({ code: 'NOT_FOUND', message: expect.any(String), details: {} });
    });
  });

  describe('inscription', () => {
    it('valide les champs et détaille les erreurs', async () => {
      const res = await ctx
        .http()
        .post('/v1/auth/register')
        .send({ phone: '123', firstName: 'A', pin: '12', acceptTerms: false })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(Object.keys(res.body.details.fields)).toEqual(
        expect.arrayContaining(['phone', 'firstName', 'lastName', 'city', 'pin', 'acceptTerms', 'acceptPrivacy']),
      );
    });

    it('refuse un PIN trop simple', async () => {
      const res = await ctx
        .http()
        .post('/v1/auth/register')
        .send({ phone: uniquePhone(), firstName: 'Awa', lastName: 'Ngono', city: 'Douala', pin: '123456', acceptTerms: true, acceptPrivacy: true })
        .expect(422);
      expect(res.body.code).toBe('PIN_TOO_WEAK');
    });

    it('active le compte, ouvre un portefeuille vide et renvoie un tableau de bord honnête', async () => {
      const member = await registerMember(ctx);
      expect(member.user.roles).toEqual(['MEMBER']);
      expect(member.user.permissions).toContain('wallet.read.self');

      const wallet = await ctx.http().get('/v1/wallet').set(bearer(member.tokens.accessToken)).expect(200);
      expect(wallet.body.availableBalance).toEqual({ amount: '0', currency: 'XAF' });
      expect(wallet.body.reservedBalance).toEqual({ amount: '0', currency: 'XAF' });

      const history = await ctx.http().get('/v1/wallet/transactions').set(bearer(member.tokens.accessToken)).expect(200);
      expect(history.body).toEqual({ items: [], nextCursor: null });

      const dashboard = await ctx.http().get('/v1/me/dashboard').set(bearer(member.tokens.accessToken)).expect(200);
      expect(dashboard.body.contribution).toBeNull();
      expect(dashboard.body.nextDraw).toBeNull();
      expect(dashboard.body.alerts.map((a: { code: string }) => a.code)).toEqual(['KYC_REQUIRED']);
      expect(dashboard.body.features.payments).toBe(false);
    });

    it('refuse un second compte sur le même numéro', async () => {
      const member = await registerMember(ctx);
      const res = await ctx
        .http()
        .post('/v1/auth/register')
        .send({ phone: member.phone, firstName: 'Awa', lastName: 'Ngono', city: 'Douala', pin: TEST_PIN, acceptTerms: true, acceptPrivacy: true })
        .expect(409);
      expect(res.body.code).toBe('PHONE_ALREADY_REGISTERED');
    });

    it('compte les mauvais codes OTP et empêche la réutilisation d’un code', async () => {
      const phone = uniquePhone();
      const registration = await ctx
        .http()
        .post('/v1/auth/register')
        .send({ phone, firstName: 'Paul', lastName: 'Fotso', city: 'Bafoussam', pin: TEST_PIN, acceptTerms: true, acceptPrivacy: true })
        .expect(202);
      const challengeId = registration.body.otp.challengeId;
      const good = ctx.otp.lastCodeFor(phone);
      const bad = good === '000000' ? '000001' : '000000';

      const wrong = await ctx.http().post('/v1/auth/otp/verify').send({ challengeId, code: bad, device: newDevice() }).expect(400);
      expect(wrong.body).toMatchObject({ code: 'OTP_INVALID', details: { remainingAttempts: 4 } });

      await ctx.http().post('/v1/auth/otp/verify').send({ challengeId, code: good, device: newDevice() }).expect(200);
      const reused = await ctx.http().post('/v1/auth/otp/verify').send({ challengeId, code: good, device: newDevice() }).expect(400);
      expect(reused.body.code).toBe('OTP_NO_LONGER_VALID');
    });

    it('impose un délai avant de redemander un code', async () => {
      const phone = uniquePhone();
      await ctx
        .http()
        .post('/v1/auth/register')
        .send({ phone, firstName: 'Paul', lastName: 'Fotso', city: 'Bafoussam', pin: TEST_PIN, acceptTerms: true, acceptPrivacy: true })
        .expect(202);
      const res = await ctx.http().post('/v1/auth/otp/request').send({ phone, purpose: 'REGISTER' }).expect(429);
      expect(res.body.code).toBe('OTP_RESEND_TOO_SOON');
      expect(res.body.details.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  describe('connexion et verrouillage', () => {
    it('connecte avec le bon PIN puis verrouille après 5 échecs', async () => {
      const member = await registerMember(ctx);
      await ctx.http().post('/v1/auth/login').send({ phone: member.phone, pin: TEST_PIN, device: member.device }).expect(200);

      for (let attempt = 1; attempt <= 4; attempt++) {
        const res = await ctx.http().post('/v1/auth/login').send({ phone: member.phone, pin: '739104', device: member.device }).expect(401);
        expect(res.body).toMatchObject({ code: 'INVALID_CREDENTIALS', details: { remainingAttempts: 5 - attempt } });
      }
      const locked = await ctx.http().post('/v1/auth/login').send({ phone: member.phone, pin: '739104', device: member.device }).expect(403);
      expect(locked.body.code).toBe('ACCOUNT_LOCKED');

      const stillLocked = await ctx.http().post('/v1/auth/login').send({ phone: member.phone, pin: TEST_PIN, device: member.device }).expect(403);
      expect(stillLocked.body.code).toBe('ACCOUNT_LOCKED');
    });

    it('ne révèle pas si un numéro existe', async () => {
      const res = await ctx.http().post('/v1/auth/login').send({ phone: uniquePhone(), pin: TEST_PIN, device: newDevice() }).expect(401);
      expect(res.body).toEqual({ code: 'INVALID_CREDENTIALS', message: expect.any(String), details: {} });
    });
  });

  describe('sessions', () => {
    it('fait tourner le refresh token et révoque la famille en cas de réutilisation', async () => {
      const member = await registerMember(ctx);
      const first = member.tokens;

      const rotated = await ctx.http().post('/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(200);
      expect(rotated.body.refreshToken).not.toBe(first.refreshToken);
      await ctx.http().get('/v1/me').set(bearer(rotated.body.accessToken)).expect(200);

      // Rejeu immédiat (retry réseau) : refusé sans casser la nouvelle session.
      const retry = await ctx.http().post('/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
      expect(retry.body.code).toBe('INVALID_REFRESH_TOKEN');
      await ctx.http().get('/v1/me').set(bearer(rotated.body.accessToken)).expect(200);

      // Rejeu tardif : considéré comme un vol, toute la famille est révoquée.
      await ctx.prisma.session.updateMany({
        where: { userId: member.user.id, revokedReason: 'ROTATED' },
        data: { revokedAt: new Date(Date.now() - 60_000) },
      });
      const reuse = await ctx.http().post('/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
      expect(reuse.body.code).toBe('REFRESH_TOKEN_REUSED');

      const revoked = await ctx.http().get('/v1/me').set(bearer(rotated.body.accessToken)).expect(401);
      expect(revoked.body.code).toBe('SESSION_REVOKED');
      await ctx.http().post('/v1/auth/refresh').send({ refreshToken: rotated.body.refreshToken }).expect(401);

      const audit = await ctx.prisma.auditLog.findFirst({ where: { action: 'auth.refresh.reuse_detected', actorId: member.user.id } });
      expect(audit).not.toBeNull();
    });

    it('invalide immédiatement l’access token à la déconnexion', async () => {
      const member = await registerMember(ctx);
      await ctx.http().post('/v1/auth/logout').set(bearer(member.tokens.accessToken)).expect(204);
      const res = await ctx.http().get('/v1/me').set(bearer(member.tokens.accessToken)).expect(401);
      expect(res.body.code).toBe('SESSION_REVOKED');
    });
  });

  describe('profil et permissions', () => {
    it('modifie le profil, refuse les champs non autorisés et audite le changement', async () => {
      const member = await registerMember(ctx);
      const auth = bearer(member.tokens.accessToken);

      const escalation = await ctx.http().patch('/v1/me').set(auth).send({ roles: ['SUPER_ADMIN'] }).expect(400);
      expect(escalation.body.code).toBe('VALIDATION_FAILED');

      const updated = await ctx.http().patch('/v1/me').set(auth).send({ city: 'Garoua' }).expect(200);
      expect(updated.body.profile.city).toBe('Garoua');
      expect(updated.body.roles).toEqual(['MEMBER']);

      const audit = await ctx.prisma.auditLog.findFirst({ where: { action: 'profile.updated', resourceId: member.user.id } });
      expect(audit?.before).toMatchObject({ city: 'Douala' });
      expect(audit?.after).toMatchObject({ city: 'Garoua' });
    });

    it('interdit le back-office à un membre et l’autorise à un rôle disposant de la permission', async () => {
      const member = await registerMember(ctx);
      const denied = await ctx.http().get('/v1/admin/audit-logs').set(bearer(member.tokens.accessToken)).expect(403);
      expect(denied.body.code).toBe('FORBIDDEN');

      const complianceRole = await ctx.prisma.role.findUniqueOrThrow({ where: { code: 'COMPLIANCE' } });
      const staff = await ctx.prisma.user.create({
        data: {
          phone: uniquePhone(),
          kind: 'STAFF',
          status: 'ACTIVE',
          profile: { create: { firstName: 'Clarisse', lastName: 'Ebongue', city: 'Yaoundé' } },
          roles: { create: { roleId: complianceRole.id } },
        },
      });
      const staffTokens = await ctx.prisma.$transaction((tx) =>
        ctx.app.get(TokenService).issueSession(tx, { userId: staff.id, kind: 'STAFF' }, {}),
      );

      const logs = await ctx
        .http()
        .get('/v1/admin/audit-logs')
        .query({ actorId: member.user.id, limit: 50 })
        .set(bearer(staffTokens.accessToken))
        .expect(200);
      expect(logs.body.items.map((l: { action: string }) => l.action)).toEqual(
        expect.arrayContaining(['auth.register.started', 'wallet.opened', 'auth.register.completed']),
      );
      expect(JSON.stringify(logs.body)).not.toMatch(/pin_hash|pinHash"\s*:\s*"\$argon/);
    });
  });
});
