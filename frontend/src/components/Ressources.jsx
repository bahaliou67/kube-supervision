// Éléments communs aux écrans Réseau et Configuration et stockage :
// badge d'état, nom avec diagnostic, liste des utilisateurs, section de
// tableau, bouton de suppression.
import Button from './Button.jsx';
import Card from './Card.jsx';
import DataTable from './DataTable.jsx';
import StatusBadge from './StatusBadge.jsx';
import { useScope } from '../state/ScopeContext.jsx';
import { useActions } from '../state/ActionsContext.jsx';
import { tplText } from '../lib/tpl.jsx';
import fr from '../i18n/fr.js';

const R = fr.ressources;
const TONS_DIAG = { erreur: 'err', attente: 'warn' };

// Badge d'état : « inactif » (Service externe…) s'affiche en neutre.
export function EtatBadge({ label, category, title }) {
  return <StatusBadge status={label} label={label} category={category === 'inactif' ? 'arret' : category} title={title ?? label} plain={category === 'ok'} />;
}

// Nom de la ressource, avec en dessous la phrase de diagnostic s'il y en a une.
export function NomEtDiagnostic({ name, diagnostic, category, extra }) {
  return (
    <div className="res-name">
      <span className="mono trunc" title={name}>
        {name}
      </span>
      {extra ? <span className="small mut">{extra}</span> : null}
      {diagnostic ? <div className={`res-diag tone-${TONS_DIAG[category] ?? 'mut'}`}>{diagnostic}</div> : null}
    </div>
  );
}

// Lien vers une charge de travail (écran Charges, recherche préremplie) ou un Pod.
export function LienCharge({ cible }) {
  const { link } = useScope();
  const href = cible.kind === 'Pod' ? link(`/pods/${cible.name}`) : link('/charges', { q: cible.name });
  return (
    <a href={href} className="mono" title={`${cible.kind} ${cible.name}`}>
      {cible.name}
    </a>
  );
}

// « web, api +2 » ; null = inconnu (Pods interdits) ; [] = aucun utilisateur.
export function UtilisePar({ cibles, vide = R.nonUtilise, max = 3 }) {
  if (cibles === null || cibles === undefined) {
    return (
      <span className="mut" title={R.inconnuAide}>
        {R.inconnu}
      </span>
    );
  }
  if (cibles.length === 0) return <span className="mut">{vide}</span>;
  const visibles = cibles.slice(0, max);
  return (
    <span className="res-list" title={cibles.map((c) => `${c.kind} ${c.name}`).join('\n')}>
      {visibles.map((c, i) => (
        <span key={`${c.kind}/${c.name}`}>
          {i > 0 ? ', ' : null}
          <LienCharge cible={c} />
        </span>
      ))}
      {cibles.length > max ? <span className="mut"> {R.afficherTout(cibles.length - max)}</span> : null}
    </span>
  );
}

// Bouton « Supprimer » d'une ligne (absent pour une ConfigMap manquante).
export function BoutonSupprimer({ cible }) {
  const { demander, raisonBlocage } = useActions();
  if (cible.missing) return null;
  return (
    <Button
      size="sm"
      icon="corbeille"
      disabledReason={raisonBlocage('remove', cible.kind)}
      onClick={() => demander('remove', cible)}
      aria-label={tplText(fr.actions.supprimerLibelle, { name: cible.name })}
    >
      {fr.actions.supprimerBouton}
    </Button>
  );
}

// Section titrée contenant un tableau, ou une phrase si la liste est vide.
// items === null : type interdit ou indisponible (déjà signalé en haut de page).
export function SectionTableau({ titre, items, total, vide, colonnes, initialSort, minWidth = 900, terme }) {
  if (items === null) return null;
  return (
    <section className="section">
      <h2>{titre}</h2>
      {/* Sans défilement : la bulle d’explication d’une action grisée ne doit pas être coupée (le tableau tient dès 1024 px). */}
      <Card className="card-visible">
        {items.length === 0 ? (
          <div className="card-pad mut">{total === 0 ? vide : R.aucunResultat.replace('{q}', terme)}</div>
        ) : (
          <DataTable columns={colonnes} rows={items} rowKey={(r) => r.uid ?? r.name} initialSort={initialSort} pageSize={50} minWidth={minWidth} caption={titre} resetKey={terme} />
        )}
      </Card>
    </section>
  );
}
