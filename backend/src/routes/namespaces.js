// GET /api/namespaces : namespaces visibles par l'utilisateur.
//
// Si la liste est interdite (403), ce n'est pas une panne : on répond 200
// avec listable=false, et le front propose une saisie manuelle du namespace.
import { Router } from 'express';
import { toAppError, withTimeout } from '../errors.js';

export function namespacesRouter(kube) {
  const r = Router();
  r.get('/namespaces', async (req, res) => {
    const ctx = kube.resolveContext(req.query.ctx || undefined).name;
    const k = kube.clients(ctx);
    const defaultNs = kube.defaultNamespace(ctx);
    try {
      const liste = await withTimeout(k.core.listNamespace());
      const items = (liste.items ?? [])
        .map((n) => ({ name: n.metadata?.name, phase: n.status?.phase ?? null }))
        .filter((n) => n.name)
        .sort((a, b) => a.name.localeCompare(b.name));
      res.json({ ctx, listable: true, defaultNamespace: defaultNs, items });
    } catch (err) {
      const e = toAppError(err);
      if (e.code !== 'ACCES_REFUSE') throw e;
      res.json({ ctx, listable: false, defaultNamespace: defaultNs, items: [] });
    }
  });
  return r;
}
