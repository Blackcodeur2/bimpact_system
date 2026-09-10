import { Transform } from 'class-transformer';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { CursorQueryDto } from '../../common/pagination';
import { CAMEROON_MOBILE_RE, normalizeCameroonPhone } from '../auth/phone';
import { PAYMENT_CHANNELS, PaymentChannel } from './payment-provider';

export const PAYMENT_STATUSES = ['CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'] as const;

export class CreatePaymentIntentDto {
  /** Montant en francs CFA entiers, en chaîne (jamais de float). */
  @Transform(({ value }) => (typeof value === 'number' ? String(value) : value))
  @Matches(/^[1-9]\d{0,8}$/, { message: 'Montant en francs CFA entiers.' })
  amount: string;

  @IsIn(PAYMENT_CHANNELS)
  channel: PaymentChannel;

  /** Numéro Mobile Money à débiter ; par défaut, celui du compte. */
  @IsOptional()
  @Transform(({ value }) => normalizeCameroonPhone(value))
  @Matches(CAMEROON_MOBILE_RE, { message: 'Numéro Mobile Money camerounais invalide.' })
  payerPhone?: string;
}

export class PaymentsQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  status?: (typeof PAYMENT_STATUSES)[number];
}
