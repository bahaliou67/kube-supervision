// Les trois actions de l'outil. Elles n'acceptent que des requêtes venant de
// la page de l'outil (voir security.js) et sont journalisées sans détail
// sensible.
//
// POST   /api/workloads/:type/:nom/restart   Deployments, StatefulSets, DaemonSets
// POST   /api/workloads/:type/:nom/scale     Deployments, StatefulSets ; corps : { replicas }
// DELETE /api/pods/:nom
import { Router } from 'express';
import * as k8s from '@kubernetes/client-node';
import { AppError, withTimeout } from '../errors.js';
import { sameOrigin } from '../security.js';
import { scope, validName } from './scope.js';

export const REPLICAS_MAX = 1000;

// « deployments », « deployment » ou « Deployment » → Deployment.
const TYPES = {
  deployment: 'Deployment',
  deployments: 'Deployment',
  statefulset: 'StatefulSet',
  statefulsets: 'StatefulSet',
  daemonset: 'DaemonSet',
  daemonsets: 'DaemonSet',
};
function typeDe(brut, autorises) {
  const kind = TYPES[String(brut).toLowerCase()];
  if (!kind || !autorises.includes(kind)) {
    throw new AppError(400, 'ACTION_IMPOSSIBLE', { type: String(brut).slice(0, 40) });
  }
  return kind;
}

const fusion = () => k8s.setHeaderOptions('Content-Type', k8s.PatchStrategy.MergePatch);

// Redémarrage progressif, comme « kubectl rollout restart » : on modifie une
// annotation du modèle de Pod, ce qui provoque le remplacement des Pods.
const REDEMARRER = {
  Deployment: (k, args, o) => k.apps.patchNamespacedDeployment(args, o),
  StatefulSet: (k, args, o) => k.apps.patchNamespacedStatefulSet(args, o),
  DaemonSet: (k, args, o) => k.apps.patchNamespacedDaemonSet(args, o),
};
const AJUSTER = {
  Deployment: (k, args, o) => k.apps.patchNamespacedDeploymentScale(args, o),
  StatefulSet: (k, args, o) => k.apps.patchNamespacedStatefulSetScale(args, o),
};

function journal(ctx, ns, texte) {
  console.log(`[action] ${texte} — ${ns} sur ${ctx}`);
}

export function actionsRouter(kube) {
  const r = Router();

  r.post('/workloads/:type/:name/restart', sameOrigin, async (req, res) => {
    const { ctx, ns, k } = scope(kube, req);
    const kind = typeDe(req.params.type, Object.keys(REDEMARRER));
    const name = validName(req.params.name, 'nom');
    const body = { spec: { template: { metadata: { annotations: { 'kubectl.kubernetes.io/restartedAt': new Date().toISOString() } } } } };
    await withTimeout(REDEMARRER[kind](k, { name, namespace: ns, body }, fusion()));
    journal(ctx, ns, `redémarrage de ${kind} ${name}`);
    res.json({ ok: true, kind, name });
  });

  r.post('/workloads/:type/:name/scale', sameOrigin, async (req, res) => {
    const { ctx, ns, k } = scope(kube, req);
    const kind = typeDe(req.params.type, Object.keys(AJUSTER));
    const name = validName(req.params.name, 'nom');
    const replicas = req.body?.replicas;
    if (!Number.isInteger(replicas) || replicas < 0 || replicas > REPLICAS_MAX) {
      throw new AppError(400, 'REPLICAS_INVALIDE', { max: REPLICAS_MAX });
    }
    const reponse = await withTimeout(AJUSTER[kind](k, { name, namespace: ns, body: { spec: { replicas } } }, fusion()));
    journal(ctx, ns, `${kind} ${name} passé à ${replicas} réplica(s)`);
    res.json({ ok: true, kind, name, replicas: reponse?.spec?.replicas ?? replicas });
  });

  r.delete('/pods/:name', sameOrigin, async (req, res) => {
    const { ctx, ns, k } = scope(kube, req);
    const name = validName(req.params.name, 'nom de Pod');
    await withTimeout(k.core.deleteNamespacedPod({ name, namespace: ns }));
    journal(ctx, ns, `suppression du Pod ${name}`);
    res.json({ ok: true, name });
  });

  return r;
}
