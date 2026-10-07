// Écran Configuration et stockage : volumes persistants (PVC) et ConfigMaps,
// avec les charges de travail qui les utilisent. Le contenu des ConfigMaps
// n'est jamais affiché, seulement le nom et la taille de leurs clés.
import { useEffect, useMemo, useState } from 'react';
import { SearchField } from '../components/Toolbar.jsx';
import { ErrorState, LoadingState, PartialNotice } from '../components/States.jsx';
import { EtatBadge, NomEtDiagnostic, SectionTableau, UtilisePar } from '../components/Ressources.jsx';
import { useScope } from '../state/ScopeContext.jsx';
import { useNamespaceData } from '../state/useNamespaceData.js';
import { RANG, abregerAcces, diagConfiguration } from '../lib/ressources.js';
import { age } from '../lib/format.js';
import { tplText } from '../lib/tpl.jsx';
import fr from '../i18n/fr.js';

const C = fr.configuration;
const R = fr.ressources;
const MAX_CLES = 4;

function Capacite({ v }) {
  return (
    <div className="res-lines">
      <span className="mono">{v.capacity ?? v.requested ?? fr.commun.aucun}</span>
      {v.requested && v.capacity && v.requested !== v.capacity ? <span className="mut">{tplText(C.demande, { taille: v.requested })}</span> : null}
    </div>
  );
}

function Acces({ modes }) {
  if (!modes.length) return <span className="mut">{fr.commun.aucun}</span>;
  return (
    <span className="mono" title={modes.map((m) => C.acces[m] ?? m).join('\n')}>
      {modes.map(abregerAcces).join(', ')}
    </span>
  );
}

// « app.yaml, MODE, logo +3 » ; la liste complète est au survol.
function Cles({ c }) {
  if (c.missing) return <span className="mut">{fr.commun.aucun}</span>;
  if (!c.keys.length) return <span className="mut">{C.aucuneCle}</span>;
  const noms = c.keys.map((k) => k.name);
  return (
    <div className="res-lines">
      <span className="mono res-list" title={c.keys.map((k) => `${k.name} · ${fr.commun.octets(k.size)}`).join('\n')}>
        {noms.slice(0, MAX_CLES).join(', ')}
        {noms.length > MAX_CLES ? <span className="mut"> {R.afficherTout(noms.length - MAX_CLES)}</span> : null}
      </span>
      <span className="mut">
        {C.nbCles(noms.length)}
        {c.immutable ? ` · ${C.immuable}` : ''}
      </span>
    </div>
  );
}

const contient = (terme, nom) => !terme || nom.toLowerCase().includes(terme);

export default function Configuration() {
  const { ctx, ns, route } = useScope();
  const { resources } = useNamespaceData();
  const [q, setQ] = useState(route.query.q ?? '');
  useEffect(() => setQ(route.query.q ?? ''), [ctx, ns, route.query.q]);

  const d = resources.data;
  const terme = q.trim().toLowerCase();
  const volumes = useMemo(() => d?.persistentvolumeclaims?.filter((v) => contient(terme, v.name)) ?? null, [d, terme]);
  const configmaps = useMemo(() => d?.configmaps?.filter((c) => contient(terme, c.name)) ?? null, [d, terme]);

  const colVolumes = useMemo(
    () => [
      {
        key: 'etat',
        label: R.colEtat,
        width: 150,
        sortValue: (v) => RANG[v.category],
        render: (v) => <EtatBadge label={v.status} category={v.category} />,
      },
      {
        key: 'nom',
        label: R.colNom,
        sortValue: (v) => v.name,
        render: (v) => <NomEtDiagnostic name={v.name} diagnostic={diagConfiguration(v)} category={v.category} />,
      },
      { key: 'capacite', label: C.colCapacite, render: (v) => <Capacite v={v} /> },
      { key: 'acces', label: C.colAcces, render: (v) => <Acces modes={v.accessModes} /> },
      { key: 'classe', label: C.colClasse, render: (v) => (v.storageClass ? <span className="mono">{v.storageClass}</span> : <span className="mut">{C.classeDefaut}</span>) },
      { key: 'usage', label: R.colUtilisePar, render: (v) => <UtilisePar cibles={v.usedBy} /> },
      { key: 'age', label: R.colAge, className: 'num', sortValue: (v) => v.age, render: (v) => <span className="mut">{age(v.createdAt)}</span> },
    ],
    [],
  );

  const colConfigMaps = useMemo(
    () => [
      {
        key: 'etat',
        label: R.colEtat,
        width: 150,
        sortValue: (c) => RANG[c.category] * 10 + (c.usedBy?.length ? 0 : 1),
        render: (c) =>
          c.missing ? (
            <EtatBadge label={C.absente} category="erreur" />
          ) : c.usedBy && c.usedBy.length === 0 ? (
            <EtatBadge label={C.nonUtilisee} category="inactif" />
          ) : (
            <EtatBadge label={C.utilisee} category="ok" />
          ),
      },
      {
        key: 'nom',
        label: R.colNom,
        sortValue: (c) => c.name,
        render: (c) => <NomEtDiagnostic name={c.name} diagnostic={diagConfiguration(c)} category={c.category} />,
      },
      { key: 'cles', label: C.colCles, render: (c) => <Cles c={c} /> },
      { key: 'taille', label: C.colTaille, sortValue: (c) => c.size, render: (c) => (c.missing ? <span className="mut">{fr.commun.aucun}</span> : <span className="mut">{fr.commun.octets(c.size)}</span>) },
      { key: 'usage', label: R.colUtilisePar, render: (c) => <UtilisePar cibles={c.usedBy} vide={C.nonUtilisee} /> },
      { key: 'age', label: R.colAge, className: 'num', sortValue: (c) => c.age, render: (c) => <span className="mut">{c.createdAt ? age(c.createdAt) : fr.commun.aucun}</span> },
    ],
    [],
  );

  let contenu;
  if (resources.status === 'error' && !d) contenu = <ErrorState error={resources.error} onRetry={resources.reload} />;
  else if (!d) contenu = <LoadingState />;
  else {
    contenu = (
      <>
        <div className="toolbar">
          <SearchField value={q} onChange={setQ} label={R.recherche} count={(volumes?.length ?? 0) + (configmaps?.length ?? 0)} />
        </div>
        <PartialNotice
          forbidden={(d.forbidden ?? []).filter((t) => ['persistentvolumeclaims', 'configmaps', 'pods'].includes(t))}
          unavailable={(d.unavailable ?? []).filter((t) => ['persistentvolumeclaims', 'configmaps'].includes(t))}
        />
        <SectionTableau
          titre={C.volumes(d.persistentvolumeclaims?.length ?? 0)}
          items={volumes}
          total={d.persistentvolumeclaims?.length}
          vide={R.vide('volume persistant')}
          colonnes={colVolumes}
          initialSort={{ key: 'etat', dir: 'asc' }}
          terme={q}
        />
        <SectionTableau
          titre={C.configmaps(d.configmaps?.length ?? 0)}
          items={configmaps}
          total={d.configmaps?.length}
          vide={R.vide('ConfigMap')}
          colonnes={colConfigMaps}
          initialSort={{ key: 'etat', dir: 'asc' }}
          terme={q}
        />
        {d.configmaps ? <div className="small mut">{C.valeursMasquees}</div> : null}
      </>
    );
  }

  return (
    <main className="page" style={{ gap: 18 }}>
      <div className="page-head">
        <h1>{C.titre}</h1>
        {d ? <span className="mut">{C.resume(d.persistentvolumeclaims?.length ?? 0, d.configmaps?.length ?? 0)}</span> : null}
      </div>
      {contenu}
    </main>
  );
}
