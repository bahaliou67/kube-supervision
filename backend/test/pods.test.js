// Tests de la route /api/pods avec un client Kubernetes simulé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { fakeGateway, pod } from './fake-kube.js';

test('GET /api/pods renvoie les Pods du namespace par défaut du contexte', async () => {
  const kube = fakeGateway({ pods: { personnes: [pod('api-1'), pod('db-0')] }, defaultNs: 'personnes' });
  const res = await request(createApp({ kube })).get('/api/pods');
  assert.equal(res.status, 200);
  assert.equal(res.body.ns, 'personnes');
  assert.deepEqual(res.body.items.map((p) => p.name), ['api-1', 'db-0']);
  assert.equal(res.body.items[0].status, 'Running');
});

test('contexte inconnu : erreur 400 au format unique', async () => {
  const kube = fakeGateway({});
  const res = await request(createApp({ kube })).get('/api/pods?ctx=inexistant');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'CONTEXTE_INCONNU');
  assert.match(res.body.error.message, /inexistant/);
});
