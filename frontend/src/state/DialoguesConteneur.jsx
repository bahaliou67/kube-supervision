// Fenêtres de modification ciblée : image, variables d'environnement, CPU et
// mémoire d'un conteneur, limites d'un autoscaler. Chacune lit le modèle de
// Pod actuel, n'envoie que ce qui a changé et rappelle la conséquence
// (remplacement des Pods).
import { useEffect, useMemo, useRef, useState } from 'react';
import Dialog, { ScopeBox } from '../components/Dialog.jsx';
import { Boutons, Erreur } from '../components/DialogActions.jsx';
import Icon, { Spinner } from '../components/Icon.jsx';
import { useApi } from '../lib/useApi.js';
import { Mono, tpl, tplText } from '../lib/tpl.jsx';
import { SEGMENT_MODIFIABLE, diffEnv, imageValide, verifierRessources } from '../lib/conteneurs.js';
import { useScope } from './ScopeContext.jsx';
import textes from '../i18n/index.js';

const A = textes.actions;
const HPA_MAX = 1000;

// Modèle de Pod de la cible et conteneur choisi (celui demandé, sinon le
// premier conteneur principal).
function useConteneurs(cible) {
  const { ctx, ns } = useScope();
  const modele = useApi(`/workloads/${SEGMENT_MODIFIABLE[cible.kind]}/${encodeURIComponent(cible.name)}/containers`, { ctx, ns });
  const conteneurs = modele.data?.containers ?? null;
  const [choix, setChoix] = useState(cible.container ?? null);
  const parDefaut = conteneurs?.find((c) => !c.init) ?? conteneurs?.[0] ?? null;
  const conteneur = conteneurs?.find((c) => c.name === choix) ?? parDefaut;
  return { modele, conteneurs, conteneur, setChoix };
}

// Chargement, erreur de lecture, ou liste de choix si plusieurs conteneurs.
function EnTeteConteneur({ modele, conteneurs, conteneur, setChoix, busy }) {
  const C = A.conteneur;
  if (modele.status === 'error' && !modele.data) return <Erreur erreur={modele.error} />;
  if (!conteneurs) {
    return (
      <div className="mut" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Spinner size={14} /> {C.chargement}
      </div>
    );
  }
  if (conteneurs.length <= 1) return null;
  return (
    <label className="form-row">
      <span className="mut">{C.choix}</span>
      <select className="input" value={conteneur?.name} disabled={busy} onChange={(e) => setChoix(e.target.value)}>
        {conteneurs.map((c) => (
          <option key={c.name} value={c.name}>
            {c.init ? tplText(C.init, { name: c.name }) : c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

const lignesPortee = (portee, cible) => [...portee, [A.cible, `${cible.kind} ${cible.name}`]];

export function DialogueImage({ cible, portee, executer, fermer, etat }) {
  const I = A.image;
  const c = useConteneurs(cible);
  const champ = useRef(null);
  const [image, setImage] = useState('');
  // Le champ est prérempli avec l'image actuelle du conteneur choisi.
  useEffect(() => {
    if (c.conteneur) setImage(c.conteneur.image ?? '');
  }, [c.conteneur?.name, c.conteneur?.image]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (c.conteneur) champ.current?.focus();
  }, [Boolean(c.conteneur)]); // eslint-disable-line react-hooks/exhaustive-deps

  const valeur = image.trim();
  const valide = imageValide(valeur);
  const identique = valeur === c.conteneur?.image;
  const pret = Boolean(c.conteneur) && valide && !identique;
  const envoyer = () => pret && executer({ container: c.conteneur.name, body: { image: valeur } });
  return (
    <Dialog title={tpl(I.titre, { name: <Mono>{cible.name}</Mono> })} onClose={fermer} busy={etat.busy}>
      <ScopeBox rows={lignesPortee(portee, cible)} />
      <EnTeteConteneur {...c} busy={etat.busy} />
      {c.conteneur ? (
        <>
          <div className="form-row">
            <span className="mut">{I.actuelle}</span>
            <span className="mono">{c.conteneur.image}</span>
          </div>
          <label className="form-row">
            <span className="mut">{I.nouvelle}</span>
            <input
              ref={champ}
              className={`input mono${valeur && !valide ? ' is-invalid' : ''}`}
              value={image}
              spellCheck={false}
              autoComplete="off"
              disabled={etat.busy}
              onChange={(e) => setImage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !etat.busy && envoyer()}
            />
            <span className="small mut">{valeur && !valide ? I.invalide : identique ? I.identique : I.aide}</span>
          </label>
          <div className="small-13">{A.conteneur.remplacement[cible.kind]}</div>
        </>
      ) : null}
      <Erreur erreur={etat.erreur} />
      <Boutons onCancel={fermer} onConfirm={envoyer} busy={etat.busy} disabled={!pret} label={I.bouton} />
    </Dialog>
  );
}

let prochainId = 0;
const ligne = (v) => ({ id: (prochainId += 1), name: v?.name ?? '', value: v?.value ?? '', source: v?.source ?? null });

export function DialogueEnv({ cible, portee, executer, fermer, etat }) {
  const E = A.env;
  const c = useConteneurs(cible);
  const [lignes, setLignes] = useState(null);
  const grille = useRef(null);
  // Ligne tout juste ajoutée : le curseur va dans son nom.
  const [aFocaliser, setAFocaliser] = useState(null);
  useEffect(() => {
    if (aFocaliser === null) return;
    grille.current?.querySelector(`[data-env-nom="${aFocaliser}"]`)?.focus();
    setAFocaliser(null);
  }, [aFocaliser]);
  useEffect(() => {
    if (c.conteneur) setLignes(c.conteneur.env.map(ligne));
  }, [c.conteneur?.name, c.modele.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const diff = useMemo(() => (c.conteneur && lignes ? diffEnv(c.conteneur.env, lignes) : null), [c.conteneur, lignes]);
  const changer = (id, champ, valeur) => setLignes((l) => l.map((x) => (x.id === id ? { ...x, [champ]: valeur } : x)));
  const valide = diff && Object.keys(diff.erreurs).length === 0 && diff.nombre > 0;
  const enBloc = c.conteneur?.envFrom ?? [];

  return (
    <Dialog title={tpl(E.titre, { name: <Mono>{cible.name}</Mono> })} onClose={fermer} busy={etat.busy} wide>
      <ScopeBox rows={lignesPortee(portee, cible)} />
      <EnTeteConteneur {...c} busy={etat.busy} />
      {c.conteneur && lignes ? (
        <>
          {lignes.length === 0 ? <div className="mut">{E.aucune}</div> : null}
          {lignes.length > 0 ? (
            <div ref={grille} className="env-grid" role="group" aria-label={E.titre.replace('{name}', cible.name)}>
              <span className="small mut">{E.nom}</span>
              <span className="small mut">{E.valeur}</span>
              <span />
              {lignes.map((l, i) => (
                <div key={l.id} style={{ display: 'contents' }}>
                  {l.source ? (
                    <>
                      <span className="mono env-ref-name">{l.name}</span>
                      <span className="small mut env-ref" title={E.referenceAide}>
                        {tplText(E.reference[l.source.kind] ?? E.reference.Autre, { name: l.source.name ?? '', key: l.source.key ?? '' })}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="form-row">
                        <input
                          className={`input mono${diff?.erreurs[i] ? ' is-invalid' : ''}`}
                          value={l.name}
                          aria-label={E.nom}
                          aria-invalid={Boolean(diff?.erreurs[i])}
                          data-env-nom={l.id}
                          spellCheck={false}
                          autoComplete="off"
                          disabled={etat.busy}
                          onChange={(e) => changer(l.id, 'name', e.target.value)}
                        />
                        {diff?.erreurs[i] ? <span className="field-error small">{E.erreurs[diff.erreurs[i]]}</span> : null}
                      </span>
                      <input
                        className="input mono"
                        value={l.value}
                        aria-label={`${E.valeur} ${l.name}`}
                        spellCheck={false}
                        autoComplete="off"
                        disabled={etat.busy}
                        onChange={(e) => changer(l.id, 'value', e.target.value)}
                      />
                    </>
                  )}
                  <button
                    type="button"
                    className="btn btn-icon btn-sm"
                    aria-label={tplText(E.supprimer, { name: l.name || '…' })}
                    title={tplText(E.supprimer, { name: l.name || '…' })}
                    disabled={etat.busy}
                    onClick={() => setLignes((x) => x.filter((y) => y.id !== l.id))}
                  >
                    <Icon name="croix" size={12} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div>
            <button
              type="button"
              className="btn btn-sm"
              disabled={etat.busy}
              onClick={() => {
                const l = ligne();
                setLignes((x) => [...x, l]);
                setAFocaliser(l.id);
              }}
            >
              {E.ajouter}
            </button>
          </div>
          {enBloc.length ? (
            <div className="small mut">{tplText(E.enBloc, { sources: enBloc.map((b) => `${b.kind} ${b.name}${b.prefix ? ` (${b.prefix}…)` : ''}`).join(', ') })}</div>
          ) : null}
          <div className="small-13">{A.conteneur.remplacement[cible.kind]}</div>
        </>
      ) : null}
      <Erreur erreur={etat.erreur} />
      <Boutons
        onCancel={fermer}
        onConfirm={() => valide && executer({ container: c.conteneur.name, body: { env: diff.env } })}
        busy={etat.busy}
        disabled={!valide}
        label={E.bouton(diff?.nombre ?? 0)}
      />
    </Dialog>
  );
}

const VIDE = { requests: { cpu: '', memory: '' }, limits: { cpu: '', memory: '' } };

export function DialogueRessources({ cible, portee, executer, fermer, etat }) {
  const R = A.ressources;
  const c = useConteneurs(cible);
  const [saisie, setSaisie] = useState(VIDE);
  useEffect(() => {
    const r = c.conteneur?.resources;
    if (r) {
      setSaisie({
        requests: { cpu: r.requests.cpu ?? '', memory: r.requests.memory ?? '' },
        limits: { cpu: r.limits.cpu ?? '', memory: r.limits.memory ?? '' },
      });
    }
  }, [c.conteneur?.name, c.modele.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const verif = c.conteneur ? verifierRessources(saisie, c.conteneur.resources) : null;
  const valide = verif && Object.keys(verif.erreurs).length === 0 && verif.body;
  const champ = (groupe, cle, label) => {
    const erreur = verif?.erreurs[`${groupe}.${cle}`];
    return (
      <span className="form-row">
        <input
          className={`input mono${erreur ? ' is-invalid' : ''}`}
          value={saisie[groupe][cle]}
          aria-label={label}
          aria-invalid={Boolean(erreur)}
          spellCheck={false}
          autoComplete="off"
          disabled={etat.busy}
          onChange={(e) => setSaisie((s) => ({ ...s, [groupe]: { ...s[groupe], [cle]: e.target.value } }))}
        />
        {erreur ? <span className="field-error small">{R.erreurs[erreur]}</span> : null}
      </span>
    );
  };

  return (
    <Dialog title={tpl(R.titre, { name: <Mono>{cible.name}</Mono> })} onClose={fermer} busy={etat.busy} wide>
      <ScopeBox rows={lignesPortee(portee, cible)} />
      <EnTeteConteneur {...c} busy={etat.busy} />
      {cible.oomLimite && c.conteneur?.name === cible.container ? (
        <div className="res-notice">
          <Icon name="memoire" size={14} />
          <span>{tplText(R.oom, { limite: cible.oomLimite })}</span>
        </div>
      ) : null}
      {c.conteneur ? (
        <>
          <div className="small-13 mut">{R.explication}</div>
          <div className="res-grid">
            <span />
            <span className="small mut">{R.cpu}</span>
            <span className="small mut">{R.memoire}</span>
            <span className="small">{R.demande}</span>
            {champ('requests', 'cpu', `${R.cpu} · ${R.demande}`)}
            {champ('requests', 'memory', `${R.memoire} · ${R.demande}`)}
            <span className="small">{R.limite}</span>
            {champ('limits', 'cpu', `${R.cpu} · ${R.limite}`)}
            {champ('limits', 'memory', `${R.memoire} · ${R.limite}`)}
          </div>
          <div className="small mut">{R.aide}</div>
          <div className="small-13">{verif?.body ? A.conteneur.remplacement[cible.kind] : R.identique}</div>
        </>
      ) : null}
      <Erreur erreur={etat.erreur} />
      <Boutons
        onCancel={fermer}
        onConfirm={() => valide && executer({ container: c.conteneur.name, body: { resources: verif.body } })}
        busy={etat.busy}
        disabled={!valide}
        label={R.bouton}
      />
    </Dialog>
  );
}

export function DialogueHpa({ cible, portee, executer, fermer, etat }) {
  const H = A.hpa;
  const premier = useRef(null);
  const [min, setMin] = useState(String(cible.min ?? 1));
  const [max, setMax] = useState(String(cible.max ?? ''));
  const nMin = /^\d+$/.test(min) ? Number(min) : NaN;
  const nMax = /^\d+$/.test(max) ? Number(max) : NaN;
  const valide = nMin >= 1 && nMax >= nMin && nMax <= HPA_MAX;
  const change = nMin !== cible.min || nMax !== cible.max;
  const envoyer = () => valide && change && executer({ min: nMin, max: nMax });
  const champ = (label, valeur, setValeur, ref) => (
    <label className="form-row">
      <span className="small mut">{label}</span>
      <input
        ref={ref}
        type="number"
        min="1"
        max={HPA_MAX}
        inputMode="numeric"
        className={`input${valide ? '' : ' is-invalid'}`}
        value={valeur}
        disabled={etat.busy}
        onChange={(e) => setValeur(e.target.value.trim())}
        onKeyDown={(e) => e.key === 'Enter' && !etat.busy && envoyer()}
      />
    </label>
  );
  return (
    <Dialog title={tpl(H.titre, { name: <Mono>{cible.name}</Mono> })} onClose={fermer} busy={etat.busy} initialFocus={premier}>
      <ScopeBox rows={lignesPortee(portee, cible)} />
      <div>{tpl(H.texte, { cible: <Mono>{cible.target ? `${cible.target.kind} ${cible.target.name}` : '?'}</Mono> })}</div>
      {cible.current !== null && cible.current !== undefined ? <div className="small-13 mut">{tplText(H.actuellement, { n: cible.current })}</div> : null}
      <div className="hpa-grid">
        {champ(H.min, min, setMin, premier)}
        {champ(H.max, max, setMax)}
      </div>
      {!valide ? <span className="field-error small">{tplText(H.invalide, { max: HPA_MAX })}</span> : null}
      <Erreur erreur={etat.erreur} />
      <Boutons onCancel={fermer} onConfirm={envoyer} busy={etat.busy} disabled={!valide || !change} label={H.bouton} />
    </Dialog>
  );
}
