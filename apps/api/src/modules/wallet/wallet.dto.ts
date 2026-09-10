import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, Matches } from 'class-validator';
import { CursorQueryDto } from '../../common/pagination';

export class WalletTransactionsQueryDto extends CursorQueryDto {
  /** Type métier : DEPOSIT, CONTRIBUTION, REVERSAL… */
  @IsOptional()
  @Matches(/^[A-Z_]{2,40}$/)
  type?: string;

  @IsOptional()
  @IsIn(['IN', 'OUT'])
  direction?: 'IN' | 'OUT';

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
