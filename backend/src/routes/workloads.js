// GET /api/workloads : Deployments, StatefulSets, DaemonSets, Jobs, CronJobs.
import { Router } from 'express';
import { AppError } from '../errors.js';
import { readNamespace } from '../kube/namespaceData.js';
import { mapWorkloads } from '../mappers/workload.js';
import { scope } from './scope.js';

export const TYPES_CHARGES = ['deployments', 'statefulsets', 'daemonsets', 'jobs', 'cronjobs'];

export function workloadsRouter(kube) {
  const r = Router();
  r.get('/workloads', async (req, res) => {
    const { ctx, ns, k } = scope(kube, req);
    const { data, forbidden, unavailable } = await readNamespace(k, ns, TYPES_CHARGES);
    // Aucun type lisible : c'est un refus d'accès pour cet écran.
    if (forbidden.length === TYPES_CHARGES.length) throw new AppError(403, 'ACCES_REFUSE');
    res.json({ ctx, ns, forbidden, unavailable, items: mapWorkloads(data) });
  });
  return r;
}
