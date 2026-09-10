import { randomInt, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TokenService } from '../src/modules/auth/token.service';
import { bearer, createTestApp, registerMember, RegisteredMember, TestContext, uniquePhone } from './support/app';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(4096, 0x37)]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF');

describe('Circuit de vérification KYC (E2E)', () => {
  let ctx: TestContext;
  let reviewerToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    reviewerToken = await staffToken('COMPLIANCE');
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
        profile: { create: { firstName: 'Clarisse', lastName: 'Ebongue', city: 'Yaoundé' } },
        roles: { create: { roleId: role.id } },
      },
    });
    const session = await ctx.prisma.$transaction((tx) =>
      ctx.app.get(TokenService).issueSession(tx, { userId: staff.id, kind: 'STAFF' }, {}),
    );
    return session.accessToken;
  }

  function upload(member: RegisteredMember, type: string, content: Buffer, filename = 'photo.jpg') {
    return ctx
      .http()
      .post('/v1/kyc/documents')
      .set(bearer(member.tokens.accessToken))
      .field('type', type)
      .attach('file', content, { filename, contentType: 'image/jpeg' });
  }

  async function completeDossier(member: RegisteredMember, fields: Record<string, string> = {}) {
    await ctx
      .http()
      .patch('/v1/kyc')
      .set(bearer(member.tokens.accessToken))
      .send({
        firstName: 'Awa',
        lastName: 'Ngono',
        birthDate: '1990-05-14',
        idDocumentType: 'CNI',
        idDocumentNumber: `CM${randomInt(10_000_000, 99_999_999)}`,
        idDocumentExpiry: '2031-01-01',
        city: 'Douala',
        district: 'Akwa',
        addressHint: 'Près du marché central',
        vehiclePlate: 'lt 123 ab',
        vehicleModel: 'Nanfang',
        vehicleOwnership: 'OWNER',
        ...fields,
      })
      .expect(200);
    for (const type of ['ID_FRONT', 'ID_BACK', 'SELFIE']) {
      await upload(member, type, JPEG).expect(201);
    }
  }

  async function kycProfileId(member: RegisteredMember) {
    return (await ctx.prisma.kycProfile.findUniqueOrThrow({ where: { userId: member.user.id } })).id;
  }

  it('présente un dossier vide pré-rempli avec les informations du compte', async () => {
    const member = await registerMember(ctx);
    const res = await ctx.http().get('/v1/kyc').set(bearer(member.tokens.accessToken)).expect(200);
    expect(res.body).toMatchObject({
      status: 'NOT_STARTED',
      editable: true,
      canSubmit: false,
      identity: { firstName: 'Awa', lastName: 'Ngono', birthDate: null },
      location: { city: 'Douala', district: null },
      requiredDocuments: ['ID_FRONT', 'ID_BACK', 'SELFIE'],
      requirements: { completion: 20 },
    });
    expect(res.body.requirements.missing).toContain('DOCUMENT:SELFIE');
  });

  it('valide les champs et refuse une date inexistante', async () => {
    const member = await registerMember(ctx);
    const res = await ctx
      .http()
      .patch('/v1/kyc')
      .set(bearer(member.tokens.accessToken))
      .send({ birthDate: '1990-02-30' })
      .expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { fields: { birthDate: expect.any(Array) } } });

    const unknown = await ctx.http().patch('/v1/kyc').set(bearer(member.tokens.accessToken)).send({ status: 'APPROVED' }).expect(400);
    expect(unknown.body.code).toBe('VALIDATION_FAILED');
  });

  it('vérifie le type réel du fichier, pas son extension', async () => {
    const member = await registerMember(ctx);
    const fake = await upload(member, 'ID_FRONT', Buffer.from('ceci n’est pas une image'), 'piece.jpg').expect(415);
    expect(fake.body.code).toBe('KYC_DOCUMENT_INVALID_TYPE');

    const pdfSelfie = await upload(member, 'SELFIE', PDF, 'selfie.pdf').expect(415);
    expect(pdfSelfie.body.code).toBe('KYC_DOCUMENT_INVALID_TYPE');

    await upload(member, 'ID_FRONT', PDF, 'cni.pdf').expect(201);
  });

  it('chiffre les documents sur disque et ne les sert que par une URL signée temporaire', async () => {
    const member = await registerMember(ctx);
    const uploaded = await upload(member, 'ID_FRONT', JPEG).expect(201);
    expect(uploaded.body).toMatchObject({ type: 'ID_FRONT', status: 'PENDING', mimeType: 'image/jpeg' });
    expect(uploaded.body.url).toMatch(/^\/v1\/files\//);

    const file = await ctx.http().get(uploaded.body.url).buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
    expect(file.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.compare(file.body as Buffer, JPEG)).toBe(0);

    const tampered = `${uploaded.body.url.slice(0, -2)}${uploaded.body.url.endsWith('A') ? 'BB' : 'AA'}`;
    expect((await ctx.http().get(tampered).expect(403)).body.code).toBe('FILE_LINK_INVALID');

    const document = await ctx.prisma.kycDocument.findUniqueOrThrow({ where: { id: uploaded.body.id } });
    const onDisk = await readFile(join(process.env.DOCUMENT_STORAGE_DIR!, `${document.storageKey}.bin`));
    expect(onDisk.includes(Buffer.alloc(64, 0x37))).toBe(false);
    expect(document.sha256).toHaveLength(64);
  });

  it('refuse un dossier incomplet, un mineur et une pièce expirée', async () => {
    const member = await registerMember(ctx);
    const auth = bearer(member.tokens.accessToken);
    await ctx.http().patch('/v1/kyc').set(auth).send({ city: 'Douala' }).expect(200);
    const incomplete = await ctx.http().post('/v1/kyc/submit').set(auth).expect(422);
    expect(incomplete.body.code).toBe('KYC_INCOMPLETE');
    expect(incomplete.body.details.missing).toEqual(expect.arrayContaining(['IDENTITY', 'VEHICLE', 'DOCUMENT:ID_FRONT']));

    const minorBirth = new Date();
    minorBirth.setUTCFullYear(minorBirth.getUTCFullYear() - 16);
    await completeDossier(member, { birthDate: minorBirth.toISOString().slice(0, 10) });
    expect((await ctx.http().post('/v1/kyc/submit').set(auth).expect(422)).body.code).toBe('KYC_UNDERAGE');

    await ctx.http().patch('/v1/kyc').set(auth).send({ birthDate: '1990-05-14', idDocumentExpiry: '2020-01-01' }).expect(200);
    expect((await ctx.http().post('/v1/kyc/submit').set(auth).expect(422)).body.code).toBe('KYC_ID_EXPIRED');
  });

  it('parcours complet : soumission, complément demandé, resoumission puis approbation', async () => {
    const member = await registerMember(ctx);
    const auth = bearer(member.tokens.accessToken);
    await completeDossier(member);

    const submitted = await ctx.http().post('/v1/kyc/submit').set(auth).expect(200);
    expect(submitted.body).toMatchObject({ status: 'SUBMITTED', editable: false, submission: { count: 1 } });
    expect(submitted.body.vehicle.plate).toBe('LT 123 AB');

    expect((await ctx.http().patch('/v1/kyc').set(auth).send({ district: 'Bonanjo' }).expect(409)).body.code).toBe('KYC_LOCKED');
    expect((await upload(member, 'SELFIE', JPEG).expect(409)).body.code).toBe('KYC_LOCKED');

    const dashboard = await ctx.http().get('/v1/me/dashboard').set(auth).expect(200);
    expect(dashboard.body.alerts.map((a: { code: string }) => a.code)).toEqual(['KYC_UNDER_REVIEW']);
    expect(dashboard.body.features.kyc).toBe(true);

    // Un membre n'a pas accès à la file de vérification.
    expect((await ctx.http().get('/v1/admin/kyc/queue').set(auth).expect(403)).body.code).toBe('FORBIDDEN');

    const reviewer = bearer(reviewerToken);
    const id = await kycProfileId(member);
    const queue = await ctx.http().get('/v1/admin/kyc/queue').query({ limit: 100 }).set(reviewer).expect(200);
    const item = queue.body.items.find((i: { id: string }) => i.id === id);
    expect(item).toMatchObject({ status: 'SUBMITTED', applicant: { phone: member.phone }, documentCount: 3 });
    expect(item.riskFlags).toContain('DOCUMENTS_NOT_SCANNED');

    const dossier = await ctx.http().get(`/v1/admin/kyc/${id}`).set(reviewer).expect(200);
    expect(dossier.body.documents.filter((d: { active: boolean }) => d.active)).toHaveLength(3);
    const idBack = dossier.body.documents.find((d: { type: string }) => d.type === 'ID_BACK');

    await ctx.http().post(`/v1/admin/kyc/${id}/claim`).set(reviewer).expect(200);
    const otherReviewer = bearer(await staffToken('COMPLIANCE'));
    expect((await ctx.http().post(`/v1/admin/kyc/${id}/claim`).set(otherReviewer).expect(409)).body.code).toBe('KYC_CLAIMED_BY_OTHER');

    const noReason = await ctx.http().post(`/v1/admin/kyc/${id}/decision`).set(reviewer).send({ decision: 'MORE_INFO_REQUESTED' }).expect(400);
    expect(noReason.body.code).toBe('VALIDATION_FAILED');

    await ctx
      .http()
      .post(`/v1/admin/kyc/${id}/decision`)
      .set(reviewer)
      .send({
        decision: 'MORE_INFO_REQUESTED',
        reason: 'Le verso de votre CNI est illisible.',
        internalNotes: 'NOTE-INTERNE-CONFORMITE : vérifier la cohérence de la date de délivrance',
        documents: [{ documentId: idBack.id, status: 'REJECTED', reason: 'Photo floue' }],
      })
      .expect(200);

    const toFix = await ctx.http().get('/v1/kyc').set(auth).expect(200);
    expect(toFix.body).toMatchObject({
      status: 'DRAFT',
      editable: true,
      canSubmit: false,
      submission: { decisionReason: 'Le verso de votre CNI est illisible.' },
    });
    expect(toFix.body.requirements.missing).toEqual(['DOCUMENT:ID_BACK']);
    // Le motif du document refusé est visible par le membre ; les notes internes jamais.
    expect(toFix.body.documents.find((d: { type: string }) => d.type === 'ID_BACK')).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Photo floue',
    });
    expect(JSON.stringify(toFix.body)).not.toContain('NOTE-INTERNE-CONFORMITE');
    const alerts = await ctx.http().get('/v1/me/dashboard').set(auth).expect(200);
    expect(alerts.body.alerts[0]).toMatchObject({ code: 'KYC_MORE_INFO_REQUIRED', message: 'Le verso de votre CNI est illisible.' });

    await upload(member, 'ID_BACK', JPEG).expect(201);
    const resubmitted = await ctx.http().post('/v1/kyc/submit').set(auth).expect(200);
    expect(resubmitted.body).toMatchObject({ status: 'SUBMITTED', submission: { count: 2, decisionReason: null } });

    const approved = await ctx.http().post(`/v1/admin/kyc/${id}/decision`).set(reviewer).send({ decision: 'APPROVED' }).expect(200);
    expect(approved.body.status).toBe('APPROVED');

    const me = await ctx.http().get('/v1/me').set(auth).expect(200);
    expect(me.body.profile.kycStatus).toBe('APPROVED');
    expect((await ctx.http().get('/v1/me/dashboard').set(auth).expect(200)).body.alerts).toEqual([]);
    const final = await ctx.http().get('/v1/kyc').set(auth).expect(200);
    expect(final.body.documents.map((d: { status: string }) => d.status)).toEqual(['ACCEPTED', 'ACCEPTED', 'ACCEPTED']);
    expect((await ctx.http().patch('/v1/kyc').set(auth).send({ district: 'Bonanjo' }).expect(409)).body.code).toBe('KYC_LOCKED');

    expect(await ctx.prisma.kycReview.count({ where: { kycProfileId: id } })).toBe(2);
    await expect(ctx.prisma.$executeRaw`UPDATE kyc_reviews SET decision = 'APPROVED' WHERE kyc_profile_id = ${id}::uuid`).rejects.toThrow(
      /IMMUTABLE_RECORD/,
    );
    const actions = (await ctx.prisma.auditLog.findMany({ where: { resourceId: id } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['kyc.submitted', 'kyc.dossier.viewed', 'kyc.review.claimed', 'kyc.review.decided']));
  });

  it('interdit à un réviseur de traiter son propre dossier', async () => {
    const member = await registerMember(ctx);
    await completeDossier(member);
    await ctx.http().post('/v1/kyc/submit').set(bearer(member.tokens.accessToken)).expect(200);

    const compliance = await ctx.prisma.role.findUniqueOrThrow({ where: { code: 'COMPLIANCE' } });
    await ctx.prisma.userRole.create({ data: { userId: member.user.id, roleId: compliance.id } });

    const res = await ctx
      .http()
      .post(`/v1/admin/kyc/${await kycProfileId(member)}/decision`)
      .set(bearer(member.tokens.accessToken))
      .send({ decision: 'APPROVED' })
      .expect(403);
    expect(res.body.code).toBe('KYC_SELF_REVIEW_FORBIDDEN');
  });

  it('signale au réviseur un numéro de pièce déjà utilisé par un autre compte', async () => {
    const idNumber = `CM${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
    const first = await registerMember(ctx);
    await completeDossier(first, { idDocumentNumber: idNumber });
    await ctx.http().post('/v1/kyc/submit').set(bearer(first.tokens.accessToken)).expect(200);

    const second = await registerMember(ctx);
    await completeDossier(second, { idDocumentNumber: idNumber, firstName: 'Paul', lastName: 'Fotso' });
    await ctx.http().post('/v1/kyc/submit').set(bearer(second.tokens.accessToken)).expect(200);

    const profile = await ctx.prisma.kycProfile.findUniqueOrThrow({ where: { userId: second.user.id } });
    expect(profile.riskFlags).toEqual(expect.arrayContaining(['DUPLICATE_ID_NUMBER', 'NAME_DIFFERS_FROM_ACCOUNT']));
  });
});
