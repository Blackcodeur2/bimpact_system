import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { cleanText } from '../../common/dto-helpers';
import { CursorQueryDto } from '../../common/pagination';
import { CAMEROON_MOBILE_RE, normalizeCameroonPhone } from '../auth/phone';

const ROLE_CODE_RE = /^[A-Z_]{2,30}$/;

export class StaffQueryDto extends CursorQueryDto {
  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED', 'LOCKED', 'CLOSED'])
  status?: 'ACTIVE' | 'SUSPENDED' | 'LOCKED' | 'CLOSED';

  @IsOptional()
  @Matches(ROLE_CODE_RE)
  role?: string;
}

export class CreateStaffDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  @MaxLength(254)
  email: string;

  @Transform(({ value }) => normalizeCameroonPhone(value))
  @Matches(CAMEROON_MOBILE_RE, { message: 'Numéro mobile camerounais invalide (ex. 6 12 34 56 78).' })
  phone: string;

  @Transform(cleanText)
  @IsString()
  @Length(2, 60)
  firstName: string;

  @Transform(cleanText)
  @IsString()
  @Length(2, 60)
  lastName: string;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @Length(2, 60)
  city?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Attribuez au moins un rôle.' })
  @ArrayMaxSize(8)
  @Matches(ROLE_CODE_RE, { each: true })
  roles: string[];
}

export class UpdateStaffDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Attribuez au moins un rôle.' })
  @ArrayMaxSize(8)
  @Matches(ROLE_CODE_RE, { each: true })
  roles?: string[];

  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'SUSPENDED';

  /** Obligatoire pour un changement de statut ; conservé dans l'audit. */
  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @Length(5, 300)
  reason?: string;
}

export class RevokeStaffSessionsDto {
  /** Absent : toutes les sessions de l'agent sont fermées. */
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
