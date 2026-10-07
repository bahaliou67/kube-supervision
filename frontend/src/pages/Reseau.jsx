// Écran Réseau : Services et Ingress du namespace, avec pour chacun ce vers
// quoi il envoie le trafic et pourquoi il ne fonctionne pas, le cas échéant.
import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { SearchField } from '../components/Toolbar.jsx';
import { ErrorState, LoadingState, PartialNotice } from '../components/States.jsx';
import { EtatBadge, NomEtDiagnostic, SectionTableau, UtilisePar } from '../components/Ressources.jsx';
import { useScope } from '../state/ScopeContext.jsx';
import { useNamespaceData } from '../state/useNamespaceData.js';
import { RANG, diagIngress, diagService, etatIngress, etatService, selecteurTexte } from '../lib/ressources.js';
import { age } from '../lib/format.js';
import { tplText } from '../lib/tpl.jsx';
import fr from '../i18n/fr.js';

const N = fr.reseau;
const R = fr.ressources;

// « ClusterIP 10.96.0.12 », « LoadBalancer 1.2.3.4 », « ExternalName → exemple.org ».
function TypeAdresse({ s }) {
  let adresse = s.clusterIP;
  if (s.headless) adresse = N.headless;
  if (s.type === 'ExternalName') adresse = `→ ${s.externalName}`;
  if (s.type === 'LoadBalancer') adresse = s.externalAddresses.length ? s.externalAddresses.join(', ') : N.enAttenteAdresse;
  return (
    <div className="res-lines">
      <span>{s.type}</span>
      {adresse ? <span className="mono mut trunc">{adresse}</span> : null}
    </div>
  );
}

// « 80 → 8080/TCP », avec le port de nœud éventuel.
function Ports({ ports }) {
  if (!ports.length) return <span className="mut">{fr.commun.aucun}</span>;
  return (
    <div className="res-lines mono">
      {ports.map((p, i) => (
        <span key={i} title={p.name ?? undefined}>
          {p.port}
          {p.targetPort && p.targetPort !== String(p.port) ? ` → ${p.targetPort}` : ''}
          {p.nodePort ? ` (:${p.nodePort})` : ''}
          <span className="mut">/{p.protocol}</span>
        </span>
      ))}
    </div>
  );
}

function Cible({ s }) {
  if (s.type === 'ExternalName') return <span className="mut">{fr.commun.aucun}</span>;
  if (!s.selector) return <span className="mut">{N.sansSelecteur}</span>;
  return (
    <div className="res-lines">
      <UtilisePar cibles={s.targets} vide={N.etats.aucunPod} />
      <span className="mono mut trunc" title={selecteurTexte(s.selector)}>
        {selecteurTexte(s.selector)}
      </span>
    </div>
  );
}

// Hôtes, avec un cadenas pour ceux qui ont un certificat TLS.
function Hotes({ i }) {
  if (!i.hosts.length) return <span className="mut">{N.toutesRoutes}</span>;
  return (
    <div className="res-lines mono">
      {i.hosts.map((h) => (
        <span key={h.host}>
          {h.host}
          {h.tls ? (
            <span className="res-icon" title={N.tls}>
              <Icon name="cadenas" size={12} />
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

// « site.org/api → api:80 » ; un Service absent est signalé en rouge.
function Routes({ i }) {
  const { link } = useScope();
  return (
    <div className="res-lines mono">
      {i.rules.map((r, n) => {
        const origine = r.host || r.path ? `${r.host ?? ''}${r.path ?? ''}` : N.routeParDefaut;
        const cible = r.service ? `${r.service}${r.port ? `:${r.port}` : ''}` : r.resource ? `${r.resource.kind} ${r.resource.name}` : '?';
        const enErreur = r.missing || r.serviceCategory === 'erreur';
        return (
          <span key={n} className={enErreur ? 'is-err' : undefined}>
            <span className="mut">{origine} → </span>
            {r.service && !r.missing ? <a href={link('/reseau', { q: r.service })}>{cible}</a> : cible}
            {r.missing ? ` (${N.serviceAbsent})` : ''}
          </span>
        );
      })}
    </div>
  );
}

const contient = (terme, ...textes) => !terme || textes.some((t) => t?.toLowerCase().includes(terme));

export default function Reseau() {
  const { ctx, ns, route } = useScope();
  const { resources } = useNamespaceData();
  const [q, setQ] = useState(route.query.q ?? '');
  useEffect(() => setQ(route.query.q ?? ''), [ctx, ns, route.query.q]);

  const d = resources.data;
  const terme = q.trim().toLowerCase();
  const services = useMemo(() => d?.services?.filter((s) => contient(terme, s.name)) ?? null, [d, terme]);
  const ingresses = useMemo(() => d?.ingresses?.filter((i) => contient(terme, i.name, ...i.hosts.map((h) => h.host))) ?? null, [d, terme]);

  const colServices = useMemo(
    () => [
      {
        key: 'etat',
        label: R.colEtat,
        width: 150,
        sortValue: (s) => RANG[s.category],
        render: (s) => <EtatBadge {...etatService(s)} />,
      },
      {
        key: 'nom',
        label: R.colNom,
        sortValue: (s) => s.name,
        render: (s) => <NomEtDiagnostic name={s.name} diagnostic={diagService(s)} category={s.category} />,
      },
      { key: 'type', label: N.colType, render: (s) => <TypeAdresse s={s} /> },
      { key: 'ports', label: N.colPorts, render: (s) => <Ports ports={s.ports} /> },
      { key: 'cible', label: N.colCible, render: (s) => <Cible s={s} /> },
      { key: 'age', label: R.colAge, className: 'num', sortValue: (s) => s.age, render: (s) => <span className="mut">{age(s.createdAt)}</span> },
    ],
    [],
  );

  const colIngress = useMemo(
    () => [
      {
        key: 'etat',
        label: R.colEtat,
        width: 150,
        sortValue: (i) => RANG[i.category],
        render: (i) => <EtatBadge {...etatIngress(i)} />,
      },
      {
        key: 'nom',
        label: R.colNom,
        sortValue: (i) => i.name,
        render: (i) => (
          <NomEtDiagnostic name={i.name} diagnostic={diagIngress(i)} category={i.category} extra={i.className ? tplText(N.classe, { classe: i.className }) : null} />
        ),
      },
      { key: 'hotes', label: N.colHotes, render: (i) => <Hotes i={i} /> },
      { key: 'routes', label: N.colRoutes, render: (i) => <Routes i={i} /> },
      {
        key: 'adresse',
        label: N.colAdresse,
        render: (i) => (i.addresses.length ? <span className="mono">{i.addresses.join(', ')}</span> : <span className="mut">{N.enAttenteAdresse}</span>),
      },
      { key: 'age', label: R.colAge, className: 'num', sortValue: (i) => i.age, render: (i) => <span className="mut">{age(i.createdAt)}</span> },
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
          <SearchField value={q} onChange={setQ} label={R.recherche} count={(services?.length ?? 0) + (ingresses?.length ?? 0)} />
        </div>
        <PartialNotice
          forbidden={(d.forbidden ?? []).filter((t) => ['services', 'endpointslices', 'ingresses', 'pods'].includes(t))}
          unavailable={(d.unavailable ?? []).filter((t) => ['services', 'endpointslices', 'ingresses'].includes(t))}
        />
        <SectionTableau
          titre={N.services(d.services?.length ?? 0)}
          items={services}
          total={d.services?.length}
          vide={R.vide('Service')}
          colonnes={colServices}
          initialSort={{ key: 'etat', dir: 'asc' }}
          terme={q}
        />
        <SectionTableau
          titre={N.ingresses(d.ingresses?.length ?? 0)}
          items={ingresses}
          total={d.ingresses?.length}
          vide={R.vide('Ingress')}
          colonnes={colIngress}
          initialSort={{ key: 'etat', dir: 'asc' }}
          terme={q}
        />
      </>
    );
  }

  return (
    <main className="page" style={{ gap: 18 }}>
      <div className="page-head">
        <h1>{N.titre}</h1>
        {d ? <span className="mut">{N.resume(d.services?.length ?? 0, d.ingresses?.length ?? 0)}</span> : null}
      </div>
      {contenu}
    </main>
  );
}
