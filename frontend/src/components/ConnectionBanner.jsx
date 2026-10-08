// Bandeau « Connexion au cluster perdue » (maquette 06), sous l'en-tête.
// Les données restent affichées avec leur date ; les actions sont désactivées
// tant que la connexion n'est pas rétablie. La reconnexion est automatique,
// « Réessayer » la déclenche tout de suite.
import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { useLive } from '../state/LiveContext.jsx';
import { useScope } from '../state/ScopeContext.jsx';
import { Mono, tpl } from '../lib/tpl.jsx';
import { ilYa } from '../lib/format.js';
import textes from '../i18n/index.js';

const C = textes.connexion;
const IDENTIFIANTS = new Set(['NON_AUTHENTIFIE', 'AUTH_EXTERNE_ECHEC']);

export default function ConnectionBanner() {
  const { connection } = useLive();
  const { ctx } = useScope();
  const [, tic] = useState(0);
  const horsLigne = connection.status === 'offline';
  useEffect(() => {
    if (!horsLigne) return undefined;
    const id = setInterval(() => tic((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [horsLigne]);
  if (!horsLigne) return null;

  const code = connection.reason?.code;
  const outil = code === 'SERVEUR_INJOIGNABLE';
  const titre = outil ? C.outilMuet : IDENTIFIANTS.has(code) ? C.identifiants : C.perdue;
  const restant =
    connection.retryIn ?? (connection.retryAt ? Math.max(0, Math.ceil((connection.retryAt - Date.now()) / 1000)) : null);
  const cause = outil ? C.outilAide : connection.reason?.message;

  return (
    <div className="banner-wrap">
      <div className="banner banner-warn" role="alert">
        <span className="banner-icon">
          <Icon name="horsLigne" size={20} strokeWidth={1.5} />
        </span>
        <div className="banner-body">
          <div className="banner-title">{tpl(titre, { ctx: <Mono className="banner-mono">{ctx}</Mono> })}</div>
          <div className="banner-text">
            {connection.lastSync ? tpl(C.donnees, { quand: ilYa(connection.lastSync) }) : C.sansDonnees}
            {restant ? C.tentative(restant) : C.tentativeEnCours}
          </div>
          {cause ? <div className="banner-cause">{cause}</div> : null}
        </div>
        <button type="button" className="btn btn-warn-outline" onClick={connection.retry}>
          {C.reessayer}
        </button>
      </div>
    </div>
  );
}
