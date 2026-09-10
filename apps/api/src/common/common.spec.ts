import { validateEnv } from '../config/env.validation';
import { AppException } from './errors/app-exception';
import { money } from './money';
import { decodeCursor, encodeCursor, toPage } from './pagination';

describe('pagination par curseur', () => {
  const position = { createdAt: new Date('2026-09-10T08:00:00.000Z'), id: '6f1c8a52-3a4b-4c1d-9e2f-0a1b2c3d4e5f' };

  it('encode puis décode un curseur', () => {
    expect(decodeCursor(encodeCursor(position))).toEqual(position);
  });

  it('refuse un curseur forgé', () => {
    expect(() => decodeCursor('pas-un-curseur')).toThrow(AppException);
    expect(() => decodeCursor(Buffer.from('2026-01-01|1 OR 1=1').toString('base64url'))).toThrow(AppException);
  });

  it('renvoie un curseur seulement s’il reste des lignes', () => {
    const rows = [1, 2, 3].map((n) => ({ ...position, id: `${position.id.slice(0, -1)}${n}` }));
    expect(toPage(rows, 2, (r) => r.id).nextCursor).not.toBeNull();
    expect(toPage(rows, 3, (r) => r.id).nextCursor).toBeNull();
  });
});

describe('money', () => {
  it('formate le XAF sans décimales et sans float', () => {
    expect(money('25400.00')).toEqual({ amount: '25400', currency: 'XAF' });
  });
});

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgresql://localhost/test',
    JWT_ACCESS_SECRET: 'x'.repeat(32),
    OTP_HMAC_SECRET: 'y'.repeat(32),
    IP_HASH_SECRET: 'z'.repeat(32),
    PIN_PEPPER: 'p'.repeat(32),
    DOCUMENT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    FILE_URL_SECRET: 'f'.repeat(32),
  };

  it('applique les valeurs par défaut', () => {
    const env = validateEnv(base);
    expect(env.API_PORT).toBe(3000);
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(900);
    expect(env.OTP_DEV_LOG).toBe(false);
  });

  it('convertit les nombres et booléens venant du .env', () => {
    const env = validateEnv({ ...base, API_PORT: '4000', OTP_DEV_LOG: 'true' });
    expect(env.API_PORT).toBe(4000);
    expect(env.OTP_DEV_LOG).toBe(true);
  });

  it('refuse un secret JWT trop court', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'court' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('refuse une clé de chiffrement des documents qui ne fait pas 32 octets', () => {
    expect(() => validateEnv({ ...base, DOCUMENT_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') })).toThrow(
      /DOCUMENT_ENCRYPTION_KEY/,
    );
  });

  it("interdit l'affichage des OTP dans les logs en production", () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production', OTP_DEV_LOG: 'true' })).toThrow(/OTP_DEV_LOG/);
  });
});
