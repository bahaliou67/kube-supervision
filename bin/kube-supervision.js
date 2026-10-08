#!/usr/bin/env node
// Lanceur de l'outil : `npx kube-supervision`.
//
// Options :
//   --port <n>    port d'écoute (sinon variable KUBE_SUPERVISION_PORT, sinon 7420)
//   --no-open     ne pas ouvrir le navigateur
//   --help        aide
//   --version     version
//
// La logique commune avec l'exécutable autonome est dans lanceur.js.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(racine, 'package.json'), 'utf8'));
const args = process.argv.slice(2);

// Version de Node : les dépendances (client Kubernetes, undici) exigent Node 22.19 ou plus.
// Vérifiée avant de charger le lanceur, qui importe ces dépendances.
const [majeur, mineur] = process.versions.node.split('.').map(Number);
if (majeur < 22 || (majeur === 22 && mineur < 19)) {
  console.error(`Node.js ${process.versions.node} est trop ancien : la version 22.19 ou plus récente est nécessaire.`);
  console.error('Téléchargez la version LTS sur https://nodejs.org puis relancez la commande.');
  process.exit(1);
}

const { lancer, traiterOptionsSimples } = await import('./lanceur.js');
const options = { version: pkg.version, commande: 'npx kube-supervision', args };
if (!traiterOptionsSimples(options)) {
  await lancer({ ...options, dossierFront: join(racine, 'frontend', 'dist') });
}
