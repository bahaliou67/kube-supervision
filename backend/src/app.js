// Construction de l'application Express. La passerelle Kubernetes est
// injectée : les tests lui substituent un client simulé.
import express from 'express';
import { errorHandler, AppError } from './errors.js';
import { hostGuard } from './security.js';
import { permissionsRouter } from './routes/permissions.js';
import { actionsRouter } from './routes/actions.js';
import { gestionRouter } from './routes/gestion.js';
import { contextsRouter } from './routes/contexts.js';
import { podsRouter } from './routes/pods.js';
import { namespacesRouter } from './routes/namespaces.js';
import { workloadsRouter } from './routes/workloads.js';
import { resourcesRouter } from './routes/resources.js';
import { logsRouter } from './routes/logs.js';
import { streamRouter } from './routes/stream.js';
import { WatchHub } from './kube/namespaceWatcher.js';

// En-têtes de sécurité de la page : pas d'intégration dans un autre site,
// scripts uniquement servis par l'outil, connexions uniquement vers l'outil.
function enTetesSecurite(_req, res, next) {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

export function createApp({ kube, hub = new WatchHub(kube), staticDir = null } = {}) {
  const app = express();
  // Accessible au lanceur pour arrêter proprement les surveillances.
  app.locals.hub = hub;
  app.disable('x-powered-by');
  // Uniquement des connexions locales, sous l'adresse locale (anti DNS rebinding).
  app.use(hostGuard);
  app.use(express.json({ limit: '10kb' }));

  const api = express.Router();
  api.use(contextsRouter(kube));
  api.use(namespacesRouter(kube));
  api.use(permissionsRouter(kube));
  api.use(actionsRouter(kube));
  api.use(gestionRouter(kube));
  api.use(streamRouter(kube, hub));
  api.use(logsRouter(kube));
  api.use(podsRouter(kube));
  api.use(workloadsRouter(kube));
  api.use(resourcesRouter(kube));
  // Route d'API inconnue : erreur au format unique plutôt qu'une page HTML.
  api.use((req, _res, next) => next(new AppError(404, 'INTROUVABLE')));
  app.use('/api', api);

  // Mode production : le backend sert aussi le front compilé, sur le même port.
  if (staticDir) {
    app.use(enTetesSecurite);
    app.use(
      express.static(staticDir, {
        index: 'index.html',
        // Fichiers nommés avec une empreinte (assets/…) : cache long ; la page elle-même : jamais en cache.
        setHeaders: (res, chemin) => {
          res.setHeader('Cache-Control', /[\\/]assets[\\/]/.test(chemin) ? 'public, max-age=31536000, immutable' : 'no-cache');
        },
      }),
    );
  }

  app.use(errorHandler);
  return app;
}
