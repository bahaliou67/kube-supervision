// Point d'entrée du serveur : écoute uniquement sur 127.0.0.1.
// Port : option --port, sinon variable KUBE_SUPERVISION_PORT, sinon 7420.
import { createApp } from './app.js';
import { KubeGateway } from './kube/gateway.js';

export const HOTE = '127.0.0.1';
export const PORT_PAR_DEFAUT = 7420;

// Lit --port <n> ou --port=<n> dans les arguments.
export function portDepuis(argv, env) {
  const i = argv.findIndex((a) => a === '--port' || a.startsWith('--port='));
  const brut = i === -1 ? env.KUBE_SUPERVISION_PORT : argv[i].includes('=') ? argv[i].split('=')[1] : argv[i + 1];
  if (brut === undefined || brut === '') return PORT_PAR_DEFAUT;
  const port = Number(brut);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Port invalide : ${brut}`);
  }
  return port;
}

// Démarre le serveur. Refuse de démarrer si le port est déjà pris
// (EADDRINUSE) plutôt que de cohabiter avec une autre instance.
export function start({ port, staticDir = null } = {}) {
  const kube = new KubeGateway();
  const app = createApp({ kube, staticDir });
  return new Promise((resolve, reject) => {
    // Express 5 appelle ce rappel aussi en cas d'échec (port occupé…), avec l'erreur en argument.
    const server = app.listen(port, HOTE, (erreur) => {
      if (erreur) {
        reject(erreur);
        return;
      }
      resolve({
        server,
        url: `http://${HOTE}:${port}`,
        // Arrêt propre : surveillances coupées, connexions fermées.
        stop: () =>
          new Promise((fin) => {
            app.locals.hub.stopAll();
            server.closeAllConnections?.();
            server.close(() => fin());
          }),
      });
    });
    server.on('error', reject);
  });
}
