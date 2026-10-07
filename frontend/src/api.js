import fr from './i18n/fr.js';

// Client de l'API du backend. Toute erreur est convertie en ApiError
// portant le code stable renvoyé par le serveur (ACCES_REFUSE, INTROUVABLE…).
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Construit la chaîne de requête en ignorant les valeurs vides.
function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

// Erreurs passagères : une nouvelle tentative a des chances de réussir.
export const ERREURS_PASSAGERES = new Set(['SERVEUR_INJOIGNABLE', 'CLUSTER_INJOIGNABLE', 'DELAI_DEPASSE', 'ERREUR_CLUSTER']);

export async function apiGet(path, params) {
  let res;
  try {
    res = await fetch(`/api${path}${qs(params)}`, { headers: { Accept: 'application/json' } });
  } catch {
    // Le backend lui-même ne répond pas (outil arrêté).
    throw new ApiError(0, 'SERVEUR_INJOIGNABLE', fr.erreurs.SERVEUR_INJOIGNABLE);
  }
  const corps = await res.json().catch(() => null);
  if (!res.ok) {
    const e = corps?.error;
    // Pas de réponse au format de l'API : c'est un intermédiaire (proxy de
    // développement) qui répond à la place de l'outil arrêté.
    if (!e && [502, 503, 504].includes(res.status)) {
      throw new ApiError(0, 'SERVEUR_INJOIGNABLE', fr.erreurs.SERVEUR_INJOIGNABLE);
    }
    throw new ApiError(res.status, e?.code ?? 'ERREUR_INTERNE', e?.message ?? `Erreur HTTP ${res.status}`);
  }
  return corps;
}

// Envoi d'une action (POST, DELETE). Le navigateur ajoute l'en-tête Origin,
// que le backend vérifie : seule la page de l'outil peut déclencher une action.
export async function apiSend(method, path, params, body) {
  let res;
  try {
    res = await fetch(`/api${path}${qs(params)}`, {
      method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'SERVEUR_INJOIGNABLE', fr.erreurs.SERVEUR_INJOIGNABLE);
  }
  const corps = await res.json().catch(() => null);
  if (!res.ok) {
    const e = corps?.error;
    if (!e && [502, 503, 504].includes(res.status)) throw new ApiError(0, 'SERVEUR_INJOIGNABLE', fr.erreurs.SERVEUR_INJOIGNABLE);
    throw new ApiError(res.status, e?.code ?? 'ERREUR_INTERNE', e?.message ?? `Erreur HTTP ${res.status}`);
  }
  return corps;
}
