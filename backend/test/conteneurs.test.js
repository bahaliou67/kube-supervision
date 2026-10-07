// Tests des modifications ciblées : image, variables d'environnement,
// ressources CPU/mémoire d'un conteneur, limites d'un autoscaler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { fakeGateway } from './fake-kube.js';

const HOTE = '127.0.0.1:7420';
const ORIGINE = `http://${HOTE}`;
const action = (a, url, corps) => request(a).post(url).set('Host', HOTE).set('Origin', ORIGINE).send(corps);
const appelsDe = (kube, m) => kube.appels.filter((x) => x.methode === m);

const podSpec = {
  initContainers: [{ name: 'migration', image: 'api:1' }],
  containers: [
    {
      name: 'api',
      image: 'api:1',
      env: [
        { name: 'MODE', value: 'prod' },
        { name: 'URL', valueFrom: { configMapKeyRef: { name: 'api-config', key: 'url' } } },
        { name: 'MOT_DE_PASSE', valueFrom: { secretKeyRef: { name: 'api-secret', key: 'mdp' } } },
      ],
      envFrom: [{ configMapRef: { name: 'commun' } }],
      resources: { limits: { memory: '192Mi' }, requests: { cpu: '100m' } },
    },
    { name: 'proxy', image: 'envoy:1' },
  ],
};
const resources = {
  deployments: { ns: [{ metadata: { name: 'api' }, spec: { template: { spec: podSpec } } }] },
  cronjobs: { ns: [{ metadata: { name: 'nuit' }, spec: { jobTemplate: { spec: { template: { spec: { containers: [{ name: 'c', image: 'batch:1' }] } } } } } }] },
};
const kubeAvec = () => fakeGateway({ defaultNs: 'ns', resources });

test('conteneurs du modèle : image, variables (origine sans valeur de Secret), ressources', async () => {
  const res = await request(createApp({ kube: kubeAvec() })).get('/api/workloads/deployments/api/containers');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.containers.map((c) => [c.name, c.init]), [['migration', true], ['api', false], ['proxy', false]]);
  const api = res.body.containers[1];
  assert.deepEqual(api.env, [
    { name: 'MODE', value: 'prod', source: null },
    { name: 'URL', value: null, source: { kind: 'ConfigMap', name: 'api-config', key: 'url' } },
    { name: 'MOT_DE_PASSE', value: null, source: { kind: 'Secret', name: 'api-secret', key: 'mdp' } },
  ]);
  assert.deepEqual(api.envFrom, [{ kind: 'ConfigMap', name: 'commun', prefix: null }]);
  assert.deepEqual(api.resources, { requests: { cpu: '100m', memory: null }, limits: { cpu: null, memory: '192Mi' } });
});

test('changement d’image : strategic merge patch du seul conteneur visé', async () => {
  const kube = kubeAvec();
  const res = await action(createApp({ kube }), '/api/workloads/deployments/api/containers/api', { image: 'api:2' });
  assert.equal(res.status, 200);
  const [appel] = appelsDe(kube, 'patchNamespacedDeployment');
  assert.deepEqual(appel.params.body, { spec: { template: { spec: { containers: [{ name: 'api', image: 'api:2' }] } } } });
  assert.ok(appel.options, 'en-tête Content-Type du patch fourni');
});

test('init container : modifié dans initContainers', async () => {
  const kube = kubeAvec();
  await action(createApp({ kube }), '/api/workloads/deployments/api/containers/migration', { image: 'api:2' });
  assert.deepEqual(appelsDe(kube, 'patchNamespacedDeployment')[0].params.body.spec.template.spec, { initContainers: [{ name: 'migration', image: 'api:2' }] });
});

test('CronJob : le modèle du Job est modifié', async () => {
  const kube = kubeAvec();
  const res = await action(createApp({ kube }), '/api/workloads/cronjobs/nuit/containers/c', { image: 'batch:2' });
  assert.equal(res.status, 200);
  assert.deepEqual(appelsDe(kube, 'patchNamespacedCronJob')[0].params.body, {
    spec: { jobTemplate: { spec: { template: { spec: { containers: [{ name: 'c', image: 'batch:2' }] } } } } },
  });
});

test('variables d’environnement : ajout, remplacement d’une référence, suppression', async () => {
  const kube = kubeAvec();
  const res = await action(createApp({ kube }), '/api/workloads/deployments/api/containers/api', {
    env: { set: { MODE: 'test', URL: 'http://x' }, remove: ['ANCIENNE'] },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(appelsDe(kube, 'patchNamespacedDeployment')[0].params.body.spec.template.spec.containers[0].env, [
    { name: 'MODE', value: 'test', valueFrom: null },
    { name: 'URL', value: 'http://x', valueFrom: null },
    { name: 'ANCIENNE', $patch: 'delete' },
  ]);
});

test('ressources : quantités validées, null pour retirer une valeur', async () => {
  const kube = kubeAvec();
  const a = createApp({ kube });
  const res = await action(a, '/api/workloads/deployments/api/containers/api', {
    resources: { requests: { memory: '128Mi', cpu: null }, limits: { memory: '512Mi' } },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(appelsDe(kube, 'patchNamespacedDeployment')[0].params.body.spec.template.spec.containers[0].resources, {
    requests: { memory: '128Mi', cpu: null },
    limits: { memory: '512Mi' },
  });
  for (const v of ['512 Mo', '1,5Gi', 'beaucoup', 12]) {
    const r = await action(a, '/api/workloads/deployments/api/containers/api', { resources: { limits: { memory: v } } });
    assert.equal(r.status, 400, String(v));
  }
});

test('refus : conteneur absent, Job, nom de variable invalide, corps vide', async () => {
  const a = createApp({ kube: kubeAvec() });
  const absent = await action(a, '/api/workloads/deployments/api/containers/inconnu', { image: 'x:1' });
  assert.equal(absent.status, 404);
  assert.equal(absent.body.error.code, 'CONTENEUR_ABSENT');
  assert.equal((await action(a, '/api/workloads/jobs/import/containers/c', { image: 'x:1' })).status, 400);
  assert.equal((await action(a, '/api/workloads/deployments/api/containers/api', { env: { set: { '1 MAUVAIS': 'x' } } })).status, 400);
  assert.equal((await action(a, '/api/workloads/deployments/api/containers/api', { image: 'avec espace' })).status, 400);
  assert.equal((await action(a, '/api/workloads/deployments/api/containers/api', {})).status, 400);
});

test('modification refusée depuis un autre site', async () => {
  const res = await request(createApp({ kube: kubeAvec() }))
    .post('/api/workloads/deployments/api/containers/api')
    .set('Host', HOTE)
    .set('Origin', 'http://malveillant.example')
    .send({ image: 'pirate:1' });
  assert.equal(res.status, 403);
});

test('limites d’un autoscaler : merge patch, bornes vérifiées', async () => {
  const kube = kubeAvec();
  const a = createApp({ kube });
  assert.equal((await action(a, '/api/resources/horizontalpodautoscalers/web/limits', { min: 2, max: 8 })).status, 200);
  assert.deepEqual(appelsDe(kube, 'patchNamespacedHorizontalPodAutoscaler')[0].params.body, { spec: { minReplicas: 2, maxReplicas: 8 } });
  for (const corps of [{ min: 0, max: 3 }, { min: 5, max: 2 }, { min: 1, max: 5000 }, { min: '1', max: 3 }]) {
    const r = await action(a, '/api/resources/horizontalpodautoscalers/web/limits', corps);
    assert.equal(r.status, 400, JSON.stringify(corps));
    assert.equal(r.body.error.code, 'LIMITES_HPA_INVALIDES');
  }
});
