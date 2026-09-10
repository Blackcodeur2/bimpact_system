import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

const cleanText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

export class UpdateMeDto {
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
  @Transform(cleanText)
  @IsString()
  @Length(2, 60)
  city?: string;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(60)
  zone?: string;
}
