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

export function start({ port, staticDir = null } = {}) {
  const kube = new KubeGateway();
  const app = createApp({ kube, staticDir });
  return new Promise((resolve, reject) => {
    const server = app.listen(port, HOTE, () => resolve({ server, url: `http://${HOTE}:${port}` }));
    server.on('error', reject);
  });
}
