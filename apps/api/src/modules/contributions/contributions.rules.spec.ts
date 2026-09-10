import {
  addDays,
  currentStreak,
  dayStatus,
  expectedDaysThisMonth,
  formatDay,
  localDay,
  localHour,
  payabilityError,
  payableDays,
} from './contributions.rules';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const paidSet = (...isos: string[]) => new Set(isos);

describe('règles des contributions', () => {
  it('utilise le jour et l’heure du Cameroun (UTC+1)', () => {
    expect(formatDay(localDay(new Date('2026-09-10T22:59:00Z')))).toBe('2026-09-10');
    expect(formatDay(localDay(new Date('2026-09-10T23:01:00Z')))).toBe('2026-09-11');
    expect(localHour(new Date('2026-09-10T06:30:00Z'))).toBe(7);
  });

  it('qualifie chaque jour : payé, dû, manqué ou pas encore commencé', () => {
    const today = day('2026-09-10');
    const start = day('2026-09-05');
    const paid = paidSet('2026-09-06');
    expect(dayStatus(day('2026-09-06'), today, start, paid)).toBe('PAID');
    expect(dayStatus(day('2026-09-10'), today, start, paid)).toBe('DUE');
    expect(dayStatus(day('2026-09-07'), today, start, paid)).toBe('MISSED');
    expect(dayStatus(day('2026-09-01'), today, start, paid)).toBe('NOT_STARTED');
    expect(dayStatus(day('2026-09-11'), today, start, paid)).toBe('NOT_STARTED');
  });

  it('compte la série jusqu’à hier tant que le jour n’est pas payé', () => {
    const today = day('2026-09-10');
    expect(currentStreak(today, paidSet('2026-09-08', '2026-09-09'))).toBe(2);
    expect(currentStreak(today, paidSet('2026-09-08', '2026-09-09', '2026-09-10'))).toBe(3);
    expect(currentStreak(today, paidSet('2026-09-07', '2026-09-09'))).toBe(1);
    expect(currentStreak(today, paidSet())).toBe(0);
  });

  it('autorise le jour même et un rattrapage limité à 7 jours depuis l’adhésion', () => {
    const today = day('2026-09-10');
    expect(payabilityError(today, today, null)).toBeNull();
    expect(payabilityError(addDays(today, -1), today, null)).toBe('CONTRIBUTION_BEFORE_START');
    expect(payabilityError(addDays(today, 1), today, day('2026-09-01'))).toBe('CONTRIBUTION_DATE_IN_FUTURE');
    expect(payabilityError(addDays(today, -8), today, day('2026-08-01'))).toBe('CONTRIBUTION_TOO_OLD');
    expect(payabilityError(addDays(today, -7), today, day('2026-08-01'))).toBeNull();

    const payable = payableDays(today, day('2026-09-08'), paidSet('2026-09-09')).map(formatDay);
    expect(payable).toEqual(['2026-09-08', '2026-09-10']);
  });

  it('calcule les jours attendus du mois depuis le début du plan', () => {
    expect(expectedDaysThisMonth(day('2026-09-10'), day('2026-08-20'))).toBe(10);
    expect(expectedDaysThisMonth(day('2026-09-10'), day('2026-09-08'))).toBe(3);
    expect(expectedDaysThisMonth(day('2026-09-10'), null)).toBe(0);
  });
});
