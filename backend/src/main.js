// Lancement du serveur en ligne de commande (node src/main.js --port 7420).
import { portDepuis, start } from './index.js';

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
