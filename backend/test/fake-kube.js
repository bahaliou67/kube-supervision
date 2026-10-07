// Client Kubernetes simulé pour les tests : même interface que KubeGateway.
import { AppError } from '../src/errors.js';
import { RESSOURCES } from '../src/kube/namespaceData.js';

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

// Erreur réseau telle que la lève undici quand le cluster ne répond pas.
export function networkError(code = 'ECONNREFUSED') {
  return Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(code), { code }) });
}

// options :
//   pods        { ns: [Pod] }                     (raccourci pour resources.pods)
//   resources   { type: { ns: [objet] } }         (types de RESSOURCES : deployments, jobs…)
//   namespaces  [noms]                             (par défaut : namespaces présents dans pods)
//   defaultNs, contexts
//   fail(methode, params) → erreur à lever (ou rien)
export function fakeGateway({ pods = {}, resources = {}, namespaces, defaultNs = 'default', contexts, fail } = {}) {
  const ctxs = contexts ?? [{ name: 'test', cluster: 'test', namespace: defaultNs }];
  const store = { ...resources, pods: { ...(resources.pods ?? {}), ...pods } };
  const appels = [];
  const leve = (methode, params) => {
    appels.push({ methode, params });
    const e = fail?.(methode, params);
    if (e) throw e;
  };

  const apis = { core: {}, apps: {}, batch: {}, authz: {} };
  for (const [type, { api, list }] of Object.entries(RESSOURCES)) {
    apis[api][list] = async (params) => {
      leve(list, params);
      let items = store[type]?.[params.namespace] ?? [];
      // fieldSelector simplifié : involvedObject.name=… (événements d'un objet).
      const nom = /involvedObject.name=([^,]+)/.exec(params.fieldSelector ?? '')?.[1];
      if (nom) items = items.filter((e) => e.involvedObject?.name === nom);
      return { metadata: { resourceVersion: '1' }, items };
    };
    // Lecture d'un objet par son nom : readNamespacedPod, readNamespacedDeployment…
    const read = list.replace('list', 'read');
    apis[api][read] = async (params) => {
      leve(read, params);
      const obj = (store[type]?.[params.namespace] ?? []).find((o) => o.metadata?.name === params.name);
      if (!obj) throw apiException(404, 'not found');
      return obj;
    };
  }
  apis.core.listNamespace = async () => {
    leve('listNamespace');
    const noms = namespaces ?? Object.keys(store.pods);
    return { items: noms.map((name) => ({ metadata: { name }, status: { phase: 'Active' } })) };
  };

  return {
    appels,
    store,
    listContexts: () => ({ contexts: ctxs, current: ctxs[0].name }),
    resolveContext(ctx) {
      const c = ctxs.find((x) => x.name === (ctx || ctxs[0].name));
      if (!c) throw new AppError(400, 'CONTEXTE_INCONNU', { ctx });
      return c;
    },
    defaultNamespace(ctx) {
      return this.resolveContext(ctx).namespace || 'default';
    },
    clients: () => apis,
  };
}
