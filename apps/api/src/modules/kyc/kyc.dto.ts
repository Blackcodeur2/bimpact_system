import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CursorQueryDto } from '../../common/pagination';

const cleanText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
const compactUpper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value;
const spacedUpper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toUpperCase() : value;

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const KYC_DOCUMENT_TYPES = ['ID_FRONT', 'ID_BACK', 'SELFIE', 'VEHICLE_REGISTRATION', 'DRIVING_LICENSE'] as const;

/** Mise à jour partielle du brouillon : chaque étape du parcours mobile envoie ses champs. */
export class UpdateKycDto {
  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @Length(2, 60)
  firstName?: string;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @Length(2, 60)
  lastName?: string;

  @IsOptional()
  @Matches(CALENDAR_DATE, { message: 'Date de naissance au format AAAA-MM-JJ.' })
  birthDate?: string;

  @IsOptional()
  @IsIn(['CNI', 'PASSPORT', 'RECEIPT'])
  idDocumentType?: 'CNI' | 'PASSPORT' | 'RECEIPT';

  @IsOptional()
  @Transform(compactUpper)
  @Matches(/^[A-Z0-9-]{5,30}$/, { message: 'Numéro de pièce invalide (lettres, chiffres et tirets).' })
  idDocumentNumber?: string;

  @IsOptional()
  @Matches(CALENDAR_DATE, { message: 'Date d’expiration au format AAAA-MM-JJ.' })
  idDocumentExpiry?: string;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @Length(2, 60)
  city?: string;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @Length(2, 60)
  district?: string;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(160)
  addressHint?: string;

  @IsOptional()
  @Transform(spacedUpper)
  @Matches(/^[A-Z0-9 -]{4,15}$/, { message: 'Immatriculation invalide.' })
  vehiclePlate?: string;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @Length(2, 60)
  vehicleModel?: string;

  @IsOptional()
  @IsIn(['OWNER', 'RENTED', 'THIRD_PARTY'])
  vehicleOwnership?: 'OWNER' | 'RENTED' | 'THIRD_PARTY';
}

export class UploadKycDocumentDto {
  @IsIn(KYC_DOCUMENT_TYPES)
  type: (typeof KYC_DOCUMENT_TYPES)[number];
}

export class KycQueueQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsIn(['SUBMITTED', 'UNDER_REVIEW'])
  status?: 'SUBMITTED' | 'UNDER_REVIEW';
}

export class DocumentDecisionDto {
  @IsUUID()
  documentId: string;

  @IsIn(['ACCEPTED', 'REJECTED'])
  status: 'ACCEPTED' | 'REJECTED';

  @ValidateIf((o: DocumentDecisionDto) => o.status === 'REJECTED')
  @Transform(cleanText)
  @IsString()
  @Length(3, 300)
  reason?: string;
}

export class KycDecisionDto {
  @IsIn(['APPROVED', 'REJECTED', 'MORE_INFO_REQUESTED'])
  decision: 'APPROVED' | 'REJECTED' | 'MORE_INFO_REQUESTED';

  /** Motif montré au membre, obligatoire pour un refus ou une demande de complément. */
  @ValidateIf((o: KycDecisionDto) => o.decision !== 'APPROVED')
  @Transform(cleanText)
  @IsString()
  @Length(5, 500)
  reason?: string;

  /** Notes internes, jamais montrées au membre. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => DocumentDecisionDto)
  documents?: DocumentDecisionDto[];
}
