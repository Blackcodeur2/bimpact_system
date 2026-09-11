import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';

/** Alphabet sans caractères ambigus (0/O, 1/I) : 32 symboles, tirage uniforme sur un octet. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Code lisible issu d'une source cryptographique (références de dossier, codes de vérification). */
export function randomCode(length: number): string {
  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) code += ALPHABET[bytes[i]! % ALPHABET.length];
  return code;
}

/** Réessaie une création dont une valeur générée (référence…) entrerait en collision avec une contrainte unique. */
export async function withUniqueRetry<T>(create: () => Promise<T>, attempts = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await create();
    } catch (error) {
      const collision = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!collision || attempt >= attempts) throw error;
    }
  }
}
