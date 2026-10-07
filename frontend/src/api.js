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

export async function apiGet(path, params) {
  let res;
  try {
    res = await fetch(`/api${path}${qs(params)}`, { headers: { Accept: 'application/json' } });
  } catch {
    // Le backend lui-même ne répond pas (outil arrêté).
    throw new ApiError(0, 'SERVEUR_INJOIGNABLE', "L'outil de supervision ne répond pas. Vérifiez qu'il est toujours lancé.");
  }
  const corps = await res.json().catch(() => null);
  if (!res.ok) {
    const e = corps?.error;
    throw new ApiError(res.status, e?.code ?? 'ERREUR_INTERNE', e?.message ?? `Erreur HTTP ${res.status}`);
  }
  return corps;
}
