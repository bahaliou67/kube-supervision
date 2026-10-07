// Fiche d'un Pod (maquette 03) : en-tête, raison du dernier arrêt,
// conteneurs (section conçue : absente des maquettes) et événements.
import { useEffect, useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Icon from '../components/Icon.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { ErrorState, LoadingState } from '../components/States.jsx';
import { LastStop } from '../components/PodDiagnosis.jsx';
import { useScope } from '../state/ScopeContext.jsx';
import { useLive } from '../state/LiveContext.jsx';
import { useActions } from '../state/ActionsContext.jsx';
import { navigate } from '../lib/router.js';
import { useApi } from '../lib/useApi.js';
import { Mono, tpl } from '../lib/tpl.jsx';
import { age, duree, depuis, ilYa } from '../lib/format.js';
import { conteneur, dernierArret, estIncident, quantite, tousConteneurs } from '../lib/diagnostic.js';
import { phraseEvenement } from '../lib/events.js';
import { prochainRedemarrage } from '../lib/restart.js';
import fr from '../i18n/fr.js';

const F = fr.fiche;
const MAX_EVENEMENTS = 30;

// Fil d'Ariane : Charges de travail / api / api-7d9f8b6c5-m8ztw
export function Breadcrumb({ pod, name, extra }) {
  const { link } = useScope();
  const w = pod?.workload;
  return (
    <nav className="crumbs" aria-label={F.filAriane}>
      <a href={link('/charges')}>{fr.charges.titre}</a>
      {' / '}
      {pod ? (
        w ? (
          <a href={link('/charges', { q: w.name })}>{w.name}</a>
        ) : (
          <a href={link('/charges', { q: name })}>{fr.charges.sansProprietaire}</a>
        )
      ) : null}
      {pod ? ' / ' : null}
      {extra ? <a href={link(`/pods/${name}`)}>{name}</a> : <span aria-current="page">{name}</span>}
      {extra ? (
        <>
          {' / '}
          <span aria-current="page">{extra}</span>
        </>
      ) : null}
    </nav>
  );
}

// Résumé court à côté du badge (« plante et redémarre en boucle »).
export function resumeCourt(pod) {
  if (pod.status === 'Running' && pod.category === 'attente') return F.courts.RunningNonPret;
  if (pod.status?.startsWith('Init:')) return pod.category === 'erreur' ? F.courts.InitErreur : F.courts.PodInitializing;
  return F.courts[pod.status] ?? null;
}

function Fait({ label, children, className }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={className}>{children}</dd>
    </div>
  );
}

function EnTete({ pod }) {
  const { link, ctx, ns } = useScope();
  const { demander, raisonBlocage } = useActions();
  // Après la suppression, retour à la charge de travail du Pod (son remplaçant y apparaîtra).
  const apresSuppression = () => navigate('/charges', { ctx, ns, q: pod.workload?.name ?? '' });
  const images = [...new Set(pod.containers.map((c) => c.image).filter(Boolean))];
  const court = resumeCourt(pod);
  return (
    <section className="pod-head">
      <div className="pod-head-main">
        <div className="pod-title-row">
          <h1 className="mono pod-title">{pod.name}</h1>
          <StatusBadge status={pod.status} category={pod.category} size="md" />
          {court ? <span className="mut">{court}</span> : null}
        </div>
        <dl className="facts">
          <Fait label={F.redemarrages} className={pod.restarts > 0 && pod.category === 'erreur' ? 'fact-err' : undefined}>
            {pod.restarts}
          </Fait>
          <Fait label={F.noeud} className="mono">
            {pod.node ?? <span className="mut">{F.aucunNoeud}</span>}
          </Fait>
          <Fait label={F.age}>{age(pod.createdAt)}</Fait>
          <Fait label={F.gerePar}>
            {pod.workload ? (
              <>
                {pod.workload.kind}{' '}
                <a href={link('/charges', { q: pod.workload.name })} className="mono">
                  {pod.workload.name}
                </a>
              </>
            ) : (
              fr.pods.sansProprietaire
            )}
          </Fait>
          <Fait label={images.length > 1 ? F.images : F.image} className="mono">
            {images.length ? images.join(', ') : fr.commun.aucun}
          </Fait>
        </dl>
      </div>
      <div className="examine-actions">
        <Button variant="primary" href={link(`/pods/${pod.name}/logs`)}>
          {fr.pods.voirLogs}
        </Button>
        <Button
          variant="danger-outline"
          icon="corbeille"
          disabledReason={raisonBlocage('delete')}
          onClick={() => demander('delete', pod, apresSuppression)}
        >
          {F.supprimer}
        </Button>
      </div>
    </section>
  );
}

// Panneau principal du diagnostic : raison du dernier arrêt (rouge), raison
// du blocage ou de l'attente, ou dernier arrêt déjà résolu (neutre).
function Panneau({ pod, workload }) {
  const P = F.panneau;
  const t = dernierArret(pod);
  const incident = estIncident(t) ? t : null;
  const nonPret = pod.status === 'Running' && pod.category === 'attente';
  // Conteneur en cause : celui que désigne le statut, sinon le premier qui n'est pas prêt.
  const cEnCause =
    conteneur(pod, pod.statusContainer ?? (nonPret ? pod.containers.find((c) => !c.ready)?.name : incident?.container)) ??
    conteneur(pod, incident?.container);
  const kind = pod.workload?.kind ?? 'Pod';

  // 1. Pod en erreur à cause d'un arrêt de conteneur : « Raison du dernier arrêt ».
  // 2. Pod en erreur sans arrêt (image, configuration…) : « Pourquoi le Pod ne démarre pas ».
  // 3. Pod en attente avec une explication : « Pourquoi le Pod attend ».
  // 4. Pod sain avec un arrêt passé : rappel neutre.
  let mode = null;
  if (pod.category === 'erreur') {
    // Le Pod plante (CrashLoopBackOff, OOMKilled, code de sortie…) : son dernier arrêt explique le problème.
    const parArret =
      incident && (pod.status === 'CrashLoopBackOff' || pod.status === incident.reason || /^(ExitCode|Signal):/.test(pod.status));
    mode = parArret ? 'arret' : 'blocage';
  } else if (pod.category === 'attente' && (nonPret || pod.statusMessage || F.explications[pod.status])) mode = 'attente';
  else if (incident && pod.category === 'ok') mode = 'resolu';
  if (!mode) return null;

  if (mode === 'resolu') {
    return (
      <section className="panel panel-neutral">
        <div className="panel-icon tone-mut">
          <Icon name={incident.reason === 'OOMKilled' ? 'memoire' : 'info'} size={22} strokeWidth={1.4} />
        </div>
        <div className="panel-body">
          <div className="panel-kicker tone-mut">{P.ancienArret}</div>
          <div>
            {tpl(P.resolu, { c: <Mono>{incident.container}</Mono>, quand: ilYa(incident.finishedAt) })}{' '}
            <span className="mut">
              ({fr.arrets[incident.reason]?.libelle ?? incident.reason} <Mono>{incident.reason}</Mono>
              {incident.exitCode !== null ? `, ${P.codeSortie.toLowerCase()} ${incident.exitCode}` : ''})
            </span>
          </div>
        </div>
      </section>
    );
  }

  const raison = mode === 'arret' ? incident.reason ?? pod.status : pod.status;
  // « Init:ImagePullBackOff » s'explique comme « ImagePullBackOff » (le conteneur en cause est l'init container).
  const sansInit = raison?.startsWith('Init:') ? raison.slice(5) : raison;
  let base = sansInit?.startsWith('ExitCode:') ? 'ExitCode' : sansInit?.startsWith('Signal:') ? 'Signal' : sansInit;
  if (nonPret) base = 'RunningNonPret';
  const libelle = mode === 'arret' ? fr.arrets[base]?.libelle ?? raison : null;
  const explication = F.explications[base] ?? F.explications.defaut;
  const piste = F.pistes[base];
  const cNom = cEnCause?.name ?? incident?.container ?? pod.containers[0]?.name;
  const enBoucle = pod.status === 'CrashLoopBackOff';
  const restant = enBoucle ? prochainRedemarrage(cEnCause) : null;
  const ton = mode === 'attente' ? 'warn' : 'err';
  const titre = mode === 'arret' ? P.dernierArret : mode === 'blocage' ? P.blocage : P.attente;

  return (
    <section className={`panel panel-${ton}`}>
      <div className={`panel-icon tone-${ton}`}>
        <Icon name={base === 'OOMKilled' ? 'memoire' : mode === 'attente' ? 'attente' : 'alerte'} size={28} strokeWidth={1.3} />
      </div>
      <div className="panel-body">
        <div className={`panel-kicker tone-${ton}`}>{titre}</div>
        <div className="panel-title">
          {libelle ? (
            <>
              {libelle.charAt(0).toUpperCase() + libelle.slice(1)} <span className="panel-title-mono">({raison})</span>
            </>
          ) : (
            <span className="mono">{raison}</span>
          )}
        </div>
        <div>
          {tpl(explication, { c: <Mono>{cNom}</Mono>, s: raison })}
          {mode === 'arret' && enBoucle ? F.explications.replante : ''}
        </div>
        {mode !== 'arret' && incident ? <LastStop pod={pod} /> : null}
        {pod.statusMessage && mode !== 'arret' ? (
          <div className="kube-msg">
            {P.messageKube} : {pod.statusMessage}
          </div>
        ) : null}
        {mode === 'arret' ? (
          <div className="panel-facts">
            {pod.containers.length + pod.initContainers.length > 1 ? (
              <div>
                <span className="mut">{P.conteneur}</span> <strong className="mono">{cNom}</strong>
              </div>
            ) : null}
            {incident.reason === 'OOMKilled' && incident.limite ? (
              <div>
                <span className="mut">{P.limiteMemoire}</span> <strong className="mono">{incident.limite}</strong>
              </div>
            ) : null}
            {incident.exitCode !== null && incident.exitCode !== undefined ? (
              <div>
                <span className="mut">{P.codeSortie}</span> <strong className="mono">{incident.exitCode}</strong>
              </div>
            ) : null}
            {incident.finishedAt ? (
              <div>
                <span className="mut">{P.arrete}</span> <strong>{ilYa(incident.finishedAt)}</strong>
              </div>
            ) : null}
            {restant !== null ? (
              <div>
                <span className="mut">{P.prochainRedemarrage}</span>{' '}
                <strong>{restant < 5 ? P.imminent : P.environ.replace('{duree}', duree(restant))}</strong>
              </div>
            ) : null}
          </div>
        ) : null}
        {incident?.message && mode === 'arret' ? <div className="kube-msg">{incident.message}</div> : null}
        {piste ? <div className="panel-hint">{piste.replace('{kind}', kind)}</div> : null}
        {workload && typeof workload.desired === 'number' && workload.desired > 0 && workload.ready < workload.desired ? (
          <div className="panel-hint">
            {tpl(fr.diagnostic.consequence(workload.ready, workload.desired), { kind: workload.kind, name: <Mono>{workload.name}</Mono> })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

// Section « Conteneurs » : statut, redémarrages, image et limites par conteneur.
function Conteneurs({ pod }) {
  const { link } = useScope();
  const C = F.conteneurs;
  const liste = tousConteneurs(pod);
  const lim = (r) => {
    const v = [r.memory && C.memoire.replace('{v}', quantite(r.memory)), r.cpu && C.cpu.replace('{v}', r.cpu)].filter(Boolean);
    return v.length ? v.join(' · ') : C.aucuneLimite;
  };
  return (
    <section className="section">
      <div className="section-title-row">
        <h2>{C.titre}</h2>
        <span className="small mut">{C.resume(pod.containers.length, pod.initContainers.length)}</span>
      </div>
      <Card as="ul" className="rows-list">
        {liste.map((c) => {
          const enCause = c.name === pod.statusContainer;
          const depuisQuand = c.state?.startedAt ? C.depuis.replace('{duree}', duree(depuis(c.state.startedAt))) : null;
          return (
            <li key={`${c.init}-${c.name}`} className="ctr-row">
              <div className="ctr-main">
                <div className="ctr-title">
                  <span className="mono ctr-name">{c.name}</span>
                  {c.init ? <span className="tag">{c.sidecar ? C.sidecar : C.init}</span> : null}
                  <StatusBadge status={c.status} category={c.category} plain />
                  {c.state?.state === 'running' && !c.init ? (
                    <span className={`small ${c.ready ? 'mut' : 'tone-warn'}`}>{c.ready ? C.pret : C.pasPret}</span>
                  ) : null}
                  {depuisQuand ? <span className="small mut">{depuisQuand}</span> : null}
                </div>
                <div className="ctr-meta">
                  <span>
                    <span className="mut">{C.image}</span> <span className="mono">{c.image}</span>
                  </span>
                  <span>
                    <span className="mut">{C.limites}</span> {lim(c.limits)}
                  </span>
                  {c.requests.memory || c.requests.cpu ? (
                    <span>
                      <span className="mut">{C.demandes}</span> {lim(c.requests)}
                    </span>
                  ) : null}
                </div>
                {c.state?.message && enCause ? <div className="kube-msg">{c.state.message}</div> : null}
              </div>
              <div className={`ctr-restarts${c.restarts > 0 && c.category === 'erreur' ? ' tone-err' : ' mut'}`}>{fr.pods.redemarrages(c.restarts)}</div>
              <a href={link(`/pods/${pod.name}/logs`, { c: c.name })} className="small-link">
                {C.logs}
              </a>
            </li>
          );
        })}
      </Card>
    </section>
  );
}

function Evenements({ events, forbidden }) {
  const E = F.evenements;
  const [tout, setTout] = useState(false);
  const visibles = tout ? events : events.slice(0, MAX_EVENEMENTS);
  return (
    <section className="section">
      <div className="section-title-row">
        <h2>{E.titre}</h2>
        {events.length ? <span className="small mut">{E.ordre}</span> : null}
      </div>
      {forbidden ? (
        <Card padded className="notice-card">
          <Icon name="cadenas" size={14} /> {E.interdit}
        </Card>
      ) : events.length === 0 ? (
        <Card padded className="mut">
          {E.aucun}
        </Card>
      ) : (
        <Card as="ol" className="rows-list">
          {visibles.map((ev) => {
            const alerte = ev.type === 'Warning';
            const simple = phraseEvenement(ev);
            return (
              <li key={ev.uid} className="ev-row">
                <div className="ev-time">{ilYa(ev.lastAt)}</div>
                <div className={`ev-type ${alerte ? 'tone-err' : 'tone-mut'}`}>
                  <Icon name={alerte ? 'alerte' : 'info'} size={14} />
                  {alerte ? E.alerte : E.info}
                </div>
                <div className="ev-body">
                  <div className="ev-simple">{simple ?? ev.message}</div>
                  <div className="kube-msg ev-tech">
                    {ev.reason}
                    {simple ? ` · ${ev.message}` : ''}
                  </div>
                </div>
                <div className="ev-count">{E.fois(ev.count)}</div>
              </li>
            );
          })}
        </Card>
      )}
      {events.length > MAX_EVENEMENTS ? (
        <div>
          <Button size="sm" onClick={() => setTout(!tout)}>
            {tout ? fr.accueil.masquerAutres : E.afficherTout(events.length)}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export default function PodDetail({ name }) {
  const { ctx, ns, link } = useScope();
  // Le Pod ou ses événements changent : la fiche se relit sans repasser par le chargement.
  const { revision } = useLive();
  const detail = useApi(`/pods/${encodeURIComponent(name)}`, { ctx, ns }, { revision: revision(name) });

  const d = detail.data;
  let contenu;
  // Un Pod supprimé pendant qu'on regarde sa fiche : « Ce Pod n'existe plus ».
  // Nom invalide (lien abîmé) : traité comme un Pod introuvable.
  const introuvable = detail.status === 'error' && ['INTROUVABLE', 'PARAMETRE_INVALIDE'].includes(detail.error.code);
  if (detail.status === 'error' && (!d || introuvable)) {
    contenu =
      introuvable ? (
        <Card className="state-card">
          <h1 className="state-title">{F.introuvable.titre}</h1>
          <div className="mut">{tpl(F.introuvable.texte, { name: <Mono>{name}</Mono>, ns: <Mono>{ns}</Mono> })}</div>
          <div>
            <Button href={link('/charges')}>{F.introuvable.retour}</Button>
          </div>
        </Card>
      ) : (
        <ErrorState error={detail.error} onRetry={detail.reload} />
      );
  } else if (!d) {
    contenu = <LoadingState />;
  } else {
    contenu = (
      <>
        <EnTete pod={d.pod} />
        <Panneau pod={d.pod} workload={d.workload} />
        <Conteneurs pod={d.pod} />
        <Evenements events={d.events} forbidden={d.eventsForbidden} />
      </>
    );
  }

  return (
    <main className="page page-detail">
      <Breadcrumb pod={d?.pod} name={name} />
      {contenu}
    </main>
  );
}
