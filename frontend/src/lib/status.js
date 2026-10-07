// Correspondance statut Kubernetes → ton (couleur), icône et explication.
// La couleur n'est jamais seule : chaque statut a une icône et son libellé.
import fr from '../i18n/fr.js';

const TONS = { ok: 'ok', attente: 'warn', erreur: 'err', arret: 'neutral', termine: 'neutral' };

// Icône selon le statut exact, puis selon la catégorie.
function icone(status, category) {
  const base = status?.startsWith('Init:') ? status.slice(5) : status;
  if (base === 'CrashLoopBackOff') return 'boucle';
  if (base === 'OOMKilled') return 'memoire';
  if (category === 'erreur') return 'alerte';
  if (category === 'arret') return 'arret';
  if (category === 'attente') return 'attente';
  return 'ok';
}

// Explication en langage simple d'un statut (ou d'une raison d'arrêt).
export function explication(status, category) {
  if (!status) return fr.statuts.inconnu;
  const s = fr.statuts;
  if (status === 'Running' && category === 'attente') return s.RunningNonPret;
  if (typeof s[status] === 'string') return s[status];
  if (status.startsWith('ExitCode:')) return s.ExitCode(status.slice(9));
  if (status.startsWith('Signal:')) return s.Signal(status.slice(7));
  if (status.startsWith('Init:')) {
    const reste = status.slice(5);
    const m = /^(\d+)\/(\d+)$/.exec(reste);
    if (m) return s.Init(s.InitEtape(m[1], m[2]));
    return s.Init(typeof s[reste] === 'string' ? s[reste].replace(/\.$/, '').toLowerCase() : reste);
  }
  return s.inconnu;
}

export function statusInfo(status, category) {
  return {
    tone: TONS[category] ?? 'neutral',
    icon: icone(status, category),
    label: status ?? fr.commun.aucun,
    explication: explication(status, category),
  };
}
