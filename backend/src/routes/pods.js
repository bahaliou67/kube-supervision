// Routes des Pods.
import { Router } from 'express';
import { withTimeout } from '../errors.js';
import { mapPod } from '../mappers/pod.js';
import { scope } from './scope.js';

export function podsRouter(kube) {
  const r = Router();

  // GET /api/pods : tous les Pods du namespace, résumés.
  r.get('/pods', async (req, res) => {
    const { ctx, ns, k } = scope(kube, req);
    const liste = await withTimeout(k.core.listNamespacedPod({ namespace: ns }));
    const now = Date.now();
    res.json({ ctx, ns, items: (liste.items ?? []).map((p) => mapPod(p, now)) });
  });

  return r;
}
