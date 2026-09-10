import { HttpStatus, Injectable } from '@nestjs/common';
import { JobApplicationStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app-exception';
import { PrismaService } from '../../database/prisma.service';
import { ApplyJobDto } from './recruitment.dto';

@Injectable()
export class RecruitmentService {
  constructor(private readonly prisma: PrismaService) {}

  async listOffers(userId: string) {
    const offers = await this.prisma.jobOffer.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        applications: {
          where: { userId },
          select: { id: true, status: true, createdAt: true },
        },
      },
    });

    return offers.map((o) => ({
      id: o.id,
      title: o.title,
      company: o.company,
      sector: o.sector,
      location: o.location,
      salaryHint: o.salaryHint,
      requirements: o.requirements,
      description: o.description,
      createdAt: o.createdAt,
      hasApplied: o.applications.length > 0,
      applicationStatus: o.applications[0]?.status ?? null,
    }));
  }

  async getOffer(id: string, userId: string) {
    const offer = await this.prisma.jobOffer.findUnique({
      where: { id },
      include: {
        applications: {
          where: { userId },
          select: { id: true, status: true, createdAt: true },
        },
      },
    });
    if (!offer) {
      throw new AppException(HttpStatus.NOT_FOUND, 'JOB_OFFER_NOT_FOUND', 'Offre d’emploi introuvable.');
    }

    return {
      id: offer.id,
      title: offer.title,
      company: offer.company,
      sector: offer.sector,
      location: offer.location,
      salaryHint: offer.salaryHint,
      requirements: offer.requirements,
      description: offer.description,
      createdAt: offer.createdAt,
      hasApplied: offer.applications.length > 0,
      applicationStatus: offer.applications[0]?.status ?? null,
    };
  }

  async apply(offerId: string, dto: ApplyJobDto, userId: string) {
    const offer = await this.prisma.jobOffer.findUnique({ where: { id: offerId } });
    if (!offer) {
      throw new AppException(HttpStatus.NOT_FOUND, 'JOB_OFFER_NOT_FOUND', 'Offre introuvable.');
    }

    const existing = await this.prisma.jobApplication.findUnique({
      where: { userId_jobOfferId: { userId, jobOfferId: offerId } },
    });
    if (existing) {
      throw new AppException(HttpStatus.CONFLICT, 'ALREADY_APPLIED', 'Vous avez déjà postulé à cette opportunité.');
    }

    const application = await this.prisma.jobApplication.create({
      data: {
        userId,
        jobOfferId: offerId,
        message: dto.message,
        status: JobApplicationStatus.PENDING,
      },
    });

    return application;
  }

  async listMyApplications(userId: string) {
    return this.prisma.jobApplication.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        jobOffer: true,
      },
    });
  }
}
