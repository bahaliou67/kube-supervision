// Suivi en direct des logs d'un conteneur (Server-Sent Events).
//
// Le flux part de l'horodatage de la dernière ligne déjà affichée et, après
// une coupure, reprend à partir de la dernière ligne reçue, sans doublon
// (reconnexion automatique : voir eventStream.js).
import { useEffect, useRef, useState } from 'react';
import { openEventStream } from './eventStream.js';

// Clé de comparaison d'un horodatage RFC3339 : Kubernetes supprime les zéros
// finaux des nanosecondes (« 42.3915Z »), on complète à 9 chiffres.
export function cleTs(ts) {
  if (!ts) return '';
  const m = /^(.+T\d\d:\d\d:\d\d)(?:\.(\d+))?Z$/.exec(ts);
  if (!m) return ts;
  return `${m[1]}.${(m[2] ?? '').padEnd(9, '0')}`;
}

// enabled : suivi demandé ; lastTs : horodatage de la dernière ligne connue ;
// onLines(lignes) : reçoit les nouvelles lignes.
export function useLogFollow({ enabled, url, lastTs, onLines }) {
  const [etat, setEtat] = useState({ status: 'off', retryIn: 0 });
  const dernier = useRef(lastTs);
  const rappel = useRef(onLines);
  rappel.current = onLines;

  useEffect(() => {
    if (!enabled || !url) {
      setEtat({ status: 'off', retryIn: 0 });
      return undefined;
    }
    dernier.current = lastTs;
    let tampon = [];
    let vidage = null;
    // Les lignes arrivent par rafales : on les regroupe par lot d'affichage.
    const vider = () => {
      vidage = null;
      if (tampon.length) rappel.current(tampon);
      tampon = [];
    };
    const flux = openEventStream({
      url: () => (dernier.current ? `${url}&sinceTime=${encodeURIComponent(dernier.current)}` : url),
      onStatus: (s) => setEtat({ status: s.status === 'open' ? 'live' : s.status, retryIn: s.retryIn ?? 0 }),
      events: {
        line: (ligne) => {
          // sinceTime est arrondi à la seconde : on écarte les lignes déjà reçues.
          if (ligne.ts && dernier.current && cleTs(ligne.ts) <= cleTs(dernier.current)) return;
          if (ligne.ts) dernier.current = ligne.ts;
          tampon.push(ligne);
          if (!vidage) vidage = setTimeout(vider, 100);
        },
      },
    });
    return () => {
      flux.close();
      clearTimeout(vidage);
    };
    // lastTs est volontairement exclu : il ne sert qu'au point de départ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, url]);

  return etat;
}
