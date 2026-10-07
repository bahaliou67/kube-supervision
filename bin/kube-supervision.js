#!/usr/bin/env node
// Lanceur de l'outil : `npx kube-supervision`.
//
// Démarre le backend sur 127.0.0.1, sert le front compilé sur le même port,
// puis ouvre le navigateur. Ctrl+C arrête proprement l'outil.
//
// Options :
//   --port <n>    port d'écoute (sinon variable KUBE_SUPERVISION_PORT, sinon 7420)
//   --no-open     ne pas ouvrir le navigateur
//   --help        aide
//   --version     version
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(racine, 'package.json'), 'utf8'));
const args = process.argv.slice(2);

const AIDE = `Supervision Kubernetes ${pkg.version}

Voir l'état d'un cluster Kubernetes et diagnostiquer un problème depuis le navigateur.
Le kubeconfig de la machine est utilisé (variable KUBECONFIG, sinon ~/.kube/config).

Utilisation :
  npx kube-supervision [options]

Options :
  --port <n>    Port d'écoute local (défaut : 7420, ou variable KUBE_SUPERVISION_PORT)
  --no-open     Ne pas ouvrir le navigateur automatiquement
  --version     Afficher la version
  --help        Afficher cette aide

L'outil n'écoute que sur 127.0.0.1 : il n'est pas accessible depuis une autre machine.
`;

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(AIDE);
  process.exit(0);
}
if (args.includes('--version') || args.includes('-v')) {
  process.stdout.write(`${pkg.version}\n`);
  process.exit(0);
}

// Version de Node : les dépendances (client Kubernetes, undici) exigent Node 22.19 ou plus.
const [majeur, mineur] = process.versions.node.split('.').map(Number);
if (majeur < 22 || (majeur === 22 && mineur < 19)) {
  console.error(`Node.js ${process.versions.node} est trop ancien : la version 22.19 ou plus récente est nécessaire.`);
  console.error('Téléchargez la version LTS sur https://nodejs.org puis relancez la commande.');
  process.exit(1);
}

const inconnues = args.filter((a, i) => a.startsWith('-') && !['--port', '--no-open'].includes(a.split('=')[0]) && args[i - 1] !== '--port');
if (inconnues.length) {
  console.error(`Option inconnue : ${inconnues.join(', ')}\n`);
  process.stdout.write(AIDE);
  process.exit(1);
}

const dossierFront = join(racine, 'frontend', 'dist');
if (!existsSync(join(dossierFront, 'index.html'))) {
  console.error("Le front n'est pas compilé (frontend/dist absent). Depuis les sources, lancez d'abord : npm run build");
  process.exit(1);
}

// Ouvre l'adresse dans le navigateur par défaut, sans bloquer si c'est impossible.
function ouvrirNavigateur(url) {
  const commandes = {
    win32: ['cmd', ['/c', 'start', '', url]],
    darwin: ['open', [url]],
  };
  const [cmd, cmdArgs] = commandes[process.platform] ?? ['xdg-open', [url]];
  try {
    const enfant = spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true, windowsHide: true });
    enfant.on('error', () => {});
    enfant.unref();
  } catch {
    /* pas de navigateur disponible : l'adresse est affichée dans le terminal */
  }
}

// Erreur imprévue : journalisée, sans arrêter l'outil ni afficher de donnée sensible.
process.on('uncaughtException', (err) => console.error(`[erreur non gérée] ${err?.name ?? ''} ${err?.message ?? err}`));
process.on('unhandledRejection', (err) => console.error(`[promesse rejetée] ${err?.name ?? ''} ${err?.message ?? err}`));

const { portDepuis, start } = await import('../backend/src/index.js');

let port;
try {
  port = portDepuis(args, process.env);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

let instance;
try {
  instance = await start({ port, staticDir: dossierFront });
} catch (err) {
  if (err.code === 'EADDRINUSE') {
    console.error(`Le port ${port} est déjà utilisé, peut-être par une autre instance de l'outil.`);
    console.error(`Fermez-la, ou choisissez un autre port : npx kube-supervision --port ${port + 1}`);
  } else {
    console.error(`Démarrage impossible : ${err.message}`);
  }
  process.exit(1);
}

console.log(`Supervision Kubernetes ${pkg.version} est prête : ${instance.url}`);
console.log('Appuyez sur Ctrl+C pour arrêter.');
if (!args.includes('--no-open')) ouvrirNavigateur(instance.url);

let arretEnCours = false;
const arreter = async () => {
  if (arretEnCours) process.exit(0);
  arretEnCours = true;
  console.log('\nArrêt de la supervision…');
  // Au plus 3 s pour fermer proprement, puis sortie.
  setTimeout(() => process.exit(0), 3000).unref();
  await instance.stop();
  process.exit(0);
};
process.on('SIGINT', arreter);
process.on('SIGTERM', arreter);
