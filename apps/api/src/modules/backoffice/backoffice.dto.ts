import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBooleanString,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { cleanMultiline, cleanText } from '../../common/dto-helpers';
import { CursorQueryDto } from '../../common/pagination';
import { PAYMENT_CHANNELS } from '../payments/payment-provider';
import { PAYMENT_STATUSES } from '../payments/payments.dto';

const CALENDAR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ───────────────────────────── Tableau de bord ─────────────────────────────

export class DashboardQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn([7, 30, 90])
  days = 30;
}

// ───────────────────────────── Conducteurs ─────────────────────────────

export const MEMBER_STATUSES = ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'LOCKED', 'CLOSED'] as const;
export const KYC_STATUSES = ['NOT_STARTED', 'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'] as const;

export class MembersQueryDto extends CursorQueryDto {
  /** Nom, prénom ou numéro de téléphone. */
  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsIn(MEMBER_STATUSES)
  status?: (typeof MEMBER_STATUSES)[number];

  @IsOptional()
  @IsIn(KYC_STATUSES)
  kycStatus?: (typeof KYC_STATUSES)[number];

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(60)
  city?: string;
}

export class MemberStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status: 'ACTIVE' | 'SUSPENDED';

  @Transform(cleanText)
  @IsString()
  @Length(5, 300)
  reason: string;
}

export class MemberNoteDto {
  @Transform(cleanMultiline)
  @IsString()
  @Length(3, 2000)
  body: string;
}

// ───────────────────────────── Finance & paiements ─────────────────────────────

export class LedgerQueryDto extends CursorQueryDto {
  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(128)
  reference?: string;

  @IsOptional()
  @Matches(/^[A-Z_]{2,40}$/)
  type?: string;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(128)
  accountCode?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

export class AdminPaymentsQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  status?: (typeof PAYMENT_STATUSES)[number];

  @IsOptional()
  @IsIn(PAYMENT_CHANNELS)
  channel?: string;

  /** Numéro payeur, numéro du compte ou référence opérateur. */
  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

// ───────────────────────────── Formation ─────────────────────────────

export const COURSE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export const LESSON_CONTENT_TYPES = ['TEXT', 'AUDIO', 'VIDEO'] as const;

export class CreateModuleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  month: number;

  @Transform(cleanText)
  @IsString()
  @Length(3, 120)
  title: string;

  @Transform(cleanMultiline)
  @IsString()
  @Length(10, 2000)
  description: string;

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(2000)
  durationMinutes: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  order: number;

  @IsOptional()
  @Matches(/^[a-z0-9_]{2,40}$/)
  iconName?: string;
}

export class UpdateModuleDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  month?: number;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @Length(3, 120)
  title?: string;

  @IsOptional()
  @Transform(cleanMultiline)
  @IsString()
  @Length(10, 2000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(2000)
  durationMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  order?: number;

  @IsOptional()
  @Matches(/^[a-z0-9_]{2,40}$/)
  iconName?: string;

  @IsOptional()
  @IsIn(COURSE_STATUSES)
  status?: (typeof COURSE_STATUSES)[number];
}

export class LessonDto {
  @Transform(cleanText)
  @IsString()
  @Length(3, 160)
  title: string;

  @IsOptional()
  @Transform(cleanMultiline)
  @IsString()
  @MaxLength(1000)
  description?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  durationMinutes: number;

  @IsIn(LESSON_CONTENT_TYPES)
  contentType: (typeof LESSON_CONTENT_TYPES)[number];

  /** Média hébergé (HTTPS uniquement). */
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'Adresse HTTPS attendue.' })
  @MaxLength(500)
  audioUrl?: string;

  @Transform(cleanMultiline)
  @IsString()
  @Length(20, 50_000)
  markdownContent: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  keyPoints?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  order?: number;
}

export class UpdateLessonDto {
  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @Length(3, 160)
  title?: string;

  @IsOptional()
  @Transform(cleanMultiline)
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  durationMinutes?: number;

  @IsOptional()
  @IsIn(LESSON_CONTENT_TYPES)
  contentType?: (typeof LESSON_CONTENT_TYPES)[number];

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'Adresse HTTPS attendue.' })
  @MaxLength(500)
  audioUrl?: string;

  @IsOptional()
  @Transform(cleanMultiline)
  @IsString()
  @Length(20, 50_000)
  markdownContent?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  keyPoints?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  order?: number;
}

export class QuizQuestionDto {
  /** Question existante à corriger ; absent pour une nouvelle question. */
  @IsOptional()
  @IsUUID()
  id?: string;

  @Transform(cleanText)
  @IsString()
  @Length(5, 500)
  question: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @Length(1, 200, { each: true })
  options: string[];

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  correctIndex: number;

  @IsOptional()
  @Transform(cleanMultiline)
  @IsString()
  @MaxLength(1000)
  explanation?: string;
}

export class SaveQuizDto {
  @Transform(cleanText)
  @IsString()
  @Length(3, 160)
  title: string;

  @Type(() => Number)
  @IsInt()
  @Min(50)
  @Max(100)
  passScore: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => QuizQuestionDto)
  questions: QuizQuestionDto[];
}

export class CertificatesQueryDto extends CursorQueryDto {
  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(80)
  q?: string;
}

export class ReasonDto {
  @Transform(cleanText)
  @IsString()
  @Length(5, 300)
  reason: string;
}

// ───────────────────────────── Entreprises & recrutement ─────────────────────────────

export class AdminCompaniesQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED', 'CLOSED'])
  status?: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(80)
  q?: string;
}

export class CompanyStatusDto extends ReasonDto {
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status: 'ACTIVE' | 'SUSPENDED';
}

export class AdminJobsQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsBooleanString()
  active?: 'true' | 'false';

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(80)
  q?: string;
}

// ───────────────────────────── Risque ─────────────────────────────

export const RISK_SIGNAL_TYPES = ['SHARED_DEVICE', 'DUPLICATE_ID_DOCUMENT', 'REPEATED_LOCKOUTS', 'PAYMENT_FAILURES', 'MANUAL'] as const;
export const RISK_CASE_STATUSES = ['NEW', 'INVESTIGATING', 'ESCALATED', 'RESOLVED', 'FALSE_POSITIVE'] as const;
export const RISK_ACTIONS = ['NOTE', 'ASSIGN_SELF', 'INVESTIGATE', 'ESCALATE', 'RESOLVE', 'FALSE_POSITIVE'] as const;

export class RiskCasesQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsIn(RISK_CASE_STATUSES)
  status?: (typeof RISK_CASE_STATUSES)[number];
}

export class OpenRiskCaseDto {
  @IsUUID()
  userId: string;

  @IsIn(RISK_SIGNAL_TYPES)
  signalType: (typeof RISK_SIGNAL_TYPES)[number];

  @Transform(cleanText)
  @IsString()
  @Length(5, 500)
  summary: string;
}

export class RiskCaseActionDto {
  @IsIn(RISK_ACTIONS)
  action: (typeof RISK_ACTIONS)[number];

  @IsOptional()
  @Transform(cleanMultiline)
  @IsString()
  @Length(3, 2000)
  note?: string;
}

// ───────────────────────────── Rapports ─────────────────────────────

export const REPORT_TYPES = ['members', 'finance', 'program', 'solidarity'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export class ReportQueryDto {
  @Matches(CALENDAR_DATE_RE, { message: 'Date attendue au format AAAA-MM-JJ.' })
  from: string;

  @Matches(CALENDAR_DATE_RE, { message: 'Date attendue au format AAAA-MM-JJ.' })
  to: string;
}
