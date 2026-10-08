// Construit l'exécutable autonome de la plateforme courante (Node SEA) :
//   npm run build:exe  →  build-exe/kube-supervision-<win|macos|linux>-<x64|arm64>[.exe]
//
// Étapes : compilation du front, regroupement du lanceur et du backend en un fichier
// CommonJS (esbuild), préparation du blob SEA avec le front en « assets », injection
// du blob dans une copie du binaire Node qui exécute ce script.
// https://nodejs.org/api/single-executable-applications.html
import { execFileSync, execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import postject from 'postject';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const sortie = join(racine, 'build-exe');
const pkg = JSON.parse(readFileSync(join(racine, 'package.json'), 'utf8'));
const windows = process.platform === 'win32';
const macos = process.platform === 'darwin';

const nomOs = { win32: 'win', darwin: 'macos', linux: 'linux' }[process.platform];
if (!nomOs) throw new Error(`Plateforme non prise en charge : ${process.platform}`);
const nomFichier = `kube-supervision-${nomOs}-${process.arch}${windows ? '.exe' : ''}`;
const executable = join(sortie, nomFichier);

function executer(commande, args) {
  console.log(`> ${commande} ${args.join(' ')}`);
  execFileSync(commande, args, { cwd: racine, stdio: 'inherit' });
}

function lister(dossier) {
  return readdirSync(dossier, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dossier, join(e.parentPath, e.name)).split('\\').join('/'));
}

rmSync(sortie, { recursive: true, force: true });
mkdirSync(sortie, { recursive: true });

// 1. Front compilé.
// Commande en une chaîne : passe par le shell, nécessaire pour trouver npm.cmd sous Windows.
execSync('npm run build', { cwd: racine, stdio: 'inherit' });

// 2. Un seul fichier CommonJS : lanceur, backend et dépendances.
await build({
  entryPoints: [join(racine, 'packaging', 'entree-executable.js')],
  outfile: join(sortie, 'bundle.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  define: { __VERSION__: JSON.stringify(pkg.version) },
  // Dépendances facultatives de `ws`, chargées seulement si elles sont installées.
  external: ['bufferutil', 'utf-8-validate'],
  logLevel: 'warning',
});

// 3. Configuration SEA : le front est embarqué fichier par fichier, avec sa liste.
const dossierFront = join(racine, 'frontend', 'dist');
const fichiersFront = lister(dossierFront);
writeFileSync(join(sortie, 'manifeste.json'), JSON.stringify(fichiersFront));
const assets = { 'manifeste.json': join(sortie, 'manifeste.json') };
for (const chemin of fichiersFront) assets[`front/${chemin}`] = join(dossierFront, chemin);
writeFileSync(
  join(sortie, 'sea-config.json'),
  JSON.stringify(
    {
      main: join(sortie, 'bundle.cjs'),
      output: join(sortie, 'sea-prep.blob'),
      disableExperimentalSEAWarning: true,
      assets,
    },
    null,
    2,
  ),
);
executer(process.execPath, ['--experimental-sea-config', join(sortie, 'sea-config.json')]);

// 4. Copie du binaire Node et injection du blob.
copyFileSync(process.execPath, executable);
if (macos) executer('codesign', ['--remove-signature', executable]);
// Sous Windows, postject signale une signature corrompue : attendu, l'exécutable n'est pas signé.
await postject.inject(executable, 'NODE_SEA_BLOB', readFileSync(join(sortie, 'sea-prep.blob')), {
  sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ...(macos ? { machoSegmentName: 'NODE_SEA' } : {}),
});
if (macos) executer('codesign', ['--sign', '-', executable]);

for (const f of ['bundle.cjs', 'manifeste.json', 'sea-config.json', 'sea-prep.blob']) rmSync(join(sortie, f));
console.log(`\nExécutable prêt : ${relative(racine, executable)}`);
