// Tests de /api/namespaces : liste normale, liste interdite (403), cluster injoignable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { apiException, fakeGateway } from './fake-kube.js';

test('liste triée des namespaces', async () => {
  const kube = fakeGateway({ namespaces: ['zeta', 'alpha', 'default'] });
  const res = await request(createApp({ kube })).get('/api/namespaces');
  assert.equal(res.status, 200);
  assert.equal(res.body.listable, true);
  assert.deepEqual(res.body.items.map((n) => n.name), ['alpha', 'default', 'zeta']);
});

test('liste interdite : 200 avec listable=false (saisie manuelle côté front)', async () => {
  const kube = fakeGateway({ defaultNs: 'equipe-a', fail: (m) => m === 'listNamespace' && apiException(403, 'namespaces is forbidden') });
  const res = await request(createApp({ kube })).get('/api/namespaces');
  assert.equal(res.status, 200);
  assert.equal(res.body.listable, false);
  assert.equal(res.body.defaultNamespace, 'equipe-a');
  assert.deepEqual(res.body.items, []);
});

test('cluster injoignable : 503 CLUSTER_INJOIGNABLE', async () => {
  const panne = Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) });
  const kube = fakeGateway({ fail: () => panne });
  const res = await request(createApp({ kube })).get('/api/namespaces');
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'CLUSTER_INJOIGNABLE');
});
