import { Transform, Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { CursorQueryDto } from '../../common/pagination';

const cleanText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

export class CreateDrawDto {
  @Transform(cleanText)
  @IsString()
  @Length(5, 120)
  title: string;

  @Type(() => Date)
  @IsDate()
  scheduledAt: Date;

  @IsInt()
  @Min(1)
  @Max(1000)
  winnerCount: number;

  /** Nombre minimum de jours de contribution payés sur la période. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  minPaidDays?: number;

  /** Période glissante d'observation des contributions, en jours. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  windowDays?: number;
}

export class CancelDrawDto {
  @Transform(cleanText)
  @IsString()
  @Length(5, 300)
  reason: string;
}

export class DrawsQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsIn(['DRAFT', 'FROZEN', 'EXECUTED', 'PUBLISHED', 'CANCELLED'])
  status?: 'DRAFT' | 'FROZEN' | 'EXECUTED' | 'PUBLISHED' | 'CANCELLED';
}

export const BENEFICIARY_STATUSES = ['SELECTED', 'TRAINING', 'CERTIFIED', 'ENTREPRENEUR', 'WITHDRAWN'] as const;

export class BeneficiariesQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsIn(BENEFICIARY_STATUSES)
  status?: (typeof BENEFICIARY_STATUSES)[number];
}

export class UpdateBeneficiaryDto {
  @IsOptional()
  @IsIn(BENEFICIARY_STATUSES)
  status?: (typeof BENEFICIARY_STATUSES)[number];

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @Length(2, 80)
  mentorName?: string;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(300)
  note?: string;
}
