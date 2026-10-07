// Tests des actions de gestion : suppression d'une ressource, pause, retour
// à une version précédente, suspension et lancement manuel d'un CronJob.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { apiException, fakeGateway } from './fake-kube.js';

const HOTE = '127.0.0.1:7420';
const ORIGINE = `http://${HOTE}`;
const action = (a, methode, url, corps) => {
  const r = request(a)[methode](url).set('Host', HOTE).set('Origin', ORIGINE);
  return corps ? r.send(corps) : r;
};
const appelsDe = (kube, m) => kube.appels.filter((x) => x.methode === m);

// Deployment « api » en révision 3, avec trois ReplicaSets (révisions 1 à 3).
function deploiement({ paused = false } = {}) {
  const rs = (rev, image) => ({
    metadata: {
      name: `api-r${rev}`,
      annotations: { 'deployment.kubernetes.io/revision': String(rev) },
      ownerReferences: [{ kind: 'Deployment', name: 'api', uid: 'd-api', controller: true }],
      creationTimestamp: new Date(Date.now() - (4 - rev) * 3600e3),
    },
    spec: {
      template: {
        metadata: { labels: { app: 'api', 'pod-template-hash': `h${rev}` } },
        spec: { containers: [{ name: 'api', image }] },
      },
    },
  });
  return {
    deployments: {
      ns: [
        {
          metadata: { name: 'api', uid: 'd-api', resourceVersion: '7', annotations: { 'deployment.kubernetes.io/revision': '3' } },
          spec: { paused, template: { metadata: { labels: { app: 'api' } }, spec: { containers: [{ name: 'api', image: 'api:3' }] } } },
        },
      ],
    },
    replicasets: {
      ns: [
        rs(1, 'api:1'),
        rs(2, 'api:2'),
        rs(3, 'api:3'),
        // ReplicaSet d'un autre Deployment : ignoré.
        { metadata: { name: 'autre-r9', annotations: { 'deployment.kubernetes.io/revision': '9' }, ownerReferences: [{ kind: 'Deployment', name: 'autre', uid: 'd-autre' }] }, spec: {} },
      ],
    },
    cronjobs: {
      ns: [
        {
          metadata: { name: 'sauvegarde-nocturne', uid: 'cj-1' },
          spec: {
            schedule: '0 3 * * *',
            jobTemplate: { metadata: { labels: { app: 'sauvegarde' } }, spec: { backoffLimit: 1, template: { spec: { containers: [{ name: 'c', image: 'backup:1' }] } } } },
          },
        },
      ],
    },
  };
}

test('suppression : chaque type supprimé avec ses dépendants (Background)', async () => {
  const kube = fakeGateway({ defaultNs: 'ns' });
  const a = createApp({ kube });
  for (const [type, methode] of [
    ['deployments', 'deleteNamespacedDeployment'],
    ['jobs', 'deleteNamespacedJob'],
    ['services', 'deleteNamespacedService'],
    ['ingresses', 'deleteNamespacedIngress'],
    ['configmaps', 'deleteNamespacedConfigMap'],
    ['persistentvolumeclaims', 'deleteNamespacedPersistentVolumeClaim'],
    ['horizontalpodautoscalers', 'deleteNamespacedHorizontalPodAutoscaler'],
  ]) {
    const res = await action(a, 'delete', `/api/resources/${type}/web`);
    assert.equal(res.status, 200, type);
    const [appel] = appelsDe(kube, methode);
    assert.deepEqual(appel.params, { name: 'web', namespace: 'ns', propagationPolicy: 'Background' });
  }
});

test('suppression : type inconnu refusé, Secret compris', async () => {
  const a = createApp({ kube: fakeGateway({ defaultNs: 'ns' }) });
  assert.equal((await action(a, 'delete', '/api/resources/secrets/x')).status, 400);
  assert.equal((await action(a, 'delete', '/api/resources/nodes/x')).status, 400);
});

test('toutes les actions de gestion exigent la même origine', async () => {
  const a = createApp({ kube: fakeGateway({ defaultNs: 'ns', resources: deploiement() }) });
  const autre = (m, url) => request(a)[m](url).set('Host', HOTE).set('Origin', 'http://malveillant.example');
  for (const [m, url] of [
    ['delete', '/api/resources/deployments/api'],
    ['post', '/api/workloads/deployments/api/pause'],
    ['post', '/api/workloads/deployments/api/rollback'],
    ['post', '/api/workloads/cronjobs/sauvegarde-nocturne/suspend'],
    ['post', '/api/workloads/cronjobs/sauvegarde-nocturne/trigger'],
  ]) {
    const res = await autre(m, url);
    assert.equal(res.status, 403, url);
    assert.equal(res.body.error.code, 'ORIGINE_REFUSEE');
  }
});

test('pause et reprise d’un Deployment : merge patch de spec.paused', async () => {
  const kube = fakeGateway({ defaultNs: 'ns' });
  const a = createApp({ kube });
  assert.equal((await action(a, 'post', '/api/workloads/deployments/api/pause', { paused: true })).status, 200);
  assert.equal((await action(a, 'post', '/api/workloads/deployments/api/pause', { paused: false })).status, 200);
  assert.deepEqual(
    appelsDe(kube, 'patchNamespacedDeployment').map((x) => x.params.body),
    [{ spec: { paused: true } }, { spec: { paused: false } }],
  );
  const invalide = await action(a, 'post', '/api/workloads/deployments/api/pause', { paused: 'oui' });
  assert.equal(invalide.status, 400);
});

test('révisions : celles du Deployment seulement, la plus récente d’abord', async () => {
  const kube = fakeGateway({ defaultNs: 'ns', resources: deploiement() });
  const res = await request(createApp({ kube })).get('/api/workloads/deployments/api/revisions');
  assert.equal(res.status, 200);
  assert.equal(res.body.current, 3);
  assert.deepEqual(
    res.body.items.map((r) => [r.revision, r.images[0], r.current]),
    [[3, 'api:3', true], [2, 'api:2', false], [1, 'api:1', false]],
  );
});

test('retour arrière : le modèle du ReplicaSet remplace celui du Deployment (JSON patch)', async () => {
  const kube = fakeGateway({ defaultNs: 'ns', resources: deploiement() });
  const res = await action(createApp({ kube }), 'post', '/api/workloads/deployments/api/rollback', { revision: 2 });
  assert.equal(res.status, 200);
  const [appel] = appelsDe(kube, 'patchNamespacedDeployment');
  assert.deepEqual(appel.params.body, [
    { op: 'replace', path: '/spec/template', value: { metadata: { labels: { app: 'api' } }, spec: { containers: [{ name: 'api', image: 'api:2' }] } } },
  ]);
  assert.ok(appel.options, 'en-tête Content-Type du JSON patch fourni');
  // Le ReplicaSet d'origine n'est pas modifié.
  assert.equal(kube.store.replicasets.ns[1].spec.template.metadata.labels['pod-template-hash'], 'h2');
});

test('retour arrière refusé : révision actuelle, inconnue, Deployment en pause', async () => {
  const a = createApp({ kube: fakeGateway({ defaultNs: 'ns', resources: deploiement() }) });
  const actuelle = await action(a, 'post', '/api/workloads/deployments/api/rollback', { revision: 3 });
  assert.equal(actuelle.body.error.code, 'REVISION_ACTUELLE');
  const inconnue = await action(a, 'post', '/api/workloads/deployments/api/rollback', { revision: 9 });
  assert.equal(inconnue.status, 404);
  assert.equal(inconnue.body.error.code, 'REVISION_INCONNUE');
  const enPause = createApp({ kube: fakeGateway({ defaultNs: 'ns', resources: deploiement({ paused: true }) }) });
  const pause = await action(enPause, 'post', '/api/workloads/deployments/api/rollback', { revision: 2 });
  assert.equal(pause.status, 409);
  assert.equal(pause.body.error.code, 'ROLLBACK_EN_PAUSE');
  assert.equal((await action(a, 'post', '/api/workloads/deployments/api/rollback', { revision: '2' })).status, 400);
});

test('CronJob : suspension et réactivation', async () => {
  const kube = fakeGateway({ defaultNs: 'ns' });
  const a = createApp({ kube });
  assert.equal((await action(a, 'post', '/api/workloads/cronjobs/nuit/suspend', { suspended: true })).status, 200);
  assert.deepEqual(appelsDe(kube, 'patchNamespacedCronJob')[0].params.body, { spec: { suspend: true } });
});

test('CronJob : lancement manuel d’un Job rattaché au CronJob', async () => {
  const kube = fakeGateway({ defaultNs: 'ns', resources: deploiement() });
  const res = await action(createApp({ kube }), 'post', '/api/workloads/cronjobs/sauvegarde-nocturne/trigger');
  assert.equal(res.status, 200);
  assert.match(res.body.job, /^sauvegarde-nocturne-manuel-[0-9a-f]{6}$/);
  const [appel] = appelsDe(kube, 'createNamespacedJob');
  const job = appel.params.body;
  assert.equal(job.metadata.name, res.body.job);
  assert.deepEqual(job.metadata.ownerReferences, [{ apiVersion: 'batch/v1', kind: 'CronJob', name: 'sauvegarde-nocturne', uid: 'cj-1', controller: true }]);
  assert.equal(job.metadata.annotations['cronjob.kubernetes.io/instantiate'], 'manual');
  assert.equal(job.spec.backoffLimit, 1);
});

test('CronJob au nom très long : nom du Job limité à 63 caractères', async () => {
  const long = 'a'.repeat(60);
  const kube = fakeGateway({ defaultNs: 'ns', resources: { cronjobs: { ns: [{ metadata: { name: long, uid: 'u' }, spec: { jobTemplate: { spec: {} } } }] } } });
  const res = await action(createApp({ kube }), 'post', `/api/workloads/cronjobs/${long}/trigger`);
  assert.equal(res.status, 200);
  assert.ok(res.body.job.length <= 63);
});

test('suppression refusée par le cluster : 403 ACCES_REFUSE', async () => {
  const kube = fakeGateway({ defaultNs: 'ns', fail: (m) => m === 'deleteNamespacedService' && apiException(403) });
  const res = await action(createApp({ kube }), 'delete', '/api/resources/services/web');
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'ACCES_REFUSE');
});

test('permissions : droits de gestion vérifiés', async () => {
  const kube = fakeGateway({ defaultNs: 'ns', rbac: (a) => a.verb !== 'delete' });
  const res = await request(createApp({ kube })).get('/api/permissions');
  assert.equal(res.body.checks['services.delete'].allowed, false);
  assert.equal(res.body.checks['cronjobs.patch'].allowed, true);
  assert.equal(res.body.checks['jobs.create'].allowed, true);
});
