import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { seedReferenceData } from '../../prisma/seed';
import { E2E_SCHEMA_RE, loadTestEnv } from './env';

/** Crée le schéma éphémère, applique les migrations (dont les triggers d'intégrité) puis le seed. */
export default async function globalSetup(): Promise<void> {
  loadTestEnv();
  const schema = process.env.E2E_SCHEMA!;
  if (!E2E_SCHEMA_RE.test(schema)) throw new Error(`Schéma de test inattendu : ${schema}`);

  const apiRoot = resolve(__dirname, '../..');
  execFileSync(
    process.execPath,
    [resolve(apiRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    { cwd: apiRoot, env: process.env, stdio: 'inherit' },
  );

  const prisma = new PrismaClient();
  try {
    await seedReferenceData(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
