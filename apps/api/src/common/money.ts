import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from './errors/app-exception';

export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

/** Nombre de décimales autorisées par devise (le franc CFA n'a pas de subdivision). */
const CURRENCY_DECIMALS: Record<string, number> = { XAF: 0 };

export interface MoneyView {
  /** Montant en chaîne décimale — jamais de float côté client. */
  amount: string;
  currency: string;
}

export function money(amount: Prisma.Decimal | string | number, currency = 'XAF'): MoneyView {
  return { amount: new Decimal(amount).toFixed(CURRENCY_DECIMALS[currency] ?? 2), currency };
}

/** Parse un montant strictement positif respectant la précision de la devise. */
export function parsePositiveAmount(value: Prisma.Decimal | string, currency: string): Prisma.Decimal {
  let amount: Prisma.Decimal;
  try {
    amount = new Decimal(value);
  } catch {
    throw invalidAmount(String(value));
  }
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > decimals) {
    throw invalidAmount(amount.toString());
  }
  return amount;
}

function invalidAmount(value: string) {
  return new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'INVALID_AMOUNT', 'Montant invalide.', { value });
}
