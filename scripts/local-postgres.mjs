// PostgreSQL local pour le développement, SANS Docker.
// Binaires officiels PostgreSQL fournis par le paquet npm `embedded-postgres` (aucune installation système).
// Données dans .data/postgres, journal dans .data/postgres.log (ignorés par Git). Paramètres lus dans DATABASE_URL.
//
//   pnpm db:local          initialise au premier lancement, démarre le serveur (détaché) et crée la base
//   pnpm db:local:status   indique si le serveur tourne
//   pnpm db:local:stop     arrête le serveur
//
// Le serveur est lancé via pg_ctl : sous Windows, pg_ctl retire les privilèges administrateur du processus,
// ce que postgres.exe exige (il refuse de tourner avec un jeton administrateur).
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = resolve(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid');
if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
  console.error(`DATABASE_URL pointe vers ${url.hostname} : aucune base locale à gérer.`);
  process.exit(1);
}
const user = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);
const port = Number(url.port || 5432);
const database = url.pathname.replace(/^\//, '');

const dataRoot = resolve(root, '.data');
const dataDir = resolve(dataRoot, 'postgres');
const logFile = resolve(dataRoot, 'postgres.log');

// Binaires de la plateforme, résolus depuis le paquet embedded-postgres.
const requireFromEmbedded = createRequire(fileURLToPath(import.meta.resolve('embedded-postgres')));
const platform = { win32: 'windows', darwin: 'darwin', linux: 'linux' }[process.platform];
const binariesModule = await import(
  pathToFileURL(requireFromEmbedded.resolve(`@embedded-postgres/${platform}-${process.arch}`)).href
);
const { initdb, pg_ctl: pgCtl } = binariesModule.default ?? binariesModule;

async function isRunning() {
  try {
    await execFileAsync(pgCtl, ['-D', dataDir, 'status'], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

/** pg_ctl start détache le serveur : stdio ignoré pour ne pas garder de pipe ouvert. */
function runDetached(binary, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(binary, args, { stdio: 'ignore', windowsHide: true });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolvePromise() : reject(new Error(`code de sortie ${code}`))));
  });
}

function tail(file, lines = 20) {
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split(/\r?\n/).slice(-lines).join('\n') : '(journal absent)';
}

const command = process.argv[2] ?? 'start';

if (command === 'status') {
  console.log((await isRunning()) ? `PostgreSQL en marche sur localhost:${port}.` : 'PostgreSQL arrêté.');
  process.exit(0);
}

if (command === 'stop') {
  if (await isRunning()) {
    await execFileAsync(pgCtl, ['-D', dataDir, 'stop', '-m', 'fast', '-w'], { windowsHide: true });
    console.log('PostgreSQL arrêté.');
  } else {
    console.log('PostgreSQL est déjà arrêté.');
  }
  process.exit(0);
}

if (command !== 'start') {
  console.error(`Commande inconnue : ${command} (start | stop | status)`);
  process.exit(1);
}

if (!existsSync(resolve(dataDir, 'PG_VERSION'))) {
  if (existsSync(dataDir)) {
    console.error(`${dataDir} existe mais ne contient pas de cluster valide. Supprimez ce dossier puis relancez.`);
    process.exit(1);
  }
  mkdirSync(dataRoot, { recursive: true });
  const passwordFile = resolve(dataRoot, '.pgpass-init');
  writeFileSync(passwordFile, password, { mode: 0o600 });
  try {
    console.log('Première utilisation : initialisation du cluster PostgreSQL (UTF-8)…');
    await execFileAsync(
      initdb,
      ['-D', dataDir, '-U', user, `--pwfile=${passwordFile}`, '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C'],
      { windowsHide: true },
    );
  } catch (error) {
    console.error('Échec de initdb :', error.stderr || error.message);
    process.exit(1);
  } finally {
    rmSync(passwordFile, { force: true });
  }
}

if (await isRunning()) {
  console.log(`PostgreSQL déjà en marche sur localhost:${port}.`);
} else {
  try {
    await runDetached(pgCtl, [
      '-D', dataDir,
      '-l', logFile,
      '-o', `-p ${port} -c listen_addresses=localhost`,
      '-w', '-t', '60',
      'start',
    ]);
    console.log(`PostgreSQL démarré sur localhost:${port}.`);
  } catch (error) {
    console.error(`Échec du démarrage (${error.message}). Fin du journal ${logFile} :`);
    console.error(tail(logFile));
    process.exit(1);
  }
}

const { Client } = requireFromEmbedded('pg');
const client = new Client({ host: '127.0.0.1', port, user, password, database: 'postgres' });
await client.connect();
const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
if (rowCount === 0) {
  await client.query(`CREATE DATABASE "${database.replaceAll('"', '""')}" ENCODING 'UTF8' TEMPLATE template0`);
  console.log(`Base « ${database} » créée.`);
}
await client.end();
console.log('Prêt. Pour arrêter : pnpm db:local:stop');
