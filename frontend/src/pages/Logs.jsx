// Écran des logs d'un Pod (maquette 04) : choix du conteneur (conçu),
// conteneur actuel ou précédent, recherche, suivi en direct.
// Les logs sont toujours lus par la fin (500 dernières lignes par défaut).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Icon, { Spinner } from '../components/Icon.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { SelectField, Segmented } from '../components/Toolbar.jsx';
import { ErrorState, LoadingState, Skeleton } from '../components/States.jsx';
import { Breadcrumb } from './PodDetail.jsx';
import { useScope } from '../state/ScopeContext.jsx';
import { useApi } from '../lib/useApi.js';
import { cleTs, useLogFollow } from '../lib/useLogFollow.js';
import { Mono, tpl, tplText } from '../lib/tpl.jsx';
import { ilYa } from '../lib/format.js';
import { libelleArret, quantite, tousConteneurs } from '../lib/diagnostic.js';
import fr from '../i18n/fr.js';

const L = fr.logs;
const CHOIX_LIGNES = [100, 500, 1000, 5000];
const LIGNES_MAX_EN_MEMOIRE = 5000;

// Heure locale « 14:31:02.118 », précédée de la date si ce n'est pas aujourd'hui.
const fmtHeure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
const fmtHeureCourte = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });
function heure(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const memeJour = d.toDateString() === new Date().toDateString();
  return `${memeJour ? '' : `${fmtDate.format(d)} `}${fmtHeure.format(d)}`;
}

// Interrupteur « Suivi en direct » (maquette 04).
function Switch({ checked, disabled, onChange, label, title }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={title}
      className={`switch${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-track">
        <span className="switch-knob" />
      </span>
      {label}
    </button>
  );
}

// Découpe une ligne autour des occurrences recherchées.
function surligner(texte, terme, indexDebut, courant) {
  if (!terme) return texte;
  const bas = texte.toLowerCase();
  const morceaux = [];
  let pos = 0;
  let i = indexDebut;
  for (let j = bas.indexOf(terme); j !== -1; j = bas.indexOf(terme, j + terme.length)) {
    if (j > pos) morceaux.push(texte.slice(pos, j));
    morceaux.push(
      <mark key={j} data-match={i} className={i === courant ? 'is-current' : undefined}>
        {texte.slice(j, j + terme.length)}
      </mark>,
    );
    i += 1;
    pos = j + terme.length;
  }
  morceaux.push(texte.slice(pos));
  return morceaux;
}

// Bandeau de fin : « Fin des logs — conteneur arrêté à 14:31:33 : mémoire dépassée (OOMKilled)… »
function FinDesLogs({ arret, limite }) {
  if (!arret) return null;
  const oom = arret.reason === 'OOMKilled';
  return (
    <div className="log-end">
      <Icon name={oom ? 'memoire' : 'alerte'} size={16} strokeWidth={1.5} />
      <span>
        {tpl(L.fin, {
          heure: arret.finishedAt ? fmtHeureCourte.format(new Date(arret.finishedAt)) : '?',
          raison: (
            <>
              {libelleArret(arret)} {arret.reason ? <Mono>({arret.reason})</Mono> : null}
            </>
          ),
          limite: oom && limite ? L.finLimite.replace('{limite}', limite) : '',
          code: arret.exitCode ?? '?',
        })}
        {oom ? L.finOom : ''}
      </span>
    </div>
  );
}

export default function Logs({ name, onUpdate }) {
  const { ctx, ns, route, link } = useScope();
  const detail = useApi(`/pods/${encodeURIComponent(name)}`, { ctx, ns });
  const pod = detail.data?.pod;
  const conteneurs = pod ? tousConteneurs(pod) : [];

  // Conteneur choisi : ?c=… dans l'adresse, sinon celui en cause, sinon le premier.
  const [choix, setChoix] = useState(route.query.c ?? null);
  const nomConteneur = choix ?? pod?.statusContainer ?? pod?.containers[0]?.name ?? null;
  const c = conteneurs.find((x) => x.name === nomConteneur) ?? null;

  // Instance : par défaut le conteneur précédent s'il plante en boucle (ses
  // logs montrent ce qui s'est passé avant l'arrêt), sinon le conteneur actuel.
  const [instance, setInstance] = useState(null);
  const aUnPrecedent = Boolean(c && (c.restarts > 0 || c.lastState?.state === 'terminated'));
  const instanceParDefaut = c?.state?.state === 'waiting' && c.state.reason === 'CrashLoopBackOff' && aUnPrecedent ? 'precedent' : 'actuel';
  const mode = instance ?? instanceParDefaut;
  const precedent = mode === 'precedent';

  const [nbLignes, setNbLignes] = useState(500);
  const [suivi, setSuivi] = useState(false);
  const [q, setQ] = useState('');
  const [courant, setCourant] = useState(0);

  const logs = useApi(
    c ? `/pods/${encodeURIComponent(name)}/logs` : null,
    { ctx, ns, container: nomConteneur, previous: precedent ? 1 : '', tailLines: nbLignes },
    { enabled: Boolean(c) },
  );
  useEffect(() => {
    if (logs.updatedAt) onUpdate?.(logs.updatedAt);
  }, [logs.updatedAt, onUpdate]);

  // Lignes affichées : celles lues + celles reçues en direct (limitées en mémoire).
  const [enDirect, setEnDirect] = useState([]);
  useEffect(() => setEnDirect([]), [logs.data]);
  const lignes = useMemo(() => {
    const toutes = [...(logs.data?.lines ?? []), ...enDirect];
    return toutes.length > LIGNES_MAX_EN_MEMOIRE ? toutes.slice(-LIGNES_MAX_EN_MEMOIRE) : toutes;
  }, [logs.data, enDirect]);

  const suiviPossible = !precedent && Boolean(logs.data);
  const urlSuivi = c
    ? `/api/pods/${encodeURIComponent(name)}/logs?${new URLSearchParams({ ctx, ns, container: nomConteneur, follow: '1' })}`
    : null;
  const derniere = logs.data?.lines.length ? logs.data.lines[logs.data.lines.length - 1].ts : null;
  const etatSuivi = useLogFollow({
    enabled: suivi && suiviPossible,
    url: urlSuivi,
    lastTs: derniere,
    onLines: useCallback((nouvelles) => setEnDirect((l) => [...l, ...nouvelles].slice(-LIGNES_MAX_EN_MEMOIRE)), []),
  });

  // Défilement : en bas au chargement ; en suivi, on reste en bas si on y était.
  const boite = useRef(null);
  const enBas = useRef(true);
  const [nonLues, setNonLues] = useState(0);
  const descendre = () => {
    if (boite.current) boite.current.scrollTop = boite.current.scrollHeight;
    setNonLues(0);
  };
  useLayoutEffect(() => {
    descendre();
  }, [logs.data]);
  const dejaVues = useRef(0);
  useLayoutEffect(() => {
    const ajout = enDirect.length - dejaVues.current;
    dejaVues.current = enDirect.length;
    if (ajout <= 0) return;
    if (enBas.current) descendre();
    else setNonLues((n) => n + ajout);
  }, [enDirect]);

  // Recherche : occurrences dans le texte des lignes (insensible à la casse).
  const terme = q.trim().toLowerCase();
  const { debuts, total } = useMemo(() => {
    const d = [];
    let n = 0;
    for (const l of lignes) {
      d.push(n);
      if (!terme) continue;
      const bas = l.text.toLowerCase();
      for (let j = bas.indexOf(terme); j !== -1; j = bas.indexOf(terme, j + terme.length)) n += 1;
    }
    return { debuts: d, total: n };
  }, [lignes, terme]);
  useEffect(() => setCourant(Math.max(0, total - 1)), [terme]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!terme || total === 0) return;
    // On fait défiler la zone des logs seulement (pas la page entière).
    const b = boite.current;
    const el = b?.querySelector(`mark[data-match="${courant}"]`);
    if (el) b.scrollTop = el.offsetTop - b.clientHeight / 2;
  }, [courant, terme, total]);
  const allerA = (delta) => total && setCourant((i) => (i + delta + total) % total);

  // Changement de conteneur ou d'instance : on repart d'une vue propre.
  const changerConteneur = (nom) => {
    setChoix(nom);
    setInstance(null);
    setSuivi(false);
  };
  const changerInstance = (m) => {
    setInstance(m);
    if (m === 'precedent') setSuivi(false);
  };

  if (detail.status === 'error' && !pod) {
    return (
      <main className="page page-detail">
        <Breadcrumb name={name} extra={L.titreCourt} />
        <ErrorState error={detail.error} onRetry={detail.reload} />
      </main>
    );
  }
  if (!pod) {
    return (
      <main className="page page-detail">
        <Breadcrumb name={name} extra={L.titreCourt} />
        <LoadingState />
      </main>
    );
  }

  const arret = precedent ? (c?.lastState?.state === 'terminated' ? c.lastState : null) : c?.state?.state === 'terminated' ? c.state : null;
  const numero = c ? (precedent ? c.restarts : c.restarts + 1) : null;
  const optionsConteneurs = conteneurs.map((x) => ({
    value: x.name,
    label: x.init ? tplText(x.sidecar ? L.auxiliaire : L.initialisation, { name: x.name }) : x.name,
  }));

  let note = null;
  if (precedent && c?.lastState?.finishedAt) {
    note = tpl(L.notePrecedent, { precedent: <strong>{L.precedentMot}</strong>, quand: ilYa(c.lastState.finishedAt) });
  } else if (!precedent && c?.state?.state === 'waiting') {
    note = tpl(L.noteActuelArrete, { status: <Mono>{c.state.reason}</Mono> });
  } else if (!precedent && c?.state?.state === 'running' && c.state.startedAt) {
    note = tpl(L.noteActuel, { actuel: <strong>{L.actuelMot}</strong>, quand: ilYa(c.state.startedAt) });
  }

  let corps;
  if (logs.status === 'error' && !logs.data) {
    const e = logs.error;
    const attendu = ['LOGS_PRECEDENT_ABSENT', 'CONTENEUR_EN_ATTENTE', 'LOGS_INTERDITS'].includes(e.code);
    corps = attendu ? (
      <div className="log-empty">
        <Icon name={e.code === 'LOGS_INTERDITS' ? 'cadenas' : 'info'} size={16} />
        <span>{e.message}</span>
        {e.code === 'LOGS_PRECEDENT_ABSENT' ? (
          <Button size="sm" onClick={() => changerInstance('actuel')}>
            {L.voirActuel}
          </Button>
        ) : (
          <Button size="sm" onClick={logs.reload}>
            {fr.commun.reessayer}
          </Button>
        )}
      </div>
    ) : (
      <div className="card-pad">
        <ErrorState error={e} onRetry={logs.reload} />
      </div>
    );
  } else if (!logs.data) {
    corps = (
      <div className="card-pad">
        <Skeleton rows={6} />
      </div>
    );
  } else if (lignes.length === 0) {
    corps = <div className="log-empty mut">{L.vide}</div>;
  } else {
    corps = (
      <pre
        className="log-pre"
        ref={boite}
        tabIndex={0}
        onScroll={(e) => {
          const b = e.currentTarget;
          enBas.current = b.scrollHeight - b.scrollTop - b.clientHeight < 24;
          if (enBas.current) setNonLues(0);
        }}
      >
        {lignes.map((l, i) => (
          <div key={i} className="log-line">
            <span className="log-time">{heure(l.ts)}</span>
            {'  '}
            <span className="log-text">{surligner(l.text, terme, debuts[i], courant)}</span>
          </div>
        ))}
      </pre>
    );
  }

  return (
    <main className="page page-detail" style={{ gap: 16 }}>
      <Breadcrumb pod={pod} name={name} extra={L.titreCourt} />
      <div className="pod-title-row">
        <h1>{tpl(L.titre, { name: <span className="mono" style={{ fontWeight: 500 }}>{name}</span> })}</h1>
        <StatusBadge status={pod.status} category={pod.category} size="md" />
      </div>

      <div className="toolbar">
        {conteneurs.length > 1 ? (
          <SelectField label={L.choixConteneur} value={nomConteneur} onChange={changerConteneur} options={optionsConteneurs} />
        ) : null}
        <div title={aUnPrecedent ? undefined : L.precedentIndispo}>
          <Segmented
            label={L.instance}
            value={mode}
            onChange={changerInstance}
            options={[
              { value: 'actuel', label: L.actuel },
              { value: 'precedent', label: L.precedent, disabled: !aUnPrecedent },
            ]}
          />
        </div>
        <div className={`field log-search${q ? ' is-active' : ''}`}>
          <Icon name="recherche" size={14} />
          <label htmlFor="recherche-logs" className="sr-only">
            {L.rechercher}
          </label>
          <input
            id="recherche-logs"
            type="search"
            value={q}
            placeholder={L.rechercher}
            spellCheck={false}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                allerA(e.shiftKey ? -1 : 1);
              }
            }}
          />
          {terme ? (
            <span className="small mut" style={{ whiteSpace: 'nowrap' }} aria-live="polite">
              {total ? `${L.resultat(courant + 1, total)} · ${L.resultats(total)}` : L.resultats(0)}
            </span>
          ) : null}
          <button type="button" className="icon-btn" aria-label={L.resultatPrecedent} onClick={() => allerA(-1)} disabled={!total}>
            <Icon name="haut" size={12} strokeWidth={2} />
          </button>
          <button type="button" className="icon-btn" aria-label={L.resultatSuivant} onClick={() => allerA(1)} disabled={!total}>
            <Icon name="bas" size={12} strokeWidth={2} />
          </button>
        </div>
        <SelectField
          label={L.nbLignes}
          value={String(nbLignes)}
          onChange={(v) => setNbLignes(Number(v))}
          options={CHOIX_LIGNES.map((n) => ({ value: String(n), label: L.dernieres(n) }))}
        />
        <Switch checked={suivi && suiviPossible} disabled={!suiviPossible} onChange={setSuivi} label={L.suivi} title={precedent ? L.suiviIndispo : undefined} />
      </div>

      {note ? <div className="small mut">{note}</div> : null}
      {suivi && suiviPossible ? (
        <div className="small mut log-follow-state" role="status">
          {etatSuivi.status === 'live' ? (
            <>
              <span className="live-dot" /> {L.suiviActif}
            </>
          ) : etatSuivi.status === 'retry' ? (
            <>
              <span className="live-dot is-off" /> {L.suiviReconnexion(etatSuivi.retryIn)}
            </>
          ) : (
            <>
              <Spinner size={12} /> {L.suiviConnexion}
            </>
          )}
        </div>
      ) : null}

      <Card className="log-card">
        <div className="log-head">
          <span>
            {tpl(numero ? L.entete : L.enteteSansNumero, { c: <Mono>{nomConteneur}</Mono>, n: numero, lignes: L.lignes(lignes.length) })}
          </span>
          <span>{L.heureLocale}</span>
        </div>
        {logs.data?.truncated && lignes.length >= nbLignes ? <div className="log-truncated small mut">{L.tronque(nbLignes)}</div> : null}
        <div className="log-body">
          {corps}
          {nonLues > 0 ? (
            <button type="button" className="btn btn-sm btn-primary log-new" onClick={descendre}>
              {L.nouvelles(nonLues)} · {L.allerEnBas}
            </button>
          ) : null}
        </div>
        <FinDesLogs arret={arret} limite={quantite(c?.limits?.memory)} />
      </Card>
      <div className="small">
        <a href={link(`/pods/${name}`)}>{fr.pods.voirFiche}</a>
      </div>
    </main>
  );
}
