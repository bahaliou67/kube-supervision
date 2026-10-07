// Tests de /api/resources : Services, Ingress, ConfigMaps, PVC, HPA et leurs diagnostics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { mapHpa, mapPvc } from '../src/mappers/resources.js';
import { apiException, fakeGateway, pod } from './fake-kube.js';

const ref = (kind, name) => [{ kind, name, controller: true }];
const pret = { conditions: [{ type: 'Ready', status: 'True' }] };

// Pod de l'application « web » (Deployment web → ReplicaSet web-abc).
const podWeb = (nom, extra = {}) =>
  pod(nom, {
    metadata: { labels: { app: 'web', 'pod-template-hash': 'abc' }, ownerReferences: ref('ReplicaSet', 'web-abc') },
    spec: {
      containers: [{ name: 'app', image: 'web:1', envFrom: [{ configMapRef: { name: 'web-config' } }], env: [{ name: 'X', valueFrom: { configMapKeyRef: { name: 'absente', key: 'x' } } }] }],
      volumes: [{ name: 'data', persistentVolumeClaim: { claimName: 'donnees' } }],
    },
    ...extra,
  });

const service = (name, selector, extra = {}) => ({ metadata: { name, uid: `s-${name}` }, spec: { type: 'ClusterIP', clusterIP: '10.0.0.1', selector, ports: [{ port: 80, targetPort: 8080 }], ...extra } });
const slice = (svc, endpoints) => ({ metadata: { name: `${svc}-x`, labels: { 'kubernetes.io/service-name': svc } }, endpoints });

function ressources() {
  return {
    pods: { ns: [podWeb('web-abc-1', { status: { phase: 'Running', ...pret } })] },
    replicasets: { ns: [{ metadata: { name: 'web-abc', ownerReferences: ref('Deployment', 'web') } }] },
    services: {
      ns: [
        service('web', { app: 'web' }),
        service('perdu', { app: 'inexistant' }),
        service('lent', { app: 'web' }),
        service('externe', null, { type: 'ExternalName', externalName: 'exemple.org' }),
        service('lb', { app: 'web' }, { type: 'LoadBalancer' }),
      ],
    },
    endpointslices: {
      ns: [
        slice('web', [{ addresses: ['10.1.0.1'], targetRef: { uid: 'uid-web-abc-1' }, conditions: { ready: true } }]),
        // IPv6 : même Pod, compté une seule fois.
        slice('web', [{ addresses: ['fd00::1'], targetRef: { uid: 'uid-web-abc-1' }, conditions: { ready: true } }]),
        slice('lent', [{ addresses: ['10.1.0.1'], targetRef: { uid: 'uid-web-abc-1' }, conditions: { ready: false } }]),
        slice('lb', [{ addresses: ['10.1.0.1'], targetRef: { uid: 'uid-web-abc-1' } }]),
      ],
    },
    ingresses: {
      ns: [
        {
          metadata: { name: 'site', uid: 'i1' },
          spec: {
            ingressClassName: 'nginx',
            tls: [{ hosts: ['site.exemple.org'] }],
            rules: [{ host: 'site.exemple.org', http: { paths: [{ path: '/', pathType: 'Prefix', backend: { service: { name: 'web', port: { number: 80 } } } }] } }],
          },
          status: { loadBalancer: { ingress: [{ ip: '1.2.3.4' }] } },
        },
        {
          metadata: { name: 'casse', uid: 'i2' },
          spec: { rules: [{ host: 'x.org', http: { paths: [{ path: '/', backend: { service: { name: 'nulle-part', port: { name: 'http' } } } }] } }] },
          status: { loadBalancer: { ingress: [{ hostname: 'lb.cloud' }] } },
        },
      ],
    },
    configmaps: {
      ns: [
        { metadata: { name: 'web-config', uid: 'c1' }, data: { 'app.yaml': 'cle: valeur\n', MODE: 'prod' }, binaryData: { logo: 'AAAA' } },
        { metadata: { name: 'kube-root-ca.crt', uid: 'c2' }, data: { 'ca.crt': '---' } },
      ],
    },
    persistentvolumeclaims: {
      ns: [
        { metadata: { name: 'donnees', uid: 'v1' }, spec: { storageClassName: 'standard', accessModes: ['ReadWriteOnce'], resources: { requests: { storage: '1Gi' } }, volumeName: 'pv-1' }, status: { phase: 'Bound', capacity: { storage: '1Gi' } } },
        { metadata: { name: 'orpheline', uid: 'v2' }, spec: { resources: { requests: { storage: '5Gi' } } }, status: { phase: 'Pending' } },
      ],
    },
    horizontalpodautoscalers: {
      ns: [
        {
          metadata: { name: 'web', uid: 'h1' },
          spec: {
            scaleTargetRef: { kind: 'Deployment', name: 'web' },
            minReplicas: 1,
            maxReplicas: 5,
            metrics: [{ type: 'Resource', resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 80 } } }],
          },
          status: {
            currentReplicas: 1,
            desiredReplicas: 1,
            currentMetrics: [{ type: 'Resource', resource: { name: 'cpu', current: { averageUtilization: 12, averageValue: '12m' } } }],
            conditions: [{ type: 'AbleToScale', status: 'True' }, { type: 'ScalingActive', status: 'True' }],
          },
        },
      ],
    },
  };
}

const parNom = (items) => Object.fromEntries(items.map((i) => [i.name, i]));

test('Services : endpoints, charges ciblées et diagnostic', async () => {
  const res = await request(createApp({ kube: fakeGateway({ resources: ressources(), defaultNs: 'ns' }) })).get('/api/resources');
  assert.equal(res.status, 200);
  const s = parNom(res.body.services);
  assert.deepEqual(s.web.endpoints, { ready: 1, total: 1 });
  assert.deepEqual(s.web.targets, [{ kind: 'Deployment', name: 'web' }]);
  assert.equal(s.web.category, 'ok');
  assert.deepEqual(s.web.ports, [{ name: null, port: 80, targetPort: '8080', nodePort: null, protocol: 'TCP' }]);
  assert.equal(s.perdu.problem, 'AUCUN_POD');
  assert.equal(s.perdu.category, 'erreur');
  assert.equal(s.lent.problem, 'AUCUN_POD_PRET');
  assert.equal(s.externe.category, 'inactif');
  assert.equal(s.lb.problem, 'ADRESSE_EN_ATTENTE');
});

test('Ingress : règles, TLS, Service absent signalé', async () => {
  const res = await request(createApp({ kube: fakeGateway({ resources: ressources(), defaultNs: 'ns' }) })).get('/api/resources');
  const i = parNom(res.body.ingresses);
  assert.equal(i.site.category, 'ok');
  assert.equal(i.site.className, 'nginx');
  assert.deepEqual(i.site.hosts, [{ host: 'site.exemple.org', tls: true }]);
  assert.deepEqual(i.site.addresses, ['1.2.3.4']);
  assert.equal(i.site.rules[0].service, 'web');
  assert.equal(i.site.rules[0].port, 80);
  assert.equal(i.casse.problem, 'SERVICE_ABSENT');
  assert.equal(i.casse.rules[0].port, 'http');
});

test('ConfigMaps : clés et tailles sans les valeurs, utilisateurs, ConfigMap absente', async () => {
  const res = await request(createApp({ kube: fakeGateway({ resources: ressources(), defaultNs: 'ns' }) })).get('/api/resources');
  const c = parNom(res.body.configmaps);
  assert.deepEqual(
    c['web-config'].keys.map((k) => [k.name, k.size, k.binary]),
    [['app.yaml', 12, false], ['logo', 3, true], ['MODE', 4, false]],
  );
  assert.ok(!JSON.stringify(res.body.configmaps).includes('valeur'), 'les valeurs ne doivent jamais être renvoyées');
  assert.deepEqual(c['web-config'].usedBy, [{ kind: 'Deployment', name: 'web' }]);
  assert.deepEqual(c['kube-root-ca.crt'].usedBy, []);
  assert.equal(c.absente.missing, true);
  assert.equal(c.absente.problem, 'CONFIGMAP_ABSENTE');
});

test('PVC et HPA : état, utilisateurs, métriques', async () => {
  const res = await request(createApp({ kube: fakeGateway({ resources: ressources(), defaultNs: 'ns' }) })).get('/api/resources');
  const v = parNom(res.body.persistentvolumeclaims);
  assert.equal(v.donnees.category, 'ok');
  assert.equal(v.donnees.capacity, '1Gi');
  assert.deepEqual(v.donnees.usedBy, [{ kind: 'Deployment', name: 'web' }]);
  assert.equal(v.orpheline.problem, 'EN_ATTENTE_SANS_POD');
  const h = res.body.horizontalpodautoscalers[0];
  assert.deepEqual(h.target, { kind: 'Deployment', name: 'web' });
  assert.deepEqual(h.metrics, [{ type: 'Resource', name: 'cpu', target: { value: 80, unit: '%' }, current: { value: 12, unit: '%' } }]);
  assert.equal(h.category, 'ok');
});

test('HPA sans métriques ou au maximum : diagnostic avec le message de Kubernetes', () => {
  const sansMetriques = mapHpa({
    metadata: { name: 'h' },
    spec: { scaleTargetRef: { kind: 'Deployment', name: 'web' }, maxReplicas: 3, metrics: [] },
    status: { conditions: [{ type: 'AbleToScale', status: 'True' }, { type: 'ScalingActive', status: 'False', message: 'missing request for cpu' }] },
  });
  assert.equal(sansMetriques.problem, 'METRIQUES_INDISPONIBLES');
  assert.equal(sansMetriques.message, 'missing request for cpu');
  const auMax = mapHpa({ metadata: { name: 'h' }, spec: { maxReplicas: 3 }, status: { conditions: [{ type: 'ScalingLimited', status: 'True', reason: 'TooManyReplicas' }] } });
  assert.equal(auMax.problem, 'AU_MAXIMUM');
});

test('PVC perdue ou en cours de suppression', () => {
  assert.equal(mapPvc({ metadata: { name: 'p' }, status: { phase: 'Lost' } }, []).problem, 'PERDU');
  assert.equal(mapPvc({ metadata: { name: 'p', deletionTimestamp: new Date() }, status: { phase: 'Bound' } }, []).status, 'Terminating');
});

test('EndpointSlices interdites : les endpoints sont déduits de l’état des Pods', async () => {
  const kube = fakeGateway({ resources: ressources(), defaultNs: 'ns', fail: (m) => m === 'listNamespacedEndpointSlice' && apiException(403) });
  const res = await request(createApp({ kube })).get('/api/resources');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.forbidden, ['endpointslices']);
  assert.deepEqual(parNom(res.body.services).web.endpoints, { ready: 1, total: 1 });
});

test('Pods interdits : les Services restent listés, sans diagnostic de sélecteur', async () => {
  const kube = fakeGateway({ resources: ressources(), defaultNs: 'ns', fail: (m) => m === 'listNamespacedPod' && apiException(403) });
  const res = await request(createApp({ kube })).get('/api/resources');
  const s = parNom(res.body.services);
  assert.equal(s.perdu.matchingPods, null);
  assert.equal(s.perdu.targets, null);
  assert.equal(parNom(res.body.configmaps)['web-config'].usedBy, null);
});

test('API autoscaling/v2 absente : HPA signalés comme indisponibles', async () => {
  const kube = fakeGateway({ resources: ressources(), defaultNs: 'ns', fail: (m) => m === 'listNamespacedHorizontalPodAutoscaler' && apiException(404) });
  const res = await request(createApp({ kube })).get('/api/resources');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.unavailable, ['horizontalpodautoscalers']);
  assert.equal(res.body.horizontalpodautoscalers, null);
});

test('aucun type de ressource lisible : 403 ACCES_REFUSE', async () => {
  const types = ['Service', 'EndpointSlice', 'Ingress', 'ConfigMap', 'PersistentVolumeClaim', 'HorizontalPodAutoscaler'];
  const kube = fakeGateway({ resources: ressources(), defaultNs: 'ns', fail: (m) => types.some((t) => m === `listNamespaced${t}`) && apiException(403) });
  const res = await request(createApp({ kube })).get('/api/resources');
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'ACCES_REFUSE');
});
