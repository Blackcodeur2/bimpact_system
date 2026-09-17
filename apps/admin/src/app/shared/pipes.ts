import { Pipe, PipeTransform } from '@angular/core';
import type { Money } from '../core/api/api.service';
import { formatAmount, formatDate, formatDateTime, formatMoney, formatPhone, formatRelative, fullName } from '../core/format';
import { auditActionLabel } from '../core/labels';

@Pipe({ name: 'xaf' })
export class MoneyPipe implements PipeTransform {
  transform(value: Money | null | undefined): string {
    return formatMoney(value);
  }
}

@Pipe({ name: 'amount' })
export class AmountPipe implements PipeTransform {
  transform(value: string | number | null | undefined): string {
    return formatAmount(value === null || value === undefined ? null : String(value));
  }
}

@Pipe({ name: 'frDate' })
export class FrDatePipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    return formatDate(value);
  }
}

@Pipe({ name: 'frDateTime' })
export class FrDateTimePipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    return formatDateTime(value);
  }
}

/** Non pur : « il y a 5 min » évolue avec le temps. */
@Pipe({ name: 'ago', pure: false })
export class RelativeTimePipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    return formatRelative(value);
  }
}

@Pipe({ name: 'phone' })
export class PhonePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return formatPhone(value);
  }
}

@Pipe({ name: 'fullName' })
export class FullNamePipe implements PipeTransform {
  transform(value: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
    return fullName(value);
  }
}

@Pipe({ name: 'auditAction' })
export class AuditActionPipe implements PipeTransform {
  transform(value: string): string {
    return auditActionLabel(value);
  }
}

@Pipe({ name: 'label' })
export class DictionaryLabelPipe implements PipeTransform {
  transform(value: string | null | undefined, dictionary: Record<string, string>): string {
    if (!value) return '—';
    return dictionary[value] ?? value;
  }
}

export const FORMAT_PIPES = [
  MoneyPipe,
  AmountPipe,
  FrDatePipe,
  FrDateTimePipe,
  RelativeTimePipe,
  PhonePipe,
  FullNamePipe,
  AuditActionPipe,
  DictionaryLabelPipe,
] as const;
