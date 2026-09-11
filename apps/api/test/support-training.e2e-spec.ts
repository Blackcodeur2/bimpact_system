import { randomUUID } from 'node:crypto';
import { seedTrainingContent } from '../scripts/seed-modules-data';
import { bearer, createTestApp, registerMember, RegisteredMember, TestContext } from './support/app';
import { staffToken } from './support/staff';

describe('Support, formation, certificats et analytics (E2E)', () => {
  let ctx: TestContext;
  let ops: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    ops = (await staffToken(ctx, 'OPS')).token;
    await seedTrainingContent(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const auth = (member: RegisteredMember) => bearer(member.tokens.accessToken);

  it('construit la FAQ à partir des règles configurées, consultable sans compte', async () => {
    const faq = await ctx.http().get('/v1/support/faq').expect(200);
    const text = JSON.stringify(faq.body.items);
    // Espace insécable entre le montant et la devise.
    expect(text).toMatch(/200\sFCFA par jour/);
    expect(text).toContain('mode test');
    expect(text).toContain('pas encore activées');
  });

  it('trace une demande de support et ses échanges avec l’équipe', async () => {
    const member = await registerMember(ctx);
    const body = { category: 'PAYMENT', subject: 'Rechargement non crédité', message: 'J’ai validé 5 000 FCFA sur MoMo hier soir.' };
    expect((await ctx.http().post('/v1/support/tickets').set(auth(member)).send(body).expect(400)).body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    const created = await ctx.http().post('/v1/support/tickets').set(auth(member)).set('Idempotency-Key', randomUUID()).send(body).expect(201);
    expect(created.body).toMatchObject({ status: 'OPEN', canReply: true, messages: [{ authorType: 'MEMBER' }] });
    expect(created.body.reference).toMatch(/^SUP-\d{6}-[A-Z2-9]{5}$/);
    const id: string = created.body.id;

    await ctx.http().get(`/v1/support/tickets/${id}`).set(auth(await registerMember(ctx))).expect(404);
    await ctx.http().get('/v1/admin/support/tickets').set(auth(member)).expect(403);

    await ctx.http().post(`/v1/admin/support/tickets/${id}/messages`).set(bearer(ops)).send({ body: 'Pouvez-vous indiquer la référence de la transaction ?' }).expect(200);
    const pending = await ctx.http().get(`/v1/support/tickets/${id}`).set(auth(member)).expect(200);
    expect(pending.body).toMatchObject({ status: 'PENDING', messages: [{ authorType: 'MEMBER' }, { authorType: 'STAFF' }] });
    expect(await ctx.prisma.notification.count({ where: { userId: member.user.id, type: 'SUPPORT_REPLY' } })).toBe(1);
    expect((await ctx.http().get('/v1/me/dashboard').set(auth(member)).expect(200)).body.alerts.some((a: { code: string }) => a.code === 'SUPPORT_REPLY')).toBe(true);

    const replied = await ctx.http().post(`/v1/support/tickets/${id}/messages`).set(auth(member)).send({ body: 'Référence MP240911.1234' }).expect(200);
    expect(replied.body.status).toBe('OPEN');
    await ctx.http().post(`/v1/support/tickets/${id}/close`).set(auth(member)).expect(200);
    expect((await ctx.http().post(`/v1/support/tickets/${id}/messages`).set(auth(member)).send({ body: 'Encore moi' }).expect(409)).body.code).toBe(
      'SUPPORT_TICKET_CLOSED',
    );
    expect((await ctx.http().get('/v1/support/tickets').set(auth(member)).expect(200)).body.items).toHaveLength(1);
  });

  it('débloque les modules dans l’ordre, corrige les quiz côté serveur et délivre un certificat vérifiable', async () => {
    const member = await registerMember(ctx);
    const list = await ctx.http().get('/v1/training/modules').set(auth(member)).expect(200);
    expect(list.body.summary).toMatchObject({ totalModules: 6, completedModules: 0, certified: false });
    expect(list.body.modules.map((m: { status: string }) => m.status)).toEqual(['AVAILABLE', 'LOCKED', 'LOCKED', 'LOCKED', 'LOCKED', 'LOCKED']);
    const [first, second] = list.body.modules;

    expect((await ctx.http().get(`/v1/training/modules/${second.id}`).set(auth(member)).expect(403)).body.code).toBe('MODULE_LOCKED');
    expect((await ctx.http().get(`/v1/training/quiz/${first.id}`).set(auth(member)).expect(409)).body.code).toBe('QUIZ_LESSONS_INCOMPLETE');

    const moduleDetail = await ctx.http().get(`/v1/training/modules/${first.id}`).set(auth(member)).expect(200);
    const lessonId: string = moduleDetail.body.lessons[0].id;
    const lesson = await ctx.http().get(`/v1/training/lessons/${lessonId}`).set(auth(member)).expect(200);
    expect(lesson.body).toMatchObject({ contentType: 'TEXT', audioUrl: null, isCompleted: false, nextLesson: { id: moduleDetail.body.lessons[1].id } });
    await ctx.http().post(`/v1/training/lessons/${lessonId}/progress`).set(auth(member)).send({ positionSeconds: 90, progressPercent: 60 }).expect(200);
    const regress = await ctx.http().post(`/v1/training/lessons/${lessonId}/progress`).set(auth(member)).send({ positionSeconds: 10, progressPercent: 20 }).expect(200);
    expect(regress.body.progressPercent).toBe(60);

    /** Termine les leçons puis soumet le quiz du module, avec de bonnes ou de mauvaises réponses. */
    const passModule = async (moduleId: string, correct: boolean) => {
      const detail = await ctx.http().get(`/v1/training/modules/${moduleId}`).set(auth(member)).expect(200);
      for (const l of detail.body.lessons) await ctx.http().post(`/v1/training/lessons/${l.id}/complete`).set(auth(member)).expect(200);
      const quiz = await ctx.http().get(`/v1/training/quiz/${moduleId}`).set(auth(member)).expect(200);
      expect(JSON.stringify(quiz.body)).not.toContain('correctIndex');
      const answers = await Promise.all(
        quiz.body.questions.map(async (q: { id: string }) => {
          const stored = await ctx.prisma.quizQuestion.findUniqueOrThrow({ where: { id: q.id } });
          return { questionId: q.id, selectedIndex: correct ? stored.correctIndex : (stored.correctIndex + 1) % 4 };
        }),
      );
      return ctx.http().post(`/v1/training/quiz/${moduleId}/submit`).set(auth(member)).send({ answers });
    };

    const failed = await passModule(first.id, false);
    expect(failed.status).toBe(200);
    expect(failed.body).toMatchObject({ passed: false, score: 0, certificate: null });
    expect(failed.body.results[0].correctIndex).toBeUndefined();
    const passed = await passModule(first.id, true);
    expect(passed.status).toBe(200);
    expect(passed.body).toMatchObject({ passed: true, score: 100 });
    expect(passed.body.results[0]).toMatchObject({ isCorrect: true, correctIndex: expect.any(Number) });

    // Limite de tentatives sur 24 heures.
    for (let i = 0; i < 5; i++) expect((await passModule(second.id, false)).status).toBe(200);
    expect((await passModule(second.id, false)).status).toBe(429);
    await ctx.prisma.quizSubmission.updateMany({
      where: { userId: member.user.id },
      data: { createdAt: new Date(Date.now() - 2 * 86_400_000) },
    });

    let certificate: { verificationCode: string; holderName: string } | null = null;
    for (const module of list.body.modules.slice(1)) {
      const result = await passModule(module.id, true);
      expect(result.status).toBe(200);
      certificate = result.body.certificate;
    }
    expect(certificate).toMatchObject({ holderName: 'Awa Ngono', revoked: false });

    const summary = (await ctx.http().get('/v1/me/dashboard').set(auth(member)).expect(200)).body.training;
    expect(summary).toMatchObject({ completedModules: 6, certified: true, progressPercent: 100 });
    expect((await ctx.http().get('/v1/certificates').set(auth(member)).expect(200)).body.items).toHaveLength(1);

    const verified = await ctx.http().get(`/v1/certificates/verify/${certificate!.verificationCode}`).expect(200);
    expect(verified.body).toMatchObject({ valid: true, holderName: 'Awa Ngono' });
    expect((await ctx.http().get('/v1/certificates/verify/INCONNU12345').expect(404)).body.code).toBe('CERTIFICATE_NOT_FOUND');

    // Une nouvelle réussite ne délivre pas de second certificat.
    const again = await passModule(list.body.modules[5].id, true);
    expect(again.status).toBe(200);
    expect(again.body.certificate).toBeNull();
  });

  it('enregistre des évènements d’usage sans données personnelles', async () => {
    const accepted = await ctx
      .http()
      .post('/v1/analytics/events')
      .send({
        installationId: randomUUID(),
        events: [{ name: 'onboarding.completed', occurredAt: new Date().toISOString(), properties: { step: 3, nested: { phone: '+2376' } } }],
      })
      .expect(202);
    expect(accepted.body).toEqual({ accepted: 1 });
    const stored = await ctx.prisma.analyticsEvent.findFirstOrThrow({ where: { name: 'onboarding.completed' }, orderBy: { receivedAt: 'desc' } });
    expect(stored.properties).toEqual({ step: 3 });

    const invalid = await ctx.http().post('/v1/analytics/events').send({ events: [{ name: 'Nom Invalide', occurredAt: new Date().toISOString() }] }).expect(400);
    expect(invalid.body.code).toBe('VALIDATION_FAILED');
  });
});
