// Transformation des charges de travail (Deployments, StatefulSets,
// DaemonSets, Jobs, CronJobs) en données prêtes pour l'écran.
import { ageSeconds, directOwner } from './pod.js';

// Images des conteneurs d'un modèle de Pod (sans doublon).
function images(template) {
  const noms = (template?.spec?.containers ?? []).map((c) => c.image).filter(Boolean);
  return [...new Set(noms)];
}

function base(kind, obj, now) {
  return {
    kind,
    name: obj.metadata?.name,
    uid: obj.metadata?.uid,
    createdAt: obj.metadata?.creationTimestamp ?? null,
    age: ageSeconds(obj.metadata?.creationTimestamp, now),
    owner: directOwner(obj),
  };
}

// Condition d'un objet (Available, Progressing, Complete, Failed…).
function condition(obj, type) {
  return (obj.status?.conditions ?? []).find((c) => c.type === type) ?? null;
}

export function mapDeployment(d, now = Date.now()) {
  const progres = condition(d, 'Progressing');
  return {
    ...base('Deployment', d, now),
    desired: d.spec?.replicas ?? 1,
    ready: d.status?.readyReplicas ?? 0,
    updated: d.status?.updatedReplicas ?? 0,
    available: d.status?.availableReplicas ?? 0,
    images: images(d.spec?.template),
    paused: Boolean(d.spec?.paused),
    // Déploiement bloqué (ProgressDeadlineExceeded) : signalé à l'écran.
    stalled: progres?.reason === 'ProgressDeadlineExceeded',
    selector: d.spec?.selector?.matchLabels ?? null,
  };
}

export function mapStatefulSet(s, now = Date.now()) {
  return {
    ...base('StatefulSet', s, now),
    desired: s.spec?.replicas ?? 1,
    ready: s.status?.readyReplicas ?? 0,
    updated: s.status?.updatedReplicas ?? 0,
    available: s.status?.availableReplicas ?? s.status?.readyReplicas ?? 0,
    images: images(s.spec?.template),
  };
}

export function mapDaemonSet(ds, now = Date.now()) {
  return {
    ...base('DaemonSet', ds, now),
    desired: ds.status?.desiredNumberScheduled ?? 0,
    ready: ds.status?.numberReady ?? 0,
    updated: ds.status?.updatedNumberScheduled ?? 0,
    available: ds.status?.numberAvailable ?? 0,
    images: images(ds.spec?.template),
  };
}

export function mapJob(j, now = Date.now()) {
  const complet = condition(j, 'Complete')?.status === 'True';
  const echec = condition(j, 'Failed');
  let state = 'running';
  if (complet) state = 'complete';
  else if (echec?.status === 'True') state = 'failed';
  else if (j.spec?.suspend) state = 'suspended';
  return {
    ...base('Job', j, now),
    completions: j.spec?.completions ?? (j.spec?.parallelism ? null : 1),
    succeeded: j.status?.succeeded ?? 0,
    failed: j.status?.failed ?? 0,
    active: j.status?.active ?? 0,
    state,
    failureReason: echec?.status === 'True' ? echec.reason ?? null : null,
    failureMessage: echec?.status === 'True' ? echec.message ?? null : null,
    startedAt: j.status?.startTime ?? null,
    finishedAt: j.status?.completionTime ?? null,
    images: images(j.spec?.template),
  };
}

export function mapCronJob(c, now = Date.now()) {
  return {
    ...base('CronJob', c, now),
    schedule: c.spec?.schedule ?? null,
    timeZone: c.spec?.timeZone ?? null,
    suspended: Boolean(c.spec?.suspend),
    active: (c.status?.active ?? []).length,
    lastScheduleTime: c.status?.lastScheduleTime ?? null,
    lastSuccessfulTime: c.status?.lastSuccessfulTime ?? null,
    images: images(c.spec?.jobTemplate?.spec?.template),
  };
}

// Toutes les charges de travail d'un namespace, à partir des listes lues.
// Les Jobs créés par un CronJob sont rattachés au CronJob (champ cronJob)
// pour ne pas encombrer la liste principale.
export function mapWorkloads(data, now = Date.now()) {
  const items = [];
  for (const d of data.deployments ?? []) items.push(mapDeployment(d, now));
  for (const s of data.statefulsets ?? []) items.push(mapStatefulSet(s, now));
  for (const ds of data.daemonsets ?? []) items.push(mapDaemonSet(ds, now));
  for (const c of data.cronjobs ?? []) items.push(mapCronJob(c, now));
  for (const j of data.jobs ?? []) {
    const job = mapJob(j, now);
    job.cronJob = job.owner?.kind === 'CronJob' ? job.owner.name : null;
    items.push(job);
  }
  return items;
}
