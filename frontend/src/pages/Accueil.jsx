// Écran Accueil : santé du namespace (maquettes 01 et 06).
// Objectif : savoir en quelques secondes quelle application est en panne, et pourquoi.
import { useMemo, useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import DataTable from '../components/DataTable.jsx';
import Icon from '../components/Icon.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Truncate, { MiddleName } from '../components/Truncate.jsx';
import { SearchField } from '../components/Toolbar.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/States.jsx';
import { Consequence, Headline, KubeMessage, LastStop } from '../components/PodDiagnosis.jsx';
import { useScope } from '../state/ScopeContext.jsx';
import { useNamespaceData } from '../state/useNamespaceData.js';
import { Mono, tpl } from '../lib/tpl.jsx';
import { age, duree, depuis, ilYa } from '../lib/format.js';
import { estIncident, libelleArret, proprietaire, tousConteneurs } from '../lib/diagnostic.js';
import fr from '../i18n/fr.js';

const A = fr.accueil;
const MAX_CARTES = 5;

// Carte de compteur : « En bon état · 4 · Pods démarrés et prêts ».
function Stat({ cat, n }) {
  const c = A.cartes[cat];
  // La couleur n'apparaît que si le compteur est non nul (sauf « En bon état »).
  const actif = cat === 'ok' || n > 0;
  const ton = !actif ? 'mut' : cat === 'ok' ? 'ok' : cat === 'erreur' ? 'err' : 'warn';
  const icone = cat === 'ok' ? 'ok' : cat === 'erreur' ? 'alerte' : 'attente';
  const bordure = n > 0 && cat === 'erreur' ? ' is-err' : n > 0 && cat === 'attente' ? ' is-warn' : '';
  return (
    <div className={`stat${bordure}`}>
      <div className={`stat-head tone-${ton}`}>
        <Icon name={icone} size={16} />
        {c.titre}
      </div>
      <div className={`stat-value${actif ? '' : ' tone-mut'}`}>{n}</div>
      <div className="stat-sub">{c.sous(n)}</div>
    </div>
  );
}

// Carte « À examiner » d'un Pod en erreur ou en attente.
function ExamineCard({ pod, workloads }) {
  const { link } = useScope();
  return (
    <Card className="examine">
      <div className="examine-body">
        <div className="examine-top">
          <StatusBadge status={pod.status} category={pod.category} />
          <a href={link(`/pods/${pod.name}`)} className="examine-name trunc" title={pod.name}>
            <MiddleName name={pod.name} max={56} />
          </a>
          <span className="small mut">
            {tpl(A.meta, { owner: proprietaire(pod), restarts: fr.pods.redemarrages(pod.restarts), age: age(pod.createdAt) })}
          </span>
        </div>
        <Headline pod={pod} />
        <LastStop pod={pod} />
        <KubeMessage pod={pod} />
        <Consequence pod={pod} workloads={workloads} />
      </div>
      <div className="examine-actions">
        <Button variant="primary" href={link(`/pods/${pod.name}`)}>
          {fr.pods.voirFiche}
        </Button>
        <Button href={link(`/pods/${pod.name}/logs`)}>{fr.pods.voirLogs}</Button>
      </div>
    </Card>
  );
}

// Liste de cartes limitée à MAX_CARTES, avec « Afficher les N autres ».
function ExamineList({ titre, pods, workloads }) {
  const [tout, setTout] = useState(false);
  if (pods.length === 0) return null;
  const visibles = tout ? pods : pods.slice(0, MAX_CARTES);
  return (
    <section className="section">
      <h2>{titre}</h2>
      <div className="list-stack">
        {visibles.map((p) => (
          <ExamineCard key={p.uid} pod={p} workloads={workloads} />
        ))}
      </div>
      {pods.length > MAX_CARTES ? (
        <div>
          <Button size="sm" onClick={() => setTout(!tout)}>
            {tout ? A.masquerAutres : A.afficherAutres(pods.length - MAX_CARTES)}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

// Tableau compact des Pods (sans en-tête, comme la maquette), avec recherche
// au-delà de 10 Pods et pagination.
function PodList({ titre, pods }) {
  const { link } = useScope();
  const [q, setQ] = useState('');
  const terme = q.trim().toLowerCase();
  const filtres = terme ? pods.filter((p) => p.name.toLowerCase().includes(terme)) : pods;
  const colonnes = useMemo(
    () => [
      { key: 'status', label: '', width: 150, render: (p) => <StatusBadge status={p.status} category={p.category} plain /> },
      {
        key: 'name',
        label: '',
        className: 'cell-name',
        width: '38%',
        sortValue: (p) => p.name,
        render: (p) => (
          <a href={link(`/pods/${p.name}`)} className="trunc" title={p.name}>
            <MiddleName name={p.name} max={48} />
          </a>
        ),
      },
      { key: 'owner', label: '', render: (p) => <Truncate className="mut">{proprietaire(p)}</Truncate> },
      { key: 'restarts', label: '', render: (p) => <span className="mut">{fr.pods.redemarrages(p.restarts)}</span> },
      { key: 'age', label: '', className: 'num', render: (p) => <span className="mut">{age(p.createdAt)}</span> },
    ],
    [link],
  );
  if (pods.length === 0) return null;
  return (
    <section className="section">
      <div className="section-head">
        <h2>{titre}</h2>
        {pods.length > 10 ? <SearchField value={q} onChange={setQ} label={fr.pods.rechercher} count={fr.pods.nb(filtres.length)} /> : null}
      </div>
      <Card scroll>
        {filtres.length === 0 ? (
          <div className="card-pad mut">{fr.pods.aucunResultat.replace('{q}', q)}</div>
        ) : (
          <DataTable columns={colonnes} rows={filtres} rowKey={(p) => p.uid} initialSort={{ key: 'name', dir: 'asc' }} showHeader={false} pageSize={50} resetKey={terme} caption={titre} />
        )}
      </Card>
    </section>
  );
}

// Dernier redémarrage et dernier incident résolu, pour le panneau « Tout fonctionne ».
function historique(pods) {
  let dernierRedemarrage = null;
  let incident = null;
  for (const p of pods) {
    for (const c of tousConteneurs(p)) {
      const t = c.lastState?.state === 'terminated' ? c.lastState : null;
      if (!t?.finishedAt || c.restarts === 0) continue;
      const fin = new Date(t.finishedAt).getTime();
      if (!dernierRedemarrage || fin > dernierRedemarrage) dernierRedemarrage = fin;
      if (estIncident(t) && (!incident || fin > incident.fin)) incident = { fin, t, pod: p };
    }
  }
  return { dernierRedemarrage, incident };
}

function ToutFonctionne({ pods, counts }) {
  const { ns, link } = useScope();
  const { dernierRedemarrage, incident } = historique(pods);
  const cible = incident ? incident.pod.workload?.name ?? incident.pod.name : null;
  return (
    <Card className="state-card">
      <div className="allgood-head">
        <span className="tone-ok" style={{ display: 'inline-flex' }}>
          <Icon name="ok" size={28} strokeWidth={1.3} />
        </span>
        <div>
          <div className="state-title">{A.toutFonctionne}</div>
          <div className="mut">{tpl(A.tousEnBonEtat(counts.ok), { n: counts.ok, ns: <Mono>{ns}</Mono> })}</div>
        </div>
      </div>
      <div className="allgood-counts">
        <span>
          <strong>{counts.ok}</strong> {A.comptes.ok}
        </span>
        <span className="mut">
          <strong>0</strong> {A.comptes.erreur}
        </span>
        <span className="mut">
          <strong>0</strong> {A.comptes.attente}
        </span>
      </div>
      <div className="mut" style={{ fontSize: 13 }}>
        {dernierRedemarrage ? A.aucunRedemarrageDepuis.replace('{duree}', duree(depuis(dernierRedemarrage))) : A.aucunRedemarrage}
        {incident ? ' ' : ''}
        {incident
          ? tpl(A.dernierIncident, {
              cible: <Mono>{cible}</Mono>,
              raison: `${libelleArret(incident.t)} (${incident.t.reason ?? incident.t.exitCode})`,
              quand: ilYa(incident.fin),
            })
          : null}
      </div>
      <a href={link('/charges')} style={{ fontSize: 13 }}>
        {A.voirCharges}
      </a>
    </Card>
  );
}

export default function Accueil({ onUpdate }) {
  const { ns } = useScope();
  const { pods, workloads } = useNamespaceData({ onUpdate });
  const items = pods.data?.items;

  const groupes = useMemo(() => {
    const g = { erreur: [], attente: [], ok: [], autres: [] };
    for (const p of items ?? []) (g[p.category] ?? g.autres).push(p);
    // Les Pods qui redémarrent le plus en premier : ce sont souvent les plus urgents.
    g.erreur.sort((a, b) => b.restarts - a.restarts || a.name.localeCompare(b.name));
    g.attente.sort((a, b) => (b.age ?? 0) - (a.age ?? 0));
    return g;
  }, [items]);

  const entete = (
    <div className="page-head">
      <h1>{A.titre}</h1>
      {items ? <span className="mut">{tpl(A.sousTitre(items.length), { n: items.length, ns: <Mono>{ns}</Mono> })}</span> : null}
    </div>
  );

  let contenu;
  if (pods.status === 'error' && !items) contenu = <ErrorState error={pods.error} onRetry={pods.reload} />;
  else if (!items) contenu = <LoadingState />;
  else if (items.length === 0) contenu = <EmptyState titre={A.vide.titre} texte={A.vide.texte} />;
  else {
    const wl = workloads.data?.items;
    const counts = { ok: groupes.ok.length, erreur: groupes.erreur.length, attente: groupes.attente.length };
    const toutVaBien = counts.erreur === 0 && counts.attente === 0;
    contenu = (
      <>
        {toutVaBien ? (
          <ToutFonctionne pods={items} counts={counts} />
        ) : (
          <section className="stats">
            <Stat cat="ok" n={counts.ok} />
            <Stat cat="erreur" n={counts.erreur} />
            <Stat cat="attente" n={counts.attente} />
          </section>
        )}
        <ExamineList titre={A.aExaminer(counts.erreur)} pods={groupes.erreur} workloads={wl} />
        <ExamineList titre={A.enAttente(counts.attente)} pods={groupes.attente} workloads={wl} />
        <PodList titre={A.enBonEtat(counts.ok)} pods={groupes.ok} />
        <PodList titre={A.autres(groupes.autres.length)} pods={groupes.autres} />
      </>
    );
  }

  return (
    <main className="page">
      {entete}
      {contenu}
    </main>
  );
}
