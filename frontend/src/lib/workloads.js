// Regroupement des Pods par charge de travail et état de chaque charge.
import fr from '../i18n/fr.js';

export const RANG_CATEGORIE = { erreur: 0, attente: 1, arret: 2, ok: 3, termine: 4, inactif: 5 };

// Clé d'une charge de travail : « Deployment/api ».
export const cle = (kind, name) => `${kind}/${name}`;

// Construit les lignes du tableau des charges de travail :
// - une ligne par charge connue (les Jobs d'un CronJob sont rattachés à celui-ci) ;
// - une ligne par propriétaire inconnu (ReplicaSet seul, ressource personnalisée…) ;
// - une ligne « Pods sans propriétaire » si besoin.
export function lignesCharges(workloads, pods) {
  const parCle = new Map();
  for (const w of workloads) {
    if (w.kind === 'Job' && w.cronJob) continue;
    parCle.set(cle(w.kind, w.name), { ...w, pods: [] });
  }
  const orphelins = [];
  for (const p of pods) {
    if (!p.workload) {
      orphelins.push(p);
      continue;
    }
    const k = cle(p.workload.kind, p.workload.name);
    if (!parCle.has(k)) parCle.set(k, { kind: p.workload.kind, name: p.workload.name, synthetic: true, pods: [], images: [] });
    parCle.get(k).pods.push(p);
  }
  const lignes = [...parCle.values()];
  if (orphelins.length > 0) {
    lignes.push({ kind: null, name: fr.charges.sansProprietaire, orphans: true, pods: orphelins, images: [] });
  }
  for (const l of lignes) {
    l.counts = compter(l.pods);
    l.category = categorie(l);
    l.key = l.orphans ? '__orphelins__' : cle(l.kind, l.name);
    l.age = l.age ?? Math.max(0, ...l.pods.map((p) => p.age ?? 0));
    if (l.synthetic || l.orphans) l.images = [...new Set(l.pods.flatMap((p) => p.containers.map((c) => c.image)).filter(Boolean))];
  }
  return lignes;
}

export function compter(pods) {
  const c = { ok: 0, erreur: 0, attente: 0, arret: 0, termine: 0 };
  for (const p of pods) c[p.category] = (c[p.category] ?? 0) + 1;
  return c;
}

// État d'une charge de travail, d'après ses Pods et ses compteurs.
export function categorie(l) {
  if (l.counts.erreur > 0 || l.state === 'failed' || l.stalled) return 'erreur';
  if (l.counts.attente > 0) return 'attente';
  if (typeof l.desired === 'number') {
    if (l.desired === 0) return 'inactif';
    if (l.ready < l.desired) return 'attente';
  }
  return 'ok';
}

// Badge « Réplicas prêts » : { tone, icon, texte, plain }.
export function badgeReplicas(l) {
  const r = fr.charges.replicas;
  if (l.kind === 'Job') {
    if (l.state === 'failed') return { tone: 'err', icon: 'alerte', texte: r.jobEchec };
    if (l.state === 'complete') return { tone: 'ok', icon: 'ok', texte: r.jobTermine(l.succeeded, l.completions), plain: true };
    if (l.state === 'suspended') return { tone: 'neutral', icon: 'arret', texte: r.jobSuspendu };
    return { tone: l.counts.erreur ? 'err' : 'ok', icon: l.counts.erreur ? 'alerte' : 'attente', texte: r.jobEnCours(l.active), plain: !l.counts.erreur };
  }
  if (l.kind === 'CronJob') {
    if (l.suspended) return { tone: 'neutral', icon: 'arret', texte: r.cronSuspendu };
    if (l.counts.erreur) return { tone: 'err', icon: 'alerte', texte: `${r.cronPlanifie}${r.erreur(l.counts.erreur)}` };
    return { tone: 'ok', icon: 'attente', texte: l.active ? `${r.cronPlanifie} · ${r.cronActif(l.active)}` : r.cronPlanifie, plain: true };
  }
  if (typeof l.desired !== 'number') {
    // Propriétaire inconnu ou Pods sans propriétaire : on compte les Pods.
    const texte = `${l.counts.ok}/${l.pods.length}`;
    if (l.counts.erreur) return { tone: 'err', icon: 'alerte', texte: texte + r.erreur(l.counts.erreur) };
    if (l.counts.attente) return { tone: 'warn', icon: 'attente', texte: texte + r.attente(l.counts.attente) };
    return { tone: 'ok', icon: 'ok', texte, plain: true };
  }
  if (l.desired === 0) return { tone: 'neutral', icon: 'arret', texte: r.arrete };
  const texte = `${l.ready}/${l.desired}`;
  if (l.counts.erreur) return { tone: 'err', icon: 'alerte', texte: texte + r.erreur(l.counts.erreur) };
  if (l.stalled) return { tone: 'err', icon: 'alerte', texte };
  if (l.ready < l.desired || l.counts.attente) {
    const n = Math.max(l.counts.attente, l.desired - l.ready);
    return { tone: 'warn', icon: 'attente', texte: texte + r.attente(n) };
  }
  return { tone: 'ok', icon: 'ok', texte, plain: true };
}

// Image et version : « personnes-api » + « 1.2 » (la version est mise en valeur).
export function decouperImage(image) {
  if (!image) return { nom: '', version: '' };
  const [sansDigest, digest] = image.split('@');
  const slash = sansDigest.lastIndexOf('/');
  const deuxPoints = sansDigest.lastIndexOf(':');
  if (deuxPoints > slash) return { nom: sansDigest.slice(0, deuxPoints), version: sansDigest.slice(deuxPoints + 1), digest };
  return { nom: sansDigest, version: digest ? digest.slice(0, 19) : 'latest', digest };
}

// Résumé « 2 Deployments · 1 StatefulSet » (types dans un ordre fixe).
const ORDRE_TYPES = ['Deployment', 'StatefulSet', 'DaemonSet', 'CronJob', 'Job'];
export function resumeTypes(lignes) {
  const n = {};
  for (const l of lignes) if (l.kind && !l.synthetic) n[l.kind] = (n[l.kind] ?? 0) + 1;
  const morceaux = ORDRE_TYPES.filter((t) => n[t]).map((t) => `${n[t]} ${fr.types[t][n[t] > 1 ? 1 : 0]}`);
  const orph = lignes.find((l) => l.orphans);
  if (orph) morceaux.push(fr.charges.resumeOrphelins(orph.pods.length));
  return morceaux.join(' · ');
}
