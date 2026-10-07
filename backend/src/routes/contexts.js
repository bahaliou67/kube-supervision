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
      contexts: contexts.map((c) => ({ ...c, defaultNamespace: c.namespace || 'default' })),
    });
  });
  return r;
}
