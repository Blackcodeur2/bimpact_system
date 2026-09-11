import type { TransformFnParams } from 'class-transformer';

/** Texte court : espaces de bord retirés, espaces multiples et retours à la ligne réduits à un espace. */
export const cleanText = ({ value }: TransformFnParams) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

/** Texte long : retours à la ligne conservés (deux lignes vides au plus), espaces superflus retirés. */
export const cleanMultiline = ({ value }: TransformFnParams) =>
  typeof value === 'string'
    ? value
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : value;

/** Montant reçu en nombre entier ou en chaîne, toujours traité en chaîne (jamais de float côté serveur). */
export const toAmountString = ({ value }: TransformFnParams) =>
  typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;

/** Francs CFA entiers strictement positifs (le franc CFA n'a pas de subdivision). */
export const XAF_AMOUNT_RE = /^[1-9]\d{0,8}$/;

/** Francs CFA entiers, zéro compris. */
export const XAF_AMOUNT_OR_ZERO_RE = /^(0|[1-9]\d{0,8})$/;

export const XAF_AMOUNT_MESSAGE = 'Montant en francs CFA entiers attendu.';
