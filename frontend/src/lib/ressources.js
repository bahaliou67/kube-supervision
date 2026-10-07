// État et diagnostic des Services, Ingress, ConfigMaps, PVC et HPA, à partir
// des codes calculés par le backend (AUCUN_POD, SERVICE_ABSENT…).
import fr from '../i18n/fr.js';

const remplir = (modele, valeurs) => String(modele).replace(/\{(\w+)\}/g, (_, k) => valeurs[k] ?? `{${k}}`);

export const RANG = { erreur: 0, attente: 1, ok: 2, inactif: 3 };

// Badge d'un Service : { label, category }.
export function etatService(s) {
  const E = fr.reseau.etats;
  if (s.type === 'ExternalName') return { label: E.externe, category: 'inactif' };
  if (s.problem === 'AUCUN_POD') return { label: E.aucunPod, category: 'erreur' };
  if (s.endpoints) {
    if (s.endpoints.total === 0) return { label: E.sansEndpoint, category: s.category };
    return { label: E.prets(s.endpoints.ready, s.endpoints.total), category: s.category };
  }
  return { label: E.inconnu, category: s.category === 'ok' ? 'inactif' : s.category };
}

export function etatIngress(i) {
  const E = fr.reseau.etats;
  if (i.problem === 'SERVICE_ABSENT') return { label: E.serviceAbsent, category: 'erreur' };
  if (i.problem === 'SERVICE_EN_ERREUR') return { label: E.serviceEnErreur, category: 'erreur' };
  if (i.problem === 'ADRESSE_EN_ATTENTE') return { label: E.sansAdresse, category: 'attente' };
  return { label: E.ok, category: 'ok' };
}

// Sélecteur lisible : « app=web, tier=api ».
export const selecteurTexte = (sel) =>
  Object.entries(sel ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');

// Phrase de diagnostic d'un Service (null si tout va bien).
export function diagService(s) {
  const P = fr.reseau.problemes;
  if (!s.problem) return null;
  if (s.problem === 'ADRESSE_EN_ATTENTE') return P.ADRESSE_EN_ATTENTE_SERVICE;
  return remplir(P[s.problem] ?? s.problem, { selecteur: selecteurTexte(s.selector) });
}

export function diagIngress(i) {
  const P = fr.reseau.problemes;
  if (!i.problem) return null;
  if (i.problem === 'ADRESSE_EN_ATTENTE') return P.ADRESSE_EN_ATTENTE_INGRESS;
  const regle = i.rules.find((r) => (i.problem === 'SERVICE_ABSENT' ? r.missing : r.serviceCategory === 'erreur'));
  return remplir(P[i.problem] ?? i.problem, { service: regle?.service ?? '?' });
}

// ConfigMap ou PVC.
export function diagConfiguration(r) {
  if (!r.problem) return null;
  return remplir(fr.configuration.problemes[r.problem] ?? r.problem, { classe: r.storageClass ?? fr.configuration.classeDefaut });
}

// HPA : phrase en français, suivie du message de Kubernetes s'il y en a un.
export function diagHpa(h) {
  if (!h.problem) return null;
  const texte = fr.hpa.problemes[h.problem] ?? h.problem;
  return h.message ? `${texte} (${h.message})` : texte;
}

// HPA qui pilote une charge de travail donnée.
export function hpaDe(hpas, kind, name) {
  return (hpas ?? []).find((h) => h.target?.kind === kind && h.target?.name === name) ?? null;
}

// Valeur d'une mesure d'HPA : « 45 % », « 500m », ou « inconnu ».
export function valeurHpa(v) {
  if (!v) return fr.hpa.inconnue;
  return v.unit === '%' ? `${v.value} %` : String(v.value);
}

// Résumé d'un HPA : « Mise à l'échelle automatique : 1 à 5 réplicas · cpu 12 % (cible 80 %) ».
export function resumeHpa(h) {
  const mesures = h.metrics.map((m) => remplir(fr.hpa.mesure, { nom: m.name, actuel: valeurHpa(m.current), cible: valeurHpa(m.target) }));
  return [remplir(fr.hpa.resume, { min: h.min, max: h.max ?? '?' }), ...mesures].join(' · ');
}

// Mode d'accès abrégé, comme kubectl : RWO, ROX, RWX, RWOP.
const ABREVIATIONS = { ReadWriteOnce: 'RWO', ReadOnlyMany: 'ROX', ReadWriteMany: 'RWX', ReadWriteOncePod: 'RWOP' };
export const abregerAcces = (mode) => ABREVIATIONS[mode] ?? mode;

// Problèmes à signaler sur l'accueil, les plus graves d'abord :
// [{ key, kind, name, category, texte, path, q }].
export function pointsAVerifier(r) {
  if (!r) return [];
  const points = [];
  const ajouter = (liste, diag, path, q = (x) => x.name) => {
    for (const x of liste ?? []) {
      if (x.category !== 'erreur' && x.category !== 'attente') continue;
      points.push({ key: `${x.kind}/${x.name}`, kind: x.kind, name: x.name, category: x.category, texte: diag(x), path, q: q(x) });
    }
  };
  ajouter(r.services, diagService, '/reseau');
  ajouter(r.ingresses, diagIngress, '/reseau');
  ajouter(r.persistentvolumeclaims, diagConfiguration, '/configuration');
  ajouter(r.configmaps, diagConfiguration, '/configuration');
  ajouter(r.horizontalpodautoscalers, diagHpa, '/charges', (h) => h.target?.name ?? h.name);
  return points.sort((a, b) => RANG[a.category] - RANG[b.category] || a.name.localeCompare(b.name, 'fr', { numeric: true }));
}
