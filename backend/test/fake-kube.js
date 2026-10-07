// Client Kubernetes simulé pour les tests : même interface que KubeGateway.
import { PassThrough } from 'node:stream';
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
//   logs        { 'pod/conteneur': 'texte' } ; logs précédents : clé 'pod/conteneur/precedent'
//   follow      { 'pod/conteneur': ['ligne', …] } : lignes émises par le suivi, puis fin du flux
//   fail(methode, params) → erreur à lever (ou rien)
export function fakeGateway({ pods = {}, resources = {}, namespaces, defaultNs = 'default', contexts, fail, logs = {}, follow = {}, rbac } = {}) {
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
  apis.core.readNamespacedPodLog = async (params) => {
    leve('readNamespacedPodLog', params);
    const cleLog = `${params.name}/${params.container ?? ''}${params.previous ? '/precedent' : ''}`;
    if (!(cleLog in logs)) throw apiException(400, 'container is not valid for pod');
    // Comme le vrai serveur : seules les tailLines dernières lignes sont renvoyées.
    const lignes = logs[cleLog].split('\n').filter(Boolean);
    return `${lignes.slice(-(params.tailLines ?? lignes.length)).join('\n')}\n`;
  };
  apis.openLogStream = async (options) => {
    leve('openLogStream', options);
    const flux = new PassThrough();
    const lignes = follow[`${options.pod}/${options.container}`] ?? [];
    setImmediate(() => {
      for (const l of lignes) flux.write(`${l}\n`);
      flux.end();
    });
    return { stream: flux, abort: () => flux.destroy() };
  };
  // Droits : rbac(attributs) → true/false (tout est permis par défaut).
  apis.authz.createSelfSubjectAccessReview = async (params) => {
    leve('createSelfSubjectAccessReview', params);
    const attrs = params.body.spec.resourceAttributes;
    return { status: { allowed: rbac ? Boolean(rbac(attrs)) : true } };
  };
  // Actions : patch et suppression, mémorisés dans appels (avec leur corps).
  for (const m of ['patchNamespacedDeployment', 'patchNamespacedStatefulSet', 'patchNamespacedDaemonSet', 'patchNamespacedDeploymentScale', 'patchNamespacedStatefulSetScale']) {
    apis.apps[m] = async (params, options) => {
      leve(m, params);
      appels.at(-1).options = options;
      return { spec: params.body.spec };
    };
  }
  apis.core.deleteNamespacedPod = async (params) => {
    leve('deleteNamespacedPod', params);
    return {};
  };
  // Watch simulé : chaque appel est mémorisé, le test émet les événements
  // (w.cb('ADDED', objet)) et termine le watch (w.done(erreur ou null)).
  const watches = [];
  apis.watch = {
    async watch(path, params, cb, done) {
      leve('watch', { path, ...params });
      const ctrl = new AbortController();
      const w = { path, params, cb, done, ctrl, aborted: false };
      ctrl.signal.addEventListener('abort', () => {
        w.aborted = true;
      });
      watches.push(w);
      return ctrl;
    },
  };
  apis.core.listNamespace = async () => {
    leve('listNamespace');
    const noms = namespaces ?? Object.keys(store.pods);
    return { items: noms.map((name) => ({ metadata: { name }, status: { phase: 'Active' } })) };
  };

  return {
    appels,
    store,
    watches,
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
