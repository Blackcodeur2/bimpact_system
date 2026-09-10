import type { KycDocument, KycDocumentType, KycProfile, KycStatus, Profile } from '@prisma/client';
import type { SignedUrlService } from '../storage/signed-url.service';
import {
  EDITABLE_KYC_STATUSES,
  evaluateRequirements,
  formatCalendarDate,
  KycRequirements,
  requiredDocumentTypes,
} from './kyc.rules';

export interface KycDocumentView {
  id: string;
  type: KycDocumentType;
  status: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  rejectionReason: string | null;
  /** URL temporaire signée (chemin relatif à l'origine de l'API). */
  url: string;
  urlExpiresAt: Date;
}

export interface KycDossierView {
  status: KycStatus;
  editable: boolean;
  canSubmit: boolean;
  identity: {
    firstName: string | null;
    lastName: string | null;
    birthDate: string | null;
    idDocumentType: string | null;
    idDocumentNumber: string | null;
    idDocumentExpiry: string | null;
  };
  location: { city: string | null; district: string | null; addressHint: string | null };
  vehicle: { plate: string | null; model: string | null; ownership: string | null };
  documents: KycDocumentView[];
  requiredDocuments: KycDocumentType[];
  requirements: KycRequirements;
  submission: {
    count: number;
    submittedAt: Date | null;
    reviewedAt: Date | null;
    /** Motif du dernier refus ou de la dernière demande de complément. */
    decisionReason: string | null;
  };
}

export function toDocumentView(document: KycDocument, urls: SignedUrlService): KycDocumentView {
  const signed = urls.sign({ storageKey: document.storageKey, mimeType: document.mimeType });
  return {
    id: document.id,
    type: document.type,
    status: document.status,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    uploadedAt: document.createdAt,
    rejectionReason: document.rejectionReason,
    url: signed.url,
    urlExpiresAt: signed.expiresAt,
  };
}

/**
 * Vue membre du dossier. Sans dossier enregistré, les champs connus du compte (nom, ville)
 * sont proposés en pré-remplissage mais rien n'est considéré comme fourni.
 */
export function toDossierView(
  profile: KycProfile | null,
  activeDocuments: KycDocument[],
  account: Pick<Profile, 'firstName' | 'lastName' | 'city' | 'kycStatus'> | null,
  urls: SignedUrlService,
): KycDossierView {
  const status: KycStatus = profile?.status ?? account?.kycStatus ?? 'NOT_STARTED';
  const requirements = evaluateRequirements(profile, activeDocuments);
  const editable = EDITABLE_KYC_STATUSES.includes(status);

  return {
    status,
    editable,
    canSubmit: editable && profile !== null && requirements.missing.length === 0,
    identity: {
      firstName: profile?.firstName ?? account?.firstName ?? null,
      lastName: profile?.lastName ?? account?.lastName ?? null,
      birthDate: formatCalendarDate(profile?.birthDate ?? null),
      idDocumentType: profile?.idDocumentType ?? null,
      idDocumentNumber: profile?.idDocumentNumber ?? null,
      idDocumentExpiry: formatCalendarDate(profile?.idDocumentExpiry ?? null),
    },
    location: {
      city: profile?.city ?? account?.city ?? null,
      district: profile?.district ?? null,
      addressHint: profile?.addressHint ?? null,
    },
    vehicle: {
      plate: profile?.vehiclePlate ?? null,
      model: profile?.vehicleModel ?? null,
      ownership: profile?.vehicleOwnership ?? null,
    },
    documents: activeDocuments.map((document) => toDocumentView(document, urls)),
    requiredDocuments: requiredDocumentTypes(profile?.idDocumentType ?? null),
    requirements,
    submission: {
      count: profile?.submissionCount ?? 0,
      submittedAt: profile?.submittedAt ?? null,
      reviewedAt: profile?.reviewedAt ?? null,
      decisionReason: profile?.lastDecisionReason ?? null,
    },
  };
}
