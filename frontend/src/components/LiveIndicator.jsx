// Indicateur « En direct · mis à jour il y a N s » / « Hors ligne ».
// Il se rafraîchit chaque seconde pour que la durée reste juste.
import { useEffect, useState } from 'react';
import { ilYa } from '../lib/format.js';
import fr from '../i18n/fr.js';

export default function LiveIndicator({ online, updatedAt }) {
  const [, tic] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tic((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const quand = updatedAt ? ilYa(updatedAt) : null;
  let texte = fr.direct.connexion;
  if (updatedAt) texte = online ? fr.direct.enDirect(quand) : fr.direct.horsLigne(quand);
  return (
    <div className="live" role="status">
      <span className={`live-dot${online ? '' : ' is-off'}`} />
      {texte}
    </div>
  );
}
