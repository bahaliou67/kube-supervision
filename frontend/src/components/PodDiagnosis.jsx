// Lignes de diagnostic d'un Pod : phrase principale, dernier arrêt,
// message de Kubernetes et conséquence sur la charge de travail.
import { Mono, tpl } from '../lib/tpl.jsx';
import { dernierArret, detailArret, estIncident, libelleArret, phrase } from '../lib/diagnostic.js';
import fr from '../i18n/fr.js';

export function Headline({ pod }) {
  const p = phrase(pod);
  return <div className="examine-title">{tpl(p.modele, { ...p.valeurs, c: <Mono>{p.valeurs.c}</Mono> })}</div>;
}

// « Dernier arrêt : mémoire dépassée (OOMKilled) — le conteneur a utilisé plus que sa limite de 192 Mi. Code de sortie 137. »
export function LastStop({ pod }) {
  const t = dernierArret(pod);
  if (!estIncident(t)) return null;
  const detail = detailArret(t, t.limite);
  return (
    <div>
      {fr.diagnostic.dernierArret}
      <strong>{libelleArret(t)}</strong>{' '}
      {t.reason ? <span className="mono" style={{ fontSize: 13 }}>({t.reason})</span> : null}
      {detail ? ` — ${detail}` : ''}
      {t.exitCode !== null && t.exitCode !== undefined ? ` ${fr.diagnostic.codeSortie.replace('{code}', t.exitCode)}` : ''}
    </div>
  );
}

// Message brut de Kubernetes (raison d'attente, de planification…).
export function KubeMessage({ pod }) {
  if (!pod.statusMessage) return null;
  return (
    <div className="kube-msg">
      {pod.status} · {pod.statusMessage}
    </div>
  );
}

// « Conséquence : le Deployment api n'a que 1 réplica prêt sur 2. »
export function Consequence({ pod, workloads }) {
  const w = pod.workload && workloads?.find((x) => x.kind === pod.workload.kind && x.name === pod.workload.name);
  if (!w || typeof w.desired !== 'number' || w.desired === 0 || w.ready >= w.desired) return null;
  return (
    <div className="small mut">
      {tpl(fr.diagnostic.consequence(w.ready, w.desired), { kind: w.kind, name: <Mono>{w.name}</Mono> })}
    </div>
  );
}

// Résumé court pour une ligne de liste (écran Charges de travail).
export function ShortReason({ pod }) {
  const d = fr.diagnostic;
  if (pod.category === 'ok') return <span className="mut">{pod.status === 'Running' ? d.pretTrafic : d.pret}</span>;
  if (pod.category === 'termine') return <span className="mut">{d.termine}</span>;
  if (pod.category === 'arret') return <span className="mut">{d.arretEnCours}</span>;
  const t = dernierArret(pod);
  if (estIncident(t)) {
    return (
      <span>
        {d.dernierArret}
        {libelleArret(t)} {t.reason ? <span className="mono" style={{ fontSize: 12.5 }}>({t.reason})</span> : null}
        {t.reason === 'OOMKilled' && t.limite ? `, ${d.limite.replace('{limite}', t.limite)}` : ''}
      </span>
    );
  }
  const p = phrase(pod);
  return <span>{tpl(p.modele, { ...p.valeurs, c: <Mono>{p.valeurs.c}</Mono> })}</span>;
}
