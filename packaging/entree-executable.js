// Point d'entrée de l'exécutable autonome (Node SEA), regroupé par esbuild
// avec le backend dans un seul fichier CommonJS.
//
// Le front compilé est embarqué dans l'exécutable (« assets » SEA) : au démarrage,
// il est extrait dans un dossier temporaire propre à la version, puis servi
// comme avec `npx`. Le dossier est réutilisé aux lancements suivants.
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { getAsset } from 'node:sea';
import { lancer, traiterOptionsSimples } from '../bin/lanceur.js';

// Remplacée à la construction (esbuild `define`).
const version = __VERSION__;

function extraireFront() {
  const dossier = join(tmpdir(), `kube-supervision-${version}`);
  // Marqueur écrit en dernier : sa présence garantit une extraction complète.
  if (existsSync(join(dossier, '.complet'))) return dossier;

  const temporaire = `${dossier}-${process.pid}`;
  rmSync(temporaire, { recursive: true, force: true });
  const fichiers = JSON.parse(getAsset('manifeste.json', 'utf8'));
  for (const chemin of fichiers) {
    const cible = join(temporaire, chemin);
    mkdirSync(dirname(cible), { recursive: true });
    writeFileSync(cible, new Uint8Array(getAsset(`front/${chemin}`)));
  }
  writeFileSync(join(temporaire, '.complet'), version);

  try {
    rmSync(dossier, { recursive: true, force: true });
    renameSync(temporaire, dossier);
    return dossier;
  } catch {
    // Une autre instance a extrait le front en même temps : on garde la copie temporaire.
    return temporaire;
  }
}

const args = process.argv.slice(2);
const options = { version, commande: 'kube-supervision', args };
if (!traiterOptionsSimples(options)) {
  lancer({ ...options, dossierFront: extraireFront() });
}
