import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma, Project, ProjectStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app-exception';
import { Decimal, money } from '../../common/money';
import { afterCursor, toPage } from '../../common/pagination';
import type { RequestContext } from '../../common/request-context';
import { PrismaService, Tx } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationInput, NotificationsService } from '../notifications/notifications.service';
import type { UploadedFileLike } from '../storage/file-types';
import { PrivateUploadService } from '../storage/private-upload.service';
import type {
  AdminProjectsQueryDto,
  CreateProjectDto,
  ProjectDecisionDto,
  ProjectFieldsDto,
  UpdateProjectDto,
} from './projects.dto';
import {
  evaluateProject,
  parseBudgetLines,
  parseForecasts,
  parseTeamMembers,
  PROJECT_DOCUMENT_STATUSES,
  PROJECT_EDITABLE_STATUSES,
} from './projects.rules';

const detailInclude = {
  documents: { orderBy: { createdAt: 'asc' } },
  reviews: { orderBy: { createdAt: 'desc' } },
  milestones: { orderBy: [{ targetDate: 'asc' }, { title: 'asc' }] },
  company: { select: { id: true, name: true, status: true } },
} satisfies Prisma.ProjectInclude;
type ProjectDetail = Prisma.ProjectGetPayload<{ include: typeof detailInclude }>;

const DECISION_STATUS = { APPROVED: 'APPROVED', REJECTED: 'REJECTED', CHANGES_REQUESTED: 'CHANGES_REQUESTED' } as const;

/** Projets d'entreprise (cahier §7.17-7.18, §8.10) : brouillon, soumission complète, décision motivée du comité. */
@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly uploads: PrivateUploadService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────────────────────── Porteur ─────────────────────────────

  async listMine(userId: string) {
    const projects = await this.prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: { company: { select: { id: true, name: true } } },
    });
    return { items: projects.map((project) => ({ ...summaryView(project), company: project.company })) };
  }

  async getMine(id: string, userId: string) {
    const project = await this.prisma.project.findFirst({ where: { id, userId }, include: detailInclude });
    if (!project) throw notFound();
    return this.detailView(project);
  }

  async create(userId: string, dto: CreateProjectDto, ctx: RequestContext) {
    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: { ...(toData(dto) as Prisma.ProjectUncheckedCreateInput), userId, title: dto.title, status: 'DRAFT' },
      });
      await this.audit.record(
        { action: 'project.created', resourceType: 'project', resourceId: created.id, after: { title: created.title } },
        ctx,
        tx,
      );
      return created;
    });
    return this.getMine(project.id, userId);
  }

  async update(id: string, userId: string, dto: UpdateProjectDto, ctx: RequestContext) {
    const data = toData(dto);
    if (Object.keys(data).length === 0) return this.getMine(id, userId);
    await this.prisma.$transaction(async (tx) => {
      const current = await lock(tx, id);
      if (current.userId !== userId) throw notFound();
      assertEditable(current.status);
      await tx.project.update({ where: { id }, data });
      await this.audit.record(
        { action: 'project.updated', resourceType: 'project', resourceId: id, metadata: { fields: Object.keys(data) } },
        ctx,
        tx,
      );
    });
    return this.getMine(id, userId);
  }

  async submit(id: string, userId: string, ctx: RequestContext) {
    const profile = await this.prisma.profile.findUnique({ where: { userId }, select: { kycStatus: true } });
    if (profile?.kycStatus !== 'APPROVED') {
      throw new AppException(HttpStatus.FORBIDDEN, 'PROJECT_KYC_REQUIRED', 'Votre identité doit être vérifiée avant de soumettre un projet.');
    }
    const project = await this.prisma.$transaction(async (tx) => {
      const current = await lock(tx, id);
      if (current.userId !== userId) throw notFound();
      assertEditable(current.status);
      const completeness = evaluateProject(current);
      if (!completeness.complete) {
        throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'PROJECT_INCOMPLETE', 'Votre projet est incomplet ou incohérent.', {
          missing: completeness.missing,
          issues: completeness.issues,
        });
      }
      const submitted = await tx.project.update({ where: { id }, data: { status: 'SUBMITTED', submittedAt: new Date() } });
      await this.audit.record(
        {
          action: 'project.submitted',
          resourceType: 'project',
          resourceId: id,
          before: { status: current.status },
          after: { status: 'SUBMITTED', estimatedBudget: current.estimatedBudget, grantRequested: current.grantRequested },
        },
        ctx,
        tx,
      );
      return submitted;
    });
    await this.notify(userId, {
      type: 'PROJECT_SUBMITTED',
      title: 'Projet soumis',
      body: `« ${project.title} » a été transmis au comité. Vous serez informé de sa décision.`,
      deepLink: `/projects/${id}`,
    });
    return this.getMine(id, userId);
  }

  async uploadDocument(id: string, userId: string, type: string, file: UploadedFileLike | undefined, ctx: RequestContext) {
    const project = await this.prisma.project.findFirst({ where: { id, userId } });
    if (!project) throw notFound();
    assertDocumentsAllowed(project.status);
    const stored = await this.uploads.store(file, ['image/jpeg', 'image/png', 'application/pdf']);
    await this.prisma.$transaction(async (tx) => {
      const current = await lock(tx, id);
      assertDocumentsAllowed(current.status);
      const document = await tx.projectDocument.create({ data: { projectId: id, type, ...stored, uploadedById: userId } });
      await this.audit.record(
        {
          action: 'project.document.uploaded',
          resourceType: 'project_document',
          resourceId: document.id,
          metadata: { projectId: id, type, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes, sha256: stored.sha256 },
        },
        ctx,
        tx,
      );
    });
    return this.getMine(id, userId);
  }

  // ───────────────────────────── Comité ─────────────────────────────

  async adminList(query: AdminProjectsQueryDto) {
    const rows = await this.prisma.project.findMany({
      where: { ...(query.status ? { status: query.status } : {}), ...afterCursor(query.cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: { user: { select: { phone: true, profile: { select: { firstName: true, lastName: true, city: true } } } } },
    });
    return toPage(rows, query.limit, (project) => ({
      ...summaryView(project),
      member: {
        userId: project.userId,
        phone: project.user.phone,
        firstName: project.user.profile?.firstName ?? null,
        lastName: project.user.profile?.lastName ?? null,
        city: project.user.profile?.city ?? null,
      },
    }));
  }

  async adminGet(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        ...detailInclude,
        user: {
          select: {
            phone: true,
            profile: { select: { firstName: true, lastName: true, city: true, kycStatus: true } },
            beneficiary: { select: { status: true } },
          },
        },
      },
    });
    if (!project) throw notFound();
    return {
      ...this.detailView(project),
      member: {
        userId: project.userId,
        phone: project.user.phone,
        firstName: project.user.profile?.firstName ?? null,
        lastName: project.user.profile?.lastName ?? null,
        city: project.user.profile?.city ?? null,
        kycStatus: project.user.profile?.kycStatus ?? null,
        beneficiaryStatus: project.user.beneficiary?.status ?? null,
      },
      reviewerId: project.reviewerId,
    };
  }

  async startReview(id: string, ctx: RequestContext) {
    const actorId = requireActor(ctx);
    await this.prisma.$transaction(async (tx) => {
      const current = await lock(tx, id);
      if (current.status !== 'SUBMITTED') throw invalidStatus(current.status, ['SUBMITTED']);
      if (current.userId === actorId) throw selfDecision();
      await tx.project.update({ where: { id }, data: { status: 'UNDER_REVIEW', reviewerId: actorId } });
      await this.audit.record(
        { action: 'project.review.started', resourceType: 'project', resourceId: id, before: { status: 'SUBMITTED' }, after: { status: 'UNDER_REVIEW' } },
        ctx,
        tx,
      );
    });
    return this.adminGet(id);
  }

  async decide(id: string, dto: ProjectDecisionDto, ctx: RequestContext) {
    const actorId = requireActor(ctx);
    const status: ProjectStatus = DECISION_STATUS[dto.decision];
    const project = await this.prisma.$transaction(async (tx) => {
      const current = await lock(tx, id);
      if (current.status !== 'SUBMITTED' && current.status !== 'UNDER_REVIEW') {
        throw invalidStatus(current.status, ['SUBMITTED', 'UNDER_REVIEW']);
      }
      if (current.userId === actorId) throw selfDecision();
      await tx.projectReview.create({
        data: { projectId: id, reviewerId: actorId, decision: dto.decision, reason: dto.reason, score: dto.score ?? null },
      });
      const updated = await tx.project.update({
        where: { id },
        data: { status, reviewFeedback: dto.reason, score: dto.score ?? current.score, reviewerId: actorId, reviewedAt: new Date() },
      });
      await this.audit.record(
        {
          action: 'project.decided',
          resourceType: 'project',
          resourceId: id,
          before: { status: current.status },
          after: { status, decision: dto.decision, score: dto.score ?? null },
        },
        ctx,
        tx,
      );
      return updated;
    });

    const titles = {
      APPROVED: 'Projet approuvé',
      REJECTED: 'Projet non retenu',
      CHANGES_REQUESTED: 'Corrections demandées sur votre projet',
    } as const;
    await this.notify(project.userId, {
      type: 'PROJECT_DECISION',
      title: titles[dto.decision],
      body: `« ${project.title} » : ${dto.reason}`,
      deepLink: `/projects/${id}`,
    });
    return this.adminGet(id);
  }

  // ───────────────────────────── Interne ─────────────────────────────

  private detailView(project: ProjectDetail) {
    const completeness = evaluateProject(project);
    const forecasts = parseForecasts(project.forecasts);
    return {
      ...summaryView(project),
      locationDetail: project.locationDetail,
      problem: project.problem,
      solution: project.solution,
      market: project.market,
      description: project.description,
      personalContribution: money(project.personalContribution),
      budgetLines: parseBudgetLines(project.budgetLines).map((line) => ({ label: line.label, amount: money(line.amount) })),
      teamMembers: parseTeamMembers(project.teamMembers),
      forecasts: {
        monthlyRevenue: forecasts.monthlyRevenue === null ? null : money(forecasts.monthlyRevenue),
        monthlyCosts: forecasts.monthlyCosts === null ? null : money(forecasts.monthlyCosts),
        jobsCreated: forecasts.jobsCreated,
      },
      reviewFeedback: project.reviewFeedback,
      score: project.score,
      canEdit: PROJECT_EDITABLE_STATUSES.includes(project.status),
      canSubmit: PROJECT_EDITABLE_STATUSES.includes(project.status) && completeness.complete,
      canAddDocuments: PROJECT_DOCUMENT_STATUSES.includes(project.status),
      completeness,
      documents: project.documents.map((document) => this.uploads.view(document)),
      reviews: project.reviews.map((review) => ({
        decision: review.decision,
        reason: review.reason,
        score: review.score,
        createdAt: review.createdAt,
      })),
      milestones: project.milestones.map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        targetDate: milestone.targetDate,
        amount: money(milestone.amount),
        isCompleted: milestone.isCompleted,
        completedAt: milestone.completedAt,
      })),
      company: project.company,
    };
  }

  private async notify(userId: string, input: NotificationInput) {
    await this.notifications
      .notify(userId, input)
      .catch((error: unknown) => this.logger.warn({ err: error, userId, type: input.type }, 'Notification projet non envoyée'));
  }
}

function summaryView(project: Project) {
  return {
    id: project.id,
    title: project.title,
    sector: project.sector,
    city: project.city,
    status: project.status,
    estimatedBudget: project.estimatedBudget ? money(project.estimatedBudget) : null,
    grantRequested: project.grantRequested ? money(project.grantRequested) : null,
    submittedAt: project.submittedAt,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function toData(dto: ProjectFieldsDto & { title?: string }): Prisma.ProjectUncheckedUpdateInput {
  const data: Prisma.ProjectUncheckedUpdateInput = {};
  const text = (value: string | null | undefined) => (value === undefined ? undefined : value === null || value === '' ? null : value);
  if (dto.title !== undefined) data.title = dto.title;
  if (dto.sector !== undefined) data.sector = text(dto.sector);
  if (dto.city !== undefined) data.city = text(dto.city);
  if (dto.locationDetail !== undefined) data.locationDetail = text(dto.locationDetail);
  if (dto.problem !== undefined) data.problem = text(dto.problem);
  if (dto.solution !== undefined) data.solution = text(dto.solution);
  if (dto.market !== undefined) data.market = text(dto.market);
  if (dto.description !== undefined) data.description = text(dto.description);
  if (dto.estimatedBudget !== undefined) data.estimatedBudget = dto.estimatedBudget === null ? null : new Decimal(dto.estimatedBudget);
  if (dto.personalContribution !== undefined) data.personalContribution = new Decimal(dto.personalContribution ?? 0);
  if (dto.grantRequested !== undefined) data.grantRequested = dto.grantRequested === null ? null : new Decimal(dto.grantRequested);
  if (dto.budgetLines !== undefined) {
    data.budgetLines = dto.budgetLines === null ? Prisma.DbNull : dto.budgetLines.map((line) => ({ label: line.label, amount: line.amount }));
  }
  if (dto.teamMembers !== undefined) {
    data.teamMembers = dto.teamMembers === null ? Prisma.DbNull : dto.teamMembers.map((member) => ({ fullName: member.fullName, role: member.role }));
  }
  if (dto.forecasts !== undefined) {
    data.forecasts =
      dto.forecasts === null
        ? Prisma.DbNull
        : {
            monthlyRevenue: dto.forecasts.monthlyRevenue ?? null,
            monthlyCosts: dto.forecasts.monthlyCosts ?? null,
            jobsCreated: dto.forecasts.jobsCreated ?? null,
          };
  }
  return data;
}

async function lock(tx: Tx, id: string): Promise<Project> {
  await tx.$queryRaw`SELECT id FROM projects WHERE id = ${id}::uuid FOR UPDATE`;
  const project = await tx.project.findUnique({ where: { id } });
  if (!project) throw notFound();
  return project;
}

function assertEditable(status: ProjectStatus) {
  if (!PROJECT_EDITABLE_STATUSES.includes(status)) {
    throw new AppException(HttpStatus.CONFLICT, 'PROJECT_LOCKED', 'Ce projet est en cours d’examen ou déjà décidé : il ne peut plus être modifié.', {
      status,
    });
  }
}

function assertDocumentsAllowed(status: ProjectStatus) {
  if (!PROJECT_DOCUMENT_STATUSES.includes(status)) {
    throw new AppException(HttpStatus.CONFLICT, 'PROJECT_LOCKED', 'Ce projet est déjà décidé : aucun document ne peut être ajouté.', { status });
  }
}

function invalidStatus(status: ProjectStatus, expected: ProjectStatus[]) {
  return new AppException(HttpStatus.CONFLICT, 'PROJECT_INVALID_STATUS', 'Action impossible dans l’état actuel du projet.', { status, expected });
}

function selfDecision() {
  return new AppException(HttpStatus.FORBIDDEN, 'PROJECT_SELF_DECISION', 'Vous ne pouvez pas examiner votre propre projet.');
}

function notFound() {
  return new AppException(HttpStatus.NOT_FOUND, 'PROJECT_NOT_FOUND', 'Projet introuvable.');
}

function requireActor(ctx: RequestContext): string {
  const actor = ctx.auth?.userId;
  if (!actor) throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Authentification requise.');
  return actor;
}
