import { LedgerAccountType, PrismaClient } from '@prisma/client';
import { PERMISSIONS, ROLES, SYSTEM_LEDGER_ACCOUNTS } from '../src/modules/auth/rbac.catalog';

/**
 * Données de référence idempotentes : permissions, rôles, comptes système du ledger.
 * Aucune donnée utilisateur ni solde fictif n'est créé.
 */
export async function seedReferenceData(prisma: PrismaClient) {
  for (const [code, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { code }, create: { code, description }, update: { description } });
  }

  const permissionIds = new Map(
    (await prisma.permission.findMany({ select: { id: true, code: true } })).map((p) => [p.code, p.id]),
  );

  for (const [code, role] of Object.entries(ROLES)) {
    const saved = await prisma.role.upsert({
      where: { code },
      create: { code, name: role.name, isSystem: true },
      update: { name: role.name },
    });
    const wanted = role.permissions.map((p) => permissionIds.get(p)!);
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: saved.id, permissionId: { notIn: wanted } } }),
      prisma.rolePermission.createMany({
        data: wanted.map((permissionId) => ({ roleId: saved.id, permissionId })),
        skipDuplicates: true,
      }),
    ]);
  }

  for (const account of SYSTEM_LEDGER_ACCOUNTS) {
    await prisma.ledgerAccount.upsert({
      where: { code: account.code },
      create: { ...account, type: account.type as LedgerAccountType, currency: 'XAF' },
      update: { name: account.name },
    });
  }
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedReferenceData(prisma)
    .then(() => console.log('Seed terminé : permissions, rôles et comptes système à jour.'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
