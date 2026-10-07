// GET /api/permissions : ce que l'utilisateur a le droit de faire dans le
// namespace, vérifié auprès du cluster (SelfSubjectAccessReview).
//
// Chaque droit vaut true, false, ou null si le cluster n'a pas pu répondre
// (le front laisse alors l'action possible : le cluster tranchera).
import { Router } from 'express';
import { toAppError, withTimeout } from '../errors.js';
import { scope } from './scope.js';

// Droits vérifiés : clé → attributs de la demande d'accès.
export const DROITS = {
  'pods.list': { verb: 'list', resource: 'pods' },
  'pods.log': { verb: 'get', resource: 'pods', subresource: 'log' },
  'pods.delete': { verb: 'delete', resource: 'pods' },
  'events.list': { verb: 'list', resource: 'events' },
  'deployments.restart': { verb: 'patch', group: 'apps', resource: 'deployments' },
  'statefulsets.restart': { verb: 'patch', group: 'apps', resource: 'statefulsets' },
  'daemonsets.restart': { verb: 'patch', group: 'apps', resource: 'daemonsets' },
  'deployments.scale': { verb: 'patch', group: 'apps', resource: 'deployments', subresource: 'scale' },
  'statefulsets.scale': { verb: 'patch', group: 'apps', resource: 'statefulsets', subresource: 'scale' },
  'namespaces.list': { verb: 'list', resource: 'namespaces', clusterScoped: true },
  // Gestion : suppression, pause, retour arrière, CronJobs.
  'deployments.delete': { verb: 'delete', group: 'apps', resource: 'deployments' },
  'statefulsets.delete': { verb: 'delete', group: 'apps', resource: 'statefulsets' },
  'daemonsets.delete': { verb: 'delete', group: 'apps', resource: 'daemonsets' },
  'jobs.delete': { verb: 'delete', group: 'batch', resource: 'jobs' },
  'cronjobs.delete': { verb: 'delete', group: 'batch', resource: 'cronjobs' },
  'services.delete': { verb: 'delete', resource: 'services' },
  'ingresses.delete': { verb: 'delete', group: 'networking.k8s.io', resource: 'ingresses' },
  'configmaps.delete': { verb: 'delete', resource: 'configmaps' },
  'persistentvolumeclaims.delete': { verb: 'delete', resource: 'persistentvolumeclaims' },
  'horizontalpodautoscalers.delete': { verb: 'delete', group: 'autoscaling', resource: 'horizontalpodautoscalers' },
  'replicasets.list': { verb: 'list', group: 'apps', resource: 'replicasets' },
  'cronjobs.patch': { verb: 'patch', group: 'batch', resource: 'cronjobs' },
  'jobs.create': { verb: 'create', group: 'batch', resource: 'jobs' },
  'horizontalpodautoscalers.patch': { verb: 'patch', group: 'autoscaling', resource: 'horizontalpodautoscalers' },
};

async function verifier(k, ns, { clusterScoped, ...attributs }) {
  try {
    const reponse = await withTimeout(
      k.authz.createSelfSubjectAccessReview({
        body: {
          apiVersion: 'authorization.k8s.io/v1',
          kind: 'SelfSubjectAccessReview',
          spec: { resourceAttributes: { ...attributs, namespace: clusterScoped ? undefined : ns } },
        },
      }),
    );
    return { allowed: Boolean(reponse.status?.allowed), reason: reponse.status?.reason ?? null };
  } catch (err) {
    const e = toAppError(err);
    // La vérification elle-même est refusée ou absente : droit inconnu.
    if (e.code === 'ACCES_REFUSE' || e.code === 'INTROUVABLE' || e.code === 'API_INCOMPATIBLE') return { allowed: null, reason: null };
    throw err;
  }
}

export function permissionsRouter(kube) {
  const r = Router();
  r.get('/permissions', async (req, res) => {
    const { ctx, ns, k } = scope(kube, req);
    const cles = Object.keys(DROITS);
    const resultats = await Promise.all(cles.map((c) => verifier(k, ns, DROITS[c])));
    res.json({ ctx, ns, checks: Object.fromEntries(cles.map((c, i) => [c, resultats[i]])) });
  });
  return r;
}
