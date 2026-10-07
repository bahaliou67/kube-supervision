// Suivi en direct des logs d'un conteneur (Server-Sent Events).
//
// Le flux part de l'horodatage de la dernière ligne déjà affichée. Après une
// coupure (réseau, conteneur qui redémarre, flux fermé par le cluster), il se
// reconnecte seul avec un délai croissant (2 s, 4 s, 8 s… jusqu'à 30 s) et
// reprend à partir de la dernière ligne reçue, sans doublon.
import { useEffect, useRef, useState } from 'react';

// Clé de comparaison d'un horodatage RFC3339 : Kubernetes supprime les zéros
// finaux des nanosecondes (« 42.3915Z »), on complète à 9 chiffres.
export function cleTs(ts) {
  if (!ts) return '';
  const m = /^(.+T\d\d:\d\d:\d\d)(?:\.(\d+))?Z$/.exec(ts);
  if (!m) return ts;
  return `${m[1]}.${(m[2] ?? '').padEnd(9, '0')}`;
}

const DELAI_MIN = 2;
const DELAI_MAX = 30;
// Le serveur envoie un battement toutes les 15 s : sans nouvelles pendant
// 35 s, la connexion est considérée comme perdue (coupure silencieuse).
const SILENCE_MAX_MS = 35000;

// enabled : suivi demandé ; lastTs : horodatage de la dernière ligne connue ;
// onLines(lignes) : reçoit les nouvelles lignes.
export function useLogFollow({ enabled, url, lastTs, onLines }) {
  const [etat, setEtat] = useState({ status: 'off', retryIn: 0 });
  const dernier = useRef(lastTs);
  const rappel = useRef(onLines);
  rappel.current = onLines;

  // La dernière ligne connue ne change le point de départ qu'à la (re)connexion.
  useEffect(() => {
    if (cleTs(lastTs) > cleTs(dernier.current)) dernier.current = lastTs;
  }, [lastTs]);

  useEffect(() => {
    if (!enabled || !url) {
      setEtat({ status: 'off', retryIn: 0 });
      return undefined;
    }
    dernier.current = lastTs;
    let source = null;
    let minuteur = null;
    let compte = null;
    let delai = DELAI_MIN;
    let arrete = false;
    let tampon = [];
    let vidage = null;
    let vuA = Date.now();
    const garde = setInterval(() => {
      if (source && Date.now() - vuA > SILENCE_MAX_MS) planifier();
    }, 5000);

    // Les lignes arrivent par rafales : on les regroupe par lot d'affichage.
    const vider = () => {
      vidage = null;
      if (tampon.length) rappel.current(tampon);
      tampon = [];
    };

    const planifier = () => {
      // « end » puis « error » peuvent arriver pour la même coupure : une seule relance.
      if (!source) return;
      source.close();
      source = null;
      if (arrete) return;
      let reste = delai;
      setEtat({ status: 'retry', retryIn: reste });
      compte = setInterval(() => {
        reste -= 1;
        if (reste > 0) setEtat({ status: 'retry', retryIn: reste });
      }, 1000);
      minuteur = setTimeout(() => {
        clearInterval(compte);
        connecter();
      }, delai * 1000);
      delai = Math.min(DELAI_MAX, delai * 2);
    };

    const connecter = () => {
      if (arrete) return;
      setEtat((e) => ({ status: e.status === 'live' ? 'live' : 'connecting', retryIn: 0 }));
      const depuis = dernier.current ? `&sinceTime=${encodeURIComponent(dernier.current)}` : '';
      source = new EventSource(`${url}${depuis}`);
      vuA = Date.now();
      source.addEventListener('ping', () => {
        vuA = Date.now();
      });
      source.addEventListener('open', () => {
        vuA = Date.now();
        delai = DELAI_MIN;
        setEtat({ status: 'live', retryIn: 0 });
      });
      source.addEventListener('line', (ev) => {
        vuA = Date.now();
        const ligne = JSON.parse(ev.data);
        // sinceTime est arrondi à la seconde : on écarte les lignes déjà reçues.
        if (ligne.ts && dernier.current && cleTs(ligne.ts) <= cleTs(dernier.current)) return;
        if (ligne.ts) dernier.current = ligne.ts;
        tampon.push(ligne);
        if (!vidage) vidage = setTimeout(vider, 100);
      });
      // Fin du flux (conteneur arrêté, flux fermé) ou erreur : on réessaie.
      source.addEventListener('end', planifier);
      source.addEventListener('failure', planifier);
      source.onerror = planifier;
    };

    connecter();
    return () => {
      arrete = true;
      source?.close();
      clearTimeout(minuteur);
      clearInterval(compte);
      clearTimeout(vidage);
      clearInterval(garde);
    };
    // lastTs est volontairement exclu : il ne sert qu'au point de départ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, url]);

  return etat;
}
