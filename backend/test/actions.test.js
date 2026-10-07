// Tests des droits (SelfSubjectAccessReview), des trois actions et des
// protections du serveur (hôte local, même origine).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { apiException, fakeGateway, networkError } from './fake-kube.js';

const HOTE = '127.0.0.1:7420';
const ORIGINE = `http://${HOTE}`;
const app = (opts = {}) => createApp({ kube: fakeGateway({ defaultNs: 'ns', ...opts }) });
// Requête d'action telle que l'envoie la page de l'outil.
const action = (a, methode, url) => request(a)[methode](url).set('Host', HOTE).set('Origin', ORIGINE);
const appelsDe = (kube, m) => kube.appels.filter((x) => x.methode === m);

test('permissions : chaque droit vérifié auprès du cluster', async () => {
  // Utilisateur en lecture seule : il peut lister et lire les logs, rien d'autre.
  const kube = fakeGateway({ defaultNs: 'ns', rbac: (a) => ['list', 'get', 'watch'].includes(a.verb) });
  const res = await request(createApp({ kube })).get('/api/permissions');
  assert.equal(res.status, 200);
  assert.equal(res.body.checks['pods.list'].allowed, true);
  assert.equal(res.body.checks['pods.log'].allowed, true);
  assert.equal(res.body.checks['pods.delete'].allowed, false);
  assert.equal(res.body.checks['deployments.restart'].allowed, false);
  assert.equal(res.body.checks['deployments.scale'].allowed, false);
  const demande = appelsDe(kube, 'createSelfSubjectAccessReview').map((a) => a.params.body.spec.resourceAttributes);
  assert.ok(demande.some((r) => r.verb === 'patch' && r.resource === 'deployments' && r.subresource === 'scale' && r.group === 'apps' && r.namespace === 'ns'));
  assert.ok(demande.some((r) => r.resource === 'namespaces' && r.namespace === undefined), 'namespaces : droit à l’échelle du cluster');
});

test('permissions : vérification impossible → droit inconnu (null), pas d’erreur', async () => {
  const res = await request(app({ fail: (m) => m === 'createSelfSubjectAccessReview' && apiException(403) })).get('/api/permissions');
  assert.equal(res.status, 200);
  assert.equal(res.body.checks['pods.delete'].allowed, null);
});

test('permissions : cluster injoignable → 503', async () => {
  const res = await request(app({ fail: () => networkError() })).get('/api/permissions');
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'CLUSTER_INJOIGNABLE');
});

test('redémarrage : annotation restartedAt sur le modèle de Pod, en merge patch', async () => {
  const kube = fakeGateway({ defaultNs: 'ns' });
  const res = await action(createApp({ kube }), 'post', '/api/workloads/deployments/api/restart');
  assert.equal(res.status, 200);
  const [appel] = appelsDe(kube, 'patchNamespacedDeployment');
  assert.equal(appel.params.name, 'api');
  assert.equal(appel.params.namespace, 'ns');
  assert.ok(appel.params.body.spec.template.metadata.annotations['kubectl.kubernetes.io/restartedAt']);
  assert.ok(appel.options, 'en-tête Content-Type du patch fourni');
});

test('redémarrage : StatefulSet et DaemonSet acceptés, Job refusé', async () => {
  const kube = fakeGateway({ defaultNs: 'ns' });
  const a = createApp({ kube });
  assert.equal((await action(a, 'post', '/api/workloads/StatefulSet/db/restart')).status, 200);
  assert.equal((await action(a, 'post', '/api/workloads/daemonsets/agent/restart')).status, 200);
  const job = await action(a, 'post', '/api/workloads/jobs/import/restart');
  assert.equal(job.status, 400);
  assert.equal(job.body.error.code, 'ACTION_IMPOSSIBLE');
});

test('réplicas : Deployment et StatefulSet, nombre validé', async () => {
  const kube = fakeGateway({ defaultNs: 'ns' });
  const a = createApp({ kube });
  const ok = await action(a, 'post', '/api/workloads/deployments/api/scale').send({ replicas: 3 });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.replicas, 3);
  assert.deepEqual(appelsDe(kube, 'patchNamespacedDeploymentScale')[0].params.body, { spec: { replicas: 3 } });
  assert.equal((await action(a, 'post', '/api/workloads/statefulsets/db/scale').send({ replicas: 0 })).status, 200);
  for (const mauvais of [-1, 2.5, '3', null, 100000]) {
    const r = await action(a, 'post', '/api/workloads/deployments/api/scale').send({ replicas: mauvais });
    assert.equal(r.status, 400, `replicas ${mauvais}`);
    assert.equal(r.body.error.code, 'REPLICAS_INVALIDE');
  }
  assert.equal((await action(a, 'post', '/api/workloads/daemonsets/agent/scale').send({ replicas: 2 })).status, 400);
});

test('suppression d’un Pod', async () => {
  const kube = fakeGateway({ defaultNs: 'ns' });
  const res = await action(createApp({ kube }), 'delete', '/api/pods/api-7d9f-abc');
  assert.equal(res.status, 200);
  assert.deepEqual(appelsDe(kube, 'deleteNamespacedPod')[0].params, { name: 'api-7d9f-abc', namespace: 'ns' });
});

test('action refusée par le cluster (403) : erreur ACCES_REFUSE, état normal', async () => {
  const res = await action(app({ fail: (m) => m === 'deleteNamespacedPod' && apiException(403, 'pods "x" is forbidden') }), 'delete', '/api/pods/x');
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'ACCES_REFUSE');
});

test('action sur une ressource disparue : 404 INTROUVABLE', async () => {
  const res = await action(app({ fail: (m) => m === 'patchNamespacedDeployment' && apiException(404) }), 'post', '/api/workloads/deployments/absent/restart');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'INTROUVABLE');
});

test('action sans en-tête Origin (curl, script) : refusée sans appel au cluster', async () => {
  const kube = fakeGateway({ defaultNs: 'ns' });
  const res = await request(createApp({ kube })).delete('/api/pods/x').set('Host', HOTE);
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'ORIGINE_REFUSEE');
  assert.equal(appelsDe(kube, 'deleteNamespacedPod').length, 0);
});

test('action venant d’un autre site : refusée sans appel au cluster', async () => {
  const kube = fakeGateway({ defaultNs: 'ns' });
  const a = createApp({ kube });
  const autre = await request(a).post('/api/workloads/deployments/api/restart').set('Host', HOTE).set('Origin', 'https://site-malveillant.example');
  assert.equal(autre.status, 403);
  assert.equal(autre.body.error.code, 'ORIGINE_REFUSEE');
  const croise = await action(a, 'post', '/api/workloads/deployments/api/restart').set('Sec-Fetch-Site', 'cross-site');
  assert.equal(croise.status, 403);
  assert.equal(appelsDe(kube, 'patchNamespacedDeployment').length, 0);
});

test('en-tête Host étranger (DNS rebinding) : toutes les routes refusées', async () => {
  const res = await request(app()).get('/api/contexts').set('Host', 'attaquant.example:7420');
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'HOTE_REFUSE');
  assert.equal((await request(app()).get('/api/contexts').set('Host', 'localhost:7420')).status, 200);
});

test('les réponses ne contiennent jamais de données d’authentification', async () => {
  const kube = fakeGateway({
    defaultNs: 'ns',
    contexts: [{ name: 'prod', cluster: 'prod-cluster', namespace: 'ns', user: { token: 'SECRET-JETON' } }],
  });
  const res = await request(createApp({ kube })).get('/api/contexts');
  assert.equal(res.status, 200);
  assert.doesNotMatch(JSON.stringify(res.body), /SECRET-JETON|token|user/i);
});
