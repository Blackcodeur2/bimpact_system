/** Numéro mobile camerounais au format E.164 : +237 6XX XX XX XX. */
export const CAMEROON_MOBILE_RE = /^\+2376\d{8}$/;

/** Accepte « 6 12 34 56 78 », « 00237612345678 », « +237 612-345-678 »… et renvoie +237612345678. */
export function normalizeCameroonPhone(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  let value = input.replace(/[\s.\-()]/g, '');
  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  if (/^6\d{8}$/.test(value)) value = `+237${value}`;
  if (/^2376\d{8}$/.test(value)) value = `+${value}`;
  return value;
}

/** Masque un numéro pour les logs : +237 6** ** 56 78. */
export function maskPhone(phone: string): string {
  return phone.length > 6 ? `${phone.slice(0, 5)}****${phone.slice(-4)}` : '****';
}
