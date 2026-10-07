// Transformation d'un objet Pod Kubernetes en données prêtes pour l'écran.
//
// Le statut affiché suit la logique de « kubectl get pods » : la raison la
// plus parlante parmi la phase du Pod, les init containers et les conteneurs
// (CrashLoopBackOff, OOMKilled, ImagePullBackOff, Init:0/1, Terminating…).
// On y ajoute une catégorie (ok, attente, erreur, arret) utilisée pour les
// compteurs et la couleur du badge.

// Raisons qui signalent un problème, quel que soit le contexte.
const RAISONS_ERREUR = new Set([
  'CrashLoopBackOff',
  'Error',
  'OOMKilled',
  'ImagePullBackOff',
  'ErrImagePull',
  'InvalidImageName',
  'ErrImageNeverPull',
  'CreateContainerConfigError',
  'CreateContainerError',
  'RunContainerError',
  'StartError',
  'ContainerCannotRun',
  'DeadlineExceeded',
  'Evicted',
  'Failed',
  'NodeLost',
  'Unknown',
  'UnexpectedAdmissionError',
  'OutOfmemory',
  'OutOfcpu',
  'ContainerStatusUnknown',
]);

// Âge en secondes depuis une date ISO.
export function ageSeconds(date, now = Date.now()) {
  if (!date) return null;
  return Math.max(0, Math.round((now - new Date(date).getTime()) / 1000));
}

// Résumé de l'état d'un conteneur (state = state ou lastState Kubernetes).
function etat(state) {
  if (!state) return null;
  if (state.running) return { state: 'running', startedAt: state.running.startedAt ?? null };
  if (state.waiting) {
    return { state: 'waiting', reason: state.waiting.reason ?? null, message: state.waiting.message ?? null };
  }
  if (state.terminated) {
    const t = state.terminated;
    return {
      state: 'terminated',
      reason: t.reason ?? null,
      message: t.message ?? null,
      exitCode: t.exitCode ?? null,
      signal: t.signal ?? null,
      startedAt: t.startedAt ?? null,
      finishedAt: t.finishedAt ?? null,
    };
  }
  return null;
}

// Statut lisible d'un Pod, calculé comme kubectl, avec le conteneur en cause
// et le message Kubernetes associé : { reason, container, init, message }.
export function podStatus(pod) {
  const status = pod.status ?? {};
  let reason = status.reason || status.phase || 'Unknown';
  let enCause = null;
  let message = status.message ?? null;

  // Init containers : tant qu'ils ne sont pas terminés, ils priment.
  const initSpecs = pod.spec?.initContainers ?? [];
  const initStatuses = status.initContainerStatuses ?? [];
  let initEnCours = false;
  initStatuses.forEach((cs, i) => {
    if (initEnCours) return;
    const term = cs.state?.terminated;
    const wait = cs.state?.waiting;
    // Init container « sidecar » (restartPolicy Always) démarré : il est normal qu'il tourne.
    const sidecar = initSpecs[i]?.restartPolicy === 'Always';
    if (term && term.exitCode === 0) return;
    if (sidecar && cs.started) return;
    enCause = { name: cs.name, init: true };
    if (term) {
      reason = term.reason ? `Init:${term.reason}` : term.signal ? `Init:Signal:${term.signal}` : `Init:ExitCode:${term.exitCode}`;
      message = term.message ?? null;
    } else if (wait?.reason && wait.reason !== 'PodInitializing') {
      reason = `Init:${wait.reason}`;
      message = wait.message ?? null;
    } else {
      reason = `Init:${i}/${initSpecs.length || initStatuses.length}`;
    }
    initEnCours = true;
  });

  if (!initEnCours) {
    let enCours = false;
    const statuses = [...(status.containerStatuses ?? [])].reverse();
    for (const cs of statuses) {
      const w = cs.state?.waiting;
      const t = cs.state?.terminated;
      if (w?.reason) {
        reason = w.reason;
        enCause = { name: cs.name, init: false };
        message = w.message ?? null;
      } else if (t?.reason) {
        reason = t.reason;
        enCause = { name: cs.name, init: false };
        message = t.message ?? null;
      } else if (t) {
        reason = t.signal ? `Signal:${t.signal}` : `ExitCode:${t.exitCode}`;
        enCause = { name: cs.name, init: false };
      } else if (cs.ready && cs.state?.running) {
        enCours = true;
      }
    }
    // Pod terminé normalement mais un conteneur tourne encore.
    if (reason === 'Completed' && enCours) reason = 'Running';
  }

  if (pod.metadata?.deletionTimestamp) {
    reason = status.reason === 'NodeLost' ? 'Unknown' : 'Terminating';
  }

  // Pod en attente de placement : la condition PodScheduled explique pourquoi
  // (par exemple « 0/3 nodes are available: insufficient memory »).
  if (reason === 'Pending') {
    const cond = (status.conditions ?? []).find((c) => c.type === 'PodScheduled' && c.status === 'False');
    if (cond) {
      reason = cond.reason === 'Unschedulable' ? 'Unschedulable' : reason;
      message = cond.message ?? message;
    }
  }
  return { reason, container: enCause?.name ?? null, init: enCause?.init ?? false, message };
}

export function podReason(pod) {
  return podStatus(pod).reason;
}

// Catégorie d'un statut : ok | attente | erreur | arret | termine.
export function categorie(pod, reason) {
  if (reason === 'Terminating') return 'arret';
  if (reason === 'Completed' || pod.status?.phase === 'Succeeded') return 'termine';
  const base = reason.startsWith('Init:') ? reason.slice(5) : reason;
  if (RAISONS_ERREUR.has(base) || base.startsWith('ExitCode:') || base.startsWith('Signal:')) {
    return 'erreur';
  }
  if (pod.status?.phase === 'Failed') return 'erreur';
  if (reason === 'Running') {
    const statuses = pod.status?.containerStatuses ?? [];
    const tousPrets = statuses.length > 0 && statuses.every((cs) => cs.ready);
    return tousPrets ? 'ok' : 'attente';
  }
  return 'attente';
}

// Conteneur dont le dernier arrêt est le plus récent (pour « raison du dernier arrêt »).
function dernierArret(conteneurs) {
  let meilleur = null;
  for (const c of conteneurs) {
    const t = c.state?.state === 'terminated' ? c.state : c.lastState?.state === 'terminated' ? c.lastState : null;
    if (!t) continue;
    if (!meilleur || new Date(t.finishedAt ?? 0) > new Date(meilleur.finishedAt ?? 0)) {
      meilleur = { container: c.name, ...t };
    }
  }
  return meilleur;
}

// Statut et catégorie d'un conteneur, sur le même modèle que ceux du Pod.
export function containerStatus(st, ready, init) {
  if (!st) return { status: 'Pending', category: 'attente' };
  if (st.state === 'running') return { status: 'Running', category: ready || init ? 'ok' : 'attente' };
  if (st.state === 'waiting') {
    const r = st.reason ?? 'Waiting';
    return { status: r, category: RAISONS_ERREUR.has(r) ? 'erreur' : 'attente' };
  }
  const r = st.reason ?? (st.signal ? `Signal:${st.signal}` : `ExitCode:${st.exitCode}`);
  return { status: r, category: st.exitCode === 0 ? 'termine' : 'erreur' };
}

// Mappe la liste des statuts de conteneurs avec leur spécification.
function conteneurs(specs, statuses, init) {
  return (specs ?? []).map((spec) => {
    const cs = (statuses ?? []).find((s) => s.name === spec.name) ?? {};
    const state = etat(cs.state);
    return {
      ...containerStatus(state, Boolean(cs.ready), init),
      name: spec.name,
      init,
      sidecar: init && spec.restartPolicy === 'Always',
      image: spec.image ?? cs.image ?? null,
      ready: Boolean(cs.ready),
      started: cs.started ?? null,
      restarts: cs.restartCount ?? 0,
      state,
      lastState: etat(cs.lastState),
      limits: { memory: spec.resources?.limits?.memory ?? null, cpu: spec.resources?.limits?.cpu ?? null },
      requests: { memory: spec.resources?.requests?.memory ?? null, cpu: spec.resources?.requests?.cpu ?? null },
    };
  });
}

// Propriétaire « contrôleur » direct d'un Pod (avant résolution ReplicaSet → Deployment).
export function directOwner(pod) {
  const refs = pod.metadata?.ownerReferences ?? [];
  const ref = refs.find((r) => r.controller) ?? refs[0];
  return ref ? { kind: ref.kind, name: ref.name } : null;
}

// Charge de travail de premier niveau qui gère le Pod.
// Un ReplicaSet appartient en général à un Deployment, un Job à un CronJob.
export function workloadOf(owner, owners, pod = null) {
  if (!owner) return null;
  const parent = owners?.[owner.kind]?.get(owner.name);
  if (parent) return parent;
  // ReplicaSets illisibles (droits) : on déduit le Deployment du suffixe
  // pod-template-hash que Kubernetes ajoute au nom du ReplicaSet.
  const hash = pod?.metadata?.labels?.['pod-template-hash'];
  if (owner.kind === 'ReplicaSet' && hash && owner.name.endsWith(`-${hash}`) && !owners?.ReplicaSet?.has(owner.name)) {
    return { kind: 'Deployment', name: owner.name.slice(0, -(hash.length + 1)) };
  }
  return owner;
}

// Index des propriétaires des ReplicaSets et des Jobs.
export function buildOwnerIndex(replicaSets, jobs) {
  const index = { ReplicaSet: new Map(), Job: new Map() };
  for (const rs of replicaSets ?? []) {
    const o = directOwner(rs);
    if (o) index.ReplicaSet.set(rs.metadata.name, o);
  }
  for (const job of jobs ?? []) {
    const o = directOwner(job);
    if (o) index.Job.set(job.metadata.name, o);
  }
  return index;
}

// Résumé d'un Pod pour les listes.
//
// owners : index facultatif { ReplicaSet: Map(nom → propriétaire), Job: Map(…) }
// qui permet de remonter Pod → ReplicaSet → Deployment et Pod → Job → CronJob.
export function mapPod(pod, now = Date.now(), owners = null) {
  const st = podStatus(pod);
  const reason = st.reason;
  const containers = conteneurs(pod.spec?.containers, pod.status?.containerStatuses, false);
  const initContainers = conteneurs(pod.spec?.initContainers, pod.status?.initContainerStatuses, true);
  const tous = [...initContainers, ...containers];
  return {
    name: pod.metadata?.name,
    namespace: pod.metadata?.namespace,
    uid: pod.metadata?.uid,
    status: reason,
    category: categorie(pod, reason),
    phase: pod.status?.phase ?? null,
    ready: `${containers.filter((c) => c.ready).length}/${containers.length}`,
    restarts: tous.reduce((s, c) => s + c.restarts, 0),
    lastTermination: dernierArret(tous),
    statusContainer: st.container,
    statusContainerInit: st.init,
    statusMessage: st.message,
    owner: directOwner(pod),
    workload: workloadOf(directOwner(pod), owners, pod),
    node: pod.spec?.nodeName ?? null,
    createdAt: pod.metadata?.creationTimestamp ?? null,
    age: ageSeconds(pod.metadata?.creationTimestamp, now),
    containers,
    initContainers,
  };
}
