// Estimation du prochain redémarrage d'un conteneur en CrashLoopBackOff.
//
// Kubernetes ne publie pas cette valeur. Le kubelet attend 10 s après le
// premier échec, puis double l'attente à chaque nouvel échec, plafonnée à
// 5 minutes (et remise à zéro après 10 minutes sans plantage). L'estimation
// est donc indicative : l'écran l'accompagne toujours du mot « environ ».
const BASE_S = 10;
const PLAFOND_S = 300;

export function delaiBackoff(restarts) {
  const n = Math.max(1, restarts);
  return Math.min(PLAFOND_S, BASE_S * 2 ** (n - 1));
}

// Secondes restantes avant la prochaine tentative, ou null si non applicable.
export function prochainRedemarrage(conteneur, now = Date.now()) {
  if (conteneur?.state?.state !== 'waiting' || conteneur.state.reason !== 'CrashLoopBackOff') return null;
  const fin = conteneur.lastState?.finishedAt;
  if (!fin) return null;
  const echeance = new Date(fin).getTime() + delaiBackoff(conteneur.restarts) * 1000;
  return Math.max(0, (echeance - now) / 1000);
}
