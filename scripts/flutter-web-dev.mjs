// Lance l'application mobile en mode web (debug) avec rechargement à chaud AUTOMATIQUE :
// chaque sauvegarde d'un fichier .dart dans apps/mobile/lib déclenche un hot reload.
//
//   node scripts/flutter-web-dev.mjs            → http://localhost:5173
//   MOBILE_WEB_PORT=5174 node scripts/flutter-web-dev.mjs
//
// Pilote `flutter run --machine` (protocole JSON du daemon Flutter) : fonctionne sous Windows,
// où l'on ne peut pas envoyer de signal au processus flutter pour recharger.
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mobileDir = resolve(root, 'apps', 'mobile');
const port = process.env.MOBILE_WEB_PORT ?? '5173';

const log = (message) => console.log(`[${new Date().toLocaleTimeString('fr-FR')}] ${message}`);

const flutter = spawn(
  'flutter',
  ['run', '--machine', '-d', 'web-server', '--web-port', port, '--web-hostname', 'localhost'],
  { cwd: mobileDir, shell: process.platform === 'win32', stdio: ['pipe', 'pipe', 'pipe'] },
);

let appId = null;
let requestId = 0;
let reloading = false;
let pendingReload = false;
const pending = new Map();

function send(method, params) {
  const id = ++requestId;
  flutter.stdin.write(`${JSON.stringify([{ id, method, params }])}\n`);
  return new Promise((resolvePromise) => pending.set(id, resolvePromise));
}

async function reload(reason) {
  if (!appId) return;
  if (reloading) {
    pendingReload = true;
    return;
  }
  reloading = true;
  const started = Date.now();
  const result = await send('app.restart', { appId, fullRestart: false, pause: false, reason });
  if (result?.error || (result?.result && result.result.code !== 0)) {
    log(`Hot reload refusé (${result.error ?? result.result.message}) → redémarrage complet`);
    await send('app.restart', { appId, fullRestart: true, pause: false, reason });
  }
  log(`Rechargé en ${Date.now() - started} ms (${reason})`);
  reloading = false;
  if (pendingReload) {
    pendingReload = false;
    void reload('modifications en attente');
  }
}

createInterface({ input: flutter.stdout }).on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed.startsWith('[')) {
    if (trimmed) log(trimmed);
    return;
  }
  let messages;
  try {
    messages = JSON.parse(trimmed);
  } catch {
    log(trimmed);
    return;
  }
  for (const message of messages) {
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
      continue;
    }
    const { event, params = {} } = message;
    switch (event) {
      case 'app.start':
        appId = params.appId;
        break;
      case 'app.webLaunchUrl':
        log(`Application disponible : ${params.url}`);
        break;
      case 'app.started':
        log('Application démarrée — rechargement à chaud automatique actif.');
        break;
      case 'app.progress':
        if (params.message && !params.finished) log(params.message);
        break;
      case 'daemon.logMessage':
      case 'app.log':
        if (params.message || params.log) log(params.message ?? params.log);
        break;
      case 'app.stop':
        log('Application arrêtée.');
        break;
      default:
        break;
    }
  }
});

createInterface({ input: flutter.stderr }).on('line', (line) => line.trim() && log(`[stderr] ${line}`));

let debounce = null;
const changed = new Set();
watch(resolve(mobileDir, 'lib'), { recursive: true }, (_event, filename) => {
  if (!filename || !filename.endsWith('.dart')) return;
  changed.add(filename.replaceAll('\\', '/'));
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    const files = [...changed];
    changed.clear();
    void reload(files.length === 1 ? files[0] : `${files.length} fichiers`);
  }, 400);
});

function shutdown() {
  if (appId) flutter.stdin.write(`${JSON.stringify([{ id: ++requestId, method: 'app.stop', params: { appId } }])}\n`);
  setTimeout(() => process.exit(0), 1500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
flutter.on('exit', (code) => {
  log(`flutter s'est arrêté (code ${code}).`);
  process.exit(code ?? 0);
});
