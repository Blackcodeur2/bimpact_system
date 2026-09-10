/**
 * Règles de calendrier des contributions quotidiennes.
 * Les jours sont ceux du Cameroun (Africa/Douala, UTC+1, sans heure d'été), représentés en Date UTC à minuit.
 */

export const DOUALA_UTC_OFFSET_MINUTES = 60;
const DAY_MS = 86_400_000;

/** Nombre de jours manqués encore payables en rattrapage (en plus du jour même). */
export const CATCH_UP_DAYS = 7;

export type DayStatus = 'PAID' | 'DUE' | 'MISSED' | 'NOT_STARTED';

export function localDay(instant: Date = new Date()): Date {
  const shifted = new Date(instant.getTime() + DOUALA_UTC_OFFSET_MINUTES * 60_000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

export function localHour(instant: Date = new Date()): number {
  return new Date(instant.getTime() + DOUALA_UTC_OFFSET_MINUTES * 60_000).getUTCHours();
}

export function addDays(day: Date, days: number): Date {
  return new Date(day.getTime() + days * DAY_MS);
}

export function formatDay(day: Date): string {
  return day.toISOString().slice(0, 10);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

export function dayStatus(day: Date, today: Date, startedOn: Date | null, paid: ReadonlySet<string>): DayStatus {
  if (paid.has(formatDay(day))) return 'PAID';
  if (!startedOn || day < startedOn || day > today) return 'NOT_STARTED';
  return day.getTime() === today.getTime() ? 'DUE' : 'MISSED';
}

/** Jours consécutifs payés jusqu'à aujourd'hui, ou jusqu'à hier si le jour n'est pas encore payé. */
export function currentStreak(today: Date, paid: ReadonlySet<string>): number {
  let cursor = paid.has(formatDay(today)) ? today : addDays(today, -1);
  let streak = 0;
  while (paid.has(formatDay(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Jours encore payables : aujourd'hui (même avant la première contribution) et les jours manqués récents. */
export function payableDays(today: Date, startedOn: Date | null, paid: ReadonlySet<string>): Date[] {
  const days: Date[] = [];
  for (let offset = CATCH_UP_DAYS; offset >= 0; offset -= 1) {
    const day = addDays(today, -offset);
    if (paid.has(formatDay(day))) continue;
    if (offset === 0 || (startedOn && day >= startedOn)) days.push(day);
  }
  return days;
}

export type PayabilityError = 'CONTRIBUTION_DATE_IN_FUTURE' | 'CONTRIBUTION_BEFORE_START' | 'CONTRIBUTION_TOO_OLD';

export function payabilityError(day: Date, today: Date, startedOn: Date | null): PayabilityError | null {
  if (day > today) return 'CONTRIBUTION_DATE_IN_FUTURE';
  if (daysBetween(day, today) > CATCH_UP_DAYS) return 'CONTRIBUTION_TOO_OLD';
  // Avant l'adhésion, seul le jour même peut démarrer le plan.
  if (day.getTime() !== today.getTime() && (!startedOn || day < startedOn)) return 'CONTRIBUTION_BEFORE_START';
  return null;
}

/** Jours attendus sur le mois en cours, depuis le début du plan. */
export function expectedDaysThisMonth(today: Date, startedOn: Date | null): number {
  if (!startedOn) return 0;
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const from = startedOn > monthStart ? startedOn : monthStart;
  return from > today ? 0 : daysBetween(from, today) + 1;
}
