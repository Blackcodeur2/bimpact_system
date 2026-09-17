import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const E2E_SCHEMA_RE = /^e2e_\d+$/;

/**
 * Environnement des tests d'intégration : base PostgreSQL de DATABASE_URL (locale via `pnpm db:local`, ou Supabase),
 * dans un schéma éphémère `e2e_<horodatage>` créé puis supprimé par la suite de tests.
 * Le schéma `public` de développement n'est jamais touché, ni par l'API ni par les migrations (DIRECT_URL).
 */
export function loadTestEnv(): void {
  const envFile = resolve(__dirname, '../../../../.env');
  if (existsSync(envFile) && !process.env.E2E_ENV_LOADED) {
    process.loadEnvFile(envFile);
    process.env.E2E_ENV_LOADED = '1';
  }
  process.env.NODE_ENV = 'test';
  process.env.OTP_DEV_LOG = 'false';
  process.env.E2E_SCHEMA ??= `e2e_${Date.now()}`;
  // Documents chiffrés des tests hors du dossier de données de développement.
  process.env.DOCUMENT_STORAGE_DIR = join(tmpdir(), 'benskin-e2e-documents', process.env.E2E_SCHEMA);

  const direct = process.env.DIRECT_URL || process.env.DATABASE_URL;
  process.env.DATABASE_URL = withSchema(process.env.DATABASE_URL, process.env.E2E_SCHEMA);
  process.env.DIRECT_URL = withSchema(direct, process.env.E2E_SCHEMA);
}

function withSchema(connection: string | undefined, schema: string): string {
  const url = new URL(connection ?? '');
  url.searchParams.set('schema', schema);
  return url.toString();
}

loadTestEnv();
