import { describe, expect, it } from 'vitest';
import { formatAmount, formatMoney, formatPhone, fullName } from './format';

describe('format utilities', () => {
  describe('formatAmount', () => {
    it('formats plain integers with non-breaking spaces', () => {
      expect(formatAmount('1500000')).toBe('1 500 000');
    });

    it('returns a dash for null, undefined or empty strings', () => {
      expect(formatAmount(null)).toBe('—');
      expect(formatAmount(undefined)).toBe('—');
      expect(formatAmount('')).toBe('—');
    });
  });

  describe('formatMoney', () => {
    it('formats money object to FCFA for XAF currency', () => {
      expect(formatMoney({ amount: '5000', currency: 'XAF' })).toBe('5 000 FCFA');
    });

    it('returns a dash for null/undefined money', () => {
      expect(formatMoney(null)).toBe('—');
    });
  });

  describe('fullName', () => {
    it('formats person with first and last name', () => {
      expect(fullName({ firstName: 'Jean', lastName: 'Dupont' })).toBe('Jean Dupont');
    });

    it('handles missing or null names', () => {
      expect(fullName({ firstName: 'Jean', lastName: null })).toBe('Jean');
      expect(fullName(null)).toBe('—');
    });
  });

  describe('formatPhone', () => {
    it('formats Cameroon E.164 phone numbers nicely', () => {
      expect(formatPhone('+237699001122')).toBe('+237 6 99 00 11 22');
    });

    it('returns unchanged for other formats or dash for null', () => {
      expect(formatPhone('+33612345678')).toBe('+33612345678');
      expect(formatPhone(null)).toBe('—');
    });
  });
});
