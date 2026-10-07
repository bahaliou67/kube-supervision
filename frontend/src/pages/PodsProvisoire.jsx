// Liste provisoire des Pods (étape 2) : sert à valider les composants de base
// sur des données réelles. Remplacée par l'écran Accueil à l'étape 3.
import { useEffect } from 'react';
import Card from '../components/Card.jsx';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Truncate from '../components/Truncate.jsx';
import { Skeleton } from '../components/States.jsx';
import { useScope } from '../state/ScopeContext.jsx';
import { useApi } from '../lib/useApi.js';
import { age } from '../lib/format.js';
import fr from '../i18n/fr.js';

const RANG = { erreur: 0, attente: 1, arret: 2, ok: 3, termine: 4 };

export default function PodsProvisoire({ onUpdate }) {
  const { ctx, ns } = useScope();
  const pods = useApi('/pods', { ctx, ns });
  useEffect(() => {
    if (pods.updatedAt) onUpdate?.(pods.updatedAt);
  }, [pods.updatedAt, onUpdate]);

  const colonnes = [
    {
      key: 'status',
      label: fr.pods.colStatut,
      width: 190,
      sortValue: (p) => `${RANG[p.category]}-${p.status}`,
      render: (p) => <StatusBadge status={p.status} category={p.category} plain />,
    },
    {
      key: 'name',
      label: fr.pods.colNom,
      className: 'cell-name',
      width: '36%',
      sortValue: (p) => p.name,
      render: (p) => <Truncate>{p.name}</Truncate>,
    },
    {
      key: 'owner',
      label: fr.pods.colProprietaire,
      sortValue: (p) => (p.owner ? `${p.owner.kind} ${p.owner.name}` : ''),
      render: (p) => <span className="mut">{p.owner ? `${p.owner.kind} ${p.owner.name}` : fr.pods.sansProprietaire}</span>,
    },
    {
      key: 'restarts',
      label: fr.pods.colRedemarrages,
      sortValue: (p) => p.restarts,
      render: (p) => <span className="mut">{fr.pods.redemarrages(p.restarts)}</span>,
    },
    {
      key: 'age',
      label: fr.pods.colAge,
      className: 'num',
      sortValue: (p) => p.age,
      render: (p) => <span className="mut">{age(p.createdAt)}</span>,
    },
  ];

  return (
    <main className="page">
      <div className="page-head">
        <h1>{fr.pods.titre}</h1>
        {pods.data ? (
          <span className="mut">
            {fr.pods.nb(pods.data.items.length)} {fr.pods.dans} <span className="mono">{ns}</span>
          </span>
        ) : null}
      </div>
      {pods.status === 'error' ? (
        <Card padded>
          {pods.error.code} — {pods.error.message}{' '}
          <button type="button" className="btn btn-sm" onClick={pods.reload}>
            {fr.commun.reessayer}
          </button>
        </Card>
      ) : null}
      {pods.status === 'loading' ? (
        <Card padded>
          <Skeleton />
        </Card>
      ) : null}
      {pods.data ? (
        <Card scroll>
          <DataTable columns={colonnes} rows={pods.data.items} rowKey={(p) => p.uid} initialSort={{ key: 'status', dir: 'asc' }} caption={fr.pods.titre} />
        </Card>
      ) : null}
    </main>
  );
}
