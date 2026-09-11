import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { cleanMultiline, cleanText } from '../../common/dto-helpers';
import { CAMEROON_MOBILE_RE, normalizeCameroonPhone } from '../auth/phone';

export class CreateCompanyDto {
  /** Projet approuvé à l'origine de l'entreprise. */
  @IsUUID()
  projectId: string;

  @Transform(cleanText)
  @IsString()
  @Length(2, 120)
  name: string;

  @Transform(cleanText)
  @IsString()
  @Length(2, 80)
  sector: string;

  @Transform(cleanText)
  @IsString()
  @Length(2, 60)
  city: string;

  @IsOptional()
  @Transform(cleanMultiline)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeCameroonPhone(value))
  @Matches(CAMEROON_MOBILE_RE, { message: 'Numéro mobile camerounais invalide.' })
  phone?: string;
}

export class UpdateCompanyDto {
  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @Length(2, 80)
  sector?: string;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @Length(2, 60)
  city?: string;

  @IsOptional()
  @Transform(cleanMultiline)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeCameroonPhone(value))
  @Matches(CAMEROON_MOBILE_RE, { message: 'Numéro mobile camerounais invalide.' })
  phone?: string;
}

export class AddCompanyMemberDto {
  @Transform(cleanText)
  @IsString()
  @Length(2, 80)
  fullName: string;

  @Transform(cleanText)
  @IsString()
  @Length(2, 60)
  role: string;
}

export class CreateJobOfferDto {
  @Transform(cleanText)
  @IsString()
  @Length(3, 120)
  title: string;

  @Transform(cleanText)
  @IsString()
  @Length(2, 80)
  sector: string;

  @Transform(cleanText)
  @IsString()
  @Length(2, 120)
  location: string;

  @Transform(cleanMultiline)
  @IsString()
  @Length(20, 3000)
  description: string;

  @IsOptional()
  @Transform(cleanMultiline)
  @IsString()
  @MaxLength(1000)
  requirements?: string;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(80)
  salaryHint?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  slots: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Length(2, 40, { each: true })
  skills?: string[];
}

export const EMPLOYER_APPLICATION_STATUSES = ['SHORTLISTED', 'CONTACTED', 'HIRED', 'REJECTED'] as const;

export class UpdateApplicationStatusDto {
  @IsIn(EMPLOYER_APPLICATION_STATUSES)
  status: (typeof EMPLOYER_APPLICATION_STATUSES)[number];
}
