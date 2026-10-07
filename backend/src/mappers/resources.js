// Transformation des ressources réseau, de configuration et de stockage
// (Services, Ingress, ConfigMaps, PersistentVolumeClaims, HPA) en données
// prêtes pour l'écran, avec un diagnostic par ressource.
//
// Chaque ressource porte une catégorie (ok, attente, erreur, inactif) et,
// s'il y a lieu, un code de problème (AUCUN_POD, SERVICE_ABSENT…) que le
// front traduit en langage simple.
import { ageSeconds, buildOwnerIndex, directOwner, workloadOf } from './pod.js';

export const TYPES_RESSOURCES = ['services', 'endpointslices', 'ingresses', 'configmaps', 'persistentvolumeclaims', 'horizontalpodautoscalers'];

function base(kind, obj, now) {
  return {
    kind,
    name: obj.metadata?.name,
    uid: obj.metadata?.uid,
    createdAt: obj.metadata?.creationTimestamp ?? null,
    age: ageSeconds(obj.metadata?.creationTimestamp, now),
  };
}

// Le sélecteur d'un Service correspond-il aux labels du Pod ?
export function correspond(selecteur, labels) {
  const paires = Object.entries(selecteur ?? {});
  return paires.length > 0 && paires.every(([k, v]) => labels?.[k] === v);
}

// Pod actif : ni terminé, ni en cours de suppression (comme les endpoints).
const actif = (p) => !['Succeeded', 'Failed'].includes(p.status?.phase) && !p.metadata?.deletionTimestamp;
const podPret = (p) => (p.status?.conditions ?? []).some((c) => c.type === 'Ready' && c.status === 'True');

// Charges de travail distinctes à partir de Pods bruts.
function chargesDe(pods, owners) {
  const vues = new Map();
  for (const p of pods) {
    const w = workloadOf(directOwner(p), owners, p) ?? { kind: 'Pod', name: p.metadata?.name };
    vues.set(`${w.kind}/${w.name}`, w);
  }
  return [...vues.values()];
}

// Adresses externes publiées (LoadBalancer, Ingress).
function adresses(status) {
  return (status?.loadBalancer?.ingress ?? []).map((i) => i.ip ?? i.hostname).filter(Boolean);
}

// Endpoints d'un Service d'après ses EndpointSlices. Un même Pod peut
// figurer dans plusieurs tranches (IPv4 et IPv6) : il n'est compté qu'une fois.
function endpointsDe(nom, slices) {
  const vus = new Map();
  for (const s of slices) {
    if (s.metadata?.labels?.['kubernetes.io/service-name'] !== nom) continue;
    for (const e of s.endpoints ?? []) {
      const cle = e.targetRef?.uid ?? e.addresses?.[0];
      if (!cle) continue;
      // conditions.ready absent : à considérer comme prêt (spécification de l'API).
      const pret = e.conditions?.ready !== false;
      vus.set(cle, (vus.get(cle) ?? false) || pret);
    }
  }
  const valeurs = [...vus.values()];
  return { ready: valeurs.filter(Boolean).length, total: valeurs.length };
}

// Service. ctx : { pods (bruts, ou null si interdits), slices (ou null), owners }.
export function mapService(svc, ctx, now = Date.now()) {
  const spec = svc.spec ?? {};
  const type = spec.type ?? 'ClusterIP';
  const selecteur = spec.selector && Object.keys(spec.selector).length ? spec.selector : null;
  const podsCibles = selecteur && ctx.pods ? ctx.pods.filter((p) => actif(p) && correspond(selecteur, p.metadata?.labels)) : null;

  // Endpoints : EndpointSlices si lisibles, sinon état Ready des Pods ciblés.
  let endpoints = null;
  if (ctx.slices) endpoints = endpointsDe(svc.metadata?.name, ctx.slices);
  else if (podsCibles) endpoints = { ready: podsCibles.filter(podPret).length, total: podsCibles.length };

  const externes = adresses(svc.status);
  let category = 'ok';
  let problem = null;
  if (type === 'ExternalName') {
    category = 'inactif';
  } else if (selecteur && podsCibles && podsCibles.length === 0) {
    category = 'erreur';
    problem = 'AUCUN_POD';
  } else if (endpoints && endpoints.total > 0 && endpoints.ready === 0) {
    category = 'erreur';
    problem = 'AUCUN_POD_PRET';
  } else if (!selecteur && endpoints && endpoints.total === 0) {
    category = 'attente';
    problem = 'SANS_SELECTEUR';
  } else if (endpoints && endpoints.ready < endpoints.total) {
    category = 'attente';
    problem = 'PARTIEL';
  } else if (type === 'LoadBalancer' && externes.length === 0) {
    category = 'attente';
    problem = 'ADRESSE_EN_ATTENTE';
  }

  return {
    ...base('Service', svc, now),
    type,
    clusterIP: spec.clusterIP === 'None' ? null : spec.clusterIP ?? null,
    headless: spec.clusterIP === 'None',
    externalName: spec.externalName ?? null,
    externalAddresses: externes,
    ports: (spec.ports ?? []).map((p) => ({
      name: p.name ?? null,
      port: p.port,
      targetPort: p.targetPort !== undefined ? String(p.targetPort) : null,
      nodePort: p.nodePort ?? null,
      protocol: p.protocol ?? 'TCP',
    })),
    selector: selecteur,
    endpoints,
    matchingPods: podsCibles ? podsCibles.length : null,
    targets: podsCibles ? chargesDe(podsCibles, ctx.owners) : null,
    category,
    problem,
  };
}

// Ingress. servicesParNom : Map nom → Service affiché (null si interdits).
export function mapIngress(ing, servicesParNom, now = Date.now()) {
  const spec = ing.spec ?? {};
  const regles = [];
  const backend = (b, host, chemin) => {
    if (!b) return;
    const svc = b.service;
    const cible = svc ? servicesParNom?.get(svc.name) : null;
    regles.push({
      host: host ?? null,
      path: chemin?.path ?? null,
      pathType: chemin?.pathType ?? null,
      service: svc?.name ?? null,
      port: svc?.port?.number ?? svc?.port?.name ?? null,
      resource: b.resource ? { kind: b.resource.kind, name: b.resource.name } : null,
      // null : impossible de vérifier (Services interdits).
      missing: svc && servicesParNom ? !cible : null,
      serviceCategory: cible?.category ?? null,
    });
  };
  backend(spec.defaultBackend, null, null);
  for (const r of spec.rules ?? []) {
    for (const p of r.http?.paths ?? []) backend(p.backend, r.host, p);
  }

  const externes = adresses(ing.status);
  let category = 'ok';
  let problem = null;
  if (regles.some((r) => r.missing)) {
    category = 'erreur';
    problem = 'SERVICE_ABSENT';
  } else if (regles.some((r) => r.serviceCategory === 'erreur')) {
    category = 'erreur';
    problem = 'SERVICE_EN_ERREUR';
  } else if (externes.length === 0) {
    category = 'attente';
    problem = 'ADRESSE_EN_ATTENTE';
  }

  const tls = new Set((spec.tls ?? []).flatMap((t) => t.hosts ?? []));
  return {
    ...base('Ingress', ing, now),
    className: spec.ingressClassName ?? ing.metadata?.annotations?.['kubernetes.io/ingress.class'] ?? null,
    addresses: externes,
    hosts: [...new Set((spec.rules ?? []).map((r) => r.host).filter(Boolean))].map((h) => ({ host: h, tls: tls.has(h) })),
    rules: regles,
    category,
    problem,
  };
}

// Références d'un Pod vers des ConfigMaps et des PVC (volumes, env, envFrom).
function references(pod) {
  const configmaps = new Map(); // nom → facultative ?
  const pvcs = new Set();
  const ajouter = (nom, facultatif) => {
    if (!nom) return;
    configmaps.set(nom, (configmaps.get(nom) ?? true) && Boolean(facultatif));
  };
  for (const v of pod.spec?.volumes ?? []) {
    if (v.configMap) ajouter(v.configMap.name, v.configMap.optional);
    for (const s of v.projected?.sources ?? []) if (s.configMap) ajouter(s.configMap.name, s.configMap.optional);
    if (v.persistentVolumeClaim?.claimName) pvcs.add(v.persistentVolumeClaim.claimName);
  }
  for (const c of [...(pod.spec?.initContainers ?? []), ...(pod.spec?.containers ?? [])]) {
    for (const e of c.envFrom ?? []) if (e.configMapRef) ajouter(e.configMapRef.name, e.configMapRef.optional);
    for (const e of c.env ?? []) {
      const ref = e.valueFrom?.configMapKeyRef;
      if (ref) ajouter(ref.name, ref.optional);
    }
  }
  return { configmaps, pvcs };
}

// Taille en octets d'une valeur (texte, ou base64 pour binaryData).
const taille = (v, binaire) => (binaire ? Math.floor((String(v).length * 3) / 4) : Buffer.byteLength(String(v ?? ''), 'utf8'));

// ConfigMap : uniquement les clés et leur taille, jamais les valeurs.
export function mapConfigMap(cm, utilisateurs, now = Date.now()) {
  const cles = [
    ...Object.entries(cm.data ?? {}).map(([name, v]) => ({ name, size: taille(v, false), binary: false })),
    ...Object.entries(cm.binaryData ?? {}).map(([name, v]) => ({ name, size: taille(v, true), binary: true })),
  ].sort((a, b) => a.name.localeCompare(b.name));
  return {
    ...base('ConfigMap', cm, now),
    keys: cles,
    size: cles.reduce((s, c) => s + c.size, 0),
    immutable: Boolean(cm.immutable),
    usedBy: utilisateurs ?? null,
    category: 'ok',
    problem: null,
  };
}

// PersistentVolumeClaim.
export function mapPvc(pvc, utilisateurs, now = Date.now()) {
  const phase = pvc.status?.phase ?? 'Pending';
  const redimensionnement = (pvc.status?.conditions ?? []).find((c) => ['Resizing', 'FileSystemResizePending'].includes(c.type) && c.status === 'True');
  let category = 'ok';
  let problem = null;
  if (pvc.metadata?.deletionTimestamp) {
    category = 'attente';
    problem = 'SUPPRESSION_BLOQUEE';
  } else if (phase === 'Lost') {
    category = 'erreur';
    problem = 'PERDU';
  } else if (phase === 'Pending') {
    category = 'attente';
    problem = utilisateurs && utilisateurs.length === 0 ? 'EN_ATTENTE_SANS_POD' : 'EN_ATTENTE';
  } else if (redimensionnement) {
    category = 'attente';
    problem = 'REDIMENSIONNEMENT';
  }
  return {
    ...base('PersistentVolumeClaim', pvc, now),
    phase,
    status: pvc.metadata?.deletionTimestamp ? 'Terminating' : phase,
    requested: pvc.spec?.resources?.requests?.storage ?? null,
    capacity: pvc.status?.capacity?.storage ?? null,
    accessModes: pvc.spec?.accessModes ?? [],
    storageClass: pvc.spec?.storageClassName ?? null,
    volumeName: pvc.spec?.volumeName ?? null,
    usedBy: utilisateurs ?? null,
    category,
    problem,
  };
}

// Valeur lisible d'une cible ou d'une mesure d'HPA : « 80 % » ou « 500m ».
function valeurMetrique(v) {
  if (!v) return null;
  if (v.averageUtilization !== undefined && v.averageUtilization !== null) return { value: v.averageUtilization, unit: '%' };
  const brut = v.averageValue ?? v.value;
  return brut !== undefined && brut !== null ? { value: String(brut), unit: null } : null;
}

// Nom d'une métrique d'HPA : « cpu », « memory », « requests_per_second »…
function nomMetrique(m) {
  const s = m[m.type?.charAt(0).toLowerCase() + m.type?.slice(1)] ?? {};
  return s.name ?? s.metric?.name ?? m.type ?? '?';
}

// HorizontalPodAutoscaler (autoscaling/v2).
export function mapHpa(hpa, now = Date.now()) {
  const spec = hpa.spec ?? {};
  const st = hpa.status ?? {};
  const actuelles = st.currentMetrics ?? [];
  const metriques = (spec.metrics ?? []).map((m) => {
    const nom = nomMetrique(m);
    const cle = m.type.charAt(0).toLowerCase() + m.type.slice(1);
    const courante = actuelles.find((c) => c.type === m.type && nomMetrique(c) === nom);
    return {
      type: m.type,
      name: nom,
      target: valeurMetrique(m[cle]?.target),
      current: valeurMetrique(courante?.[cle]?.current),
    };
  });
  const cond = (type) => (st.conditions ?? []).find((c) => c.type === type);
  const capable = cond('AbleToScale');
  const actif = cond('ScalingActive');
  const limite = cond('ScalingLimited');

  let category = 'ok';
  let problem = null;
  let message = null;
  if (capable?.status === 'False') {
    category = 'erreur';
    problem = 'ECHELLE_IMPOSSIBLE';
    message = capable.message ?? null;
  } else if (actif?.status === 'False') {
    category = 'erreur';
    problem = 'METRIQUES_INDISPONIBLES';
    message = actif.message ?? null;
  } else if (limite?.status === 'True' && limite.reason === 'TooManyReplicas') {
    category = 'attente';
    problem = 'AU_MAXIMUM';
    message = limite.message ?? null;
  }
  return {
    ...base('HorizontalPodAutoscaler', hpa, now),
    target: spec.scaleTargetRef ? { kind: spec.scaleTargetRef.kind, name: spec.scaleTargetRef.name } : null,
    min: spec.minReplicas ?? 1,
    max: spec.maxReplicas ?? null,
    current: st.currentReplicas ?? null,
    desired: st.desiredReplicas ?? null,
    metrics: metriques,
    lastScaleTime: st.lastScaleTime ?? null,
    category,
    problem,
    message,
  };
}

// Toutes les ressources d'un namespace, à partir des listes lues (null =
// type interdit ou indisponible). Les Pods, ReplicaSets et Jobs servent à
// relier chaque ressource aux charges de travail qui l'utilisent.
export function mapResources(data, now = Date.now()) {
  const pods = data.pods ?? null;
  const owners = buildOwnerIndex(data.replicasets, data.jobs);

  const services = data.services ? data.services.map((s) => mapService(s, { pods, slices: data.endpointslices ?? null, owners }, now)) : null;
  const servicesParNom = services ? new Map(services.map((s) => [s.name, s])) : null;
  const ingresses = data.ingresses ? data.ingresses.map((i) => mapIngress(i, servicesParNom, now)) : null;

  // Qui utilise quoi : ConfigMap → charges de travail, PVC → Pods.
  const parConfigMap = new Map();
  const parPvc = new Map();
  const facultatives = new Map();
  for (const p of (pods ?? []).filter(actif)) {
    const refs = references(p);
    for (const [nom, facultatif] of refs.configmaps) {
      if (!parConfigMap.has(nom)) parConfigMap.set(nom, []);
      parConfigMap.get(nom).push(p);
      facultatives.set(nom, (facultatives.get(nom) ?? true) && facultatif);
    }
    for (const nom of refs.pvcs) {
      if (!parPvc.has(nom)) parPvc.set(nom, []);
      parPvc.get(nom).push(p);
    }
  }
  const usage = (index, nom) => (pods ? chargesDe(index.get(nom) ?? [], owners) : null);

  let configmaps = null;
  if (data.configmaps) {
    configmaps = data.configmaps.map((c) => mapConfigMap(c, usage(parConfigMap, c.metadata?.name), now));
    // ConfigMaps référencées par un Pod mais absentes : le Pod ne peut pas démarrer.
    const existantes = new Set(configmaps.map((c) => c.name));
    for (const [nom, utilisateurs] of parConfigMap) {
      if (existantes.has(nom) || facultatives.get(nom)) continue;
      configmaps.push({
        kind: 'ConfigMap',
        name: nom,
        uid: `absente/${nom}`,
        createdAt: null,
        age: null,
        keys: [],
        size: 0,
        immutable: false,
        usedBy: chargesDe(utilisateurs, owners),
        missing: true,
        category: 'erreur',
        problem: 'CONFIGMAP_ABSENTE',
      });
    }
  }

  const persistentvolumeclaims = data.persistentvolumeclaims
    ? data.persistentvolumeclaims.map((v) => mapPvc(v, usage(parPvc, v.metadata?.name), now))
    : null;
  const horizontalpodautoscalers = data.horizontalpodautoscalers ? data.horizontalpodautoscalers.map((h) => mapHpa(h, now)) : null;

  return { services, ingresses, configmaps, persistentvolumeclaims, horizontalpodautoscalers };
}
