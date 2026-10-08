// Logs d'un Pod, toujours lus par la fin (jamais en entier).
//
// GET /api/pods/:nom/logs?container=…&previous=1&tailLines=500
//   → JSON : dernières lignes du conteneur (actuel ou précédent).
// GET /api/pods/:nom/logs?container=…&follow=1&sinceTime=…
//   → Server-Sent Events : nouvelles lignes au fil de l'eau. Le front lit
//     d'abord les dernières lignes en JSON, puis suit à partir de l'horodatage
//     de la dernière ligne reçue (ce qui permet aussi de reprendre après une coupure).
import { Router } from 'express';
import { AppError, kubeBody, toAppError, withTimeout } from '../errors.js';
import { bilingue, format, langueDe } from '../messages.js';
import { scope, validName } from './scope.js';

export const LIGNES_PAR_DEFAUT = 500;
export const LIGNES_MAX = 5000;
// Garde-fou en volume : des lignes très longues ne doivent pas saturer le navigateur.
const OCTETS_MAX = 4 * 1024 * 1024;
const BATTEMENT_MS = 15000;

// « 2026-10-07T13:22:57.123456789Z message » → { ts, text }
const HORODATAGE = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)) ?(.*)$/;
export function parseLine(brut) {
  const m = HORODATAGE.exec(brut);
  return m ? { ts: m[1], text: m[2] } : { ts: null, text: brut };
}

export function parseLog(texte) {
  if (!texte) return [];
  const lignes = texte.split('\n');
  if (lignes[lignes.length - 1] === '') lignes.pop();
  return lignes.map(parseLine);
}

// Les erreurs de lecture des logs ont des causes propres : on les rend lisibles.
function erreurLogs(err) {
  const msg = String(kubeBody(err)?.message ?? '');
  if (err?.code === 400 || err?.code === 404) {
    if (/previous terminated container .* not found|previous terminated container/i.test(msg)) {
      return new AppError(404, 'LOGS_PRECEDENT_ABSENT');
    }
    if (/is waiting to start|ContainerCreating|PodInitializing/i.test(msg)) return new AppError(409, 'CONTENEUR_EN_ATTENTE');
    if (/container .* is not valid|container .* not found/i.test(msg)) return new AppError(400, 'CONTENEUR_INCONNU');
  }
  const e = toAppError(err);
  if (e.code === 'ACCES_REFUSE') return new AppError(403, 'LOGS_INTERDITS');
  return e;
}

function nombreLignes(v) {
  const n = Number(v ?? LIGNES_PAR_DEFAUT);
  if (!Number.isInteger(n) || n < 1) throw new AppError(400, 'PARAMETRE_INVALIDE', { detail: 'tailLines' });
  return Math.min(n, LIGNES_MAX);
}

export function logsRouter(kube) {
  const r = Router();

  r.get('/pods/:name/logs', async (req, res) => {
    const { ns, k } = scope(kube, req);
    const name = validName(req.params.name, 'nom de Pod');
    const container = req.query.container ? validName(String(req.query.container), 'nom de conteneur') : undefined;
    const previous = req.query.previous === '1' || req.query.previous === 'true';
    const follow = req.query.follow === '1' || req.query.follow === 'true';

    if (follow) {
      if (previous) throw new AppError(400, 'PARAMETRE_INVALIDE', {
        detail: bilingue('le suivi en direct est impossible sur le conteneur précédent', 'live following is not possible on the previous container'),
      });
      return suivre({ k, ns, name, container, sinceTime: req.query.sinceTime, req, res });
    }

    const tailLines = nombreLignes(req.query.tailLines);
    let texte;
    try {
      texte = await withTimeout(
        k.core.readNamespacedPodLog({ name, namespace: ns, container, previous, tailLines, timestamps: true, limitBytes: OCTETS_MAX }),
        20000,
      );
    } catch (err) {
      throw erreurLogs(err);
    }
    const lines = parseLog(texte);
    res.json({ container: container ?? null, previous, tailLines, lines, truncated: lines.length >= tailLines });
  });

  return r;
}

// Suivi en direct : chaque ligne est envoyée comme un événement SSE « line ».
// « end » signale que le conteneur s'est arrêté, « failure » une erreur.
async function suivre({ k, ns, name, container, sinceTime, req, res }) {
  if (sinceTime !== undefined && !HORODATAGE.test(`${sinceTime} `)) {
    throw new AppError(400, 'PARAMETRE_INVALIDE', { detail: 'sinceTime' });
  }
  if (!container) throw new AppError(400, 'PARAMETRE_INVALIDE', { detail: 'container' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const envoyer = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  envoyer('open', { container });

  let flux = null;
  let reste = '';
  let fini = false;
  let controleur = null;
  // Battement visible par le navigateur : il détecte ainsi une connexion
  // à moitié coupée (proxy, réseau) et se reconnecte.
  const battement = setInterval(() => envoyer('ping', {}), BATTEMENT_MS);

  const terminer = (type, data) => {
    if (fini) return;
    fini = true;
    clearInterval(battement);
    controleur?.abort();
    controleur = null;
    if (type) envoyer(type, data);
    res.end();
  };

  // Le navigateur a fermé la connexion : on coupe le flux côté cluster.
  res.on('close', () => terminer(null));

  try {
    const ouvert = await k.openLogStream({
      namespace: ns,
      pod: name,
      container,
      // sinceTime est arrondi à la seconde par l'API ; sans point de départ,
      // seules les nouvelles lignes arrivent.
      ...(sinceTime ? { sinceTime: sinceTime.replace(/\.\d+/, '') } : { sinceSeconds: 1 }),
    });
    if (fini) {
      ouvert.abort();
      return;
    }
    controleur = ouvert;
    flux = ouvert.stream;
  } catch (err) {
    const e = erreurLogs(err);
    terminer('failure', { code: e.code, message: e.messageDans(langueDe(req)) });
    return;
  }

  flux.on('data', (morceau) => {
    reste += morceau.toString('utf8');
    const lignes = reste.split('\n');
    reste = lignes.pop();
    for (const l of lignes) envoyer('line', parseLine(l));
  });
  flux.on('end', () => {
    if (reste) envoyer('line', parseLine(reste));
    terminer('end', {});
  });
  flux.on('error', (err) => {
    // Une interruption volontaire (AbortError) n'est pas une erreur à signaler.
    if (fini || err?.name === 'AbortError') return;
    terminer('failure', { code: 'SUIVI_INTERROMPU', message: format('SUIVI_INTERROMPU', {}, langueDe(req)) });
  });
}
