// Format d'erreur unique de l'API :
//   HTTP <statut>  { "error": { "code": "ACCES_REFUSE", "message": "…" } }
// Le code est stable ; le message est destiné à l'utilisateur, dans la langue
// de l'interface (français par défaut, pour les journaux).
import { format, langueDe } from './messages.js';

export class AppError extends Error {
  constructor(status, code, vars = {}) {
    super(format(code, vars));
    this.status = status;
    this.code = code;
    // Gardées pour reformuler le message dans une autre langue.
    this.vars = vars;
  }

  messageDans(langue) {
    return format(this.code, this.vars, langue);
  }
}

// Codes réseau qui signifient « le cluster ne répond pas ».
const CODES_INJOIGNABLE = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ECONNRESET',
  'EAI_AGAIN',
  'EPIPE',
  'UND_ERR_SOCKET',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN',
]);
const CODES_DELAI = new Set(['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT']);

// Tronque un détail technique pour ne pas renvoyer de longs textes au front.
function court(texte) {
  const t = String(texte ?? '').replace(/\s+/g, ' ').trim();
  return t.length > 200 ? `${t.slice(0, 200)}…` : t;
}

// Cherche un code réseau dans l'erreur ou dans ses causes successives
// (undici enveloppe l'erreur système dans « fetch failed »).
function codeReseau(err) {
  let e = err;
  for (let i = 0; e && i < 5; i += 1) {
    if (typeof e.code === 'string') return e.code;
    e = e.cause;
  }
  return null;
}

// Corps d'une réponse d'erreur Kubernetes (objet Status). Selon l'appel,
// le client le fournit déjà décodé ou sous forme de texte JSON.
export function kubeBody(err) {
  const b = err?.body;
  if (typeof b !== 'string') return b ?? null;
  try {
    return JSON.parse(b);
  } catch {
    return { message: b };
  }
}

// Convertit n'importe quelle erreur (client Kubernetes, réseau, interne)
// en AppError. Ne recopie jamais d'en-têtes ni de contenu du kubeconfig.
export function toAppError(err) {
  if (err instanceof AppError) return err;

  // Réponse HTTP du serveur d'API Kubernetes (ApiException : code numérique).
  const statut = typeof err?.code === 'number' ? err.code : err?.statusCode;
  if (typeof statut === 'number') {
    const detail = court(kubeBody(err)?.message ?? '');
    switch (statut) {
      case 401:
        return new AppError(401, 'NON_AUTHENTIFIE');
      case 403:
        return new AppError(403, 'ACCES_REFUSE');
      case 404:
        return new AppError(404, 'INTROUVABLE');
      case 409:
        return new AppError(409, 'CONFLIT');
      case 405:
      case 406:
      case 415:
        return new AppError(502, 'API_INCOMPATIBLE');
      case 422:
      case 400:
        return new AppError(400, 'PARAMETRE_INVALIDE', { detail });
      case 504:
        return new AppError(504, 'DELAI_DEPASSE');
      case 502:
      case 503:
        return new AppError(503, 'CLUSTER_INJOIGNABLE');
      default:
        return new AppError(502, 'ERREUR_CLUSTER', { detail: detail || `HTTP ${statut}` });
    }
  }

  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return new AppError(504, 'DELAI_DEPASSE');
  }
  const code = codeReseau(err);
  if (code && CODES_DELAI.has(code)) return new AppError(504, 'DELAI_DEPASSE');
  if (code && CODES_INJOIGNABLE.has(code)) return new AppError(503, 'CLUSTER_INJOIGNABLE');
  if (err?.message === 'fetch failed') return new AppError(503, 'CLUSTER_INJOIGNABLE');

  // Échec d'un plugin d'authentification (exec, OIDC…) : message du plugin.
  if (/exec|credential|oidc|refresh token|auth provider/i.test(err?.message ?? '')) {
    return new AppError(401, 'AUTH_EXTERNE_ECHEC', { detail: court(err.message) });
  }

  return new AppError(500, 'ERREUR_INTERNE');
}

// Délai maximal d'attente d'une réponse du cluster (réglable pour les tests).
let delaiParDefaut = 15000;
export function setDefaultTimeout(ms) {
  delaiParDefaut = ms;
}

// Rejette la promesse si le cluster ne répond pas dans le délai imparti.
export function withTimeout(promise, ms = delaiParDefaut) {
  let minuteur;
  const delai = new Promise((_, reject) => {
    minuteur = setTimeout(() => reject(new AppError(504, 'DELAI_DEPASSE')), ms);
  });
  return Promise.race([promise, delai]).finally(() => clearTimeout(minuteur));
}

// Middleware Express final : écrit l'erreur au format unique.
// La journalisation se limite au code et au chemin (aucun détail sensible).
export function errorHandler(err, req, res, _next) {
  const e = toAppError(err);
  if (e.status >= 500 && e.code === 'ERREUR_INTERNE') {
    console.error(`[erreur] ${req.method} ${req.path} : ${err?.stack ?? err}`);
  } else if (process.env.DEBUG_KS) {
    console.warn(`[api] ${req.method} ${req.path} → ${e.status} ${e.code}`);
  }
  if (res.headersSent) return res.end();
  res.status(e.status).json({ error: { code: e.code, message: e.messageDans(langueDe(req)) } });
}
