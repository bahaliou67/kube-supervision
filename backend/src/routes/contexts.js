// GET /api/contexts : contextes du kubeconfig et contexte courant.
import { Router } from 'express';

export function contextsRouter(kube) {
  const r = Router();
  r.get('/contexts', (req, res) => {
    // Relit le kubeconfig : un contexte ajouté entre-temps apparaît sans redémarrage.
    if (typeof kube.reload === 'function' && req.query.reload === '1') kube.reload();
    const { contexts, current } = kube.listContexts();
    res.json({
      current,
      // Liste explicite des champs : rien d'autre du kubeconfig ne sort (jetons, certificats, utilisateurs).
      contexts: contexts.map((c) => ({ name: c.name, cluster: c.cluster, namespace: c.namespace ?? null, defaultNamespace: c.namespace || 'default' })),
    });
  });
  return r;
}
