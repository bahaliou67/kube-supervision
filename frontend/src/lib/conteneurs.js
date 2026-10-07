// Logique des formulaires de modification d'un conteneur : quantités
// Kubernetes (CPU, mémoire) et différences de variables d'environnement.

// Types dont le modèle de Pod est modifiable → segment d'URL de l'API
// (le modèle d'un Job est immuable).
export const SEGMENT_MODIFIABLE = { Deployment: 'deployments', StatefulSet: 'statefulsets', DaemonSet: 'daemonsets', CronJob: 'cronjobs' };

// Même règle que le serveur : « 250m », « 0.5 », « 256Mi », « 1Gi », « 1e3 »…
const QUANTITE = /^\+?(\d+(\.\d*)?|\.\d+)(([KMGTPE]i)|[numkMGTPE]|[eE][+-]?\d+)?$/;
const NOM_ENV = /^[-._a-zA-Z][-._a-zA-Z0-9]*$/;
const IMAGE = /^[^\s]{1,512}$/;

const SUFFIXES = {
  Ki: 2 ** 10,
  Mi: 2 ** 20,
  Gi: 2 ** 30,
  Ti: 2 ** 40,
  Pi: 2 ** 50,
  Ei: 2 ** 60,
  n: 1e-9,
  u: 1e-6,
  m: 1e-3,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
};

export const quantiteValide = (q) => QUANTITE.test(q);
export const nomEnvValide = (n) => NOM_ENV.test(n);
export const imageValide = (i) => IMAGE.test(i);

// Valeur numérique d'une quantité (cœurs ou octets), ou null si invalide.
export function valeurQuantite(q) {
  if (typeof q !== 'string' || !QUANTITE.test(q)) return null;
  const m = /^\+?(\d+(?:\.\d*)?|\.\d+)(.*)$/.exec(q);
  const nombre = Number(m[1]);
  const suffixe = m[2];
  if (!suffixe) return nombre;
  if (/^[eE]/.test(suffixe)) return nombre * 10 ** Number(suffixe.slice(1));
  return nombre * SUFFIXES[suffixe];
}

// Vérifie un formulaire de ressources : { requests: { cpu, memory }, limits: { … } }
// (valeurs saisies, '' = aucune). Renvoie { erreurs: { 'limits.memory': code }, body }
// où body ne contient que les valeurs modifiées (null = retirer).
export function verifierRessources(saisie, origine) {
  const erreurs = {};
  const body = {};
  for (const groupe of ['requests', 'limits']) {
    for (const cle of ['cpu', 'memory']) {
      const v = (saisie[groupe]?.[cle] ?? '').trim();
      const avant = origine?.[groupe]?.[cle] ?? null;
      if (v && !QUANTITE.test(v)) {
        erreurs[`${groupe}.${cle}`] = 'format';
        continue;
      }
      const apres = v || null;
      if (apres !== avant) {
        body[groupe] = body[groupe] ?? {};
        body[groupe][cle] = apres;
      }
    }
  }
  // Une demande ne peut pas dépasser la limite (Kubernetes le refuserait).
  for (const cle of ['cpu', 'memory']) {
    const demande = valeurQuantite((saisie.requests?.[cle] ?? '').trim());
    const limite = valeurQuantite((saisie.limits?.[cle] ?? '').trim());
    if (demande !== null && limite !== null && demande > limite && !erreurs[`requests.${cle}`]) erreurs[`requests.${cle}`] = 'superieure';
  }
  return { erreurs, body: Object.keys(body).length ? body : null };
}

// Différence entre les variables d'origine et les lignes du formulaire.
// origine : [{ name, value, source }] ; lignes : [{ name, value, source }]
// (une ligne avec source est une référence, non modifiable ; une ligne
// entièrement vide, tout juste ajoutée, est ignorée).
// Renvoie { erreurs: { index: code }, env: { set, remove } | null, nombre }.
export function diffEnv(origine, lignes) {
  const erreurs = {};
  const vus = new Map();
  const vide = (l) => !l.source && !l.name.trim() && !l.value;
  lignes.forEach((l, i) => {
    if (vide(l)) return;
    const nom = l.name.trim();
    if (!nom) erreurs[i] = 'vide';
    else if (!NOM_ENV.test(nom)) erreurs[i] = 'format';
    else if (vus.has(nom)) erreurs[i] = 'double';
    else vus.set(nom, i);
  });
  const avant = new Map(origine.map((v) => [v.name, v]));
  const set = {};
  for (const l of lignes) {
    if (l.source || vide(l)) continue;
    const nom = l.name.trim();
    const o = avant.get(nom);
    if (!o || o.source || o.value !== l.value) set[nom] = l.value;
  }
  const remove = origine.map((v) => v.name).filter((n) => !vus.has(n));
  const nombre = Object.keys(set).length + remove.length;
  return { erreurs, env: nombre ? { set, remove } : null, nombre };
}
