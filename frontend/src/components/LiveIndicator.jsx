// Indicateur de l'en-tête : « En direct · mis à jour il y a 2 s » ou
// « Hors ligne · dernières données il y a 48 s » (maquettes 01 et 06).
// Il se rafraîchit chaque seconde pour que la durée reste juste.
import { useEffect, useState } from 'react';
import { ilYa } from '../lib/format.js';
import textes from '../i18n/index.js';

export default function LiveIndicator({ connection }) {
  const [, tic] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tic((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const quand = connection?.lastSync ? ilYa(connection.lastSync) : null;
  const enLigne = connection?.status === 'live';
  let texte = textes.direct.connexion;
  if (quand) texte = enLigne ? textes.direct.enDirect(quand) : textes.direct.horsLigne(quand);
  return (
    <div className="live" role="status">
      <span className={`live-dot${enLigne ? '' : ' is-off'}`} />
      {texte}
    </div>
  );
}
