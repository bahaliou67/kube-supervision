// Client Kubernetes simulé pour les tests : même interface que KubeGateway.
import { AppError } from '../src/errors.js';

// Construit un Pod minimal « Running et prêt ».
export function pod(name, extra = {}) {
  return {
    metadata: { name, namespace: 'ns', uid: `uid-${name}`, creationTimestamp: new Date(Date.now() - 3600e3), ...extra.metadata },
    spec: { nodeName: 'noeud-1', containers: [{ name: 'app', image: 'app:1' }], ...extra.spec },
    status: {
      phase: 'Running',
      containerStatuses: [{ name: 'app', ready: true, restartCount: 0, state: { running: { startedAt: new Date() } } }],
      ...extra.status,
    },
  };
}

// Erreur telle que la lève @kubernetes/client-node (ApiException).
export function apiException(code, message = '') {
  const e = new Error(`HTTP-Code: ${code}`);
  e.code = code;
  e.body = { message };
  return e;
}

// options : pods { ns: [Pod] }, defaultNs, contexts, fail(nomMethode) → erreur à lever
export function fakeGateway({ pods = {}, defaultNs = 'default', contexts, fail } = {}) {
  const ctxs = contexts ?? [{ name: 'test', cluster: 'test', namespace: defaultNs }];
  const leve = (methode) => {
    const e = fail?.(methode);
    if (e) throw e;
  };
  const core = {
    async listNamespacedPod({ namespace }) {
      leve('listNamespacedPod');
      return { items: pods[namespace] ?? [] };
    },
  };
  return {
    listContexts: () => ({ contexts: ctxs, current: ctxs[0].name }),
    resolveContext(ctx) {
      const c = ctxs.find((x) => x.name === (ctx || ctxs[0].name));
      if (!c) throw new AppError(400, 'CONTEXTE_INCONNU', { ctx });
      return c;
    },
    defaultNamespace(ctx) {
      return this.resolveContext(ctx).namespace || 'default';
    },
    clients: () => ({ core }),
  };
}
