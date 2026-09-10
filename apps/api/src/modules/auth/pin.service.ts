import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AppConfig } from '../../config/app-config';

/** PIN trivialement devinables refusés à l'inscription. */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1{5}$/.test(pin)) return true; // 000000, 777777
  if ('01234567890123456'.includes(pin) || '98765432109876543'.includes(pin)) return true; // suites
  if (/^(\d\d)\1\1$/.test(pin) || /^(\d{3})\1$/.test(pin)) return true; // 121212, 123123
  return false;
}

/** Hachage Argon2id (paramètres OWASP) avec pepper serveur ; le PIN n'est jamais stocké en clair. */
@Injectable()
export class PinService {
  private readonly pepper: Buffer;
  private dummyHash?: Promise<string>;

  constructor(config: AppConfig) {
    this.pepper = Buffer.from(config.pinPepper, 'utf8');
  }

  hash(pin: string): Promise<string> {
    return argon2.hash(pin, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
      secret: this.pepper,
    });
  }

  async verify(hash: string, pin: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, pin, { secret: this.pepper });
    } catch {
      return false;
    }
  }

  /** Vérification factice pour un compte inexistant : temps de réponse homogène. */
  async burn(pin: string): Promise<void> {
    this.dummyHash ??= this.hash('dummy-pin-for-timing');
    await this.verify(await this.dummyHash, pin);
  }
}
