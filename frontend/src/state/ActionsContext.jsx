// Les trois actions (redémarrer, changer les réplicas, supprimer un Pod) :
// droits vérifiés, fenêtres de confirmation qui rappellent le cluster et le
// namespace (maquette 05), exécution et notification du résultat.
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Dialog, { ScopeBox } from '../components/Dialog.jsx';
import Icon, { Spinner } from '../components/Icon.jsx';
import { apiSend } from '../api.js';
import { useApi } from '../lib/useApi.js';
import { Mono, tpl, tplText } from '../lib/tpl.jsx';
import { useScope } from './ScopeContext.jsx';
import { useLive } from './LiveContext.jsx';
import fr from '../i18n/fr.js';

const A = fr.actions;
const REPLICAS_MAX = 1000;
const ActionsCtx = createContext(null);

// Type Kubernetes → segment d'URL de l'API.
const SEGMENT = { Deployment: 'deployments', StatefulSet: 'statefulsets', DaemonSet: 'daemonsets' };
// Droit à vérifier pour chaque action.
const DROIT = {
  restart: (kind) => `${SEGMENT[kind]}.restart`,
  scale: (kind) => `${SEGMENT[kind]}.scale`,
  delete: () => 'pods.delete',
};

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

const DIALOGUES = { restart: DialogueRedemarrer, scale: DialogueReplicas, delete: DialogueSupprimer };

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
      const droit = permissions.data?.checks?.[DROIT[type](kind)];
      if (permissions.status === 'loading' && !permissions.data) return A.verification;
      // Droit inconnu (vérification impossible) : on laisse le cluster trancher.
      if (droit?.allowed === false) return type === 'delete' ? A.interdit.delete : A.interdit[type](kind);
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
        if (type === 'restart') {
          await apiSend('POST', `/workloads/${SEGMENT[cible.kind]}/${encodeURIComponent(cible.name)}/restart`, params);
          notifier(tplText(A.redemarrer.succes, { name: cible.name }));
        } else if (type === 'scale') {
          await apiSend('POST', `/workloads/${SEGMENT[cible.kind]}/${encodeURIComponent(cible.name)}/scale`, params, { replicas: extra.replicas });
          notifier(tplText(A.replicas.succes(extra.replicas), { name: cible.name }));
        } else {
          await apiSend('DELETE', `/pods/${encodeURIComponent(cible.name)}`, params);
          notifier(tplText(A.supprimer.succes, { name: cible.name }));
        }
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
