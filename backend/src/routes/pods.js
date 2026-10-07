// Routes des Pods.
import { Router } from 'express';
import { AppError, toAppError, withTimeout } from '../errors.js';
import { readNamespace } from '../kube/namespaceData.js';
import { buildOwnerIndex, directOwner, mapPod } from '../mappers/pod.js';
import { eventsFor } from '../mappers/event.js';
import { mapDaemonSet, mapDeployment, mapJob, mapCronJob, mapStatefulSet } from '../mappers/workload.js';
import { scope, validName } from './scope.js';

// Lecture facultative : un refus (403) ou une absence (404) donne null au
// lieu d'une erreur, pour afficher le reste de la fiche.
async function facultatif(promesse) {
  try {
    return { value: await withTimeout(promesse) };
  } catch (err) {
    const e = toAppError(err);
    if (e.code === 'ACCES_REFUSE') return { value: null, forbidden: true };
    if (e.code === 'INTROUVABLE') return { value: null };
    throw err;
  }
}

// Lecture d'une charge de travail par type, pour la ligne « Conséquence ».
const LECTEURS = {
  Deployment: (k, name, namespace) => k.apps.readNamespacedDeployment({ name, namespace }),
  StatefulSet: (k, name, namespace) => k.apps.readNamespacedStatefulSet({ name, namespace }),
  DaemonSet: (k, name, namespace) => k.apps.readNamespacedDaemonSet({ name, namespace }),
  Job: (k, name, namespace) => k.batch.readNamespacedJob({ name, namespace }),
  CronJob: (k, name, namespace) => k.batch.readNamespacedCronJob({ name, namespace }),
};
const MAPPEURS = { Deployment: mapDeployment, StatefulSet: mapStatefulSet, DaemonSet: mapDaemonSet, Job: mapJob, CronJob: mapCronJob };

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

  // GET /api/pods/:nom : détail d'un Pod, ses conteneurs, ses événements et
  // l'état de la charge de travail qui le gère.
  r.get('/pods/:name', async (req, res) => {
    const { ctx, ns, k } = scope(kube, req);
    const name = validName(req.params.name, 'nom de Pod');
    const pod = await withTimeout(k.core.readNamespacedPod({ name, namespace: ns }));

    // Remontée vers la charge de travail de premier niveau (ReplicaSet → Deployment, Job → CronJob).
    const owner = directOwner(pod);
    const owners = { ReplicaSet: new Map(), Job: new Map() };
    if (owner && owners[owner.kind]) {
      const lire = owner.kind === 'ReplicaSet' ? k.apps.readNamespacedReplicaSet.bind(k.apps) : k.batch.readNamespacedJob.bind(k.batch);
      const parent = await facultatif(lire({ name: owner.name, namespace: ns }));
      const o = parent.value && directOwner(parent.value);
      if (o) owners[owner.kind].set(owner.name, o);
    }
    const mapped = mapPod(pod, Date.now(), owners);

    const [evenements, charge] = await Promise.all([
      facultatif(
        k.core.listNamespacedEvent({
          namespace: ns,
          fieldSelector: `involvedObject.kind=Pod,involvedObject.name=${name}`,
        }),
      ),
      mapped.workload && LECTEURS[mapped.workload.kind]
        ? facultatif(LECTEURS[mapped.workload.kind](k, mapped.workload.name, ns))
        : Promise.resolve({ value: null }),
    ]);

    res.json({
      ctx,
      ns,
      pod: mapped,
      events: evenements.value ? eventsFor(evenements.value.items, pod.metadata?.uid) : [],
      eventsForbidden: Boolean(evenements.forbidden),
      workload: charge.value ? MAPPEURS[mapped.workload.kind](charge.value) : null,
    });
  });

  return r;
}
