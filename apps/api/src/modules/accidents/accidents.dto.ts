import { AccidentClaimStatus, AccidentDocType, AccidentSeverity } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { cleanMultiline, cleanText, toAmountString, XAF_AMOUNT_MESSAGE, XAF_AMOUNT_RE } from '../../common/dto-helpers';
import { CursorQueryDto } from '../../common/pagination';

export class ReportAccidentDto {
  @Type(() => Date)
  @IsDate()
  date: Date;

  @Transform(cleanText)
  @IsString()
  @Length(3, 200)
  location: string;

  @IsEnum(AccidentSeverity)
  severity: AccidentSeverity;

  @IsOptional()
  @IsBoolean()
  thirdPartyInvolved?: boolean;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(120)
  hospitalName?: string;

  @Transform(cleanMultiline)
  @IsString()
  @Length(10, 2000)
  description: string;

  /** Estimation des frais en francs CFA entiers ; n'engage aucune prise en charge. */
  @Transform(toAmountString)
  @Matches(XAF_AMOUNT_RE, { message: XAF_AMOUNT_MESSAGE })
  requestedAmount: string;
}

export class UploadClaimDocumentDto {
  @IsEnum(AccidentDocType)
  type: AccidentDocType;
}

export class ClaimMessageDto {
  @Transform(cleanMultiline)
  @IsString()
  @Length(2, 1000)
  message: string;
}

export class AdminClaimsQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsEnum(AccidentClaimStatus)
  status?: AccidentClaimStatus;
}

/** Motif visible par le membre. */
export class ClaimReasonDto {
  @Transform(cleanMultiline)
  @IsString()
  @Length(5, 500)
  reason: string;
}

export class InvestigateClaimDto {
  /** Note interne du comité, jamais montrée au membre. */
  @IsOptional()
  @Transform(cleanMultiline)
  @IsString()
  @MaxLength(1000)
  internalNote?: string;
}

export class ApproveClaimDto extends ClaimReasonDto {
  @Transform(toAmountString)
  @Matches(XAF_AMOUNT_RE, { message: XAF_AMOUNT_MESSAGE })
  approvedAmount: string;

  @IsOptional()
  @Transform(cleanMultiline)
  @IsString()
  @MaxLength(1000)
  internalNote?: string;
}

export class CloseClaimDto {
  @IsOptional()
  @Transform(cleanMultiline)
  @IsString()
  @MaxLength(500)
  reason?: string;
}
