// Tests de GET /api/pods/:nom : Pod à plusieurs conteneurs, événements, droits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { apiException, fakeGateway, pod } from './fake-kube.js';

const ref = (kind, name) => [{ kind, name, controller: true }];

// Pod avec un init container terminé, un sidecar et deux conteneurs dont un qui plante.
const multi = pod('web-abc-1', {
  metadata: { uid: 'u-1', ownerReferences: ref('ReplicaSet', 'web-abc') },
  spec: {
    initContainers: [
      { name: 'migrations', image: 'migr:1' },
      { name: 'proxy', image: 'envoy:1', restartPolicy: 'Always' },
    ],
    containers: [
      { name: 'app', image: 'web:2', resources: { limits: { memory: '192Mi' } } },
      { name: 'metriques', image: 'exporter:1' },
    ],
  },
  status: {
    phase: 'Running',
    initContainerStatuses: [
      { name: 'migrations', ready: false, restartCount: 0, state: { terminated: { exitCode: 0, reason: 'Completed' } } },
      { name: 'proxy', ready: true, started: true, restartCount: 0, state: { running: {} } },
    ],
    containerStatuses: [
      {
        name: 'app',
        ready: false,
        restartCount: 6,
        state: { waiting: { reason: 'CrashLoopBackOff', message: 'back-off 5m0s' } },
        lastState: { terminated: { reason: 'OOMKilled', exitCode: 137, finishedAt: new Date() } },
      },
      { name: 'metriques', ready: true, restartCount: 0, state: { running: {} } },
    ],
  },
});

const evenement = (reason, uid, date, type = 'Warning') => ({
  metadata: { uid: `e-${reason}-${uid}` },
  involvedObject: { kind: 'Pod', name: 'web-abc-1', uid },
  reason,
  type,
  message: `${reason} message`,
  count: 2,
  lastTimestamp: date,
});

const resources = {
  pods: { ns: [multi] },
  replicasets: { ns: [{ metadata: { name: 'web-abc', ownerReferences: ref('Deployment', 'web') } }] },
  deployments: { ns: [{ metadata: { name: 'web' }, spec: { replicas: 2 }, status: { readyReplicas: 1 } }] },
  events: {
    ns: [
      evenement('Started', 'u-1', new Date(Date.now() - 600e3), 'Normal'),
      evenement('BackOff', 'u-1', new Date()),
      // Événement d'un ancien Pod du même nom : écarté.
      evenement('Scheduled', 'ancien', new Date(), 'Normal'),
    ],
  },
};

test('Pod à plusieurs conteneurs : statut, redémarrages et limites par conteneur', async () => {
  const res = await request(createApp({ kube: fakeGateway({ resources, defaultNs: 'ns' }) })).get('/api/pods/web-abc-1');
  assert.equal(res.status, 200);
  const p = res.body.pod;
  assert.equal(p.status, 'CrashLoopBackOff');
  assert.equal(p.category, 'erreur');
  assert.equal(p.statusContainer, 'app');
  assert.equal(p.restarts, 6);
  assert.deepEqual(p.initContainers.map((c) => [c.name, c.status, c.sidecar]), [
    ['migrations', 'Completed', false],
    ['proxy', 'Running', true],
  ]);
  const parNom = Object.fromEntries(p.containers.map((c) => [c.name, c]));
  assert.equal(parNom.app.category, 'erreur');
  assert.equal(parNom.app.restarts, 6);
  assert.equal(parNom.app.lastState.reason, 'OOMKilled');
  assert.equal(parNom.app.limits.memory, '192Mi');
  assert.equal(parNom.metriques.category, 'ok');
  assert.equal(p.lastTermination.container, 'app');
});

test('fiche : charge de travail résolue et événements du plus récent au plus ancien', async () => {
  const res = await request(createApp({ kube: fakeGateway({ resources, defaultNs: 'ns' }) })).get('/api/pods/web-abc-1');
  assert.deepEqual(res.body.pod.workload, { kind: 'Deployment', name: 'web' });
  assert.equal(res.body.workload.ready, 1);
  assert.equal(res.body.workload.desired, 2);
  assert.deepEqual(res.body.events.map((e) => e.reason), ['BackOff', 'Started']);
  assert.equal(res.body.events[0].count, 2);
});

test('événements interdits : la fiche s’affiche quand même', async () => {
  const kube = fakeGateway({ resources, defaultNs: 'ns', fail: (m) => m === 'listNamespacedEvent' && apiException(403) });
  const res = await request(createApp({ kube })).get('/api/pods/web-abc-1');
  assert.equal(res.status, 200);
  assert.equal(res.body.eventsForbidden, true);
  assert.deepEqual(res.body.events, []);
});

test('Pod introuvable : 404 INTROUVABLE', async () => {
  const res = await request(createApp({ kube: fakeGateway({ resources, defaultNs: 'ns' }) })).get('/api/pods/absent');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'INTROUVABLE');
});

test('nom de Pod invalide : 400 sans appel au cluster', async () => {
  const kube = fakeGateway({ resources, defaultNs: 'ns' });
  const res = await request(createApp({ kube })).get('/api/pods/..%2Fsecrets');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'PARAMETRE_INVALIDE');
  assert.equal(kube.appels.length, 0);
});
