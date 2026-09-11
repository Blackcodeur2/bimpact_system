import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { JobApplication, JobApplicationStatus, JobOffer, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app-exception';
import { afterCursor, toPage } from '../../common/pagination';
import type { RequestContext } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { ApplyJobDto, JobsQueryDto } from './recruitment.dto';

/** Le candidat peut retirer sa candidature tant que l'employeur n'a pas conclu. */
const WITHDRAWABLE: JobApplicationStatus[] = ['PENDING', 'SHORTLISTED', 'CONTACTED'];

type OfferWithContext = JobOffer & {
  employer: { ownerId: string } | null;
  applications: Pick<JobApplication, 'id' | 'status' | 'createdAt'>[];
};

/** Offres d'emploi et candidatures des membres (cahier §7.20). */
@Injectable()
export class RecruitmentService {
  private readonly logger = new Logger(RecruitmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(userId: string, query: JobsQueryDto) {
    const filters: Prisma.JobOfferWhereInput[] = [{ isActive: true }];
    if (query.q) {
      filters.push({
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { company: { contains: query.q, mode: 'insensitive' } },
          { description: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    }
    if (query.sector) filters.push({ sector: { contains: query.sector, mode: 'insensitive' } });
    if (query.city) filters.push({ location: { contains: query.city, mode: 'insensitive' } });

    const rows = await this.prisma.jobOffer.findMany({
      where: { AND: [...filters, afterCursor(query.cursor)] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: this.contextInclude(userId),
    });
    return toPage(rows, query.limit, (offer) => offerView(offer, userId));
  }

  async get(id: string, userId: string) {
    const offer = await this.prisma.jobOffer.findUnique({ where: { id }, include: this.contextInclude(userId) });
    if (!offer) throw offerNotFound();
    return offerView(offer, userId);
  }

  async apply(id: string, userId: string, dto: ApplyJobDto, ctx: RequestContext) {
    const offer = await this.prisma.jobOffer.findUnique({ where: { id }, include: { employer: { select: { ownerId: true, name: true } } } });
    if (!offer) throw offerNotFound();
    if (!offer.isActive) throw new AppException(HttpStatus.CONFLICT, 'JOB_OFFER_CLOSED', 'Cette offre n’est plus ouverte.');
    if (offer.employer?.ownerId === userId) {
      throw new AppException(HttpStatus.CONFLICT, 'JOB_OWN_COMPANY', 'Vous ne pouvez pas postuler à une offre de votre entreprise.');
    }

    const application = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.jobApplication.findUnique({ where: { userId_jobOfferId: { userId, jobOfferId: id } } });
      if (existing && existing.status !== 'WITHDRAWN') {
        throw new AppException(HttpStatus.CONFLICT, 'ALREADY_APPLIED', 'Vous avez déjà postulé à cette offre.', { status: existing.status });
      }
      const saved = existing
        ? await tx.jobApplication.update({ where: { id: existing.id }, data: { status: 'PENDING', message: dto.message ?? null } })
        : await tx.jobApplication.create({ data: { userId, jobOfferId: id, message: dto.message ?? null } });
      await this.audit.record(
        { action: existing ? 'job_application.resubmitted' : 'job_application.created', resourceType: 'job_application', resourceId: saved.id, after: { jobOfferId: id } },
        ctx,
        tx,
      );
      return saved;
    });

    if (offer.employer) {
      await this.notifications
        .notify(offer.employer.ownerId, {
          type: 'RECRUITMENT_NEW_APPLICATION',
          title: 'Nouvelle candidature',
          body: `Une nouvelle candidature a été reçue pour « ${offer.title} ».`,
          deepLink: `/companies/${offer.companyId}`,
        })
        .catch((error: unknown) => this.logger.warn({ err: error }, 'Notification employeur non envoyée'));
    }
    return { id: application.id, status: application.status, createdAt: application.createdAt, offer: await this.get(id, userId) };
  }

  async myApplications(userId: string) {
    const applications = await this.prisma.jobApplication.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: { jobOffer: { select: { id: true, title: true, company: true, location: true, isActive: true } } },
    });
    return {
      items: applications.map((application) => ({
        id: application.id,
        status: application.status,
        message: application.message,
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
        canWithdraw: WITHDRAWABLE.includes(application.status),
        offer: application.jobOffer,
      })),
    };
  }

  async withdraw(applicationId: string, userId: string, ctx: RequestContext) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM job_applications WHERE id = ${applicationId}::uuid FOR UPDATE`;
      const application = await tx.jobApplication.findFirst({ where: { id: applicationId, userId } });
      if (!application) throw new AppException(HttpStatus.NOT_FOUND, 'APPLICATION_NOT_FOUND', 'Candidature introuvable.');
      if (!WITHDRAWABLE.includes(application.status)) {
        throw new AppException(HttpStatus.CONFLICT, 'APPLICATION_NOT_WITHDRAWABLE', 'Cette candidature ne peut plus être retirée.', {
          status: application.status,
        });
      }
      await tx.jobApplication.update({ where: { id: applicationId }, data: { status: 'WITHDRAWN' } });
      await this.audit.record(
        { action: 'job_application.withdrawn', resourceType: 'job_application', resourceId: applicationId, before: { status: application.status } },
        ctx,
        tx,
      );
    });
    return this.myApplications(userId);
  }

  private contextInclude(userId: string) {
    return {
      employer: { select: { ownerId: true } },
      applications: { where: { userId }, select: { id: true, status: true, createdAt: true } },
    } satisfies Prisma.JobOfferInclude;
  }
}

function offerView(offer: OfferWithContext, userId: string) {
  const application = offer.applications[0];
  return {
    id: offer.id,
    title: offer.title,
    company: offer.company,
    companyId: offer.companyId,
    sector: offer.sector,
    location: offer.location,
    salaryHint: offer.salaryHint,
    requirements: offer.requirements,
    skills: offer.skills,
    slots: offer.slots,
    description: offer.description,
    isActive: offer.isActive,
    createdAt: offer.createdAt,
    isOwnCompany: offer.employer?.ownerId === userId,
    application: application ? { id: application.id, status: application.status, createdAt: application.createdAt } : null,
  };
}

function offerNotFound() {
  return new AppException(HttpStatus.NOT_FOUND, 'JOB_OFFER_NOT_FOUND', 'Offre introuvable.');
}
