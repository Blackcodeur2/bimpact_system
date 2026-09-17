/**
 * Crée un compte du back-office (typiquement le premier super administrateur) avec un mot de passe temporaire.
 * Le mot de passe est affiché une seule fois et doit être remplacé à la première connexion.
 *
 *   pnpm --filter @benskin/api staff:create -- --email admin@exemple.cm --phone 699001122 --first Awa --last Ngono
 *   (option --role, répétable ; SUPER_ADMIN par défaut)
 */
import { parseArgs } from 'node:util';
import { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../src/config/app-config';
import { generateTemporaryPassword, PasswordService } from '../src/modules/auth/password.service';
import { CAMEROON_MOBILE_RE, normalizeCameroonPhone } from '../src/modules/auth/phone';
import { ROLES } from '../src/modules/auth/rbac.catalog';

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      phone: { type: 'string' },
      first: { type: 'string' },
      last: { type: 'string' },
      role: { type: 'string', multiple: true },
    },
  });
  const email = values.email?.trim().toLowerCase();
  const phone = normalizeCameroonPhone(values.phone);
  const firstName = values.first?.trim();
  const lastName = values.last?.trim();
  const roles = values.role?.length ? values.role : ['SUPER_ADMIN'];

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('--email invalide');
  if (typeof phone !== 'string' || !CAMEROON_MOBILE_RE.test(phone)) throw new Error('--phone invalide (ex. 699001122)');
  if (!firstName || !lastName) throw new Error('--first et --last sont obligatoires');
  const unknown = roles.filter((code) => code === 'MEMBER' || !ROLES[code]);
  if (unknown.length > 0) throw new Error(`Rôles inconnus : ${unknown.join(', ')}`);
  const pepper = process.env.PIN_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error('PIN_PEPPER absent ou trop court dans .env');

  const passwords = new PasswordService({ pinPepper: pepper } as AppConfig);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await passwords.hash(temporaryPassword);

  const prisma = new PrismaClient();
  try {
    const roleRows = await prisma.role.findMany({ where: { code: { in: roles } }, select: { id: true, code: true } });
    if (roleRows.length !== roles.length) throw new Error('Rôles absents de la base : lancez d’abord pnpm db:seed');
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          phone,
          kind: 'STAFF',
          status: 'ACTIVE',
          passwordHash,
          mustChangePassword: true,
          profile: { create: { firstName, lastName, city: 'Non renseignée' } },
          roles: { create: roleRows.map((role) => ({ roleId: role.id })) },
        },
      });
      await tx.auditLog.create({
        data: {
          actorType: 'SYSTEM',
          action: 'staff.created',
          resourceType: 'user',
          resourceId: created.id,
          after: { email, roles },
          metadata: { source: 'cli' },
        },
      });
      return created;
    });
    console.log(`Compte back-office créé : ${email} (${roles.join(', ')}) — id ${user.id}`);
    console.log(`Mot de passe temporaire (affiché une seule fois) : ${temporaryPassword}`);
    console.log('Il devra être remplacé à la première connexion.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
