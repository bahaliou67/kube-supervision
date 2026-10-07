// Lancement du serveur en ligne de commande (node src/main.js --port 7420).
import { portDepuis, start } from './index.js';

// Filet de sécurité : une erreur imprévue (flux interrompu, bibliothèque)
// est journalisée sans arrêter l'outil. Le message ne contient jamais de
// données d'authentification.
process.on('uncaughtException', (err) => console.error(`[erreur non gérée] ${err?.name ?? ''} ${err?.message ?? err}`));
process.on('unhandledRejection', (err) => console.error(`[promesse rejetée] ${err?.name ?? ''} ${err?.message ?? err}`));

let port;
try {
  port = portDepuis(process.argv.slice(2), process.env);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
start({ port })
  .then(({ url }) => console.log(`API de supervision à l'écoute sur ${url}`))
  .catch((err) => {
    console.error(err.code === 'EADDRINUSE' ? `Le port ${port} est déjà utilisé. Choisissez-en un autre avec --port.` : err.message);
    process.exit(1);
  });
