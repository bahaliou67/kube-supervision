// Tests des logs : lecture par la fin, conteneur précédent, droits, suivi en direct.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { parseLine } from '../src/routes/logs.js';
import { apiException, fakeGateway } from './fake-kube.js';

const ts = (i) => `2026-10-07T14:31:${String(i % 60).padStart(2, '0')}.${String(i).padStart(3, '0')}Z`;
const texte = (n) => Array.from({ length: n }, (_, i) => `${ts(i)} ligne ${i}`).join('\n');

const kube = (extra = {}) =>
  fakeGateway({
    defaultNs: 'ns',
    logs: { 'web/app': texte(20), 'web/app/precedent': `${ts(1)} avant l'arrêt`, 'web/sidecar': `${ts(2)} sidecar` },
    follow: { 'web/app': [`${ts(30)} nouvelle 1`, `${ts(31)} nouvelle 2`] },
    ...extra,
  });

test('les logs sont lus par la fin et les horodatages séparés du texte', async () => {
  const k = kube();
  const res = await request(createApp({ kube: k })).get('/api/pods/web/logs?container=app&tailLines=5');
  assert.equal(res.status, 200);
  assert.equal(res.body.lines.length, 5);
  assert.equal(res.body.lines[4].text, 'ligne 19');
  assert.equal(res.body.lines[4].ts, ts(19));
  assert.equal(res.body.truncated, true);
  const appel = k.appels.find((a) => a.methode === 'readNamespacedPodLog');
  assert.equal(appel.params.tailLines, 5);
  assert.equal(appel.params.timestamps, true);
  assert.ok(appel.params.limitBytes > 0, 'volume plafonné');
});

test('le nombre de lignes est plafonné à 5000 (jamais de lecture complète)', async () => {
  const k = kube();
  await request(createApp({ kube: k })).get('/api/pods/web/logs?container=app&tailLines=999999');
  assert.equal(k.appels.find((a) => a.methode === 'readNamespacedPodLog').params.tailLines, 5000);
});

test('Pod à plusieurs conteneurs : logs par conteneur', async () => {
  const res = await request(createApp({ kube: kube() })).get('/api/pods/web/logs?container=sidecar');
  assert.deepEqual(res.body.lines.map((l) => l.text), ['sidecar']);
});

test('conteneur précédent', async () => {
  const res = await request(createApp({ kube: kube() })).get('/api/pods/web/logs?container=app&previous=1');
  assert.equal(res.body.previous, true);
  assert.deepEqual(res.body.lines.map((l) => l.text), ["avant l'arrêt"]);
});

test('pas de conteneur précédent : message dédié', async () => {
  const k = kube({ fail: (m, p) => m === 'readNamespacedPodLog' && p.previous && apiException(400, 'previous terminated container "app" in pod "web" not found') });
  // Le client Kubernetes fournit parfois le corps sous forme de texte JSON.
  const res = await request(createApp({ kube: k })).get('/api/pods/web/logs?container=app&previous=1');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'LOGS_PRECEDENT_ABSENT');
});

test('corps d’erreur en texte JSON : il est décodé', async () => {
  const e = apiException(400);
  e.body = JSON.stringify({ kind: 'Status', message: 'container "app" in pod "web" is waiting to start: ContainerCreating', code: 400 });
  const k = kube({ fail: (m) => m === 'readNamespacedPodLog' && e });
  const res = await request(createApp({ kube: k })).get('/api/pods/web/logs?container=app');
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'CONTENEUR_EN_ATTENTE');
});

test('logs interdits (pods/log) : 403 LOGS_INTERDITS', async () => {
  const k = kube({ fail: (m) => m === 'readNamespacedPodLog' && apiException(403) });
  const res = await request(createApp({ kube: k })).get('/api/pods/web/logs?container=app');
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'LOGS_INTERDITS');
});

test('suivi en direct : flux SSE des nouvelles lignes, puis fin', async () => {
  const k = kube();
  const res = await request(createApp({ kube: k }))
    .get(`/api/pods/web/logs?container=app&follow=1&sinceTime=${encodeURIComponent(ts(29))}`)
    .buffer(true)
    .parse((r, cb) => {
      let s = '';
      r.on('data', (d) => (s += d));
      r.on('end', () => cb(null, s));
    });
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/event-stream/);
  const evenements = res.body.split('\n\n').filter(Boolean).map((b) => b.split('\n')[0]);
  assert.deepEqual(evenements, ['event: open', 'event: line', 'event: line', 'event: end']);
  assert.match(res.body, /nouvelle 2/);
  // sinceTime transmis au cluster (arrondi à la seconde).
  assert.equal(k.appels.find((a) => a.methode === 'openLogStream').params.sinceTime, '2026-10-07T14:31:29Z');
});

test('suivi impossible sur le conteneur précédent', async () => {
  const res = await request(createApp({ kube: kube() })).get('/api/pods/web/logs?container=app&follow=1&previous=1');
  assert.equal(res.status, 400);
});

test('analyse d’une ligne sans horodatage', () => {
  assert.deepEqual(parseLine('texte brut'), { ts: null, text: 'texte brut' });
  assert.deepEqual(parseLine('2026-10-07T14:31:02.1Z  indenté'), { ts: '2026-10-07T14:31:02.1Z', text: ' indenté' });
});
