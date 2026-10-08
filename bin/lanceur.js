// Logique commune des deux lanceurs : `npx kube-supervision` (bin/kube-supervision.js)
// et l'exécutable autonome (packaging/entree-executable.js).
//
// Démarre le backend sur 127.0.0.1, sert le front compilé sur le même port,
// puis ouvre le navigateur. Ctrl+C arrête proprement l'outil.
//
// Pas d'`await` de premier niveau ni d'`import.meta` ici : ce fichier est aussi
// regroupé en CommonJS pour l'exécutable autonome.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { portDepuis, start } from '../backend/src/index.js';

function aide(version, commande) {
  return `Supervision Kubernetes ${version}

Voir l'état d'un cluster Kubernetes et diagnostiquer un problème depuis le navigateur.
Le kubeconfig de la machine est utilisé (variable KUBECONFIG, sinon ~/.kube/config).

Utilisation :
  ${commande} [options]

Options :
  --port <n>    Port d'écoute local (défaut : 7420, ou variable KUBE_SUPERVISION_PORT)
  --no-open     Ne pas ouvrir le navigateur automatiquement
  --version     Afficher la version
  --help        Afficher cette aide

L'outil n'écoute que sur 127.0.0.1 : il n'est pas accessible depuis une autre machine.
`;
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

/**
 * Options et aide traitées sans rien démarrer. Renvoie true si le programme doit s'arrêter là.
 * Séparé de `lancer` pour que l'exécutable réponde à --version sans extraire le front.
 */
export function traiterOptionsSimples({ version, commande, args }) {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(aide(version, commande));
    return true;
  }
  if (args.includes('--version') || args.includes('-v')) {
    process.stdout.write(`${version}\n`);
    return true;
  }
  const inconnues = args.filter((a, i) => a.startsWith('-') && !['--port', '--no-open'].includes(a.split('=')[0]) && args[i - 1] !== '--port');
  if (inconnues.length) {
    console.error(`Option inconnue : ${inconnues.join(', ')}\n`);
    process.stdout.write(aide(version, commande));
    process.exitCode = 1;
    return true;
  }
  return false;
}

export async function lancer({ version, commande, dossierFront, args }) {
  if (!existsSync(join(dossierFront, 'index.html'))) {
    console.error("Le front n'est pas compilé (frontend/dist absent). Depuis les sources, lancez d'abord : npm run build");
    process.exit(1);
  }

  // Erreur imprévue : journalisée, sans arrêter l'outil ni afficher de donnée sensible.
  process.on('uncaughtException', (err) => console.error(`[erreur non gérée] ${err?.name ?? ''} ${err?.message ?? err}`));
  process.on('unhandledRejection', (err) => console.error(`[promesse rejetée] ${err?.name ?? ''} ${err?.message ?? err}`));

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
      console.error(`Fermez-la, ou choisissez un autre port : ${commande} --port ${port + 1}`);
    } else {
      console.error(`Démarrage impossible : ${err.message}`);
    }
    process.exit(1);
  }

  console.log(`Supervision Kubernetes ${version} est prête : ${instance.url}`);
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
}
