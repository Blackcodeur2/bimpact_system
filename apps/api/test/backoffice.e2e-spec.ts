import { bearer, createTestApp, registerMember, TestContext } from './support/app';
import { staffAccount, staffToken } from './support/staff';

const NEW_PASSWORD = 'Kribi-Limbe-Bafoussam-42';

describe('Back-office : connexion staff, comptes internes et supervision (E2E)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const login = (email: string, password: string) => ctx.http().post('/v1/auth/staff/login').send({ email, password });

  describe('connexion par e-mail et mot de passe', () => {
    it('impose le remplacement du mot de passe temporaire avant toute action', async () => {
      const agent = await staffAccount(ctx, 'SUPER_ADMIN', { mustChangePassword: true });
      const res = await login(agent.email.toUpperCase(), agent.password).expect(200);
      expect(res.body.user).toMatchObject({ email: agent.email, mustChangePassword: true, roles: ['SUPER_ADMIN'] });
      const token = res.body.tokens.accessToken as string;

      const blocked = await ctx.http().get('/v1/admin/dashboard').set(bearer(token)).expect(403);
      expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
      await ctx.http().get('/v1/admin/me').set(bearer(token)).expect(200);

      const weak = await ctx
        .http()
        .post('/v1/admin/me/password')
        .set(bearer(token))
        .send({ currentPassword: agent.password, newPassword: 'court' })
        .expect(422);
      expect(weak.body.code).toBe('PASSWORD_TOO_WEAK');
      expect(weak.body.details.fields.newPassword.length).toBeGreaterThan(0);

      const changed = await ctx
        .http()
        .post('/v1/admin/me/password')
        .set(bearer(token))
        .send({ currentPassword: agent.password, newPassword: NEW_PASSWORD })
        .expect(200);
      expect(changed.body.mustChangePassword).toBe(false);
      await ctx.http().get('/v1/admin/dashboard').set(bearer(token)).expect(200);
      await login(agent.email, agent.password).expect(401);
      await login(agent.email, NEW_PASSWORD).expect(200);
    });

    it('refuse un membre et verrouille après cinq échecs', async () => {
      const member = await registerMember(ctx);
      await login('inconnu@benskin.test', 'peu-importe-123').expect(401);
      await ctx.http().post('/v1/auth/staff/login').send({ email: member.phone, password: 'x' }).expect(400);

      const agent = await staffAccount(ctx, 'OPS');
      for (let attempt = 1; attempt <= 4; attempt++) {
        const res = await login(agent.email, 'mauvais-mot-de-passe').expect(401);
        expect(res.body.code).toBe('INVALID_CREDENTIALS');
      }
      const locked = await login(agent.email, 'mauvais-mot-de-passe').expect(403);
      expect(locked.body.code).toBe('ACCOUNT_LOCKED');
      await login(agent.email, agent.password).expect(403);
    });
  });

  describe('comptes internes', () => {
    it('crée un agent avec mot de passe temporaire et protège le dernier super administrateur', async () => {
      const admin = await staffToken(ctx, 'SUPER_ADMIN');
      const created = await ctx
        .http()
        .post('/v1/admin/users')
        .set(bearer(admin.token))
        .send({ email: `ops.${Date.now()}@benskin.test`, phone: '6 99 00 11 22', firstName: 'Brice', lastName: 'Essomba', roles: ['OPS'] })
        .expect(201);
      expect(created.body.temporaryPassword).toMatch(/^[\w]{4}-[\w]{4}-[\w]{4}-[\w]{4}$/);
      expect(created.body.user).toMatchObject({ mustChangePassword: true, roles: [{ code: 'OPS', name: 'Opérations' }] });

      const opsLogin = await login(created.body.user.email, created.body.temporaryPassword).expect(200);
      await ctx
        .http()
        .post('/v1/admin/me/password')
        .set(bearer(opsLogin.body.tokens.accessToken))
        .send({ currentPassword: created.body.temporaryPassword, newPassword: NEW_PASSWORD })
        .expect(200);
      await ctx.http().get('/v1/admin/users').set(bearer(opsLogin.body.tokens.accessToken)).expect(403);

      const self = await ctx.http().patch(`/v1/admin/users/${admin.userId}`).set(bearer(admin.token)).send({ status: 'SUSPENDED', reason: 'Test de sécurité' }).expect(409);
      expect(self.body.code).toBe('CANNOT_SUSPEND_SELF');
      const demote = await ctx.http().patch(`/v1/admin/users/${admin.userId}`).set(bearer(admin.token)).send({ roles: ['OPS'] }).expect(409);
      expect(demote.body.code).toBe('CANNOT_REMOVE_OWN_ADMIN');

      const suspended = await ctx
        .http()
        .patch(`/v1/admin/users/${created.body.user.id}`)
        .set(bearer(admin.token))
        .send({ status: 'SUSPENDED', reason: 'Départ de l’équipe' })
        .expect(200);
      expect(suspended.body.status).toBe('SUSPENDED');
      await ctx.http().get('/v1/admin/me').set(bearer(opsLogin.body.tokens.accessToken)).expect(401);

      const roles = await ctx.http().get('/v1/admin/roles').set(bearer(admin.token)).expect(200);
      expect(roles.body.roles.map((r: { code: string }) => r.code)).not.toContain('MEMBER');
    });
  });

  describe('conducteurs', () => {
    it('recherche, note interne et suspension avec fermeture des sessions', async () => {
      const ops = await staffToken(ctx, 'OPS');
      const member = await registerMember(ctx);

      const list = await ctx.http().get('/v1/admin/drivers').query({ q: member.phone.slice(-8) }).set(bearer(ops.token)).expect(200);
      expect(list.body.items.map((m: { id: string }) => m.id)).toContain(member.user.id);

      await ctx.http().post(`/v1/admin/drivers/${member.user.id}/notes`).set(bearer(ops.token)).send({ body: 'Appel de vérification effectué.' }).expect(201);
      const detail = await ctx.http().get(`/v1/admin/drivers/${member.user.id}`).set(bearer(ops.token)).expect(200);
      expect(detail.body.notes[0]).toMatchObject({ body: 'Appel de vérification effectué.', authorName: 'Agent OPS' });
      expect(detail.body.wallet.available).toEqual({ amount: '0', currency: 'XAF' });
      expect(await ctx.prisma.auditLog.count({ where: { action: 'member.viewed', resourceId: member.user.id } })).toBe(1);

      await ctx.http().patch(`/v1/admin/drivers/${member.user.id}/status`).set(bearer(ops.token)).send({ status: 'SUSPENDED' }).expect(400);
      await ctx
        .http()
        .patch(`/v1/admin/drivers/${member.user.id}/status`)
        .set(bearer(ops.token))
        .send({ status: 'SUSPENDED', reason: 'Signalement de fraude en cours' })
        .expect(200);
      await ctx.http().get('/v1/me').set(bearer(member.tokens.accessToken)).expect(401);
    });

    it('refuse la supervision à un rôle sans permission', async () => {
      const program = await staffToken(ctx, 'PROGRAM');
      await ctx.http().get('/v1/admin/drivers').set(bearer(program.token)).expect(403);
      await ctx.http().get('/v1/admin/finance/overview').set(bearer(program.token)).expect(403);
    });
  });

  describe('tableau de bord, finance, paiements et rapports', () => {
    it('renvoie des agrégats réels et des contrôles de cohérence', async () => {
      const admin = await staffToken(ctx, 'SUPER_ADMIN');
      const dashboard = await ctx.http().get('/v1/admin/dashboard').query({ days: 7 }).set(bearer(admin.token)).expect(200);
      expect(dashboard.body.series).toHaveLength(7);
      expect(typeof dashboard.body.kpis.members.total).toBe('number');

      const overview = await ctx.http().get('/v1/admin/finance/overview').set(bearer(admin.token)).expect(200);
      expect(overview.body.trialBalance.balanced).toBe(true);
      expect(overview.body.provider).toMatchObject({ code: 'sandbox', testMode: true });

      const run = await ctx.http().post('/v1/admin/finance/reconciliation/run').set(bearer(admin.token)).expect(200);
      expect(run.body.checks.find((c: { code: string }) => c.code === 'TRIAL_BALANCE').status).toBe('OK');
      const history = await ctx.http().get('/v1/admin/finance/reconciliation').set(bearer(admin.token)).expect(200);
      expect(history.body.items[0].summary.checks).toHaveLength(run.body.checks.length);

      await ctx.http().get('/v1/admin/finance/ledger').set(bearer(admin.token)).expect(200);
      await ctx.http().get('/v1/admin/payments').query({ status: 'PENDING' }).set(bearer(admin.token)).expect(200);

      const report = await ctx.http().get('/v1/admin/reports/finance').query({ from: '2026-09-01', to: '2026-09-07' }).set(bearer(admin.token)).expect(200);
      expect(report.body.tables[0].rows).toHaveLength(7);
      await ctx.http().get('/v1/admin/reports/finance').query({ from: '2026-09-07', to: '2026-09-01' }).set(bearer(admin.token)).expect(422);
      await ctx.http().get('/v1/admin/reports/inconnu').query({ from: '2026-09-01', to: '2026-09-02' }).set(bearer(admin.token)).expect(404);
    });
  });

  describe('formation', () => {
    it('garde un module invisible des membres tant qu’il n’est pas publié', async () => {
      const program = await staffToken(ctx, 'PROGRAM');
      const member = await registerMember(ctx);
      const created = await ctx
        .http()
        .post('/v1/admin/training/modules')
        .set(bearer(program.token))
        .send({ month: 23, title: 'Module de test', description: 'Un module pour vérifier la publication.', durationMinutes: 30, order: 99 })
        .expect(201);
      expect(created.body.status).toBe('DRAFT');
      const id = created.body.id as string;

      const visible = async () =>
        (await ctx.http().get('/v1/training/modules').set(bearer(member.tokens.accessToken)).expect(200)).body.modules.some(
          (m: { id: string }) => m.id === id,
        );
      expect(await visible()).toBe(false);

      const empty = await ctx.http().patch(`/v1/admin/training/modules/${id}`).set(bearer(program.token)).send({ status: 'PUBLISHED' }).expect(422);
      expect(empty.body.code).toBe('MODULE_EMPTY');

      await ctx
        .http()
        .post(`/v1/admin/training/modules/${id}/lessons`)
        .set(bearer(program.token))
        .send({ title: 'Leçon unique', durationMinutes: 10, contentType: 'TEXT', markdownContent: 'Contenu de la leçon de test, assez long.' })
        .expect(201);
      const quiz = await ctx
        .http()
        .put(`/v1/admin/training/modules/${id}/quiz`)
        .set(bearer(program.token))
        .send({ title: 'Quiz de test', passScore: 70, questions: [{ question: 'Combien font deux et deux ?', options: ['3', '4'], correctIndex: 1 }] })
        .expect(200);
      expect(quiz.body.quiz).toMatchObject({ structureLocked: false, questions: [{ correctIndex: 1 }] });

      await ctx.http().patch(`/v1/admin/training/modules/${id}`).set(bearer(program.token)).send({ status: 'PUBLISHED' }).expect(200);
      expect(await visible()).toBe(true);

      await ctx.http().patch(`/v1/admin/training/modules/${id}`).set(bearer(program.token)).send({ status: 'ARCHIVED' }).expect(200);
      expect(await visible()).toBe(false);
    });
  });

  describe('fraude et risque', () => {
    it('documente chaque étape d’un dossier jusqu’à sa clôture', async () => {
      const risk = await staffToken(ctx, 'RISK');
      const member = await registerMember(ctx);
      await ctx.http().get('/v1/admin/fraud/signals').set(bearer(risk.token)).expect(200);

      const opened = await ctx
        .http()
        .post('/v1/admin/fraud/cases')
        .set(bearer(risk.token))
        .send({ userId: member.user.id, signalType: 'MANUAL', summary: 'Signalement d’un partenaire.' })
        .expect(201);
      expect(opened.body).toMatchObject({ status: 'NEW', reference: expect.stringMatching(/^RSK-\d{4}-[A-Z0-9]{6}$/) });
      const id = opened.body.id as string;

      const investigating = await ctx.http().post(`/v1/admin/fraud/cases/${id}/actions`).set(bearer(risk.token)).send({ action: 'INVESTIGATE' }).expect(200);
      expect(investigating.body).toMatchObject({ status: 'INVESTIGATING', assignedToId: risk.userId });

      const noNote = await ctx.http().post(`/v1/admin/fraud/cases/${id}/actions`).set(bearer(risk.token)).send({ action: 'RESOLVE' }).expect(422);
      expect(noNote.body.code).toBe('NOTE_REQUIRED');
      const resolved = await ctx
        .http()
        .post(`/v1/admin/fraud/cases/${id}/actions`)
        .set(bearer(risk.token))
        .send({ action: 'RESOLVE', note: 'Vérification faite, aucune anomalie.' })
        .expect(200);
      expect(resolved.body.status).toBe('RESOLVED');
      expect(resolved.body.events.map((e: { type: string }) => e.type)).toEqual(['OPENED', 'STATUS_CHANGED', 'STATUS_CHANGED']);

      await ctx.http().post(`/v1/admin/fraud/cases/${id}/actions`).set(bearer(risk.token)).send({ action: 'NOTE', note: 'Trop tard.' }).expect(409);
    });
  });
});
