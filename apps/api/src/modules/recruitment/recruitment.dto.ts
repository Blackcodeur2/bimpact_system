import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { cleanMultiline, cleanText } from '../../common/dto-helpers';
import { CursorQueryDto } from '../../common/pagination';

export class JobsQueryDto extends CursorQueryDto {
  /** Recherche dans l'intitulé, l'employeur et la description. */
  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(60)
  q?: string;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(80)
  sector?: string;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(60)
  city?: string;
}

export class ApplyJobDto {
  @IsOptional()
  @Transform(cleanMultiline)
  @IsString()
  @MaxLength(500)
  message?: string;
}
