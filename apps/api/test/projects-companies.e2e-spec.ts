import { randomUUID } from 'node:crypto';
import { bearer, createTestApp, registerMember, RegisteredMember, TestContext } from './support/app';
import { approveKyc, JPEG, staffToken } from './support/staff';

describe('Projets, entreprises et recrutement (E2E)', () => {
  let ctx: TestContext;
  let program: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    program = (await staffToken(ctx, 'PROGRAM')).token;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const auth = (member: RegisteredMember) => bearer(member.tokens.accessToken);

  const completeFields = {
    sector: 'Mécanique',
    city: 'Douala',
    problem: 'Aucun atelier fiable ouvert le soir au carrefour.',
    solution: 'Un atelier ouvert de 17 h à 23 h avec des pièces d’usure en stock.',
    market: 'Les conducteurs de motos-taxis du quartier.',
    description: 'Atelier équipé, deux postes de travail.',
    estimatedBudget: '1000000',
    personalContribution: '200000',
    grantRequested: '800000',
    budgetLines: [
      { label: 'Outillage', amount: '600000' },
      { label: 'Stock initial', amount: '400000' },
    ],
    teamMembers: [{ fullName: 'Awa Ngono', role: 'Mécanicienne' }],
    forecasts: { monthlyRevenue: '450000', monthlyCosts: '210000', jobsCreated: 2 },
  };

  async function approvedProject(owner: RegisteredMember) {
    const created = await ctx.http().post('/v1/projects').set(auth(owner)).set('Idempotency-Key', randomUUID()).send({ title: 'Atelier du soir', ...completeFields }).expect(201);
    await ctx.http().post(`/v1/projects/${created.body.id}/submit`).set(auth(owner)).expect(200);
    await ctx.http().post(`/v1/admin/projects/${created.body.id}/decision`).set(bearer(program)).send({ decision: 'APPROVED', reason: 'Projet solide.', score: 82 }).expect(200);
    return created.body.id as string;
  }

  it('fait passer un projet du brouillon à l’approbation avec corrections demandées', async () => {
    const owner = await registerMember(ctx);
    const created = await ctx.http().post('/v1/projects').set(auth(owner)).set('Idempotency-Key', randomUUID()).send({ title: 'Atelier du soir' }).expect(201);
    expect(created.body).toMatchObject({ status: 'DRAFT', canEdit: true, canSubmit: false, estimatedBudget: null });
    expect(created.body.completeness.missing).toEqual(
      expect.arrayContaining(['sector', 'city', 'problem', 'solution', 'market', 'estimatedBudget', 'grantRequested', 'budgetLines']),
    );
    const id: string = created.body.id;

    expect((await ctx.http().post(`/v1/projects/${id}/submit`).set(auth(owner)).expect(403)).body.code).toBe('PROJECT_KYC_REQUIRED');
    await approveKyc(ctx, owner);
    const incomplete = await ctx.http().post(`/v1/projects/${id}/submit`).set(auth(owner)).expect(422);
    expect(incomplete.body.code).toBe('PROJECT_INCOMPLETE');

    const unbalanced = await ctx.http().patch(`/v1/projects/${id}`).set(auth(owner)).send({ ...completeFields, personalContribution: '0' }).expect(200);
    expect(unbalanced.body.completeness).toMatchObject({ missing: [], issues: ['FINANCING_UNBALANCED'] });
    const fixed = await ctx.http().patch(`/v1/projects/${id}`).set(auth(owner)).send({ personalContribution: '200000' }).expect(200);
    expect(fixed.body).toMatchObject({ canSubmit: true, budgetLines: [{ label: 'Outillage', amount: { amount: '600000' } }, expect.anything()] });

    const submitted = await ctx.http().post(`/v1/projects/${id}/submit`).set(auth(owner)).expect(200);
    expect(submitted.body).toMatchObject({ status: 'SUBMITTED', canEdit: false });
    expect((await ctx.http().patch(`/v1/projects/${id}`).set(auth(owner)).send({ title: 'Autre titre' }).expect(409)).body.code).toBe('PROJECT_LOCKED');
    const withDocument = await ctx
      .http()
      .post(`/v1/projects/${id}/documents`)
      .set(auth(owner))
      .field('type', 'QUOTE')
      .attach('file', JPEG, { filename: 'devis.jpg', contentType: 'image/jpeg' })
      .expect(201);
    expect(withDocument.body.documents).toHaveLength(1);

    const queue = await ctx.http().get('/v1/admin/projects').query({ status: 'SUBMITTED', limit: 100 }).set(bearer(program)).expect(200);
    expect(queue.body.items.some((p: { id: string }) => p.id === id)).toBe(true);
    await ctx.http().post(`/v1/admin/projects/${id}/review`).set(bearer(program)).expect(200);
    await ctx.http().post(`/v1/admin/projects/${id}/decision`).set(bearer(program)).send({ decision: 'CHANGES_REQUESTED', reason: 'Précisez le loyer du local.' }).expect(200);

    const toFix = await ctx.http().get(`/v1/projects/${id}`).set(auth(owner)).expect(200);
    expect(toFix.body).toMatchObject({ status: 'CHANGES_REQUESTED', canEdit: true, reviewFeedback: 'Précisez le loyer du local.' });
    const dashboard = await ctx.http().get('/v1/me/dashboard').set(auth(owner)).expect(200);
    expect(dashboard.body.alerts.some((a: { code: string }) => a.code === 'PROJECT_CHANGES_REQUESTED')).toBe(true);

    await ctx.http().patch(`/v1/projects/${id}`).set(auth(owner)).send({ description: 'Atelier équipé, deux postes, loyer 40 000 FCFA par mois.' }).expect(200);
    await ctx.http().post(`/v1/projects/${id}/submit`).set(auth(owner)).expect(200);
    const decided = await ctx.http().post(`/v1/admin/projects/${id}/decision`).set(bearer(program)).send({ decision: 'APPROVED', reason: 'Projet solide.', score: 82 }).expect(200);
    expect(decided.body).toMatchObject({ status: 'APPROVED', score: 82 });
    expect(decided.body.reviews.map((r: { decision: string }) => r.decision)).toEqual(['APPROVED', 'CHANGES_REQUESTED']);
    expect(await ctx.prisma.notification.count({ where: { userId: owner.user.id, type: 'PROJECT_DECISION' } })).toBe(2);
  });

  it('crée une entreprise depuis un projet approuvé, publie une offre et suit les candidatures', async () => {
    const owner = await registerMember(ctx);
    await approveKyc(ctx, owner);
    const draft = await ctx.http().post('/v1/projects').set(auth(owner)).set('Idempotency-Key', randomUUID()).send({ title: 'Brouillon' }).expect(201);
    const companyBody = { name: 'Atelier Ndokoti', sector: 'Mécanique', city: 'Douala', description: 'Réparation et pièces.' };
    expect((await ctx.http().post('/v1/companies').set(auth(owner)).send({ ...companyBody, projectId: draft.body.id }).expect(409)).body.code).toBe(
      'COMPANY_PROJECT_NOT_APPROVED',
    );

    const projectId = await approvedProject(owner);
    const company = await ctx.http().post('/v1/companies').set(auth(owner)).send({ ...companyBody, projectId }).expect(201);
    expect(company.body).toMatchObject({ isOwner: true, status: 'ACTIVE', members: [{ role: 'Fondateur', isOwner: true }] });
    expect((await ctx.http().post('/v1/companies').set(auth(owner)).send({ ...companyBody, projectId }).expect(409)).body.code).toBe('COMPANY_ALREADY_EXISTS');
    const companyId: string = company.body.id;

    const withJob = await ctx
      .http()
      .post(`/v1/companies/${companyId}/jobs`)
      .set(auth(owner))
      .send({
        title: 'Apprenti mécanicien',
        sector: 'Mécanique',
        location: 'Douala, Ndokoti',
        description: 'Aide à la réparation des motos, formation assurée sur place.',
        slots: 2,
        skills: ['Mécanique moto'],
      })
      .expect(201);
    const jobId: string = withJob.body.jobs[0].id;

    const candidate = await registerMember(ctx);
    const listed = await ctx.http().get('/v1/jobs').query({ q: 'apprenti', limit: 50 }).set(auth(candidate)).expect(200);
    expect(listed.body.items.find((j: { id: string }) => j.id === jobId)).toMatchObject({ company: 'Atelier Ndokoti', isOwnCompany: false, application: null });

    expect((await ctx.http().post(`/v1/jobs/${jobId}/apply`).set(auth(owner)).send({}).expect(409)).body.code).toBe('JOB_OWN_COMPANY');
    const applied = await ctx.http().post(`/v1/jobs/${jobId}/apply`).set(auth(candidate)).send({ message: 'Disponible dès lundi.' }).expect(201);
    expect(applied.body).toMatchObject({ status: 'PENDING', offer: { application: { status: 'PENDING' } } });
    expect((await ctx.http().post(`/v1/jobs/${jobId}/apply`).set(auth(candidate)).send({}).expect(409)).body.code).toBe('ALREADY_APPLIED');
    expect(await ctx.prisma.notification.count({ where: { userId: owner.user.id, type: 'RECRUITMENT_NEW_APPLICATION' } })).toBe(1);

    const applications = await ctx.http().get(`/v1/companies/${companyId}/jobs/${jobId}/applications`).set(auth(owner)).expect(200);
    const applicationId: string = applications.body.items[0].id;
    expect(applications.body.items[0]).toMatchObject({ candidate: { firstName: 'Awa', phone: null, identityVerified: false } });
    await ctx.http().get(`/v1/companies/${companyId}/jobs/${jobId}/applications`).set(auth(candidate)).expect(404);

    const invalid = await ctx.http().patch(`/v1/companies/${companyId}/applications/${applicationId}`).set(auth(owner)).send({ status: 'HIRED' }).expect(422);
    expect(invalid.body.code).toBe('APPLICATION_INVALID_TRANSITION');
    const contacted = await ctx.http().patch(`/v1/companies/${companyId}/applications/${applicationId}`).set(auth(owner)).send({ status: 'CONTACTED' }).expect(200);
    expect(contacted.body.items[0].candidate.phone).toBe(candidate.phone);
    await ctx.http().patch(`/v1/companies/${companyId}/applications/${applicationId}`).set(auth(owner)).send({ status: 'HIRED' }).expect(200);

    const team = await ctx.http().get(`/v1/companies/${companyId}`).set(auth(candidate)).expect(200);
    expect(team.body).toMatchObject({ isOwner: false });
    expect(team.body.members.map((m: { role: string }) => m.role)).toEqual(['Fondateur', 'Apprenti mécanicien']);
    expect(team.body.jobs[0].applications).toBeNull();
    expect((await ctx.http().post(`/v1/companies/${companyId}/jobs/${jobId}/close`).set(auth(candidate)).expect(403)).body.code).toBe('COMPANY_OWNER_ONLY');

    const mine = await ctx.http().get('/v1/jobs/applications/me').set(auth(candidate)).expect(200);
    expect(mine.body.items[0]).toMatchObject({ status: 'HIRED', canWithdraw: false });
    expect((await ctx.http().post(`/v1/jobs/applications/${applicationId}/withdraw`).set(auth(candidate)).expect(409)).body.code).toBe(
      'APPLICATION_NOT_WITHDRAWABLE',
    );
    expect(await ctx.prisma.notification.count({ where: { userId: candidate.user.id, type: 'RECRUITMENT_APPLICATION_UPDATED' } })).toBe(2);

    // Un second candidat retire puis renouvelle sa candidature.
    const second = await registerMember(ctx);
    const secondApplication = await ctx.http().post(`/v1/jobs/${jobId}/apply`).set(auth(second)).send({}).expect(201);
    const withdrawn = await ctx.http().post(`/v1/jobs/applications/${secondApplication.body.id}/withdraw`).set(auth(second)).expect(200);
    expect(withdrawn.body.items[0].status).toBe('WITHDRAWN');
    await ctx.http().post(`/v1/jobs/${jobId}/apply`).set(auth(second)).send({}).expect(201);

    await ctx.http().post(`/v1/companies/${companyId}/jobs/${jobId}/close`).set(auth(owner)).expect(200);
    expect((await ctx.http().post(`/v1/jobs/${jobId}/apply`).set(auth(await registerMember(ctx))).send({}).expect(409)).body.code).toBe('JOB_OFFER_CLOSED');
  });
});
