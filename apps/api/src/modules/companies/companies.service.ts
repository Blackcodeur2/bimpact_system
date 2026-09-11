import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { JobApplicationStatus, Prisma, ProjectStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app-exception';
import type { RequestContext } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  AddCompanyMemberDto,
  CreateCompanyDto,
  CreateJobOfferDto,
  UpdateApplicationStatusDto,
  UpdateCompanyDto,
} from './companies.dto';

/** Une entreprise naît d'un projet validé par le comité. */
const COMPANY_PROJECT_STATUSES: ProjectStatus[] = ['APPROVED', 'FUNDED', 'ACTIVE', 'COMPLETED'];

/** Suivi d'une candidature par l'employeur ; HIRED, REJECTED et WITHDRAWN sont définitifs. */
export const APPLICATION_TRANSITIONS: Record<JobApplicationStatus, JobApplicationStatus[]> = {
  PENDING: ['SHORTLISTED', 'CONTACTED', 'REJECTED'],
  SHORTLISTED: ['CONTACTED', 'HIRED', 'REJECTED'],
  CONTACTED: ['HIRED', 'REJECTED'],
  HIRED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

/** Le numéro du candidat n'est communiqué qu'une fois la prise de contact décidée. */
const PHONE_VISIBLE_STATUSES: JobApplicationStatus[] = ['CONTACTED', 'HIRED'];

const CANDIDATE_MESSAGES: Partial<Record<JobApplicationStatus, { title: string; body: (job: string, company: string) => string }>> = {
  SHORTLISTED: { title: 'Candidature présélectionnée', body: (job, company) => `${company} a présélectionné votre candidature pour « ${job} ».` },
  CONTACTED: { title: 'Un employeur va vous contacter', body: (job, company) => `${company} souhaite échanger avec vous au sujet de « ${job} ».` },
  HIRED: { title: 'Félicitations, vous êtes retenu', body: (job, company) => `${company} vous a retenu pour « ${job} ».` },
  REJECTED: { title: 'Candidature non retenue', body: (job, company) => `${company} n’a pas retenu votre candidature pour « ${job} ».` },
};

/** Entreprises des bénéficiaires, équipe et offres d'emploi (cahier §7.19, §7.20). */
@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateCompanyDto, ctx: RequestContext) {
    const [project, profile] = await Promise.all([
      this.prisma.project.findFirst({ where: { id: dto.projectId, userId }, include: { company: { select: { id: true } } } }),
      this.prisma.profile.findUniqueOrThrow({ where: { userId }, select: { firstName: true, lastName: true } }),
    ]);
    if (!project) throw new AppException(HttpStatus.NOT_FOUND, 'PROJECT_NOT_FOUND', 'Projet introuvable.');
    if (!COMPANY_PROJECT_STATUSES.includes(project.status)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'COMPANY_PROJECT_NOT_APPROVED',
        'Une entreprise ne peut être créée qu’à partir d’un projet approuvé par le comité.',
        { status: project.status },
      );
    }
    if (project.company) throw companyExists();

    try {
      const company = await this.prisma.$transaction(async (tx) => {
        const created = await tx.company.create({
          data: {
            ownerId: userId,
            projectId: project.id,
            name: dto.name,
            sector: dto.sector,
            city: dto.city,
            description: dto.description ?? null,
            phone: dto.phone ?? null,
          },
        });
        await tx.companyMember.create({
          data: { companyId: created.id, userId, fullName: `${profile.firstName} ${profile.lastName}`, role: 'Fondateur' },
        });
        await this.audit.record(
          { action: 'company.created', resourceType: 'company', resourceId: created.id, after: { name: created.name, projectId: project.id } },
          ctx,
          tx,
        );
        return created;
      });
      return this.get(company.id, userId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw companyExists();
      throw error;
    }
  }

  async mine(userId: string) {
    const companies = await this.prisma.company.findMany({
      where: { OR: [{ ownerId: userId }, { members: { some: { userId, leftAt: null } } }] },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { members: { where: { leftAt: null } }, jobOffers: { where: { isActive: true } } } },
      },
    });
    return {
      items: companies.map((company) => ({
        id: company.id,
        name: company.name,
        sector: company.sector,
        city: company.city,
        status: company.status,
        isOwner: company.ownerId === userId,
        membersCount: company._count.members,
        openJobsCount: company._count.jobOffers,
        createdAt: company.createdAt,
      })),
    };
  }

  async get(id: string, userId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, title: true } },
        members: { where: { leftAt: null }, orderBy: { joinedAt: 'asc' } },
        jobOffers: { orderBy: { createdAt: 'desc' } },
      },
    });
    const isOwner = company?.ownerId === userId;
    if (!company || (!isOwner && !company.members.some((member) => member.userId === userId))) throw notFound();

    const counts = await this.prisma.jobApplication.groupBy({
      by: ['jobOfferId', 'status'],
      where: { jobOfferId: { in: company.jobOffers.map((job) => job.id) } },
      _count: true,
    });
    const countFor = (jobId: string, statuses?: JobApplicationStatus[]) =>
      counts
        .filter((row) => row.jobOfferId === jobId && (!statuses || statuses.includes(row.status)))
        .reduce((sum, row) => sum + row._count, 0);

    return {
      id: company.id,
      name: company.name,
      sector: company.sector,
      city: company.city,
      description: company.description,
      phone: company.phone,
      status: company.status,
      createdAt: company.createdAt,
      project: company.project,
      isOwner,
      members: company.members.map((member) => ({
        id: member.id,
        fullName: member.fullName,
        role: member.role,
        joinedAt: member.joinedAt,
        isOwner: member.userId === company.ownerId,
      })),
      jobs: company.jobOffers.map((job) => ({
        id: job.id,
        title: job.title,
        sector: job.sector,
        location: job.location,
        slots: job.slots,
        isActive: job.isActive,
        createdAt: job.createdAt,
        closedAt: job.closedAt,
        // Les candidatures ne sont visibles que par le propriétaire.
        applications: isOwner ? { total: countFor(job.id), pending: countFor(job.id, ['PENDING']) } : null,
      })),
    };
  }

  async update(id: string, userId: string, dto: UpdateCompanyDto, ctx: RequestContext) {
    const company = await this.owned(id, userId);
    const data = Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined));
    if (Object.keys(data).length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.company.update({ where: { id }, data });
        await this.audit.record(
          { action: 'company.updated', resourceType: 'company', resourceId: id, before: pick(company, Object.keys(data)), after: data },
          ctx,
          tx,
        );
      });
    }
    return this.get(id, userId);
  }

  async addMember(id: string, userId: string, dto: AddCompanyMemberDto, ctx: RequestContext) {
    await this.owned(id, userId, { active: true });
    await this.prisma.$transaction(async (tx) => {
      const member = await tx.companyMember.create({ data: { companyId: id, fullName: dto.fullName, role: dto.role } });
      await this.audit.record(
        { action: 'company.member.added', resourceType: 'company_member', resourceId: member.id, after: { companyId: id, role: dto.role } },
        ctx,
        tx,
      );
    });
    return this.get(id, userId);
  }

  async removeMember(id: string, memberId: string, userId: string, ctx: RequestContext) {
    const company = await this.owned(id, userId);
    const member = await this.prisma.companyMember.findFirst({ where: { id: memberId, companyId: id, leftAt: null } });
    if (!member) throw new AppException(HttpStatus.NOT_FOUND, 'COMPANY_MEMBER_NOT_FOUND', 'Membre introuvable.');
    if (member.userId === company.ownerId) {
      throw new AppException(HttpStatus.CONFLICT, 'COMPANY_OWNER_REQUIRED', 'Le fondateur ne peut pas être retiré de l’équipe.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.companyMember.update({ where: { id: memberId }, data: { leftAt: new Date() } });
      await this.audit.record({ action: 'company.member.removed', resourceType: 'company_member', resourceId: memberId }, ctx, tx);
    });
    return this.get(id, userId);
  }

  async createJob(id: string, userId: string, dto: CreateJobOfferDto, ctx: RequestContext) {
    const company = await this.owned(id, userId, { active: true });
    await this.prisma.$transaction(async (tx) => {
      const job = await tx.jobOffer.create({
        data: {
          companyId: id,
          company: company.name,
          title: dto.title,
          sector: dto.sector,
          location: dto.location,
          description: dto.description,
          requirements: dto.requirements ?? null,
          salaryHint: dto.salaryHint ?? null,
          slots: dto.slots,
          skills: dto.skills ?? [],
          createdById: userId,
        },
      });
      await this.audit.record(
        { action: 'job_offer.published', resourceType: 'job_offer', resourceId: job.id, after: { companyId: id, title: job.title, slots: job.slots } },
        ctx,
        tx,
      );
    });
    return this.get(id, userId);
  }

  async closeJob(id: string, jobId: string, userId: string, ctx: RequestContext) {
    await this.owned(id, userId);
    const job = await this.prisma.jobOffer.findFirst({ where: { id: jobId, companyId: id } });
    if (!job) throw jobNotFound();
    if (job.isActive) {
      await this.prisma.$transaction(async (tx) => {
        await tx.jobOffer.update({ where: { id: jobId }, data: { isActive: false, closedAt: new Date() } });
        await this.audit.record({ action: 'job_offer.closed', resourceType: 'job_offer', resourceId: jobId }, ctx, tx);
      });
    }
    return this.get(id, userId);
  }

  async applications(id: string, jobId: string, userId: string) {
    await this.owned(id, userId);
    const job = await this.prisma.jobOffer.findFirst({ where: { id: jobId, companyId: id } });
    if (!job) throw jobNotFound();
    const applications = await this.prisma.jobApplication.findMany({
      where: { jobOfferId: jobId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { phone: true, profile: { select: { firstName: true, lastName: true, city: true, kycStatus: true } } } } },
    });
    return {
      job: { id: job.id, title: job.title, slots: job.slots, isActive: job.isActive },
      items: applications.map((application) => ({
        id: application.id,
        status: application.status,
        message: application.message,
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
        allowedTransitions: APPLICATION_TRANSITIONS[application.status],
        candidate: {
          firstName: application.user.profile?.firstName ?? null,
          lastName: application.user.profile?.lastName ?? null,
          city: application.user.profile?.city ?? null,
          identityVerified: application.user.profile?.kycStatus === 'APPROVED',
          phone: PHONE_VISIBLE_STATUSES.includes(application.status) ? application.user.phone : null,
        },
      })),
    };
  }

  async updateApplication(id: string, applicationId: string, userId: string, dto: UpdateApplicationStatusDto, ctx: RequestContext) {
    const company = await this.owned(id, userId);
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM job_applications WHERE id = ${applicationId}::uuid FOR UPDATE`;
      const application = await tx.jobApplication.findFirst({
        where: { id: applicationId, jobOffer: { companyId: id } },
        include: { jobOffer: { select: { id: true, title: true } }, user: { select: { profile: { select: { firstName: true, lastName: true } } } } },
      });
      if (!application) throw new AppException(HttpStatus.NOT_FOUND, 'APPLICATION_NOT_FOUND', 'Candidature introuvable.');
      if (application.status === dto.status) return null;
      if (!APPLICATION_TRANSITIONS[application.status].includes(dto.status)) {
        throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'APPLICATION_INVALID_TRANSITION', 'Changement de statut impossible pour cette candidature.', {
          status: application.status,
          allowed: APPLICATION_TRANSITIONS[application.status],
        });
      }
      await tx.jobApplication.update({ where: { id: applicationId }, data: { status: dto.status } });
      if (dto.status === 'HIRED') {
        const alreadyMember = await tx.companyMember.findFirst({ where: { companyId: id, userId: application.userId, leftAt: null } });
        if (!alreadyMember) {
          await tx.companyMember.create({
            data: {
              companyId: id,
              userId: application.userId,
              fullName: `${application.user.profile?.firstName ?? ''} ${application.user.profile?.lastName ?? ''}`.trim(),
              role: application.jobOffer.title,
            },
          });
        }
      }
      await this.audit.record(
        {
          action: 'job_application.status_changed',
          resourceType: 'job_application',
          resourceId: applicationId,
          before: { status: application.status },
          after: { status: dto.status },
        },
        ctx,
        tx,
      );
      return { candidateId: application.userId, jobTitle: application.jobOffer.title };
    });

    const message = CANDIDATE_MESSAGES[dto.status];
    if (outcome && message) {
      await this.notifications
        .notify(outcome.candidateId, {
          type: 'RECRUITMENT_APPLICATION_UPDATED',
          title: message.title,
          body: message.body(outcome.jobTitle, company.name),
          deepLink: '/recruitment',
        })
        .catch((error: unknown) => this.logger.warn({ err: error }, 'Notification de candidature non envoyée'));
    }
    return this.applications(id, (await this.prisma.jobApplication.findUniqueOrThrow({ where: { id: applicationId } })).jobOfferId, userId);
  }

  private async owned(id: string, userId: string, options: { active?: boolean } = {}) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw notFound();
    if (company.ownerId !== userId) {
      const member = await this.prisma.companyMember.findFirst({ where: { companyId: id, userId, leftAt: null } });
      if (!member) throw notFound();
      throw new AppException(HttpStatus.FORBIDDEN, 'COMPANY_OWNER_ONLY', 'Seul le fondateur peut effectuer cette action.');
    }
    if (options.active && company.status !== 'ACTIVE') {
      throw new AppException(HttpStatus.CONFLICT, 'COMPANY_NOT_ACTIVE', 'Cette entreprise n’est pas active.', { status: company.status });
    }
    return company;
  }
}

function pick(source: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, source[key]]));
}

function notFound() {
  return new AppException(HttpStatus.NOT_FOUND, 'COMPANY_NOT_FOUND', 'Entreprise introuvable.');
}

function jobNotFound() {
  return new AppException(HttpStatus.NOT_FOUND, 'JOB_OFFER_NOT_FOUND', 'Offre introuvable.');
}

function companyExists() {
  return new AppException(HttpStatus.CONFLICT, 'COMPANY_ALREADY_EXISTS', 'Une entreprise existe déjà pour ce projet.');
}
