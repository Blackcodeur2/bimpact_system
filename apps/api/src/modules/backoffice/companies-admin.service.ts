import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception';
import { afterCursor, toPage } from '../../common/pagination';
import type { RequestContext } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { fullName } from './backoffice.common';
import type { AdminCompaniesQueryDto, AdminJobsQueryDto, CompanyStatusDto, ReasonDto } from './backoffice.dto';

const ownerSelect = { select: { id: true, phone: true, profile: { select: { firstName: true, lastName: true } } } } as const;

/** Supervision des entreprises (cahier §8.11) et du recrutement (cahier §8.12). */
@Injectable()
export class CompaniesAdminService {
  private readonly logger = new Logger(CompaniesAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async companies(query: AdminCompaniesQueryDto) {
    const q = query.q;
    const rows = await this.prisma.company.findMany({
      where: {
        status: query.status,
        ...(q
          ? {
              AND: [
                {
                  OR: [
                    { name: { contains: q, mode: 'insensitive' } },
                    { city: { contains: q, mode: 'insensitive' } },
                    { sector: { contains: q, mode: 'insensitive' } },
                  ],
                },
              ],
            }
          : {}),
        ...afterCursor(query.cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: {
        owner: ownerSelect,
        _count: { select: { members: { where: { leftAt: null } }, jobOffers: { where: { isActive: true } } } },
      },
    });
    return toPage(rows, query.limit, (company) => ({
      id: company.id,
      name: company.name,
      sector: company.sector,
      city: company.city,
      status: company.status,
      createdAt: company.createdAt,
      owner: { userId: company.owner.id, name: fullName(company.owner.profile), phone: company.owner.phone },
      membersCount: company._count.members,
      openJobsCount: company._count.jobOffers,
    }));
  }

  async company(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        owner: ownerSelect,
        project: { select: { id: true, title: true, status: true } },
        members: { orderBy: { joinedAt: 'asc' } },
        jobOffers: { orderBy: { createdAt: 'desc' }, include: { _count: { select: { applications: true } } } },
      },
    });
    if (!company) throw companyNotFound();
    const hires = await this.prisma.jobApplication.count({ where: { jobOffer: { companyId: id }, status: 'HIRED' } });
    return {
      id: company.id,
      name: company.name,
      sector: company.sector,
      city: company.city,
      description: company.description,
      phone: company.phone,
      status: company.status,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
      owner: { userId: company.owner.id, name: fullName(company.owner.profile), phone: company.owner.phone },
      project: company.project,
      performance: {
        activeMembers: company.members.filter((member) => member.leftAt === null).length,
        jobsPublished: company.jobOffers.length,
        openJobs: company.jobOffers.filter((job) => job.isActive).length,
        applications: company.jobOffers.reduce((sum, job) => sum + job._count.applications, 0),
        hires,
      },
      members: company.members.map((member) => ({
        id: member.id,
        fullName: member.fullName,
        role: member.role,
        joinedAt: member.joinedAt,
        leftAt: member.leftAt,
        userId: member.userId,
      })),
      jobs: company.jobOffers.map((job) => ({
        id: job.id,
        title: job.title,
        location: job.location,
        slots: job.slots,
        isActive: job.isActive,
        createdAt: job.createdAt,
        closedAt: job.closedAt,
        applications: job._count.applications,
      })),
    };
  }

  /** Suspension : les offres ouvertes de l'entreprise sont fermées pour ne plus recevoir de candidatures. */
  async setCompanyStatus(id: string, dto: CompanyStatusDto, ctx: RequestContext) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM companies WHERE id = ${id}::uuid FOR UPDATE`;
      const company = await tx.company.findUnique({ where: { id } });
      if (!company) throw companyNotFound();
      if (company.status === dto.status) return null;
      if (company.status === 'CLOSED') {
        throw new AppException(HttpStatus.CONFLICT, 'COMPANY_CLOSED', 'Une entreprise fermée ne peut pas changer de statut.');
      }
      await tx.company.update({ where: { id }, data: { status: dto.status } });
      const closedOffers =
        dto.status === 'SUSPENDED'
          ? (await tx.jobOffer.updateMany({ where: { companyId: id, isActive: true }, data: { isActive: false, closedAt: new Date() } })).count
          : 0;
      await this.audit.record(
        {
          action: 'company.status.changed',
          resourceType: 'company',
          resourceId: id,
          before: { status: company.status },
          after: { status: dto.status },
          metadata: { reason: dto.reason, closedOffers },
        },
        ctx,
        tx,
      );
      return company;
    });
    if (outcome) {
      await this.notifications
        .notify(outcome.ownerId, {
          type: 'COMPANY_STATUS_CHANGED',
          title: dto.status === 'SUSPENDED' ? 'Entreprise suspendue' : 'Entreprise réactivée',
          body:
            dto.status === 'SUSPENDED'
              ? `${outcome.name} est suspendue et ses offres sont fermées. Motif : ${dto.reason}`
              : `${outcome.name} est de nouveau active. Vous pouvez publier des offres.`,
          deepLink: '/companies',
        })
        .catch((error: unknown) => this.logger.warn({ err: error }, 'Notification d’entreprise non envoyée'));
    }
    return this.company(id);
  }

  async jobs(query: AdminJobsQueryDto) {
    const q = query.q;
    const rows = await this.prisma.jobOffer.findMany({
      where: {
        ...(query.active ? { isActive: query.active === 'true' } : {}),
        ...(q
          ? {
              AND: [
                {
                  OR: [
                    { title: { contains: q, mode: 'insensitive' } },
                    { company: { contains: q, mode: 'insensitive' } },
                    { location: { contains: q, mode: 'insensitive' } },
                  ],
                },
              ],
            }
          : {}),
        ...afterCursor(query.cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: { employer: { select: { id: true, name: true, status: true } }, _count: { select: { applications: true } } },
    });
    const ids = rows.slice(0, query.limit).map((row) => row.id);
    const byStatus = await this.prisma.jobApplication.groupBy({ by: ['jobOfferId', 'status'], where: { jobOfferId: { in: ids } }, _count: true });
    return toPage(rows, query.limit, (job) => ({
      id: job.id,
      title: job.title,
      companyName: job.company,
      employer: job.employer,
      sector: job.sector,
      location: job.location,
      slots: job.slots,
      isActive: job.isActive,
      createdAt: job.createdAt,
      closedAt: job.closedAt,
      applications: {
        total: job._count.applications,
        byStatus: Object.fromEntries(byStatus.filter((row) => row.jobOfferId === job.id).map((row) => [row.status, row._count])),
      },
    }));
  }

  async jobApplications(jobId: string) {
    const job = await this.prisma.jobOffer.findUnique({ where: { id: jobId }, include: { employer: { select: { id: true, name: true } } } });
    if (!job) throw jobNotFound();
    const applications = await this.prisma.jobApplication.findMany({
      where: { jobOfferId: jobId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, phone: true, profile: { select: { firstName: true, lastName: true, city: true, kycStatus: true } } } } },
    });
    return {
      job: {
        id: job.id,
        title: job.title,
        companyName: job.company,
        employer: job.employer,
        description: job.description,
        requirements: job.requirements,
        skills: job.skills,
        slots: job.slots,
        isActive: job.isActive,
        createdAt: job.createdAt,
        closedAt: job.closedAt,
      },
      items: applications.map((application) => ({
        id: application.id,
        status: application.status,
        message: application.message,
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
        candidate: {
          userId: application.user.id,
          name: fullName(application.user.profile),
          phone: application.user.phone,
          city: application.user.profile?.city ?? null,
          identityVerified: application.user.profile?.kycStatus === 'APPROVED',
        },
      })),
    };
  }

  async closeJob(jobId: string, dto: ReasonDto, ctx: RequestContext) {
    const job = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM job_offers WHERE id = ${jobId}::uuid FOR UPDATE`;
      const current = await tx.jobOffer.findUnique({ where: { id: jobId }, include: { employer: { select: { ownerId: true } } } });
      if (!current) throw jobNotFound();
      if (!current.isActive) throw new AppException(HttpStatus.CONFLICT, 'JOB_ALREADY_CLOSED', 'Cette offre est déjà fermée.');
      await tx.jobOffer.update({ where: { id: jobId }, data: { isActive: false, closedAt: new Date() } });
      await this.audit.record(
        { action: 'job_offer.moderated', resourceType: 'job_offer', resourceId: jobId, metadata: { reason: dto.reason } },
        ctx,
        tx,
      );
      return current;
    });
    if (job.employer) {
      await this.notifications
        .notify(job.employer.ownerId, {
          type: 'JOB_OFFER_CLOSED_BY_TEAM',
          title: 'Offre fermée par l’équipe',
          body: `Votre offre « ${job.title} » a été fermée. Motif : ${dto.reason}`,
          deepLink: '/companies',
        })
        .catch((error: unknown) => this.logger.warn({ err: error }, 'Notification d’offre non envoyée'));
    }
    return this.jobApplications(jobId);
  }
}

function companyNotFound() {
  return new AppException(HttpStatus.NOT_FOUND, 'COMPANY_NOT_FOUND', 'Entreprise introuvable.');
}

function jobNotFound() {
  return new AppException(HttpStatus.NOT_FOUND, 'JOB_OFFER_NOT_FOUND', 'Offre introuvable.');
}
