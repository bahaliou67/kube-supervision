// Tests du temps réel : surveillance d'un namespace (watch) et flux SSE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { NamespaceWatcher, WatchHub } from '../src/kube/namespaceWatcher.js';
import { apiException, fakeGateway, networkError, pod } from './fake-kube.js';

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
// Attend qu'une condition devienne vraie (sans dépendre d'un délai fixe).
async function quand(cond, maxMs = 3000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > maxMs) throw new Error('condition non atteinte');
    await attendre(5);
  }
}
const watchDe = (kube, type) => kube.watches.filter((w) => w.path.endsWith(`/${type}`) && !w.aborted).at(-1);
const avecVersion = (p, rv) => ({ ...p, metadata: { ...p.metadata, resourceVersion: rv } });

function watcher(kube) {
  return new NamespaceWatcher(kube.clients(), 'ns', { delaiMin: 0.01, delaiMax: 0.02 }).start();
}

test('liste initiale puis ajouts, modifications et suppressions reçus par le watch', async () => {
  const kube = fakeGateway({ pods: { ns: [pod('a')] } });
  const w = watcher(kube);
  await quand(() => w.ready && watchDe(kube, 'pods'));
  assert.deepEqual(w.list('pods').map((p) => p.metadata.name), ['a']);
  const ww = watchDe(kube, 'pods');
  assert.equal(ww.params.resourceVersion, '1');
  ww.cb('ADDED', avecVersion(pod('b'), '5'));
  ww.cb('MODIFIED', avecVersion({ ...pod('a'), status: { phase: 'Failed' } }, '6'));
  ww.cb('DELETED', avecVersion(pod('b'), '7'));
  assert.deepEqual(w.list('pods').map((p) => [p.metadata.name, p.status.phase]), [['a', 'Failed']]);
  w.stop();
});

test('fin normale du watch : reprise à la dernière version connue', async () => {
  const kube = fakeGateway({ pods: { ns: [pod('a')] } });
  const w = watcher(kube);
  await quand(() => watchDe(kube, 'pods'));
  const premier = watchDe(kube, 'pods');
  premier.cb('MODIFIED', avecVersion(pod('a'), '42'));
  premier.done(null);
  // Un watch fermé aussitôt ouvert n'est relancé qu'après 1 s (pas de boucle).
  await quand(() => watchDe(kube, 'pods') !== premier, 3000);
  assert.equal(watchDe(kube, 'pods').params.resourceVersion, '42');
  w.stop();
});

test('version expirée (410 Gone) : la liste est relue', async () => {
  const kube = fakeGateway({ pods: { ns: [pod('a')] } });
  const w = watcher(kube);
  await quand(() => watchDe(kube, 'pods'));
  const listesAvant = kube.appels.filter((a) => a.methode === 'listNamespacedPod').length;
  kube.store.pods.ns.push(pod('c'));
  watchDe(kube, 'pods').cb('ERROR', { kind: 'Status', code: 410, message: 'too old resource version' });
  await quand(() => kube.appels.filter((a) => a.methode === 'listNamespacedPod').length > listesAvant);
  await quand(() => w.list('pods').length === 2);
  w.stop();
});

test('cluster injoignable : santé dégradée, nouvelles tentatives, puis rétablissement', async () => {
  let panne = true;
  const kube = fakeGateway({ pods: { ns: [pod('a')] }, fail: (m) => panne && m.startsWith('list') && networkError() });
  const w = watcher(kube);
  const santes = [];
  w.on('health', (h) => santes.push(h));
  await quand(() => santes.length > 0);
  assert.equal(w.health().ok, false);
  assert.equal(w.health().code, 'CLUSTER_INJOIGNABLE');
  assert.ok(w.health().retryAt > Date.now() - 1000);
  panne = false;
  await quand(() => w.health().ok);
  assert.deepEqual(w.list('pods').map((p) => p.metadata.name), ['a']);
  assert.equal(santes.at(-1).ok, true);
  w.stop();
});

test('jeton expiré : santé dégradée avec le code NON_AUTHENTIFIE', async () => {
  const kube = fakeGateway({ pods: { ns: [] }, fail: (m) => m === 'listNamespacedPod' && apiException(401) });
  const w = watcher(kube);
  await quand(() => !w.health().ok);
  assert.equal(w.health().code, 'NON_AUTHENTIFIE');
  w.stop();
});

test('watch coupé par une erreur réseau : relance après délai', async () => {
  const kube = fakeGateway({ pods: { ns: [pod('a')] } });
  const w = watcher(kube);
  await quand(() => watchDe(kube, 'pods'));
  const premier = watchDe(kube, 'pods');
  premier.done(networkError('ECONNRESET'));
  await quand(() => watchDe(kube, 'pods') && watchDe(kube, 'pods') !== premier);
  await quand(() => w.health().ok);
  w.stop();
});

test('type interdit (403) : signalé, sans watch ni nouvelle tentative', async () => {
  const kube = fakeGateway({ pods: { ns: [] }, fail: (m) => m === 'listNamespacedCronJob' && apiException(403) });
  const w = watcher(kube);
  await quand(() => w.ready);
  assert.deepEqual(w.forbidden(), ['cronjobs']);
  assert.equal(w.list('cronjobs'), null);
  assert.equal(watchDe(kube, 'cronjobs'), undefined);
  assert.equal(w.health().ok, true);
  w.stop();
});

test('un seul watcher par namespace, arrêté après le départ du dernier abonné', async () => {
  const kube = fakeGateway({ pods: { ns: [] } });
  const hub = new WatchHub(kube, { arretApresMs: 20 });
  const a = hub.subscribe('test', 'ns');
  const b = hub.subscribe('test', 'ns');
  assert.equal(a.watcher, b.watcher);
  a.unsubscribe();
  b.unsubscribe();
  await attendre(60);
  assert.equal(hub.entrees.size, 0);
  assert.equal(a.watcher.arrete, true);
});

// Lit les événements SSE d'une réponse HTTP.
function lireSse(res, surEvenement) {
  let tampon = '';
  res.on('data', (d) => {
    tampon += d;
    const blocs = tampon.split('\n\n');
    tampon = blocs.pop();
    for (const b of blocs) {
      const type = /^event: (.+)$/m.exec(b)?.[1];
      const data = /^data: (.+)$/m.exec(b)?.[1];
      if (type) surEvenement(type, JSON.parse(data));
    }
  });
}

async function ouvrirFlux(kube) {
  const hub = new WatchHub(kube, { arretApresMs: 10 });
  const serveur = createApp({ kube, hub }).listen(0, '127.0.0.1');
  await new Promise((r) => serveur.once('listening', r));
  const recus = [];
  let entetes = null;
  const req = http.get(`http://127.0.0.1:${serveur.address().port}/api/stream`, (res) => {
    entetes = res.headers;
    lireSse(res, (type, data) => recus.push({ type, data }));
  });
  return {
    recus,
    entetes: () => entetes,
    fermer: () => {
      req.destroy();
      serveur.close();
      hub.stopAll();
    },
  };
}

test('flux /api/stream : état complet puis différences', async () => {
  const kube = fakeGateway({ pods: { ns: [pod('a'), pod('b')] }, defaultNs: 'ns' });
  const flux = await ouvrirFlux(kube);
  try {
    await quand(() => flux.recus.some((e) => e.type === 'snapshot'));
    assert.match(flux.entetes()['content-type'], /text\/event-stream/);
    const instantane = flux.recus.find((e) => e.type === 'snapshot').data;
    assert.deepEqual(instantane.pods.map((p) => p.name).sort(), ['a', 'b']);
    assert.equal(instantane.health.ok, true);

    const ww = watchDe(kube, 'pods');
    const plante = pod('a', {
      status: { phase: 'Running', containerStatuses: [{ name: 'app', ready: false, restartCount: 3, state: { waiting: { reason: 'CrashLoopBackOff' } } }] },
    });
    ww.cb('MODIFIED', plante);
    ww.cb('DELETED', pod('b'));
    await quand(() => flux.recus.some((e) => e.type === 'changes'));
    const ch = flux.recus.find((e) => e.type === 'changes').data;
    assert.deepEqual(ch.pods.upsert.map((p) => [p.name, p.status]), [['a', 'CrashLoopBackOff']]);
    assert.deepEqual(ch.pods.remove, ['uid-b']);
    assert.deepEqual(ch.touched.sort(), ['a', 'b']);
  } finally {
    flux.fermer();
  }
});

test('flux /api/stream : un Pod dont seul le numéro de version change n’est pas renvoyé', async () => {
  const a = pod('a');
  const kube = fakeGateway({ pods: { ns: [a, pod('b')] }, defaultNs: 'ns' });
  const flux = await ouvrirFlux(kube);
  try {
    await quand(() => flux.recus.some((e) => e.type === 'snapshot'));
    watchDe(kube, 'pods').cb('MODIFIED', avecVersion(a, '9'));
    await attendre(600);
    const ch = flux.recus.find((e) => e.type === 'changes')?.data;
    assert.ok(!ch || ch.pods.upsert.length === 0);
  } finally {
    flux.fermer();
  }
});

test('flux /api/stream : un nouvel événement sur un Pod est signalé (rafraîchir sa fiche)', async () => {
  const kube = fakeGateway({ pods: { ns: [pod('a')] }, defaultNs: 'ns' });
  const flux = await ouvrirFlux(kube);
  try {
    await quand(() => flux.recus.some((e) => e.type === 'snapshot') && watchDe(kube, 'events'));
    watchDe(kube, 'events').cb('ADDED', { metadata: { uid: 'e1', name: 'e1' }, involvedObject: { kind: 'Pod', name: 'a' }, reason: 'BackOff' });
    await quand(() => flux.recus.some((e) => e.type === 'changes'));
    assert.deepEqual(flux.recus.find((e) => e.type === 'changes').data.touched, ['a']);
  } finally {
    flux.fermer();
  }
});

test('flux /api/stream : cluster injoignable signalé aux abonnés', async () => {
  const kube = fakeGateway({ pods: { ns: [] }, defaultNs: 'ns', fail: (m) => m.startsWith('list') && m !== 'listNamespace' && networkError() });
  const flux = await ouvrirFlux(kube);
  try {
    await quand(() => flux.recus.some((e) => e.type === 'health'));
    const h = flux.recus.find((e) => e.type === 'health').data;
    assert.equal(h.ok, false);
    assert.equal(h.code, 'CLUSTER_INJOIGNABLE');
    assert.match(h.message, /cluster ne répond pas/);
  } finally {
    flux.fermer();
  }
});

test('flux /api/stream : un Service qui perd ses Pods est renvoyé avec son diagnostic', async () => {
  const p = pod('web-1', { metadata: { labels: { app: 'web' } } });
  const svc = { metadata: { name: 'web', uid: 's1' }, spec: { selector: { app: 'web' }, ports: [{ port: 80 }] } };
  const kube = fakeGateway({ pods: { ns: [p] }, resources: { services: { ns: [svc] } }, defaultNs: 'ns' });
  const flux = await ouvrirFlux(kube);
  try {
    await quand(() => flux.recus.some((e) => e.type === 'snapshot') && watchDe(kube, 'pods'));
    const instantane = flux.recus.find((e) => e.type === 'snapshot').data;
    assert.equal(instantane.resources.services[0].matchingPods, 1);
    watchDe(kube, 'pods').cb('DELETED', p);
    await quand(() => flux.recus.some((e) => e.type === 'changes' && e.data.resources));
    const ch = flux.recus.find((e) => e.type === 'changes' && e.data.resources).data;
    assert.equal(ch.resources.services[0].problem, 'AUCUN_POD');
  } finally {
    flux.fermer();
  }
});
