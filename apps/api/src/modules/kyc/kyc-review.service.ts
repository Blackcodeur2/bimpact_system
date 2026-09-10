import { HttpStatus, Injectable } from '@nestjs/common';
import type { KycStatus, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app-exception';
import { decodeCursor, encodeCursor } from '../../common/pagination';
import type { RequestContext } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SignedUrlService } from '../storage/signed-url.service';
import type { KycDecisionDto, KycQueueQueryDto } from './kyc.dto';
import { syncAccountKycStatus } from './kyc.service';
import { evaluateRequirements, formatCalendarDate, REVIEWABLE_KYC_STATUSES } from './kyc.rules';
import { toDocumentView } from './kyc.views';

const NEXT_STATUS: Record<KycDecisionDto['decision'], KycStatus> = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  MORE_INFO_REQUESTED: 'DRAFT',
};

/** Traitement des dossiers par l'équipe conformité (cahier §8.3). Toute décision est tracée. */
@Injectable()
export class KycReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly urls: SignedUrlService,
  ) {}

  /** File d'attente FIFO : les dossiers les plus anciens d'abord. */
  async queue(query: KycQueueQueryDto) {
    const statuses: KycStatus[] = query.status ? [query.status] : [...REVIEWABLE_KYC_STATUSES];
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const where: Prisma.KycProfileWhereInput = {
      status: { in: statuses },
      ...(after
        ? { OR: [{ submittedAt: { gt: after.createdAt } }, { submittedAt: after.createdAt, id: { gt: after.id } }] }
        : {}),
    };

    const rows = await this.prisma.kycProfile.findMany({
      where,
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
      include: {
        user: { select: { phone: true } },
        _count: { select: { documents: { where: { replacedAt: null } } } },
      },
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];

    return {
      items: page.map((row) => ({
        id: row.id,
        userId: row.userId,
        status: row.status,
        applicant: { firstName: row.firstName, lastName: row.lastName, phone: row.user.phone },
        city: row.city,
        submittedAt: row.submittedAt,
        submissionCount: row.submissionCount,
        riskFlags: row.riskFlags,
        reviewerId: row.reviewerId,
        reviewStartedAt: row.reviewStartedAt,
        documentCount: row._count.documents,
      })),
      nextCursor: hasMore && last?.submittedAt ? encodeCursor({ createdAt: last.submittedAt, id: last.id }) : null,
    };
  }

  async dossier(id: string, ctx: RequestContext) {
    const profile = await this.prisma.kycProfile.findUnique({
      where: { id },
      include: {
        documents: { orderBy: { createdAt: 'desc' } },
        reviews: { orderBy: { createdAt: 'desc' } },
        user: { select: { id: true, phone: true, status: true, createdAt: true, profile: true } },
      },
    });
    if (!profile) throw notFound();

    // Consulter des pièces d'identité est une action sensible : elle est journalisée.
    await this.audit.record({ action: 'kyc.dossier.viewed', resourceType: 'kyc_profile', resourceId: id }, ctx);

    const active = profile.documents.filter((d) => d.replacedAt === null);
    return {
      id: profile.id,
      status: profile.status,
      riskFlags: profile.riskFlags,
      provider: { name: profile.providerName, reference: profile.providerReference },
      reviewerId: profile.reviewerId,
      reviewStartedAt: profile.reviewStartedAt,
      account: {
        userId: profile.user.id,
        phone: profile.user.phone,
        status: profile.user.status,
        memberSince: profile.user.createdAt,
        firstName: profile.user.profile?.firstName ?? null,
        lastName: profile.user.profile?.lastName ?? null,
        city: profile.user.profile?.city ?? null,
      },
      identity: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        birthDate: formatCalendarDate(profile.birthDate),
        idDocumentType: profile.idDocumentType,
        idDocumentNumber: profile.idDocumentNumber,
        idDocumentExpiry: formatCalendarDate(profile.idDocumentExpiry),
      },
      location: { city: profile.city, district: profile.district, addressHint: profile.addressHint },
      vehicle: { plate: profile.vehiclePlate, model: profile.vehicleModel, ownership: profile.vehicleOwnership },
      requirements: evaluateRequirements(profile, active),
      submission: {
        count: profile.submissionCount,
        submittedAt: profile.submittedAt,
        reviewedAt: profile.reviewedAt,
        decisionReason: profile.lastDecisionReason,
      },
      documents: profile.documents.map((document) => ({
        ...toDocumentView(document, this.urls),
        active: document.replacedAt === null,
        scanStatus: document.scanStatus,
        sha256: document.sha256,
      })),
      reviews: profile.reviews,
    };
  }

  /** Prise en charge : évite que deux réviseurs traitent le même dossier. */
  async claim(id: string, ctx: RequestContext) {
    const reviewerId = requireActor(ctx);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM kyc_profiles WHERE id = ${id}::uuid FOR UPDATE`;
      const profile = await tx.kycProfile.findUnique({ where: { id } });
      if (!profile) throw notFound();
      assertReviewable(profile.status, profile.userId, profile.reviewerId, reviewerId);

      const updated = await tx.kycProfile.update({
        where: { id },
        data: {
          status: 'UNDER_REVIEW',
          reviewerId,
          reviewStartedAt: profile.reviewerId === reviewerId && profile.reviewStartedAt ? profile.reviewStartedAt : new Date(),
        },
      });
      await syncAccountKycStatus(tx, profile.userId, 'UNDER_REVIEW');
      await this.audit.record(
        { action: 'kyc.review.claimed', resourceType: 'kyc_profile', resourceId: id, before: { status: profile.status }, after: { status: 'UNDER_REVIEW' } },
        ctx,
        tx,
      );
      return { id, status: updated.status, reviewerId, reviewStartedAt: updated.reviewStartedAt };
    });
  }

  async decide(id: string, dto: KycDecisionDto, ctx: RequestContext) {
    const reviewerId = requireActor(ctx);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM kyc_profiles WHERE id = ${id}::uuid FOR UPDATE`;
      const profile = await tx.kycProfile.findUnique({
        where: { id },
        include: { documents: { where: { replacedAt: null } } },
      });
      if (!profile) throw notFound();
      assertReviewable(profile.status, profile.userId, profile.reviewerId, reviewerId);

      const activeIds = new Set(profile.documents.map((d) => d.id));
      for (const decision of dto.documents ?? []) {
        if (!activeIds.has(decision.documentId)) {
          throw new AppException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'KYC_DOCUMENT_NOT_IN_DOSSIER',
            'Ce document ne fait pas partie de la version actuelle du dossier.',
            { documentId: decision.documentId },
          );
        }
      }

      if (dto.decision === 'APPROVED') {
        if (dto.documents?.some((d) => d.status === 'REJECTED')) {
          throw new AppException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'KYC_APPROVAL_WITH_REJECTED_DOCUMENT',
            'Un dossier ne peut pas être approuvé avec un document refusé.',
          );
        }
        const requirements = evaluateRequirements(profile, profile.documents);
        if (requirements.missing.length > 0) {
          throw new AppException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'KYC_INCOMPLETE',
            'Le dossier est incomplet et ne peut pas être approuvé.',
            { missing: requirements.missing },
          );
        }
      }

      for (const decision of dto.documents ?? []) {
        await tx.kycDocument.update({
          where: { id: decision.documentId },
          data: { status: decision.status, rejectionReason: decision.status === 'REJECTED' ? decision.reason : null },
        });
      }
      if (dto.decision === 'APPROVED') {
        await tx.kycDocument.updateMany({
          where: { kycProfileId: id, replacedAt: null, status: 'PENDING' },
          data: { status: 'ACCEPTED' },
        });
      }

      const status = NEXT_STATUS[dto.decision];
      const reviewedAt = new Date();
      await tx.kycReview.create({
        data: {
          kycProfileId: id,
          reviewerId,
          decision: dto.decision,
          reason: dto.reason ?? null,
          internalNotes: dto.internalNotes ?? null,
          submissionNumber: profile.submissionCount,
          documentDecisions: dto.documents ? (dto.documents as unknown as Prisma.InputJsonValue) : undefined,
        },
      });
      await tx.kycProfile.update({
        where: { id },
        data: {
          status,
          reviewerId,
          reviewedAt,
          lastDecisionReason: dto.decision === 'APPROVED' ? null : (dto.reason ?? null),
        },
      });
      await syncAccountKycStatus(tx, profile.userId, status);
      await this.audit.record(
        {
          action: 'kyc.review.decided',
          resourceType: 'kyc_profile',
          resourceId: id,
          before: { status: profile.status },
          after: { status, decision: dto.decision, reason: dto.reason ?? null },
          metadata: {
            submissionNumber: profile.submissionCount,
            documents: dto.documents?.map((d) => ({ documentId: d.documentId, status: d.status })),
          },
        },
        ctx,
        tx,
      );
      return { id, status, decision: dto.decision, reviewedAt };
    });
  }
}

function requireActor(ctx: RequestContext): string {
  const actor = ctx.auth?.userId;
  if (!actor) throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Authentification requise.');
  return actor;
}

function assertReviewable(status: KycStatus, applicantId: string, currentReviewer: string | null, reviewerId: string) {
  if (applicantId === reviewerId) {
    throw new AppException(HttpStatus.FORBIDDEN, 'KYC_SELF_REVIEW_FORBIDDEN', 'Vous ne pouvez pas vérifier votre propre dossier.');
  }
  if (!REVIEWABLE_KYC_STATUSES.includes(status)) {
    throw new AppException(HttpStatus.CONFLICT, 'KYC_NOT_REVIEWABLE', 'Ce dossier n’est pas en attente de vérification.', { status });
  }
  if (status === 'UNDER_REVIEW' && currentReviewer && currentReviewer !== reviewerId) {
    throw new AppException(HttpStatus.CONFLICT, 'KYC_CLAIMED_BY_OTHER', 'Ce dossier est déjà pris en charge par un autre réviseur.');
  }
}

function notFound() {
  return new AppException(HttpStatus.NOT_FOUND, 'KYC_NOT_FOUND', 'Dossier introuvable.');
}
