import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AppConfig } from '../../config/app-config';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Mots de passe parmi les plus répandus : refusés même s'ils atteignent la longueur minimale. */
const COMMON_PASSWORDS = new Set([
  '123456789012',
  '1234567890123',
  'azertyuiop12',
  'azertyuiopqs',
  'motdepasse123',
  'motdepasse1234',
  'password1234',
  'password12345',
  'passwordpassword',
  'qwertyuiop12',
  'admin1234567',
  'administrateur',
  'benskinimpact',
  'benskin-impact',
  'benskinimpact1',
  'benskinimpact2026',
  'changeme12345',
  'bienvenue1234',
  'cameroun2026',
  'douala123456',
  'yaounde123456',
]);

export interface PasswordIdentity {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * Politique de mot de passe du back-office (OWASP ASVS V2.1) : longueur plutôt que complexité imposée,
 * refus des mots de passe courants, répétitifs ou construits sur l'identité de l'agent.
 */
export function passwordIssues(password: string, identity: PasswordIdentity = {}): string[] {
  const issues: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) issues.push(`Au moins ${PASSWORD_MIN_LENGTH} caractères.`);
  if (password.length > PASSWORD_MAX_LENGTH) issues.push(`${PASSWORD_MAX_LENGTH} caractères maximum.`);
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) issues.push('Ce mot de passe est trop courant.');
  if (/^(.)\1+$/.test(password) || new Set(password).size < 5) issues.push('Utilisez des caractères plus variés.');
  const personal = [identity.email?.split('@')[0], identity.firstName, identity.lastName]
    .map((part) => part?.toLowerCase().trim())
    .filter((part): part is string => Boolean(part && part.length >= 4));
  if (personal.some((part) => lower.includes(part))) issues.push('Ne réutilisez pas votre nom ou votre adresse e-mail.');
  return issues;
}

const TEMPORARY_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Mot de passe temporaire lisible (4 groupes de 4 caractères sans caractères ambigus). */
export function generateTemporaryPassword(): string {
  return Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => TEMPORARY_ALPHABET[randomInt(TEMPORARY_ALPHABET.length)]).join(''),
  ).join('-');
}

/** Hachage Argon2id (paramètres OWASP) avec le pepper serveur des identifiants. */
@Injectable()
export class PasswordService {
  private readonly pepper: Buffer;
  private dummyHash?: Promise<string>;

  constructor(config: AppConfig) {
    this.pepper = Buffer.from(config.pinPepper, 'utf8');
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
      secret: this.pepper,
    });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password, { secret: this.pepper });
    } catch {
      return false;
    }
  }

  /** Vérification factice pour un compte inexistant : temps de réponse homogène. */
  async burn(password: string): Promise<void> {
    this.dummyHash ??= this.hash('dummy-password-for-timing');
    await this.verify(await this.dummyHash, password);
  }
}
