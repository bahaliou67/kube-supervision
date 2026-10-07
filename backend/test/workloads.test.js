// Tests de /api/workloads et du rattachement Pod → charge de travail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { apiException, fakeGateway, pod } from './fake-kube.js';

const ref = (kind, name) => [{ kind, name, controller: true }];

const resources = {
  deployments: { ns: [{ metadata: { name: 'web', uid: 'd1' }, spec: { replicas: 2, template: { spec: { containers: [{ image: 'web:2' }] } } }, status: { readyReplicas: 1 } }] },
  replicasets: { ns: [{ metadata: { name: 'web-abc', ownerReferences: ref('Deployment', 'web') } }] },
  cronjobs: { ns: [{ metadata: { name: 'nuit', uid: 'c1' }, spec: { schedule: '0 3 * * *', jobTemplate: { spec: { template: { spec: { containers: [{ image: 'batch:1' }] } } } } }, status: {} }] },
  jobs: { ns: [{ metadata: { name: 'nuit-123', uid: 'j1', ownerReferences: ref('CronJob', 'nuit') }, spec: { completions: 1 }, status: { succeeded: 1, conditions: [{ type: 'Complete', status: 'True' }] } }] },
  pods: {
    ns: [
      pod('web-abc-1', { metadata: { ownerReferences: ref('ReplicaSet', 'web-abc') } }),
      pod('nuit-123-x', { metadata: { ownerReferences: ref('Job', 'nuit-123') } }),
      pod('seul'),
    ],
  },
};

test('les charges de travail de tous les types sont listées', async () => {
  const res = await request(createApp({ kube: fakeGateway({ resources, defaultNs: 'ns' }) })).get('/api/workloads');
  assert.equal(res.status, 200);
  const parNom = Object.fromEntries(res.body.items.map((w) => [w.name, w]));
  assert.equal(parNom.web.kind, 'Deployment');
  assert.equal(parNom.web.ready, 1);
  assert.equal(parNom.web.desired, 2);
  assert.equal(parNom.nuit.kind, 'CronJob');
  assert.equal(parNom['nuit-123'].cronJob, 'nuit');
  assert.equal(parNom['nuit-123'].state, 'complete');
});

test('les Pods remontent à leur Deployment ou CronJob ; un Pod seul n’a pas de propriétaire', async () => {
  const res = await request(createApp({ kube: fakeGateway({ resources, defaultNs: 'ns' }) })).get('/api/pods');
  const parNom = Object.fromEntries(res.body.items.map((p) => [p.name, p.workload]));
  assert.deepEqual(parNom['web-abc-1'], { kind: 'Deployment', name: 'web' });
  assert.deepEqual(parNom['nuit-123-x'], { kind: 'CronJob', name: 'nuit' });
  assert.equal(parNom.seul, null);
});

test('CronJobs interdits : les autres types restent listés et le manque est signalé', async () => {
  const kube = fakeGateway({ resources, defaultNs: 'ns', fail: (m) => m === 'listNamespacedCronJob' && apiException(403) });
  const res = await request(createApp({ kube })).get('/api/workloads');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.forbidden, ['cronjobs']);
  assert.ok(res.body.items.some((w) => w.name === 'web'));
});

test('API CronJob absente (autre version de Kubernetes) : signalée comme indisponible', async () => {
  const kube = fakeGateway({ resources, defaultNs: 'ns', fail: (m) => m === 'listNamespacedCronJob' && apiException(404) });
  const res = await request(createApp({ kube })).get('/api/workloads');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.unavailable, ['cronjobs']);
});

test('aucun type lisible : 403 ACCES_REFUSE', async () => {
  const kube = fakeGateway({ resources, defaultNs: 'ns', fail: (m) => m !== 'listNamespacedPod' && apiException(403) });
  const res = await request(createApp({ kube })).get('/api/workloads');
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'ACCES_REFUSE');
});

test('ReplicaSets interdits : le Deployment est déduit du pod-template-hash', async () => {
  const p = pod('web-abc-1', { metadata: { labels: { 'pod-template-hash': 'abc' }, ownerReferences: ref('ReplicaSet', 'web-abc') } });
  const kube = fakeGateway({ pods: { ns: [p] }, defaultNs: 'ns', fail: (m) => m === 'listNamespacedReplicaSet' && apiException(403) });
  const res = await request(createApp({ kube })).get('/api/pods');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.items[0].workload, { kind: 'Deployment', name: 'web' });
});
