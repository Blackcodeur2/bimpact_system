import type { Money } from './api/api.service';

const TIME_ZONE = 'Africa/Douala';
const NARROW_NBSP = ' ';

/**
 * Montant décimal en chaîne, groupé par milliers sans passer par un nombre flottant.
 * « 1500000 » → « 1 500 000 ».
 */
export function formatAmount(amount: string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const negative = amount.startsWith('-');
  const [integer = '0', decimals] = amount.replace(/^[-+]/, '').split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, NARROW_NBSP);
  const fraction = decimals && !/^0+$/.test(decimals) ? `,${decimals}` : '';
  return `${negative ? '−' : ''}${grouped}${fraction}`;
}

export function formatMoney(money: Money | null | undefined): string {
  if (!money) return '—';
  return `${formatAmount(money.amount)} ${money.currency === 'XAF' ? 'FCFA' : money.currency}`;
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const dayFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: '2-digit', month: 'short' });
const relativeFormat = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? dateFormat.format(date) : '—';
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? dateTimeFormat.format(date) : '—';
}

/** Jour calendaire « AAAA-MM-JJ » (déjà exprimé à l'heure du Cameroun par l'API). */
export function formatDayKey(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? day : dayFormat.format(date);
}

export function formatRelative(value: string | Date | null | undefined, now = Date.now()): string {
  const date = toDate(value);
  if (!date) return '—';
  const seconds = Math.round((date.getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return 'à l’instant';
  if (abs < 3600) return relativeFormat.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return relativeFormat.format(Math.round(seconds / 3600), 'hour');
  if (abs < 30 * 86_400) return relativeFormat.format(Math.round(seconds / 86_400), 'day');
  return formatDate(date);
}

export function fullName(person: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  const name = `${person?.firstName ?? ''} ${person?.lastName ?? ''}`.trim();
  return name || '—';
}

/** Numéro E.164 camerounais lisible : +237 6 99 00 11 22. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const match = /^\+237(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(phone);
  return match ? `+237 ${match.slice(1).join(' ')}` : phone;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/** Début d'un jour saisi « AAAA-MM-JJ », à l'heure du Cameroun (UTC+1), pour les filtres de période. */
export function dayStart(day: string): string | undefined {
  return day ? `${day}T00:00:00+01:00` : undefined;
}

export function dayEnd(day: string): string | undefined {
  return day ? `${day}T23:59:59.999+01:00` : undefined;
}

/** Valeur d'un champ « datetime-local » interprétée à l'heure du Cameroun. */
export function localDateTime(value: string): string {
  return `${value}:00+01:00`;
}

/** Jour calendaire au Cameroun (UTC+1 toute l'année), décalé de `offsetDays`. */
export function dayKey(offsetDays = 0, now = Date.now()): string {
  return new Date(now + 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}
