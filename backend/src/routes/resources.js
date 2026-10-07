// GET /api/resources : Services, Ingress, ConfigMaps, PersistentVolumeClaims
// et HorizontalPodAutoscalers du namespace, avec leur diagnostic.
import { Router } from 'express';
import { AppError } from '../errors.js';
import { readNamespace } from '../kube/namespaceData.js';
import { TYPES_RESSOURCES, mapResources } from '../mappers/resources.js';
import { scope } from './scope.js';

// Lus en plus pour relier les ressources aux Pods et aux charges de travail.
const TYPES_LIES = ['pods', 'replicasets', 'jobs'];

export function resourcesRouter(kube) {
  const r = Router();
  r.get('/resources', async (req, res) => {
    const { ctx, ns, k } = scope(kube, req);
    const { data, forbidden, unavailable } = await readNamespace(k, ns, [...TYPES_RESSOURCES, ...TYPES_LIES]);
    // Aucun type lisible : c'est un refus d'accès pour cet écran.
    if (TYPES_RESSOURCES.every((t) => forbidden.includes(t))) throw new AppError(403, 'ACCES_REFUSE');
    res.json({ ctx, ns, forbidden, unavailable, ...mapResources(data) });
  });
  return r;
}
