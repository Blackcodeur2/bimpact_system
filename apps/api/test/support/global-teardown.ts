import { PrismaClient } from '@prisma/client';
import { E2E_SCHEMA_RE } from './env';

/** Supprime uniquement le schéma éphémère créé par cette exécution (nom vérifié). */
export default async function globalTeardown(): Promise<void> {
  const schema = process.env.E2E_SCHEMA;
  if (!schema || !E2E_SCHEMA_RE.test(schema) || process.env.E2E_KEEP_SCHEMA === '1') return;

  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await prisma.$disconnect();
  }
}
