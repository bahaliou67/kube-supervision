// Construction de l'application Express. La passerelle Kubernetes est
// injectée : les tests lui substituent un client simulé.
import express from 'express';
import { errorHandler, AppError } from './errors.js';
import { hostGuard } from './security.js';
import { permissionsRouter } from './routes/permissions.js';
import { actionsRouter } from './routes/actions.js';
import { contextsRouter } from './routes/contexts.js';
import { podsRouter } from './routes/pods.js';
import { namespacesRouter } from './routes/namespaces.js';
import { workloadsRouter } from './routes/workloads.js';
import { logsRouter } from './routes/logs.js';
import { streamRouter } from './routes/stream.js';
import { WatchHub } from './kube/namespaceWatcher.js';

export function createApp({ kube, hub = new WatchHub(kube), staticDir = null } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Uniquement des connexions locales, sous l'adresse locale (anti DNS rebinding).
  app.use(hostGuard);
  app.use(express.json({ limit: '10kb' }));

  const api = express.Router();
  api.use(contextsRouter(kube));
  api.use(namespacesRouter(kube));
  api.use(permissionsRouter(kube));
  api.use(actionsRouter(kube));
  api.use(streamRouter(kube, hub));
  api.use(logsRouter(kube));
  api.use(podsRouter(kube));
  api.use(workloadsRouter(kube));
  // Route d'API inconnue : erreur au format unique plutôt qu'une page HTML.
  api.use((req, _res, next) => next(new AppError(404, 'INTROUVABLE')));
  app.use('/api', api);

  if (staticDir) {
    app.use(express.static(staticDir));
  }

  app.use(errorHandler);
  return app;
}
