// Cas limites que le cluster de démonstration ne permet pas de vérifier :
// accès refusé (403), cluster injoignable, délai dépassé, jeton expiré,
// liste de 500 Pods, Pod à plusieurs conteneurs, namespace vide.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { setDefaultTimeout } from '../src/errors.js';
import { mapPod } from '../src/mappers/pod.js';
import { apiException, fakeGateway, networkError, pod } from './fake-kube.js';

const app = (opts) => createApp({ kube: fakeGateway({ defaultNs: 'ns', ...opts }) });

// Routes de lecture : toutes doivent répondre au format d'erreur unique.
const LECTURES = ['/api/namespaces', '/api/pods', '/api/workloads', '/api/permissions', '/api/pods/web/logs?container=app', '/api/pods/web'];

// Vérifie le format unique : { error: { code, message } } en français.
function formatErreur(res, statut, code) {
  assert.equal(res.status, statut, `${res.req.path} → ${res.status}`);
  assert.equal(res.body.error.code, code, res.req.path);
  assert.equal(typeof res.body.error.message, 'string');
  assert.ok(res.body.error.message.length > 10);
  assert.match(res.headers['content-type'], /json/);
}

// ---------- Accès refusé (403) ----------

test('403 : liste des Pods interdite → ACCES_REFUSE (état normal, pas une panne)', async () => {
  const res = await request(app({ fail: (m) => m === 'listNamespacedPod' && apiException(403, 'pods is forbidden') })).get('/api/pods');
  formatErreur(res, 403, 'ACCES_REFUSE');
});

test('403 : lecture seule — tout se lit, les actions sont signalées interdites', async () => {
  const lectureSeule = (a) => ['get', 'list', 'watch'].includes(a.verb);
  const a = app({ pods: { ns: [pod('web')] }, logs: { 'web/app': '2026-10-07T10:00:00Z ok' }, rbac: lectureSeule });
  assert.equal((await request(a).get('/api/pods')).status, 200);
  assert.equal((await request(a).get('/api/pods/web/logs?container=app')).status, 200);
  const droits = (await request(a).get('/api/permissions')).body.checks;
  assert.equal(droits['pods.delete'].allowed, false);
  assert.equal(droits['deployments.restart'].allowed, false);
  assert.equal(droits['deployments.scale'].allowed, false);
});

test('403 : accès limité à certains types — le reste reste visible', async () => {
  const res = await request(
    app({ fail: (m) => ['listNamespacedDeployment', 'listNamespacedStatefulSet'].includes(m) && apiException(403) }),
  ).get('/api/workloads');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.forbidden.sort(), ['deployments', 'statefulsets']);
});

test('403 : namespaces non listables → saisie manuelle possible, sans erreur', async () => {
  const res = await request(app({ fail: (m) => m === 'listNamespace' && apiException(403) })).get('/api/namespaces');
  assert.equal(res.status, 200);
  assert.equal(res.body.listable, false);
});

// ---------- Cluster injoignable, délai dépassé, jeton expiré ----------

test('cluster injoignable : chaque route renvoie 503 CLUSTER_INJOIGNABLE', async () => {
  const a = app({ fail: () => networkError('ECONNREFUSED') });
  for (const url of LECTURES) formatErreur(await request(a).get(url), 503, 'CLUSTER_INJOIGNABLE');
});

test('nom de serveur introuvable (DNS) : 503 CLUSTER_INJOIGNABLE', async () => {
  formatErreur(await request(app({ fail: () => networkError('ENOTFOUND') })).get('/api/pods'), 503, 'CLUSTER_INJOIGNABLE');
});

test('délai dépassé : 504 DELAI_DEPASSE (le cluster ne répond jamais)', async () => {
  setDefaultTimeout(50);
  try {
    const kube = fakeGateway({ defaultNs: 'ns' });
    kube.clients().core.listNamespacedPod = () => new Promise(() => {});
    formatErreur(await request(createApp({ kube })).get('/api/pods'), 504, 'DELAI_DEPASSE');
  } finally {
    setDefaultTimeout(15000);
  }
});

test('jeton expiré (401) : chaque route renvoie NON_AUTHENTIFIE', async () => {
  const a = app({ fail: () => apiException(401, 'Unauthorized') });
  for (const url of LECTURES) formatErreur(await request(a).get(url), 401, 'NON_AUTHENTIFIE');
});

test('plugin d’authentification en échec (exec) : AUTH_EXTERNE_ECHEC avec son message', async () => {
  const res = await request(app({ fail: () => new Error('exec: executable gke-gcloud-auth-plugin not found') })).get('/api/pods');
  formatErreur(res, 401, 'AUTH_EXTERNE_ECHEC');
  assert.match(res.body.error.message, /gke-gcloud-auth-plugin/);
});

test('erreur imprévue : 500 ERREUR_INTERNE au format unique, sans pile technique', async () => {
  const res = await request(app({ fail: () => new TypeError('x is undefined') })).get('/api/pods');
  formatErreur(res, 500, 'ERREUR_INTERNE');
  assert.doesNotMatch(JSON.stringify(res.body), /TypeError|undefined|at /);
});

// ---------- Volume : 500 Pods ----------

function beaucoupDePods(n) {
  return Array.from({ length: n }, (_, i) =>
    pod(`charge-${String(i).padStart(4, '0')}-au-nom-tres-long-genere-automatiquement-abcde`, {
      metadata: { ownerReferences: [{ kind: 'ReplicaSet', name: `charge-${i % 20}-rs`, controller: true }] },
    }),
  );
}

test('500 Pods : liste complète, rapide, lue par pages', async () => {
  const kube = fakeGateway({ defaultNs: 'ns', pods: { ns: beaucoupDePods(500) } });
  const t0 = Date.now();
  const res = await request(createApp({ kube })).get('/api/pods');
  assert.equal(res.status, 200);
  assert.equal(res.body.items.length, 500);
  assert.ok(Date.now() - t0 < 2000, `réponse en ${Date.now() - t0} ms`);
  assert.ok(kube.appels.some((a) => a.methode === 'listNamespacedPod' && a.params.limit === 500), 'liste paginée');
});

test('1200 Pods : toutes les pages sont lues (jeton _continue)', async () => {
  const kube = fakeGateway({ defaultNs: 'ns', pods: { ns: beaucoupDePods(1200) } });
  const res = await request(createApp({ kube })).get('/api/pods');
  assert.equal(res.body.items.length, 1200);
  assert.equal(kube.appels.filter((a) => a.methode === 'listNamespacedPod').length, 3);
});

test('500 Pods : calcul des statuts rapide (moins de 200 ms)', () => {
  const pods = beaucoupDePods(500);
  const t0 = performance.now();
  for (const p of pods) mapPod(p);
  assert.ok(performance.now() - t0 < 200);
});

// ---------- Pod à plusieurs conteneurs ----------

test('Pod à plusieurs conteneurs dans la liste : prêts « 1/2 », redémarrages additionnés, conteneur en cause', async () => {
  const p = pod('multi', {
    spec: { containers: [{ name: 'app', image: 'app:1' }, { name: 'proxy', image: 'envoy:1' }] },
    status: {
      phase: 'Running',
      containerStatuses: [
        { name: 'app', ready: true, restartCount: 1, state: { running: {} } },
        { name: 'proxy', ready: false, restartCount: 4, state: { waiting: { reason: 'CrashLoopBackOff' } }, lastState: { terminated: { reason: 'Error', exitCode: 1 } } },
      ],
    },
  });
  const res = await request(app({ pods: { ns: [p] } })).get('/api/pods');
  const m = res.body.items[0];
  assert.equal(m.ready, '1/2');
  assert.equal(m.restarts, 5);
  assert.equal(m.status, 'CrashLoopBackOff');
  assert.equal(m.statusContainer, 'proxy');
  assert.equal(m.lastTermination.container, 'proxy');
});

test('Pod bloqué par un init container : statut Init:… et conteneur en cause', async () => {
  const p = pod('init', {
    spec: { initContainers: [{ name: 'migrations', image: 'm:1' }], containers: [{ name: 'app', image: 'a:1' }] },
    status: {
      phase: 'Pending',
      initContainerStatuses: [{ name: 'migrations', ready: false, restartCount: 0, state: { waiting: { reason: 'ImagePullBackOff', message: 'Back-off pulling image' } } }],
      containerStatuses: [{ name: 'app', ready: false, restartCount: 0, state: { waiting: { reason: 'PodInitializing' } } }],
    },
  });
  const m = (await request(app({ pods: { ns: [p] } })).get('/api/pods')).body.items[0];
  assert.equal(m.status, 'Init:ImagePullBackOff');
  assert.equal(m.category, 'erreur');
  assert.equal(m.statusContainer, 'migrations');
  assert.equal(m.statusContainerInit, true);
});

// ---------- Namespace vide ----------

test('namespace vide : listes vides, réponses 200', async () => {
  const a = app({ pods: { vide: [] }, defaultNs: 'vide' });
  const pods = await request(a).get('/api/pods?ns=vide');
  assert.equal(pods.status, 200);
  assert.deepEqual(pods.body.items, []);
  const charges = await request(a).get('/api/workloads?ns=vide');
  assert.equal(charges.status, 200);
  assert.deepEqual(charges.body.items, []);
  assert.deepEqual(charges.body.forbidden, []);
});

// ---------- Paramètres invalides ----------

test('namespace et contexte invalides : 400 sans appel au cluster', async () => {
  const kube = fakeGateway({ defaultNs: 'ns' });
  const a = createApp({ kube });
  formatErreur(await request(a).get('/api/pods?ns=Pas_Valide'), 400, 'PARAMETRE_INVALIDE');
  formatErreur(await request(a).get('/api/pods?ctx=inconnu'), 400, 'CONTEXTE_INCONNU');
  assert.equal(kube.appels.length, 0);
});

test('route inconnue : 404 au format unique', async () => {
  formatErreur(await request(app()).get('/api/nexiste-pas'), 404, 'INTROUVABLE');
});

after(() => setDefaultTimeout(15000));
