// États de page communs (maquette 06) : chargement, liste vide, erreur.
import Button from './Button.jsx';
import Card from './Card.jsx';
import Icon, { Spinner } from './Icon.jsx';
import { useScope } from '../state/ScopeContext.jsx';
import { Mono, tpl, tplText } from '../lib/tpl.jsx';
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
  const { ctx, ns, namespaces } = useScope();
  // Namespace saisi à la main mais absent de la liste : on le dit plutôt que « vide ».
  const liste = namespaces.data;
  if (liste?.listable && !liste.items.some((i) => i.name === ns)) {
    titre = fr.etats.nsInexistant.titre;
    texte = fr.etats.nsInexistant.texte;
  }
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

// Familles d'erreurs : chacune a son titre, son ton et son aide.
const FAMILLES = {
  ACCES_REFUSE: 'acces',
  LOGS_INTERDITS: 'acces',
  CLUSTER_INJOIGNABLE: 'injoignable',
  DELAI_DEPASSE: 'delai',
  NON_AUTHENTIFIE: 'identifiants',
  AUTH_EXTERNE_ECHEC: 'identifiants',
  SERVEUR_INJOIGNABLE: 'outil',
  API_INCOMPATIBLE: 'api',
  KUBECONFIG_ABSENT: 'kubeconfig',
  KUBECONFIG_INVALIDE: 'kubeconfigInvalide',
};
// Erreurs passagères : affichées comme la maquette « connexion perdue » (orange).
const PASSAGERES = new Set(['injoignable', 'delai', 'outil']);

// Erreur de chargement : un écran différent selon la cause (accès refusé,
// cluster injoignable, identifiants refusés…), jamais un écran blanc.
export function ErrorState({ error, onRetry }) {
  const { ctx, ns } = useScope();
  const E = fr.erreurs;
  const famille = FAMILLES[error?.code] ?? 'inconnu';
  const v = { ctx: <Mono className="state-title-mono">{ctx}</Mono>, ns: <Mono className="state-title-mono">{ns}</Mono> };
  const titre = tpl(E.titres[famille], v);
  const aide = E.aides[famille] ? tpl(E.aides[famille], v) : null;
  const passagere = PASSAGERES.has(famille);
  const reessayer = onRetry ? (
    <Button variant={passagere ? 'warn-outline' : 'secondary'} onClick={onRetry}>
      {fr.commun.reessayer}
    </Button>
  ) : null;

  if (passagere) {
    return (
      <div className="banner banner-warn" role="alert">
        <span className="banner-icon">
          <Icon name="horsLigne" size={20} strokeWidth={1.5} />
        </span>
        <div className="banner-body">
          <div className="banner-title">{titre}</div>
          <div className="banner-text">{error?.message}</div>
          <div className="banner-cause">{E.autoRetry}</div>
        </div>
        {reessayer}
      </div>
    );
  }

  const icone = famille === 'acces' || famille === 'identifiants' ? 'cadenas' : 'alerte';
  return (
    <Card className="state-card" role="alert">
      <div className="error-head">
        <span className={famille === 'acces' ? 'tone-mut' : 'tone-err'}>
          <Icon name={icone} size={20} strokeWidth={1.5} />
        </span>
        <h2 className="state-title">{titre}</h2>
      </div>
      {/* Le message du serveur n'est affiché que s'il apporte une information propre
          (pas d'aide prévue, ou détail renvoyé par le plugin d'authentification). */}
      {!aide || error?.code === 'AUTH_EXTERNE_ECHEC' ? <div>{error?.message}</div> : null}
      {aide ? <div className="mut">{aide}</div> : null}
      <div className="error-actions">
        {famille === 'acces' ? <Button onClick={ouvrirMenuNamespace}>{E.changerNamespace}</Button> : null}
        {reessayer}
      </div>
      {error?.code ? <div className="small mut">{tplText(E.codeTechnique, { code: error.code })}</div> : null}
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
