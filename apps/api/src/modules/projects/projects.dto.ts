import { ProjectDecision, ProjectStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  cleanMultiline,
  cleanText,
  toAmountString,
  XAF_AMOUNT_MESSAGE,
  XAF_AMOUNT_OR_ZERO_RE,
  XAF_AMOUNT_RE,
} from '../../common/dto-helpers';
import { CursorQueryDto } from '../../common/pagination';

export class BudgetLineDto {
  @Transform(cleanText)
  @IsString()
  @Length(2, 80)
  label: string;

  @Transform(toAmountString)
  @Matches(XAF_AMOUNT_RE, { message: XAF_AMOUNT_MESSAGE })
  amount: string;
}

export class TeamMemberDto {
  @Transform(cleanText)
  @IsString()
  @Length(2, 80)
  fullName: string;

  @Transform(cleanText)
  @IsString()
  @Length(2, 60)
  role: string;
}

export class ForecastsDto {
  @IsOptional()
  @Transform(toAmountString)
  @Matches(XAF_AMOUNT_OR_ZERO_RE, { message: XAF_AMOUNT_MESSAGE })
  monthlyRevenue?: string;

  @IsOptional()
  @Transform(toAmountString)
  @Matches(XAF_AMOUNT_OR_ZERO_RE, { message: XAF_AMOUNT_MESSAGE })
  monthlyCosts?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  jobsCreated?: number;
}

/**
 * Champs de la fiche projet, tous facultatifs : le brouillon s'enregistre au fil de la saisie.
 * `null` efface une valeur ; la complétude n'est exigée qu'à la soumission.
 */
export class ProjectFieldsDto {
  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(80)
  sector?: string | null;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(60)
  city?: string | null;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(120)
  locationDetail?: string | null;

  @IsOptional()
  @Transform(cleanMultiline)
  @IsString()
  @MaxLength(2000)
  problem?: string | null;

  @IsOptional()
  @Transform(cleanMultiline)
  @IsString()
  @MaxLength(2000)
  solution?: string | null;

  @IsOptional()
  @Transform(cleanMultiline)
  @IsString()
  @MaxLength(2000)
  market?: string | null;

  @IsOptional()
  @Transform(cleanMultiline)
  @IsString()
  @MaxLength(3000)
  description?: string | null;

  @IsOptional()
  @Transform(toAmountString)
  @Matches(XAF_AMOUNT_RE, { message: XAF_AMOUNT_MESSAGE })
  estimatedBudget?: string | null;

  @IsOptional()
  @Transform(toAmountString)
  @Matches(XAF_AMOUNT_OR_ZERO_RE, { message: XAF_AMOUNT_MESSAGE })
  personalContribution?: string | null;

  @IsOptional()
  @Transform(toAmountString)
  @Matches(XAF_AMOUNT_RE, { message: XAF_AMOUNT_MESSAGE })
  grantRequested?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => BudgetLineDto)
  budgetLines?: BudgetLineDto[] | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TeamMemberDto)
  teamMembers?: TeamMemberDto[] | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ForecastsDto)
  forecasts?: ForecastsDto | null;
}

export class CreateProjectDto extends ProjectFieldsDto {
  @Transform(cleanText)
  @IsString()
  @Length(3, 120)
  title: string;
}

export class UpdateProjectDto extends ProjectFieldsDto {
  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @Length(3, 120)
  title?: string;
}

export const PROJECT_DOCUMENT_TYPES = ['BUSINESS_PLAN', 'QUOTE', 'PHOTO', 'OTHER'] as const;

export class UploadProjectDocumentDto {
  @IsIn(PROJECT_DOCUMENT_TYPES)
  type: (typeof PROJECT_DOCUMENT_TYPES)[number];
}

export class AdminProjectsQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}

export class ProjectDecisionDto {
  @IsEnum(ProjectDecision)
  decision: ProjectDecision;

  /** Motif communiqué au porteur. */
  @Transform(cleanMultiline)
  @IsString()
  @Length(5, 1000)
  reason: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  score?: number;
}
