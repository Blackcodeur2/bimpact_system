import type { KycDocument, KycDocumentType, KycIdDocumentType, KycProfile, KycStatus } from '@prisma/client';

/** Le membre peut modifier son dossier tant qu'il n'est pas en cours de vérification ou approuvé. */
export const EDITABLE_KYC_STATUSES: readonly KycStatus[] = ['NOT_STARTED', 'DRAFT', 'REJECTED'];
export const REVIEWABLE_KYC_STATUSES: readonly KycStatus[] = ['SUBMITTED', 'UNDER_REVIEW'];

export const DOCUMENT_ALLOWED_MIME: Record<KycDocumentType, readonly string[]> = {
  ID_FRONT: ['image/jpeg', 'image/png', 'application/pdf'],
  ID_BACK: ['image/jpeg', 'image/png', 'application/pdf'],
  SELFIE: ['image/jpeg', 'image/png'],
  VEHICLE_REGISTRATION: ['image/jpeg', 'image/png', 'application/pdf'],
  DRIVING_LICENSE: ['image/jpeg', 'image/png', 'application/pdf'],
};

/** Pièces obligatoires : recto/verso pour une CNI, une seule face pour un passeport ou un récépissé, plus un selfie. */
export function requiredDocumentTypes(idDocumentType: KycIdDocumentType | null): KycDocumentType[] {
  return idDocumentType === 'PASSPORT' || idDocumentType === 'RECEIPT'
    ? ['ID_FRONT', 'SELFIE']
    : ['ID_FRONT', 'ID_BACK', 'SELFIE'];
}

export type RequirementProfile = Pick<
  KycProfile,
  | 'firstName'
  | 'lastName'
  | 'birthDate'
  | 'idDocumentType'
  | 'idDocumentNumber'
  | 'idDocumentExpiry'
  | 'city'
  | 'district'
  | 'vehiclePlate'
  | 'vehicleOwnership'
>;

export interface KycRequirements {
  phone: true;
  identity: boolean;
  location: boolean;
  vehicle: boolean;
  documents: boolean;
  /** Pourcentage d'avancement (téléphone vérifié + 4 étapes). */
  completion: number;
  /** Codes stables : IDENTITY, LOCATION, VEHICLE, DOCUMENT:ID_FRONT… */
  missing: string[];
}

export function evaluateRequirements(
  profile: RequirementProfile | null,
  activeDocuments: Pick<KycDocument, 'type' | 'status'>[],
): KycRequirements {
  const missing: string[] = [];

  const identity = Boolean(
    profile?.firstName &&
      profile.lastName &&
      profile.birthDate &&
      profile.idDocumentType &&
      profile.idDocumentNumber &&
      profile.idDocumentExpiry,
  );
  if (!identity) missing.push('IDENTITY');

  const location = Boolean(profile?.city && profile.district);
  if (!location) missing.push('LOCATION');

  const vehicle = Boolean(profile?.vehiclePlate && profile.vehicleOwnership);
  if (!vehicle) missing.push('VEHICLE');

  const usable = new Set(activeDocuments.filter((d) => d.status !== 'REJECTED').map((d) => d.type));
  const missingDocuments = requiredDocumentTypes(profile?.idDocumentType ?? null).filter((type) => !usable.has(type));
  missing.push(...missingDocuments.map((type) => `DOCUMENT:${type}`));
  const documents = missingDocuments.length === 0;

  const done = 1 + [identity, location, vehicle, documents].filter(Boolean).length;
  return { phone: true, identity, location, vehicle, documents, completion: Math.round((done / 5) * 100), missing };
}

/** Date calendaire « AAAA-MM-JJ » stricte (refuse 2026-02-30). */
export function parseCalendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? date : null;
}

export function formatCalendarDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function ageAt(birthDate: Date, today = new Date()): number {
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < birthDate.getUTCMonth() ||
    (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function startOfUtcDay(today = new Date()): Date {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
}

/** Comparaison de noms insensible aux accents, à la casse et à la ponctuation. */
export function sameName(a: string, b: string): boolean {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z]/g, '');
  return normalize(a) === normalize(b);
}
