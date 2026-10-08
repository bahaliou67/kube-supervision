// Traduction des événements Kubernetes en phrases simples.
// Le texte technique (raison · message) reste toujours affiché en dessous ;
// une raison inconnue n'a pas de traduction inventée.
import textes from '../i18n/index.js';

const E = textes.evenements;

// Phrase simple d'un événement, ou null si la raison n'est pas connue.
export function phraseEvenement(ev) {
  const m = ev.message ?? '';
  switch (ev.reason) {
    case 'BackOff':
      return /image/i.test(m) ? E.BackOffImage : E.BackOff;
    case 'Unhealthy': {
      if (/^Liveness/i.test(m)) return E.Liveness;
      if (/^Startup/i.test(m)) return E.Startup;
      if (/^Readiness/i.test(m)) {
        const code = /statuscode:\s*(\d{3})/i.exec(m);
        return code ? E.ReadinessHttp.replace('{x}', code[1]) : E.Readiness;
      }
      return E.Unhealthy;
    }
    case 'Pulling': {
      const img = /image "([^"]+)"/.exec(m);
      return img ? E.Pulling.replace('{x}', img[1]) : E.Pulling.replace(' {x}', '');
    }
    case 'Pulled': {
      const img = /image "([^"]+)"/.exec(m);
      return img ? E.Pulled.replace('{x}', img[1]) : E.PulledSimple;
    }
    case 'Scheduled': {
      const noeud = /\bto (\S+)\s*$/.exec(m);
      return noeud ? E.Scheduled.replace('{x}', noeud[1]) : E.Scheduled.replace(' {x}', '');
    }
    case 'Failed':
      return /pull|image/i.test(m) ? E.FailedImage : E.Failed;
    default:
      return typeof E[ev.reason] === 'string' ? E[ev.reason] : null;
  }
}
