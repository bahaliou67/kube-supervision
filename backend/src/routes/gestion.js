// Actions de gestion, toutes confirmées dans l'interface. Comme les actions
// de base, elles n'acceptent que des requêtes venant de la page de l'outil et
// sont journalisées sans détail sensible.
//
// DELETE /api/resources/:type/:nom                       supprimer une ressource
// POST   /api/workloads/deployments/:nom/pause            corps : { paused }
// GET    /api/workloads/deployments/:nom/revisions        versions disponibles
// POST   /api/workloads/deployments/:nom/rollback         corps : { revision }
// POST   /api/workloads/cronjobs/:nom/suspend             corps : { suspended }
// POST   /api/workloads/cronjobs/:nom/trigger             lancer un Job maintenant
import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import * as k8s from '@kubernetes/client-node';
import { AppError, withTimeout } from '../errors.js';
import { sameOrigin } from '../security.js';
import { listAll } from '../kube/namespaceData.js';
import { fusion, journal } from './actions.js';
import { scope, validName } from './scope.js';

// Types supprimables : segment d'URL → type, client et méthode.
export const SUPPRESSIONS = {
  deployments: { kind: 'Deployment', api: 'apps', methode: 'deleteNamespacedDeployment' },
  statefulsets: { kind: 'StatefulSet', api: 'apps', methode: 'deleteNamespacedStatefulSet' },
  daemonsets: { kind: 'DaemonSet', api: 'apps', methode: 'deleteNamespacedDaemonSet' },
  jobs: { kind: 'Job', api: 'batch', methode: 'deleteNamespacedJob' },
  cronjobs: { kind: 'CronJob', api: 'batch', methode: 'deleteNamespacedCronJob' },
  services: { kind: 'Service', api: 'core', methode: 'deleteNamespacedService' },
  ingresses: { kind: 'Ingress', api: 'networking', methode: 'deleteNamespacedIngress' },
  configmaps: { kind: 'ConfigMap', api: 'core', methode: 'deleteNamespacedConfigMap' },
  persistentvolumeclaims: { kind: 'PersistentVolumeClaim', api: 'core', methode: 'deleteNamespacedPersistentVolumeClaim' },
  horizontalpodautoscalers: { kind: 'HorizontalPodAutoscaler', api: 'autoscaling', methode: 'deleteNamespacedHorizontalPodAutoscaler' },
};

const REVISION = 'deployment.kubernetes.io/revision';
const CAUSE = 'kubernetes.io/change-cause';

// Booléen obligatoire dans le corps de la requête.
function booleen(valeur, nom) {
  if (typeof valeur !== 'boolean') throw new AppError(400, 'PARAMETRE_INVALIDE', { detail: `${nom} doit valoir true ou false` });
  return valeur;
}

// ReplicaSets d'un Deployment, avec leur numéro de révision (le plus récent d'abord).
async function revisions(k, ns, deployment) {
  const { items } = await listAll(k, 'replicasets', ns);
  const uid = deployment.metadata?.uid;
  return items
    .filter((rs) => (rs.metadata?.ownerReferences ?? []).some((o) => o.uid === uid))
    .map((rs) => ({ revision: Number(rs.metadata?.annotations?.[REVISION]), rs }))
    .filter((r) => Number.isInteger(r.revision))
    .sort((a, b) => b.revision - a.revision);
}

const images = (template) => [...new Set((template?.spec?.containers ?? []).map((c) => c.image).filter(Boolean))];

// Nom du Job lancé à la main : « nuit-manuel-a1b2c3 » (63 caractères au plus).
function nomJobManuel(cronjob) {
  const suffixe = `-manuel-${randomBytes(3).toString('hex')}`;
  return `${cronjob.slice(0, 63 - suffixe.length).replace(/[-.]+$/, '')}${suffixe}`;
}

export function gestionRouter(kube) {
  const r = Router();

  r.delete('/resources/:type/:name', sameOrigin, async (req, res) => {
    const { ctx, ns, k } = scope(kube, req);
    const t = SUPPRESSIONS[String(req.params.type).toLowerCase()];
    if (!t) throw new AppError(400, 'ACTION_IMPOSSIBLE', { type: String(req.params.type).slice(0, 40) });
    const name = validName(req.params.name, 'nom');
    // Background : les objets dépendants (Pods d'un Job, ReplicaSets…) sont
    // supprimés aussi ; sans cela, l'API laisserait les Pods d'un Job orphelins.
    await withTimeout(k[t.api][t.methode]({ name, namespace: ns, propagationPolicy: 'Background' }));
    journal(ctx, ns, `suppression de ${t.kind} ${name}`);
    res.json({ ok: true, kind: t.kind, name });
  });

  r.post('/workloads/deployments/:name/pause', sameOrigin, async (req, res) => {
    const { ctx, ns, k } = scope(kube, req);
    const name = validName(req.params.name, 'nom');
    const paused = booleen(req.body?.paused, 'paused');
    await withTimeout(k.apps.patchNamespacedDeployment({ name, namespace: ns, body: { spec: { paused } } }, fusion()));
    journal(ctx, ns, `${paused ? 'pause' : 'reprise'} du déploiement de Deployment ${name}`);
    res.json({ ok: true, kind: 'Deployment', name, paused });
  });

  r.get('/workloads/deployments/:name/revisions', async (req, res) => {
    const { ctx, ns, k } = scope(kube, req);
    const name = validName(req.params.name, 'nom');
    const d = await withTimeout(k.apps.readNamespacedDeployment({ name, namespace: ns }));
    const actuelle = Number(d.metadata?.annotations?.[REVISION]) || null;
    const liste = await revisions(k, ns, d);
    res.json({
      ctx,
      ns,
      name,
      paused: Boolean(d.spec?.paused),
      current: actuelle,
      items: liste.map(({ revision, rs }) => ({
        revision,
        replicaSet: rs.metadata?.name,
        createdAt: rs.metadata?.creationTimestamp ?? null,
        images: images(rs.spec?.template),
        changeCause: rs.metadata?.annotations?.[CAUSE] ?? null,
        current: revision === actuelle,
      })),
    });
  });

  // Retour à une version précédente, comme « kubectl rollout undo » : le
  // modèle de Pod du ReplicaSet choisi remplace celui du Deployment. Kubernetes
  // réutilise alors ce ReplicaSet et remplace progressivement les Pods.
  r.post('/workloads/deployments/:name/rollback', sameOrigin, async (req, res) => {
    const { ctx, ns, k } = scope(kube, req);
    const name = validName(req.params.name, 'nom');
    const revision = req.body?.revision;
    if (!Number.isInteger(revision) || revision < 1) throw new AppError(400, 'PARAMETRE_INVALIDE', { detail: 'revision doit être un entier positif' });
    const d = await withTimeout(k.apps.readNamespacedDeployment({ name, namespace: ns }));
    if (d.spec?.paused) throw new AppError(409, 'ROLLBACK_EN_PAUSE');
    if (Number(d.metadata?.annotations?.[REVISION]) === revision) throw new AppError(409, 'REVISION_ACTUELLE', { revision });
    const cible = (await revisions(k, ns, d)).find((x) => x.revision === revision);
    if (!cible) throw new AppError(404, 'REVISION_INCONNUE', { revision });

    const template = structuredClone(cible.rs.spec.template);
    // Label ajouté par Kubernetes au ReplicaSet, absent du modèle du Deployment.
    if (template.metadata?.labels) delete template.metadata.labels['pod-template-hash'];
    // JSON patch : le modèle est remplacé tel quel (un merge patch garderait
    // les labels et annotations ajoutés depuis, et créerait une nouvelle version).
    const patch = [{ op: 'replace', path: '/spec/template', value: template }];
    await withTimeout(k.apps.patchNamespacedDeployment({ name, namespace: ns, body: patch }, k8s.setHeaderOptions('Content-Type', k8s.PatchStrategy.JsonPatch)));
    journal(ctx, ns, `retour de Deployment ${name} à la révision ${revision}`);
    res.json({ ok: true, kind: 'Deployment', name, revision });
  });

  r.post('/workloads/cronjobs/:name/suspend', sameOrigin, async (req, res) => {
    const { ctx, ns, k } = scope(kube, req);
    const name = validName(req.params.name, 'nom');
    const suspended = booleen(req.body?.suspended, 'suspended');
    await withTimeout(k.batch.patchNamespacedCronJob({ name, namespace: ns, body: { spec: { suspend: suspended } } }, fusion()));
    journal(ctx, ns, `${suspended ? 'suspension' : 'réactivation'} de CronJob ${name}`);
    res.json({ ok: true, kind: 'CronJob', name, suspended });
  });

  // Lancement immédiat, comme « kubectl create job --from=cronjob/… » : un Job
  // créé à partir du modèle du CronJob et rattaché à celui-ci.
  r.post('/workloads/cronjobs/:name/trigger', sameOrigin, async (req, res) => {
    const { ctx, ns, k } = scope(kube, req);
    const name = validName(req.params.name, 'nom');
    const cj = await withTimeout(k.batch.readNamespacedCronJob({ name, namespace: ns }));
    const modele = cj.spec?.jobTemplate;
    if (!modele?.spec) throw new AppError(400, 'SANS_MODELE');
    const job = nomJobManuel(name);
    await withTimeout(
      k.batch.createNamespacedJob({
        namespace: ns,
        body: {
          apiVersion: 'batch/v1',
          kind: 'Job',
          metadata: {
            name: job,
            namespace: ns,
            labels: modele.metadata?.labels,
            annotations: { ...modele.metadata?.annotations, 'cronjob.kubernetes.io/instantiate': 'manual' },
            ownerReferences: [{ apiVersion: 'batch/v1', kind: 'CronJob', name, uid: cj.metadata.uid, controller: true }],
          },
          spec: modele.spec,
        },
      }),
    );
    journal(ctx, ns, `lancement manuel de CronJob ${name} (Job ${job})`);
    res.json({ ok: true, kind: 'CronJob', name, job });
  });

  return r;
}
