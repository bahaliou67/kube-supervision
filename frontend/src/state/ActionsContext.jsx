// Les actions : redémarrer, changer les réplicas, supprimer un Pod, et les
// actions de gestion (supprimer une ressource, pause, retour à une version
// précédente, suspendre ou lancer un CronJob). Droits vérifiés, fenêtres de
// confirmation qui rappellent le cluster et le namespace (maquette 05),
// exécution et notification du résultat.
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Dialog, { ScopeBox } from '../components/Dialog.jsx';
import Icon, { Spinner } from '../components/Icon.jsx';
import { apiSend } from '../api.js';
import { useApi } from '../lib/useApi.js';
import { Mono, tpl, tplText } from '../lib/tpl.jsx';
import { hpaDe } from '../lib/ressources.js';
import { ilYa } from '../lib/format.js';
import { useScope } from './ScopeContext.jsx';
import { useLive } from './LiveContext.jsx';
import fr from '../i18n/fr.js';

const A = fr.actions;
const REPLICAS_MAX = 1000;
const ActionsCtx = createContext(null);

// Type Kubernetes → segment d'URL de l'API (et nom de la ressource dans les droits).
const SEGMENT = {
  Deployment: 'deployments',
  StatefulSet: 'statefulsets',
  DaemonSet: 'daemonsets',
  Job: 'jobs',
  CronJob: 'cronjobs',
  Service: 'services',
  Ingress: 'ingresses',
  ConfigMap: 'configmaps',
  PersistentVolumeClaim: 'persistentvolumeclaims',
  HorizontalPodAutoscaler: 'horizontalpodautoscalers',
};
// Droit(s) à vérifier pour chaque action.
const DROIT = {
  restart: (kind) => `${SEGMENT[kind]}.restart`,
  scale: (kind) => `${SEGMENT[kind]}.scale`,
  delete: () => 'pods.delete',
  remove: (kind) => `${SEGMENT[kind]}.delete`,
  pause: () => 'deployments.restart',
  rollback: () => ['deployments.restart', 'replicasets.list'],
  suspend: () => 'cronjobs.patch',
  trigger: () => 'jobs.create',
};
const enc = encodeURIComponent;

function Boutons({ onCancel, onConfirm, busy, label, danger, disabled, annulerRef }) {
  return (
    <div className="dialog-actions">
      <button ref={annulerRef} type="button" className="btn btn-lg btn-quiet" onClick={onCancel} disabled={busy}>
        {A.annuler}
      </button>
      <button type="button" className={`btn btn-lg ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy || disabled} aria-busy={busy}>
        {busy ? (
          <>
            <Spinner size={14} /> {A.enCours}
          </>
        ) : (
          label
        )}
      </button>
    </div>
  );
}

function Erreur({ erreur }) {
  if (!erreur) return null;
  return (
    <div className="field-error dialog-error" role="alert">
      <Icon name="alerte" size={14} />
      <span>
        {A.echec}
        {erreur.message}
      </span>
    </div>
  );
}

function DialogueRedemarrer({ cible, portee, executer, fermer, etat }) {
  const R = A.redemarrer;
  const annuler = useRef(null);
  const n = cible.desired ?? cible.pods.length;
  const oom = cible.pods.some((p) => p.lastTermination?.reason === 'OOMKilled');
  const v = { name: <Mono>{cible.name}</Mono>, n };
  return (
    <Dialog title={tpl(R.titre, v)} onClose={fermer} busy={etat.busy} initialFocus={annuler}>
      <ScopeBox rows={[...portee, [A.cible, `${cible.kind} ${cible.name}`]]} />
      <div>{tpl(cible.kind === 'DaemonSet' ? R.texteDaemonSet : R.texte(n), v)}</div>
      {typeof cible.desired === 'number' ? (
        <div className="small-13 mut">
          {R.actuellement(cible.ready, cible.desired)}
          {oom ? R.memoire : ''}
        </div>
      ) : null}
      <Erreur erreur={etat.erreur} />
      <Boutons annulerRef={annuler} onCancel={fermer} onConfirm={() => executer()} busy={etat.busy} label={tpl(R.bouton, v)} />
    </Dialog>
  );
}

function DialogueReplicas({ cible, portee, executer, fermer, etat }) {
  const R = A.replicas;
  // Un HPA pilote déjà ce nombre : la modification sera vite annulée.
  const hpa = hpaDe(useLive()?.resources?.data?.horizontalpodautoscalers, cible.kind, cible.name);
  const champ = useRef(null);
  const actuel = cible.desired ?? 0;
  const [valeur, setValeur] = useState(String(actuel));
  const n = /^\d+$/.test(valeur) ? Number(valeur) : NaN;
  const valide = Number.isInteger(n) && n >= 0 && n <= REPLICAS_MAX;
  const ecart = valide ? n - actuel : 0;
  const changer = (delta) => setValeur(String(Math.min(REPLICAS_MAX, Math.max(0, (valide ? n : actuel) + delta))));
  let consequence = R.identique;
  if (ecart > 0) consequence = R.plus(ecart);
  if (ecart < 0) consequence = R.moins(-ecart);
  return (
    <Dialog title={tpl(R.titre, { name: <Mono>{cible.name}</Mono> })} onClose={fermer} busy={etat.busy} initialFocus={champ}>
      <ScopeBox rows={[...portee, [A.cible, `${cible.kind} ${cible.name}`]]} />
      {hpa ? (
        <div className="res-notice" role="note">
          <Icon name="alerte" size={14} />
          <span>{tpl(fr.hpa.alerteReplicas, { name: <Mono>{hpa.name}</Mono>, min: hpa.min, max: hpa.max ?? '?' })}</span>
        </div>
      ) : null}
      <div className="scale-row">
        <div>
          <div className="small-12 mut">{R.actuellement}</div>
          <div className="scale-current">{actuel}</div>
        </div>
        <Icon name="fleche" size={20} />
        <div>
          <label htmlFor="replicas" className="small-12 mut" style={{ display: 'block' }}>
            {R.nouveau}
          </label>
          <div className="stepper">
            <button type="button" className="btn stepper-btn" aria-label={R.diminuer} onClick={() => changer(-1)} disabled={etat.busy || (valide && n <= 0)}>
              −
            </button>
            <input
              ref={champ}
              id="replicas"
              type="number"
              min="0"
              max={REPLICAS_MAX}
              inputMode="numeric"
              className={`stepper-input${valide ? '' : ' is-invalid'}`}
              value={valeur}
              aria-invalid={!valide}
              aria-describedby="replicas-effet"
              disabled={etat.busy}
              onChange={(e) => setValeur(e.target.value.trim())}
            />
            <button type="button" className="btn stepper-btn" aria-label={R.augmenter} onClick={() => changer(1)} disabled={etat.busy || (valide && n >= REPLICAS_MAX)}>
              +
            </button>
          </div>
        </div>
      </div>
      <div id="replicas-effet" aria-live="polite">
        {valide ? (
          <>
            {consequence}
            <span className={n === 0 ? 'tone-err' : undefined}>{R.zero}</span>
          </>
        ) : (
          <span className="field-error">
            <Icon name="alerte" size={14} />
            {tplText(R.invalide, { max: REPLICAS_MAX })}
          </span>
        )}
      </div>
      <Erreur erreur={etat.erreur} />
      <Boutons
        onCancel={fermer}
        onConfirm={() => executer({ replicas: n })}
        busy={etat.busy}
        disabled={!valide || ecart === 0}
        label={valide ? R.bouton(n) : R.bouton(actuel)}
      />
    </Dialog>
  );
}

function DialogueSupprimer({ cible, portee, executer, fermer, etat }) {
  const S = A.supprimer;
  const annuler = useRef(null);
  const w = cible.workload;
  let texte = S.orphelin;
  if (w) texte = w.kind === 'Job' || w.kind === 'CronJob' ? S.job : w.kind === 'StatefulSet' ? S.memeNom : S.recree;
  return (
    <Dialog
      title={
        <>
          <span className="tone-err" style={{ display: 'inline-flex' }}>
            <Icon name="corbeille" size={18} />
          </span>
          {S.titre}
        </>
      }
      onClose={fermer}
      busy={etat.busy}
      initialFocus={annuler}
    >
      <ScopeBox rows={[...portee, [A.cible, `Pod ${cible.name}`]]} />
      <div>{tpl(texte, { kind: w?.kind, name: <Mono>{w?.name}</Mono>, pod: <Mono>{cible.name}</Mono> })}</div>
      <div className="small-13 mut">{S.note}</div>
      <Erreur erreur={etat.erreur} />
      <Boutons annulerRef={annuler} onCancel={fermer} onConfirm={() => executer()} busy={etat.busy} label={S.bouton} danger />
    </Dialog>
  );
}

// Suppression d'une ressource : la conséquence est expliquée selon le type,
// et le nom doit être saisi pour confirmer.
function DialogueSupprimerRessource({ cible, portee, executer, fermer, etat }) {
  const S = A.supprimerRessource;
  const champ = useRef(null);
  const [saisie, setSaisie] = useState('');
  const C = S.consequences;
  const utilise = Array.isArray(cible.usedBy) && cible.usedBy.length > 0;
  let consequence = C[cible.kind]?.(cible.pods?.length ?? cible.desired ?? 0) ?? null;
  if (cible.kind === 'ConfigMap') consequence = utilise ? C.ConfigMapUtilisee() : cible.usedBy ? C.ConfigMap() : null;
  if (cible.kind === 'PersistentVolumeClaim') consequence = utilise ? C.PersistentVolumeClaimUtilise() : C.PersistentVolumeClaim();
  const cibles = utilise ? cible.usedBy.map((u) => u.name).join(', ') : null;
  const ok = saisie.trim() === cible.name;
  return (
    <Dialog
      title={
        <>
          <span className="tone-err" style={{ display: 'inline-flex' }}>
            <Icon name="corbeille" size={18} />
          </span>
          {tpl(S.titre, { name: <Mono>{cible.name}</Mono> })}
        </>
      }
      onClose={fermer}
      busy={etat.busy}
      initialFocus={champ}
    >
      <ScopeBox rows={[...portee, [A.cible, `${cible.kind} ${cible.name}`]]} />
      {consequence ? <div>{consequence}</div> : null}
      {cibles ? <div className="small-13 mut">{tplText(S.utilisePar, { cibles })}</div> : null}
      <div className="small-13 tone-err">{S.definitif}</div>
      <label className="confirm-field">
        <span>{tpl(S.saisie, { name: <Mono>{cible.name}</Mono> })}</span>
        <input
          ref={champ}
          value={saisie}
          aria-label={S.saisieLabel}
          autoComplete="off"
          spellCheck={false}
          disabled={etat.busy}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && ok && !etat.busy) executer();
          }}
        />
      </label>
      <Erreur erreur={etat.erreur} />
      <Boutons onCancel={fermer} onConfirm={() => executer()} busy={etat.busy} disabled={!ok} label={S.bouton} danger />
    </Dialog>
  );
}

function DialoguePause({ cible, portee, executer, fermer, etat }) {
  const P = A.pause;
  const annuler = useRef(null);
  const reprise = Boolean(cible.paused);
  const v = { name: <Mono>{cible.name}</Mono> };
  return (
    <Dialog title={tpl(reprise ? P.titreReprise : P.titrePause, v)} onClose={fermer} busy={etat.busy} initialFocus={annuler}>
      <ScopeBox rows={[...portee, [A.cible, `${cible.kind} ${cible.name}`]]} />
      <div>{reprise ? P.texteReprise : P.textePause}</div>
      <Erreur erreur={etat.erreur} />
      <Boutons annulerRef={annuler} onCancel={fermer} onConfirm={() => executer()} busy={etat.busy} label={reprise ? P.boutonReprise : P.boutonPause} />
    </Dialog>
  );
}

// Retour à une version précédente : liste des révisions encore disponibles.
function DialogueRollback({ cible, portee, executer, fermer, etat }) {
  const R = A.rollback;
  const { ctx, ns } = useScope();
  const revisions = useApi(`/workloads/deployments/${enc(cible.name)}/revisions`, { ctx, ns });
  const d = revisions.data;
  const precedentes = d ? d.items.filter((r) => !r.current) : [];
  const actuelle = d?.items.find((r) => r.current);
  const [choix, setChoix] = useState(null);
  const revision = choix ?? precedentes[0]?.revision ?? null;
  const annuler = useRef(null);

  let contenu;
  if (revisions.status === 'error' && !d) contenu = <Erreur erreur={revisions.error} />;
  else if (!d)
    contenu = (
      <div className="mut" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Spinner size={14} /> {R.chargement}
      </div>
    );
  else if (d.paused) contenu = <div className="res-notice">{R.enPause}</div>;
  else if (precedentes.length === 0) contenu = <div className="mut">{R.aucune}</div>;
  else {
    contenu = (
      <fieldset className="revisions" disabled={etat.busy}>
        <legend>{R.legende}</legend>
        {precedentes.map((r) => (
          <label key={r.revision} className="revision">
            <input type="radio" name="revision" value={r.revision} checked={revision === r.revision} onChange={() => setChoix(r.revision)} />
            <span>
              <strong>{tplText(R.revision, { n: r.revision })}</strong>
              <span className="mut"> · {tplText(R.creee, { quand: ilYa(r.createdAt) })}</span>
            </span>
            <span className="revision-meta mono">
              {r.images.join(', ')}
              {r.changeCause ? <span className="mut"> · {r.changeCause}</span> : null}
            </span>
          </label>
        ))}
      </fieldset>
    );
  }

  return (
    <Dialog title={tpl(R.titre, { name: <Mono>{cible.name}</Mono> })} onClose={fermer} busy={etat.busy} initialFocus={annuler}>
      <ScopeBox rows={[...portee, [A.cible, `${cible.kind} ${cible.name}`]]} />
      <div>{R.texte}</div>
      {actuelle ? <div className="small-13 mut">{tplText(R.actuelle, { n: actuelle.revision, images: actuelle.images.join(', ') })}</div> : null}
      {contenu}
      <Erreur erreur={etat.erreur} />
      <Boutons
        annulerRef={annuler}
        onCancel={fermer}
        onConfirm={() => executer({ revision })}
        busy={etat.busy}
        disabled={!revision || d?.paused}
        label={R.bouton(revision ?? '…')}
      />
    </Dialog>
  );
}

function DialogueSuspendre({ cible, portee, executer, fermer, etat }) {
  const S = A.suspendre;
  const annuler = useRef(null);
  const reactiver = Boolean(cible.suspended);
  const v = { name: <Mono>{cible.name}</Mono>, schedule: <Mono>{cible.schedule}</Mono> };
  return (
    <Dialog title={tpl(reactiver ? S.titreReactiver : S.titreSuspendre, v)} onClose={fermer} busy={etat.busy} initialFocus={annuler}>
      <ScopeBox rows={[...portee, [A.cible, `${cible.kind} ${cible.name}`]]} />
      <div>{tpl(reactiver ? S.texteReactiver : S.texteSuspendre, v)}</div>
      <Erreur erreur={etat.erreur} />
      <Boutons annulerRef={annuler} onCancel={fermer} onConfirm={() => executer()} busy={etat.busy} label={reactiver ? S.boutonReactiver : S.boutonSuspendre} />
    </Dialog>
  );
}

function DialogueLancer({ cible, portee, executer, fermer, etat }) {
  const L = A.lancer;
  const annuler = useRef(null);
  const v = { name: <Mono>{cible.name}</Mono> };
  return (
    <Dialog title={tpl(L.titre, v)} onClose={fermer} busy={etat.busy} initialFocus={annuler}>
      <ScopeBox rows={[...portee, [A.cible, `${cible.kind} ${cible.name}`]]} />
      <div>{tpl(L.texte, v)}</div>
      {cible.suspended ? <div className="small-13 mut">{L.suspendu}</div> : null}
      <Erreur erreur={etat.erreur} />
      <Boutons annulerRef={annuler} onCancel={fermer} onConfirm={() => executer()} busy={etat.busy} label={L.bouton} />
    </Dialog>
  );
}

const DIALOGUES = {
  restart: DialogueRedemarrer,
  scale: DialogueReplicas,
  delete: DialogueSupprimer,
  remove: DialogueSupprimerRessource,
  pause: DialoguePause,
  rollback: DialogueRollback,
  suspend: DialogueSuspendre,
  trigger: DialogueLancer,
};

// Appel à l'API et message de réussite de chaque action.
const ACTIONS = {
  restart: {
    appel: (c, x, p) => apiSend('POST', `/workloads/${SEGMENT[c.kind]}/${enc(c.name)}/restart`, p),
    succes: (c) => tplText(A.redemarrer.succes, { name: c.name }),
  },
  scale: {
    appel: (c, x, p) => apiSend('POST', `/workloads/${SEGMENT[c.kind]}/${enc(c.name)}/scale`, p, { replicas: x.replicas }),
    succes: (c, x) => tplText(A.replicas.succes(x.replicas), { name: c.name }),
  },
  delete: {
    appel: (c, x, p) => apiSend('DELETE', `/pods/${enc(c.name)}`, p),
    succes: (c) => tplText(A.supprimer.succes, { name: c.name }),
  },
  remove: {
    appel: (c, x, p) => apiSend('DELETE', `/resources/${SEGMENT[c.kind]}/${enc(c.name)}`, p),
    succes: (c) => tplText(A.supprimerRessource.succes, { kind: c.kind, name: c.name }),
  },
  pause: {
    appel: (c, x, p) => apiSend('POST', `/workloads/deployments/${enc(c.name)}/pause`, p, { paused: !c.paused }),
    succes: (c) => tplText(c.paused ? A.pause.succesReprise : A.pause.succesPause, { name: c.name }),
  },
  rollback: {
    appel: (c, x, p) => apiSend('POST', `/workloads/deployments/${enc(c.name)}/rollback`, p, { revision: x.revision }),
    succes: (c, x) => tplText(A.rollback.succes, { name: c.name, n: x.revision }),
  },
  suspend: {
    appel: (c, x, p) => apiSend('POST', `/workloads/cronjobs/${enc(c.name)}/suspend`, p, { suspended: !c.suspended }),
    succes: (c) => tplText(c.suspended ? A.suspendre.succesReactiver : A.suspendre.succesSuspendre, { name: c.name }),
  },
  trigger: {
    appel: (c, x, p) => apiSend('POST', `/workloads/cronjobs/${enc(c.name)}/trigger`, p),
    succes: (c, x, r) => tplText(A.lancer.succes, { job: r?.job ?? c.name }),
  },
};

// Raison affichée quand un droit manque.
function raisonInterdit(type, kind) {
  const I = A.interdit;
  if (type === 'delete') return I.delete;
  if (type === 'remove') return I.remove(kind, SEGMENT[kind]);
  return typeof I[type] === 'function' ? I[type](kind) : I[type];
}

export function ActionsProvider({ children }) {
  const { ctx, ns } = useScope();
  const { online } = useLive();
  const permissions = useApi('/permissions', { ctx, ns }, { enabled: Boolean(ctx && ns) });
  const [demande, setDemande] = useState(null); // { type, cible, apres }
  const [etat, setEtat] = useState({ busy: false, erreur: null });
  const [notes, setNotes] = useState([]);

  const notifier = useCallback((texte, ton = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setNotes((n) => [...n, { id, texte, ton }]);
    setTimeout(() => setNotes((n) => n.filter((x) => x.id !== id)), 6000);
  }, []);

  // Raison pour laquelle une action est grisée, ou null si elle est possible.
  const raisonBlocage = useCallback(
    (type, kind) => {
      if (!online) return A.horsLigne;
      if (permissions.status === 'loading' && !permissions.data) return A.verification;
      const cles = [DROIT[type](kind)].flat();
      // Droit inconnu (vérification impossible) : on laisse le cluster trancher.
      if (cles.some((c) => permissions.data?.checks?.[c]?.allowed === false)) return raisonInterdit(type, kind);
      return null;
    },
    [online, permissions],
  );

  const demander = useCallback((type, cible, apres) => {
    setEtat({ busy: false, erreur: null });
    setDemande({ type, cible, apres });
  }, []);
  const fermer = useCallback(() => setDemande(null), []);

  const executer = useCallback(
    async (extra = {}) => {
      if (!demande) return;
      const { type, cible, apres } = demande;
      setEtat({ busy: true, erreur: null });
      const params = { ctx, ns };
      try {
        const reponse = await ACTIONS[type].appel(cible, extra, params);
        notifier(ACTIONS[type].succes(cible, extra, reponse));
        setDemande(null);
        setEtat({ busy: false, erreur: null });
        apres?.();
      } catch (erreur) {
        // La fenêtre reste ouverte avec l'explication ; l'utilisateur peut réessayer ou annuler.
        setEtat({ busy: false, erreur });
        // Un refus du cluster peut signifier que les droits ont changé.
        if (erreur.code === 'ACCES_REFUSE') permissions.reload();
      }
    },
    [demande, ctx, ns, notifier, permissions],
  );

  const value = useMemo(() => ({ demander, raisonBlocage, permissions }), [demander, raisonBlocage, permissions]);
  const Dialogue = demande ? DIALOGUES[demande.type] : null;
  const portee = [
    [A.cluster, ctx],
    [A.namespace, ns],
  ];

  return (
    <ActionsCtx.Provider value={value}>
      {children}
      {Dialogue ? <Dialogue cible={demande.cible} portee={portee} executer={executer} fermer={fermer} etat={etat} /> : null}
      <div className="toasts" role="status" aria-live="polite">
        {notes.map((n) => (
          <div key={n.id} className={`toast toast-${n.ton}`}>
            <Icon name="ok" size={16} />
            <span>{n.texte}</span>
            <button type="button" className="icon-btn" aria-label={A.fermer} onClick={() => setNotes((x) => x.filter((y) => y.id !== n.id))}>
              <Icon name="croix" size={12} strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
    </ActionsCtx.Provider>
  );
}

export function useActions() {
  return useContext(ActionsCtx);
}
