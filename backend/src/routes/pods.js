// Routes des Pods.
import { Router } from 'express';
import { AppError } from '../errors.js';
import { readNamespace } from '../kube/namespaceData.js';
import { buildOwnerIndex, mapPod } from '../mappers/pod.js';
import { scope } from './scope.js';

export function podsRouter(kube) {
  const r = Router();

  // GET /api/pods : tous les Pods du namespace, résumés, avec leur charge de
  // travail (Deployment, StatefulSet, DaemonSet, CronJob, Job ou aucune).
  r.get('/pods', async (req, res) => {
    const { ctx, ns, k } = scope(kube, req);
    const { data, forbidden } = await readNamespace(k, ns, ['pods', 'replicasets', 'jobs']);
    if (data.pods === null) throw new AppError(403, 'ACCES_REFUSE');
    const owners = buildOwnerIndex(data.replicasets, data.jobs);
    const now = Date.now();
    res.json({ ctx, ns, forbidden, items: data.pods.map((p) => mapPod(p, now, owners)) });
  });

  return r;
}
