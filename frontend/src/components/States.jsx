// États de page communs (maquette 06) : chargement, liste vide, erreur.
import Button from './Button.jsx';
import Card from './Card.jsx';
import Icon, { Spinner } from './Icon.jsx';
import { useScope } from '../state/ScopeContext.jsx';
import { Mono, tpl } from '../lib/tpl.jsx';
import fr from '../i18n/fr.js';

const LARGEURS = [190, 150, 170];

// Lignes fantômes : elles reprennent la forme du tableau à venir.
export function Skeleton({ rows = 3 }) {
  return (
    <div className="skeleton-rows" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-row" key={i}>
          <div className="skeleton" style={{ width: 90 }} />
          <div className="skeleton" style={{ width: LARGEURS[i % LARGEURS.length] }} />
          <div className="skeleton" style={{ flex: 1 }} />
        </div>
      ))}
    </div>
  );
}

// « Lecture de l'état de personnes sur docker-desktop… » + lignes fantômes.
export function LoadingState({ rows = 3 }) {
  const { ctx, ns } = useScope();
  return (
    <Card padded className="state-card" aria-busy="true">
      <div className="state-loading" role="status">
        <Spinner />
        <span>{tpl(fr.etats.chargement, { ns: <Mono>{ns}</Mono>, ctx: <Mono>{ctx}</Mono> })}</span>
      </div>
      <Skeleton rows={rows} />
    </Card>
  );
}

// Demande à l'en-tête d'ouvrir le menu des namespaces.
export function ouvrirMenuNamespace() {
  window.dispatchEvent(new CustomEvent('ks:ouvrir-namespace'));
}

// Liste vide : titre, explication, bouton « Changer de namespace ».
export function EmptyState({ titre, texte }) {
  const { ctx, ns } = useScope();
  const v = { ns: <Mono className="state-title-mono">{ns}</Mono>, ctx: <Mono>{ctx}</Mono> };
  return (
    <Card padded className="state-card">
      <h2 className="state-title">{tpl(titre, v)}</h2>
      <div className="mut">{tpl(texte, v)}</div>
      <div>
        <Button onClick={ouvrirMenuNamespace}>{fr.charges.changerNamespace}</Button>
      </div>
    </Card>
  );
}

// Erreur de chargement : message du backend et bouton « Réessayer ».
// (Les variantes détaillées — accès refusé, connexion perdue — arrivent à l'étape 8.)
export function ErrorState({ error, onRetry }) {
  return (
    <Card padded className="state-card">
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ color: 'var(--err)', display: 'inline-flex', paddingTop: 2 }}>
          <Icon name="alerte" size={16} />
        </span>
        <div style={{ flex: 1 }}>{error?.message}</div>
        {onRetry ? <Button onClick={onRetry}>{fr.commun.reessayer}</Button> : null}
      </div>
    </Card>
  );
}

// Bandeau discret pour les ressources masquées par les droits ou absentes du cluster.
export function PartialNotice({ forbidden = [], unavailable = [] }) {
  const noms = (types) => types.map((t) => fr.types[t]?.[1] ?? t).join(', ');
  if (forbidden.length === 0 && unavailable.length === 0) return null;
  return (
    <div className="notice" role="note">
      <Icon name="cadenas" size={14} />
      <div>
        {forbidden.length ? <div>{fr.charges.interdits.replace('{types}', noms(forbidden))}</div> : null}
        {unavailable.length ? <div>{fr.charges.indisponibles.replace('{types}', noms(unavailable))}</div> : null}
      </div>
    </div>
  );
}
