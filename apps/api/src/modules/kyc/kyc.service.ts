import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { KycDocument, KycDocumentType, KycProfile, KycStatus, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app-exception';
import type { RequestContext } from '../../common/request-context';
import { AppConfig } from '../../config/app-config';
import { PrismaService, Tx } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DOCUMENT_STORAGE, DocumentStorage } from '../storage/document-storage';
import { detectDocumentMime, MALWARE_SCANNER, MalwareScanner, UploadedFileLike } from '../storage/file-types';
import { SignedUrlService } from '../storage/signed-url.service';
import type { UpdateKycDto } from './kyc.dto';
import { KYC_PROVIDER, KycProvider } from './kyc.provider';
import {
  ageAt,
  DOCUMENT_ALLOWED_MIME,
  EDITABLE_KYC_STATUSES,
  evaluateRequirements,
  parseCalendarDate,
  sameName,
  startOfUtcDay,
} from './kyc.rules';
import { KycDocumentView, KycDossierView, toDocumentView, toDossierView } from './kyc.views';

export function assertEditable(status: KycStatus): void {
  if (!EDITABLE_KYC_STATUSES.includes(status)) {
    throw new AppException(
      HttpStatus.CONFLICT,
      'KYC_LOCKED',
      status === 'APPROVED'
        ? 'Votre identité est déjà vérifiée. Contactez le support pour toute modification.'
        : 'Votre dossier est en cours de vérification et ne peut pas être modifié.',
      { status },
    );
  }
}

/** Le statut KYC du profil de compte est un miroir du dossier, mis à jour dans la même transaction. */
export async function syncAccountKycStatus(tx: Tx, userId: string, status: KycStatus): Promise<void> {
  await tx.profile.update({ where: { userId }, data: { kycStatus: status } });
}

/** Parcours membre de vérification d'identité (cahier §7.5). */
@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
    private readonly urls: SignedUrlService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner,
    @Inject(KYC_PROVIDER) private readonly provider: KycProvider,
  ) {}

  async getMine(userId: string): Promise<KycDossierView> {
    const [profile, account] = await Promise.all([
      this.prisma.kycProfile.findUnique({
        where: { userId },
        include: { documents: { where: { replacedAt: null }, orderBy: { createdAt: 'asc' } } },
      }),
      this.prisma.profile.findUnique({
        where: { userId },
        select: { firstName: true, lastName: true, city: true, kycStatus: true },
      }),
    ]);
    return toDossierView(profile, profile?.documents ?? [], account, this.urls);
  }

  async getStatus(userId: string) {
    const [profile, account] = await Promise.all([
      this.prisma.kycProfile.findUnique({ where: { userId } }),
      this.prisma.profile.findUnique({ where: { userId }, select: { kycStatus: true } }),
    ]);
    return {
      status: profile?.status ?? account?.kycStatus ?? 'NOT_STARTED',
      submittedAt: profile?.submittedAt ?? null,
      reviewedAt: profile?.reviewedAt ?? null,
      decisionReason: profile?.lastDecisionReason ?? null,
    };
  }

  async updateDraft(userId: string, dto: UpdateKycDto, ctx: RequestContext): Promise<KycDossierView> {
    const data = toDraftData(dto);
    await this.prisma.$transaction(async (tx) => {
      const profile = await this.lockOrCreate(tx, userId);
      assertEditable(profile.status);
      await tx.kycProfile.update({ where: { id: profile.id }, data: { ...data, status: 'DRAFT' } });
      await syncAccountKycStatus(tx, userId, 'DRAFT');
      // Pas de valeurs d'identité dans l'audit : seulement les champs modifiés.
      await this.audit.record(
        {
          action: 'kyc.draft.updated',
          resourceType: 'kyc_profile',
          resourceId: profile.id,
          metadata: { fields: Object.keys(data), previousStatus: profile.status },
        },
        ctx,
        tx,
      );
    });
    return this.getMine(userId);
  }

  async uploadDocument(
    userId: string,
    type: KycDocumentType,
    file: UploadedFileLike | undefined,
    ctx: RequestContext,
  ): Promise<KycDocumentView> {
    if (!file?.buffer?.length) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'KYC_DOCUMENT_MISSING', 'Aucun fichier reçu.');
    }
    const { maxBytes } = this.config.documents;
    if (file.buffer.length > maxBytes) {
      throw new AppException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        'KYC_DOCUMENT_TOO_LARGE',
        `Fichier trop volumineux (maximum ${Math.floor(maxBytes / 1_000_000)} Mo).`,
        { maxBytes },
      );
    }
    const mimeType = detectDocumentMime(file.buffer);
    if (!mimeType || !DOCUMENT_ALLOWED_MIME[type].includes(mimeType)) {
      throw new AppException(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        'KYC_DOCUMENT_INVALID_TYPE',
        type === 'SELFIE' ? 'La photo doit être au format JPEG ou PNG.' : 'Formats acceptés : JPEG, PNG ou PDF.',
      );
    }

    const current = await this.prisma.kycProfile.findUnique({ where: { userId }, select: { status: true } });
    if (current) assertEditable(current.status);

    const scanStatus = await this.scanner.scan(file.buffer);
    if (scanStatus === 'INFECTED') {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'KYC_DOCUMENT_REJECTED',
        'Ce fichier a été refusé par le contrôle de sécurité.',
      );
    }

    const storageKey = randomUUID();
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    await this.storage.put(storageKey, file.buffer);

    const document = await this.prisma.$transaction(async (tx) => {
      const profile = await this.lockOrCreate(tx, userId);
      assertEditable(profile.status);
      const replaced = await tx.kycDocument.updateMany({
        where: { kycProfileId: profile.id, type, replacedAt: null },
        data: { replacedAt: new Date(), status: 'REPLACED' },
      });
      const created = await tx.kycDocument.create({
        data: {
          kycProfileId: profile.id,
          type,
          storageKey,
          mimeType,
          sizeBytes: file.buffer.length,
          sha256,
          scanStatus,
          uploadedById: userId,
        },
      });
      if (profile.status !== 'DRAFT') {
        await tx.kycProfile.update({ where: { id: profile.id }, data: { status: 'DRAFT' } });
        await syncAccountKycStatus(tx, userId, 'DRAFT');
      }
      await this.audit.record(
        {
          action: 'kyc.document.uploaded',
          resourceType: 'kyc_document',
          resourceId: created.id,
          metadata: { kycProfileId: profile.id, type, mimeType, sizeBytes: created.sizeBytes, sha256, scanStatus, replaced: replaced.count },
        },
        ctx,
        tx,
      );
      return created;
    });

    return toDocumentView(document, this.urls);
  }

  async submit(userId: string, ctx: RequestContext): Promise<KycDossierView> {
    const snapshot = await this.prisma.kycProfile.findUnique({
      where: { userId },
      include: { documents: { where: { replacedAt: null } } },
    });
    if (!snapshot) throw incomplete(evaluateRequirements(null, []).missing);
    assertEditable(snapshot.status);
    this.assertSubmittable(snapshot, snapshot.documents);

    const riskFlags = await this.riskFlags(snapshot, snapshot.documents);
    const check = await this.provider.verifyIdentity({
      userId,
      firstName: snapshot.firstName!,
      lastName: snapshot.lastName!,
      birthDate: snapshot.birthDate!,
      idDocumentType: snapshot.idDocumentType!,
      idDocumentNumber: snapshot.idDocumentNumber!,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM kyc_profiles WHERE user_id = ${userId}::uuid FOR UPDATE`;
      const profile = await tx.kycProfile.findUniqueOrThrow({
        where: { userId },
        include: { documents: { where: { replacedAt: null } } },
      });
      assertEditable(profile.status);
      this.assertSubmittable(profile, profile.documents);

      const flags = [...new Set([...riskFlags, ...check.signals])];
      const updated = await tx.kycProfile.update({
        where: { id: profile.id },
        data: {
          status: 'SUBMITTED',
          submittedAt: new Date(),
          submissionCount: { increment: 1 },
          riskFlags: flags,
          reviewerId: null,
          reviewStartedAt: null,
          lastDecisionReason: null,
          providerName: this.provider.name,
          providerReference: check.reference,
        },
      });
      await syncAccountKycStatus(tx, userId, 'SUBMITTED');
      await this.audit.record(
        {
          action: 'kyc.submitted',
          resourceType: 'kyc_profile',
          resourceId: profile.id,
          metadata: {
            submissionNumber: updated.submissionCount,
            riskFlags: flags,
            provider: { name: this.provider.name, status: check.status },
          },
        },
        ctx,
        tx,
      );
    });

    return this.getMine(userId);
  }

  private assertSubmittable(profile: KycProfile, documents: KycDocument[]): void {
    const requirements = evaluateRequirements(profile, documents);
    if (requirements.missing.length > 0) throw incomplete(requirements.missing);
    if (ageAt(profile.birthDate!) < 18) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'KYC_UNDERAGE', 'Le programme est réservé aux personnes majeures.');
    }
    if (profile.idDocumentExpiry! < startOfUtcDay()) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'KYC_ID_EXPIRED',
        'Votre pièce d’identité est expirée. Utilisez une pièce valide ou un récépissé.',
      );
    }
  }

  /** Signaux d'aide à la décision ; ils ne bloquent jamais seuls un dossier. */
  private async riskFlags(profile: KycProfile, documents: KycDocument[]): Promise<string[]> {
    const flags: string[] = [];
    const duplicates = await this.prisma.kycProfile.count({
      where: { idDocumentNumber: profile.idDocumentNumber, userId: { not: profile.userId } },
    });
    if (duplicates > 0) flags.push('DUPLICATE_ID_NUMBER');

    const account = await this.prisma.profile.findUnique({ where: { userId: profile.userId } });
    if (account && (!sameName(account.firstName, profile.firstName!) || !sameName(account.lastName, profile.lastName!))) {
      flags.push('NAME_DIFFERS_FROM_ACCOUNT');
    }
    if (documents.some((d) => d.scanStatus === 'NOT_SCANNED')) flags.push('DOCUMENTS_NOT_SCANNED');
    return flags;
  }

  private async lockOrCreate(tx: Tx, userId: string): Promise<KycProfile> {
    await tx.kycProfile.upsert({ where: { userId }, create: { userId, status: 'DRAFT' }, update: {} });
    await tx.$queryRaw`SELECT id FROM kyc_profiles WHERE user_id = ${userId}::uuid FOR UPDATE`;
    return tx.kycProfile.findUniqueOrThrow({ where: { userId } });
  }
}

function incomplete(missing: string[]) {
  return new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'KYC_INCOMPLETE', 'Votre dossier est incomplet.', { missing });
}

function toDraftData(dto: UpdateKycDto): Prisma.KycProfileUpdateInput {
  const data: Prisma.KycProfileUpdateInput = {};
  const dateField = (value: string | undefined, field: string): Date | undefined => {
    if (value === undefined) return undefined;
    const parsed = parseCalendarDate(value);
    if (!parsed) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Certaines informations sont invalides.', {
        fields: { [field]: ['Date inexistante.'] },
      });
    }
    return parsed;
  };

  if (dto.firstName !== undefined) data.firstName = dto.firstName;
  if (dto.lastName !== undefined) data.lastName = dto.lastName;
  if (dto.birthDate !== undefined) data.birthDate = dateField(dto.birthDate, 'birthDate');
  if (dto.idDocumentType !== undefined) data.idDocumentType = dto.idDocumentType;
  if (dto.idDocumentNumber !== undefined) data.idDocumentNumber = dto.idDocumentNumber;
  if (dto.idDocumentExpiry !== undefined) data.idDocumentExpiry = dateField(dto.idDocumentExpiry, 'idDocumentExpiry');
  if (dto.city !== undefined) data.city = dto.city;
  if (dto.district !== undefined) data.district = dto.district;
  if (dto.addressHint !== undefined) data.addressHint = dto.addressHint;
  if (dto.vehiclePlate !== undefined) data.vehiclePlate = dto.vehiclePlate;
  if (dto.vehicleModel !== undefined) data.vehicleModel = dto.vehicleModel;
  if (dto.vehicleOwnership !== undefined) data.vehicleOwnership = dto.vehicleOwnership;

  if (data.birthDate instanceof Date && data.birthDate > new Date()) {
    throw new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Certaines informations sont invalides.', {
      fields: { birthDate: ['La date de naissance ne peut pas être dans le futur.'] },
    });
  }
  return data;
}
