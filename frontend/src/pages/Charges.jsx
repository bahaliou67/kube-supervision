// Écran Charges de travail (maquette 02) : une ligne par charge, dépliable
// pour afficher ses Pods. Recherche, filtre par statut et par type, tri et
// pagination ont été conçus pour les namespaces de plusieurs centaines de Pods.
import { Fragment, useEffect, useMemo, useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Icon from '../components/Icon.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { MiddleName } from '../components/Truncate.jsx';
import { Pager, SortHeader, ariaSort } from '../components/DataTable.jsx';
import { SearchField, Segmented, SelectField } from '../components/Toolbar.jsx';
import { EmptyState, ErrorState, LoadingState, PartialNotice } from '../components/States.jsx';
import { ShortReason } from '../components/PodDiagnosis.jsx';
import { useScope } from '../state/ScopeContext.jsx';
import { useNamespaceData } from '../state/useNamespaceData.js';
import { useTable } from '../lib/useTable.js';
import { RANG_CATEGORIE, badgeReplicas, decouperImage, lignesCharges, resumeTypes } from '../lib/workloads.js';
import { age, ilYa } from '../lib/format.js';
import { tplText } from '../lib/tpl.jsx';
import fr from '../i18n/fr.js';

const C = fr.charges;
const MAX_PODS_DEPLIES = 20;
const COLONNES = 6;

// Types pour lesquels les actions existent (branchées à l'étape 7).
const REDEMARRABLE = new Set(['Deployment', 'StatefulSet', 'DaemonSet']);
const AJUSTABLE = new Set(['Deployment', 'StatefulSet']);

function BadgeReplicas({ ligne }) {
  const b = badgeReplicas(ligne);
  return (
    <span className={`badge badge-13 badge-${b.tone}${b.plain ? ' badge-nobg' : ''}`}>
      <Icon name={b.icon} size={14} />
      {b.texte}
    </span>
  );
}

function Image({ images }) {
  if (!images?.length) return <span className="mut">{fr.commun.aucun}</span>;
  const { nom, version } = decouperImage(images[0]);
  return (
    <span className="wl-image trunc" title={images.join('\n')} style={{ maxWidth: 280 }}>
      {nom}:<strong>{version}</strong>
      {images.length > 1 ? <span className="mut"> +{images.length - 1}</span> : null}
    </span>
  );
}

// Une ligne de Pod dans le panneau déplié.
function PodLine({ pod }) {
  const { link } = useScope();
  const enErreur = pod.category === 'erreur' && pod.restarts > 0;
  return (
    <div className="pod-line">
      <span className="pod-line-status">
        <StatusBadge status={pod.status} category={pod.category} plain />
      </span>
      <a href={link(`/pods/${pod.name}`)} className="pod-line-name trunc" title={pod.name}>
        <MiddleName name={pod.name} max={26} />
      </a>
      <span className="pod-line-msg">
        <ShortReason pod={pod} />
      </span>
      <span className={`pod-line-restarts${enErreur ? ' is-err' : ''}`}>{fr.pods.redemarrages(pod.restarts)}</span>
      <a href={link(`/pods/${pod.name}`)} className="small-link">
        {fr.pods.fiche}
      </a>
      <a href={link(`/pods/${pod.name}/logs`)} className="small-link">
        {fr.pods.logs}
      </a>
    </div>
  );
}

// Informations propres au type, affichées en tête du panneau déplié.
function InfosType({ ligne }) {
  const infos = [];
  if (ligne.kind === 'CronJob') {
    infos.push(tplText(C.cronInfo, { schedule: ligne.schedule }));
    if (ligne.lastScheduleTime) infos.push(tplText(C.cronDernier, { quand: ilYa(ligne.lastScheduleTime) }));
  }
  if (ligne.kind === 'Job' && ligne.failureReason) {
    infos.push(<span className="subcard-alert">{tplText(C.jobEchecInfo, { raison: ligne.failureMessage ?? ligne.failureReason })}</span>);
  }
  if (ligne.stalled) infos.push(<span className="subcard-alert">{C.bloque}</span>);
  if (ligne.orphans) infos.push(C.sansProprietaireAide);
  return infos.map((i, n) => <span key={n}>{i}</span>);
}

function PanneauPods({ ligne, pods }) {
  const [tout, setTout] = useState(false);
  const visibles = tout ? pods : pods.slice(0, MAX_PODS_DEPLIES);
  return (
    <div className="subcard">
      <div className="subcard-head">
        <span>{ligne.orphans ? `${C.sansProprietaire} · ${pods.length}` : tplText(C.podsDe(pods.length), { name: ligne.name })}</span>
        <InfosType ligne={ligne} />
      </div>
      {pods.length === 0 ? <div className="pod-line mut">{C.aucunPod}</div> : visibles.map((p) => <PodLine key={p.uid} pod={p} />)}
      {pods.length > MAX_PODS_DEPLIES ? (
        <div className="subcard-more">
          <Button size="sm" onClick={() => setTout(!tout)}>
            {tout ? fr.accueil.masquerAutres : fr.tableau.afficherTout(pods.length)}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Actions({ ligne }) {
  if (ligne.orphans || ligne.synthetic) return null;
  return (
    <>
      {REDEMARRABLE.has(ligne.kind) ? (
        <Button size="sm" disabledReason={C.actionsBientot}>
          {C.redemarrer}
        </Button>
      ) : null}
      {AJUSTABLE.has(ligne.kind) ? (
        <Button size="sm" disabledReason={C.actionsBientot}>
          {C.changerReplicas}
        </Button>
      ) : null}
    </>
  );
}

// Tri des Pods dans un panneau : les plus problématiques d'abord.
const triPods = (a, b) => RANG_CATEGORIE[a.category] - RANG_CATEGORIE[b.category] || a.name.localeCompare(b.name, 'fr', { numeric: true });

export default function Charges({ onUpdate }) {
  const { ctx, ns } = useScope();
  const { pods, workloads } = useNamespaceData({ onUpdate });
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState('tous');
  const [type, setType] = useState('tous');
  const [ouverts, setOuverts] = useState(null); // Set des clés dépliées (null = pas encore initialisé)

  // Nouveau namespace : filtres et dépliage remis à zéro.
  useEffect(() => {
    setQ('');
    setStatut('tous');
    setType('tous');
    setOuverts(null);
  }, [ctx, ns]);

  const pret = pods.data && workloads.data;
  const lignes = useMemo(() => {
    if (!pret) return [];
    const l = lignesCharges(workloads.data.items, pods.data.items);
    l.forEach((x) => x.pods.sort(triPods));
    return l.sort((a, b) => (a.orphans ? 1 : 0) - (b.orphans ? 1 : 0) || a.name.localeCompare(b.name, 'fr', { numeric: true }));
  }, [pret, workloads.data, pods.data]);

  // Au premier affichage, les charges en erreur sont dépliées (3 au plus).
  useEffect(() => {
    if (ouverts === null && pret) {
      const enErreur = lignes.filter((l) => l.category === 'erreur');
      setOuverts(new Set(enErreur.length <= 3 ? enErreur.map((l) => l.key) : []));
    }
  }, [ouverts, pret, lignes]);

  const terme = q.trim().toLowerCase();
  const filtrees = useMemo(() => {
    return lignes
      .map((l) => {
        const parNom = !terme || l.name.toLowerCase().includes(terme);
        const podsTrouves = terme && !parNom ? l.pods.filter((p) => p.name.toLowerCase().includes(terme)) : null;
        return { l, parNom, podsTrouves };
      })
      .filter(({ l, parNom, podsTrouves }) => {
        if (!parNom && !podsTrouves?.length) return false;
        if (type !== 'tous' && (l.orphans ? 'aucun' : l.kind) !== type) return false;
        if (statut === 'tous') return true;
        if (statut === 'ok') return l.category === 'ok' || l.category === 'inactif';
        return l.category === statut;
      });
  }, [lignes, terme, type, statut]);

  const sortValues = useMemo(
    () => ({
      nom: ({ l }) => (l.orphans ? '￿' : l.name),
      type: ({ l }) => l.kind ?? '￿',
      etat: ({ l }) => RANG_CATEGORIE[l.category],
      age: ({ l }) => l.age,
    }),
    [],
  );
  const table = useTable(filtrees, { sortValues, initialSort: { key: 'etat', dir: 'asc' }, pageSize: 50, resetKey: `${terme}|${statut}|${type}|${ns}` });

  const compte = (cat) => lignes.filter((l) => (cat === 'ok' ? l.category === 'ok' || l.category === 'inactif' : l.category === cat)).length;
  const typesPresents = [...new Set(lignes.map((l) => (l.orphans ? 'aucun' : l.kind)))];

  const basculer = (key) =>
    setOuverts((s) => {
      const n = new Set(s ?? []);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const erreur = pods.status === 'error' && !pods.data ? pods : workloads.status === 'error' && !workloads.data ? workloads : null;

  let contenu;
  if (erreur) contenu = <ErrorState error={erreur.error} onRetry={erreur.reload} />;
  else if (!pret) contenu = <LoadingState />;
  else if (lignes.length === 0) contenu = <EmptyState titre={C.vide.titre} texte={C.vide.texte} />;
  else {
    contenu = (
      <>
        <div className="toolbar">
          <SearchField value={q} onChange={setQ} label={C.recherche} count={filtrees.length} />
          <Segmented
            label={C.filtreStatut}
            value={statut}
            onChange={setStatut}
            options={[
              { value: 'tous', label: C.tous, count: lignes.length },
              { value: 'erreur', label: C.filtres.erreur, count: compte('erreur'), icon: 'alerte', tone: 'err' },
              { value: 'attente', label: C.filtres.attente, count: compte('attente'), icon: 'attente', tone: 'warn' },
              { value: 'ok', label: C.filtres.ok, count: compte('ok'), icon: 'ok', tone: 'ok' },
            ]}
          />
          {typesPresents.length > 1 ? (
            <SelectField
              label={C.filtreType}
              value={type}
              onChange={setType}
              options={[{ value: 'tous', label: C.tousTypes }, ...typesPresents.map((t) => ({ value: t, label: t === 'aucun' ? C.sansProprietaire : t }))]}
            />
          ) : null}
        </div>
        <PartialNotice forbidden={[...(workloads.data.forbidden ?? []), ...(pods.data.forbidden ?? [])]} unavailable={workloads.data.unavailable} />
        <Card scroll>
          {filtrees.length === 0 ? (
            <div className="card-pad" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span className="mut">{C.aucunResultat}</span>
              <Button
                size="sm"
                onClick={() => {
                  setQ('');
                  setStatut('tous');
                  setType('tous');
                }}
              >
                {C.effacerFiltres}
              </Button>
            </div>
          ) : (
            <table className="table wl-table" style={{ minWidth: 900 }}>
              <caption className="sr-only">{C.titre}</caption>
              <thead>
                <tr>
                  <th aria-sort={ariaSort(table, 'nom')}>
                    <SortHeader label={C.colNom} sortKey="nom" table={table} />
                  </th>
                  <th aria-sort={ariaSort(table, 'type')}>
                    <SortHeader label={C.colType} sortKey="type" table={table} />
                  </th>
                  <th aria-sort={ariaSort(table, 'etat')}>
                    <SortHeader label={C.colReplicas} sortKey="etat" table={table} />
                  </th>
                  <th>{C.colImage}</th>
                  <th aria-sort={ariaSort(table, 'age')}>
                    <SortHeader label={C.colAge} sortKey="age" table={table} />
                  </th>
                  <th className="num">{C.colActions}</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map(({ l, podsTrouves }) => {
                  const ouvert = Boolean(podsTrouves?.length) || (ouverts?.has(l.key) ?? false);
                  const libelle = tplText(ouvert ? C.masquerPods : C.afficherPods, { name: l.name });
                  return (
                    <Fragment key={l.key}>
                      <tr
                        className={`wl-row${ouvert ? ' is-open' : ''}`}
                        onClick={(e) => {
                          // Un clic sur la ligne la déplie ; les boutons et liens gardent leur propre action.
                          if (!e.target.closest('button, a')) basculer(l.key);
                        }}
                      >
                        <td style={{ maxWidth: 360 }}>
                          <button type="button" className={`wl-name${l.orphans ? ' wl-orphans-name' : ''}`} aria-expanded={ouvert} aria-label={libelle} title={l.name} onClick={() => basculer(l.key)}>
                            <Icon name={ouvert ? 'bas' : 'droite'} size={12} strokeWidth={2} />
                            <span className="trunc">{l.name}</span>
                          </button>
                        </td>
                        <td className="mut">{l.orphans ? C.sansProprietaireType : l.kind}</td>
                        <td>
                          <BadgeReplicas ligne={l} />
                        </td>
                        <td>
                          <Image images={l.images} />
                        </td>
                        <td className="mut">{l.createdAt ? age(l.createdAt) : fr.commun.aucun}</td>
                        <td className="wl-actions">
                          <Actions ligne={l} />
                        </td>
                      </tr>
                      {ouvert ? (
                        <tr className="wl-pods">
                          <td colSpan={COLONNES} className="wl-pods-cell">
                            <PanneauPods ligne={l} pods={podsTrouves?.length ? podsTrouves : l.pods} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
          <Pager table={table} />
        </Card>
        <div className="small mut">{C.aide}</div>
      </>
    );
  }

  return (
    <main className="page" style={{ gap: 18 }}>
      <div className="page-head">
        <h1>{C.titre}</h1>
        {pret && lignes.length > 0 ? <span className="mut">{resumeTypes(lignes)}</span> : null}
      </div>
      {contenu}
    </main>
  );
}
