// Diagnostic d'un Pod en langage simple, à partir des données du backend :
// phrase principale, raison du dernier arrêt, message Kubernetes.
import textes from '../i18n/index.js';

// « 192Mi » → « 192 Mi » ; « 1Gi » → « 1 Gi ».
export function quantite(q) {
  if (!q) return null;
  return String(q).replace(/^([\d.]+)\s*([a-zA-Z]+)$/, '$1 $2');
}

// Tous les conteneurs (init + principaux).
export function tousConteneurs(pod) {
  return [...(pod.initContainers ?? []), ...(pod.containers ?? [])];
}

export function conteneur(pod, nom) {
  return tousConteneurs(pod).find((c) => c.name === nom) ?? null;
}

// Phrase principale : « Le conteneur api plante puis redémarre en boucle. »
// Renvoie { modele, valeurs } à remplir avec tpl() (le conteneur en mono).
export function phrase(pod) {
  const d = textes.diagnostic;
  const s = pod.status ?? '';
  const c = pod.statusContainer;
  if (pod.category === 'attente') {
    if (s === 'Running') return { modele: d.RunningNonPret, valeurs: {} };
    const m = /^Init:(\d+)\/(\d+)$/.exec(s);
    if (m) return { modele: d.InitEtape, valeurs: { i: m[1], n: m[2] } };
    if (d[s] && !s.startsWith('Init:')) return { modele: d[s], valeurs: { c } };
    return { modele: d.attenteDefaut, valeurs: { s } };
  }
  if (s.startsWith('Init:') && c) return { modele: d.init, valeurs: { c } };
  const base = s.startsWith('ExitCode:') ? 'ExitCode' : s.startsWith('Signal:') ? 'Signal' : s;
  if (d[base] && (c || !d[base].includes('{c}'))) return { modele: d[base], valeurs: { c } };
  return { modele: d.defaut, valeurs: { s } };
}

// Libellé simple d'une raison d'arrêt (« mémoire dépassée »).
export function libelleArret(t) {
  if (!t) return null;
  const a = textes.arrets[t.reason];
  if (a) return a.libelle;
  if (t.exitCode === 137) return textes.arrets.code137;
  if (t.exitCode === 143) return textes.arrets.code143;
  return t.reason ?? textes.arrets.defaut.libelle;
}

// Précision d'une raison d'arrêt (« le conteneur a utilisé plus que sa limite de 192 Mi. »).
export function detailArret(t, limite) {
  if (!t) return '';
  const a = textes.arrets[t.reason];
  if (!a) return '';
  if (t.reason === 'OOMKilled') return limite ? a.detail.replace('{limite}', limite) : a.detailSansLimite;
  return a.detail;
}

// Dernier arrêt pertinent d'un Pod : celui du conteneur en cause s'il y en a un,
// sinon le plus récent. Un arrêt « Completed » d'un conteneur qui a fini son
// travail normalement n'est pas un incident.
export function dernierArret(pod) {
  const enCause = pod.statusContainer ? conteneur(pod, pod.statusContainer) : null;
  const t =
    (enCause && (enCause.state?.state === 'terminated' ? enCause.state : enCause.lastState?.state === 'terminated' ? enCause.lastState : null)) ||
    pod.lastTermination;
  if (!t) return null;
  const nom = t.container ?? enCause?.name;
  const c = conteneur(pod, nom);
  return { ...t, container: nom, limite: quantite(c?.limits?.memory) };
}

// Un arrêt est un incident s'il n'est pas une fin normale (code 0).
export function estIncident(t) {
  return Boolean(t) && !(t.reason === 'Completed' && t.exitCode === 0);
}

// Libellé du propriétaire : « Deployment api », ou « Pod sans propriétaire ».
export function proprietaire(pod) {
  return pod.workload ? `${pod.workload.kind} ${pod.workload.name}` : textes.pods.sansProprietaire;
}
