import { bearer, createTestApp, newDevice, registerMember, TEST_PIN, TestContext, uniquePhone } from './support/app';

describe('Sécurité du compte : code PIN, appareils, PIN oublié (E2E)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  function login(phone: string, pin: string, device = newDevice()) {
    return ctx.http().post('/v1/auth/login').send({ phone, pin, device });
  }

  it('change le code PIN après vérification du PIN actuel et ferme les autres sessions', async () => {
    const member = await registerMember(ctx);
    const second = await login(member.phone, TEST_PIN).expect(200);
    const secondAuth = bearer(second.body.tokens.accessToken);

    const wrong = await ctx.http().post('/v1/security/pin').set(secondAuth).send({ currentPin: '999111', newPin: '682417' }).expect(422);
    expect(wrong.body).toMatchObject({ code: 'CURRENT_PIN_INVALID', details: { remainingAttempts: 4 } });
    expect((await ctx.http().post('/v1/security/pin').set(secondAuth).send({ currentPin: TEST_PIN, newPin: '123456' }).expect(422)).body.code).toBe(
      'PIN_TOO_WEAK',
    );
    expect((await ctx.http().post('/v1/security/pin').set(secondAuth).send({ currentPin: TEST_PIN, newPin: TEST_PIN }).expect(422)).body.code).toBe(
      'PIN_UNCHANGED',
    );

    const changed = await ctx.http().post('/v1/security/pin').set(secondAuth).send({ currentPin: TEST_PIN, newPin: '682417' }).expect(200);
    expect(changed.body).toEqual({ changed: true, revokedSessions: 1 });

    // La session d'inscription est fermée, celle qui a changé le PIN reste active.
    expect((await ctx.http().get('/v1/me').set(bearer(member.tokens.accessToken)).expect(401)).body.code).toBe('SESSION_REVOKED');
    await ctx.http().get('/v1/me').set(secondAuth).expect(200);
    await login(member.phone, TEST_PIN).expect(401);
    await login(member.phone, '682417').expect(200);
    expect(await ctx.prisma.auditLog.count({ where: { resourceId: member.user.id, action: 'security.pin.changed' } })).toBe(1);
    expect(await ctx.prisma.notification.count({ where: { userId: member.user.id, type: 'SECURITY_PIN_CHANGED' } })).toBe(1);
  });

  it('liste les appareils et révoque un autre appareil, jamais celui en cours', async () => {
    const member = await registerMember(ctx);
    const otherDevice = newDevice();
    await login(member.phone, TEST_PIN, otherDevice).expect(200);
    const auth = bearer(member.tokens.accessToken);

    const devices = await ctx.http().get('/v1/security/devices').set(auth).expect(200);
    expect(devices.body.items).toHaveLength(2);
    const current = devices.body.items.find((d: { current: boolean }) => d.current);
    const other = devices.body.items.find((d: { current: boolean }) => !d.current);
    expect(current).toMatchObject({ activeSessions: 1, revokedAt: null });

    expect((await ctx.http().post(`/v1/security/devices/${current.id}/revoke`).set(auth).expect(409)).body.code).toBe('DEVICE_IS_CURRENT');
    const revoked = await ctx.http().post(`/v1/security/devices/${other.id}/revoke`).set(auth).expect(200);
    expect(revoked.body.items.find((d: { id: string }) => d.id === other.id)).toMatchObject({ activeSessions: 0, revokedAt: expect.any(String) });

    expect((await login(member.phone, TEST_PIN, otherDevice).expect(403)).body.code).toBe('DEVICE_REVOKED');

    const stranger = await registerMember(ctx);
    expect((await ctx.http().post(`/v1/security/devices/${other.id}/revoke`).set(bearer(stranger.tokens.accessToken)).expect(404)).body.code).toBe(
      'DEVICE_NOT_FOUND',
    );
  });

  it('réinitialise un PIN oublié par SMS, déverrouille le compte et ferme toutes les sessions', async () => {
    const member = await registerMember(ctx);
    for (let i = 0; i < 5; i++) await login(member.phone, '999111');
    expect((await login(member.phone, TEST_PIN).expect(403)).body.code).toBe('ACCOUNT_LOCKED');

    const request = await ctx.http().post('/v1/auth/pin-reset/request').send({ phone: member.phone }).expect(202);
    const code = ctx.otp.lastCodeFor(member.phone);
    expect(ctx.otp.sent.at(-1)).toMatchObject({ purpose: 'PIN_RESET' });

    const weak = await ctx
      .http()
      .post('/v1/auth/pin-reset/confirm')
      .send({ challengeId: request.body.otp.challengeId, code, newPin: '000000', device: newDevice() })
      .expect(422);
    expect(weak.body.code).toBe('PIN_TOO_WEAK');

    const confirmed = await ctx
      .http()
      .post('/v1/auth/pin-reset/confirm')
      .send({ challengeId: request.body.otp.challengeId, code, newPin: '731946', device: newDevice() })
      .expect(200);
    expect(confirmed.body.tokens.accessToken).toEqual(expect.any(String));
    expect(confirmed.body.user.id).toBe(member.user.id);

    expect((await ctx.http().get('/v1/me').set(bearer(member.tokens.accessToken)).expect(401)).body.code).toBe('SESSION_REVOKED');
    await login(member.phone, '731946').expect(200);

    // Le code ne sert qu'une fois.
    const replay = await ctx
      .http()
      .post('/v1/auth/pin-reset/confirm')
      .send({ challengeId: request.body.otp.challengeId, code, newPin: '582639', device: newDevice() })
      .expect(400);
    expect(replay.body.code).toBe('OTP_NO_LONGER_VALID');
  });

  it('ne révèle pas si un numéro est inscrit', async () => {
    const unknownPhone = uniquePhone();
    const sentBefore = ctx.otp.sent.length;
    const response = await ctx.http().post('/v1/auth/pin-reset/request').send({ phone: unknownPhone }).expect(202);
    expect(response.body).toMatchObject({ phone: unknownPhone, otp: { challengeId: expect.any(String), expiresAt: expect.any(String) } });
    expect(ctx.otp.sent.length).toBe(sentBefore);

    const attempt = await ctx
      .http()
      .post('/v1/auth/pin-reset/confirm')
      .send({ challengeId: response.body.otp.challengeId, code: '123456', newPin: '731946', device: newDevice() })
      .expect(400);
    expect(attempt.body.code).toBe('OTP_INVALID');
  });
});
