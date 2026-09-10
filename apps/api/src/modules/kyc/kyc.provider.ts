import { Injectable } from '@nestjs/common';
import type { KycIdDocumentType } from '@prisma/client';

export const KYC_PROVIDER = Symbol('KYC_PROVIDER');

export interface KycIdentityCheck {
  userId: string;
  firstName: string;
  lastName: string;
  birthDate: Date;
  idDocumentType: KycIdDocumentType;
  idDocumentNumber: string;
}

export interface KycProviderResult {
  status: 'VERIFIED' | 'FAILED' | 'MANUAL_REVIEW_REQUIRED';
  reference: string | null;
  /** Signaux transmis au réviseur (ex. DOCUMENT_SUSPECTED_FORGERY). */
  signals: string[];
}

/**
 * Abstraction des services de vérification d'identité (cahier §16).
 * Le cœur métier ne dépend d'aucun prestataire : un fournisseur agréé implémentera cette interface.
 */
export interface KycProvider {
  readonly name: string;
  verifyIdentity(check: KycIdentityCheck): Promise<KycProviderResult>;
  getStatus(reference: string): Promise<KycProviderResult>;
}

/** Aucun prestataire connecté : chaque dossier est vérifié manuellement par l'équipe conformité. */
@Injectable()
export class ManualReviewKycProvider implements KycProvider {
  readonly name = 'manual';

  async verifyIdentity(): Promise<KycProviderResult> {
    return { status: 'MANUAL_REVIEW_REQUIRED', reference: null, signals: [] };
  }

  async getStatus(): Promise<KycProviderResult> {
    return { status: 'MANUAL_REVIEW_REQUIRED', reference: null, signals: [] };
  }
}
