import { SupportTicketStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { cleanMultiline, cleanText } from '../../common/dto-helpers';
import { CursorQueryDto } from '../../common/pagination';

export const SUPPORT_CATEGORIES = ['ACCOUNT', 'PAYMENT', 'CONTRIBUTION', 'DRAW', 'TRAINING', 'PROJECT', 'ACCIDENT', 'OTHER'] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export class CreateTicketDto {
  @IsIn(SUPPORT_CATEGORIES)
  category: SupportCategory;

  @Transform(cleanText)
  @IsString()
  @Length(5, 120)
  subject: string;

  @Transform(cleanMultiline)
  @IsString()
  @Length(10, 2000)
  message: string;
}

export class TicketMessageDto {
  @Transform(cleanMultiline)
  @IsString()
  @Length(2, 2000)
  body: string;
}

export class TicketsQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus;
}

export class TicketStatusDto {
  @IsIn(['OPEN', 'RESOLVED', 'CLOSED'])
  status: 'OPEN' | 'RESOLVED' | 'CLOSED';
}
