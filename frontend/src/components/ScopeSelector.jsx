// Sélecteur cluster / namespace de l'en-tête (bloc inversé des maquettes).
// Les menus déroulants, le filtre et la saisie manuelle du namespace ont été
// conçus dans le style existant : ils n'apparaissent pas dans les maquettes.
import { useEffect, useRef, useState } from 'react';
import Icon, { Spinner } from './Icon.jsx';
import Truncate from './Truncate.jsx';
import { useScope } from '../state/ScopeContext.jsx';
import { flechesListe, useMenu } from '../lib/useMenu.js';
import textes from '../i18n/index.js';

const NOM_NS = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

function ScopeButton({ menu, label, value, title }) {
  return (
    <button
      ref={menu.declencheur}
      type="button"
      className="scope-btn"
      aria-haspopup="dialog"
      aria-expanded={menu.open}
      onClick={menu.toggle}
      title={title}
    >
      <span className="scope-label">{label}</span>
      <span className="scope-value trunc">{value ?? '…'}</span>
      <Icon name="bas" size={12} strokeWidth={2} />
    </button>
  );
}

function ContextMenu({ menu }) {
  const { contexts, ctx, setScope } = useScope();
  const liste = contexts.data?.contexts ?? [];
  const actif = useRef(null);
  useEffect(() => actif.current?.focus(), []);
  return (
    <div className="menu" role="dialog" aria-label={textes.selecteur.contextes} onKeyDown={flechesListe}>
      <div className="menu-title">{textes.selecteur.contextes}</div>
      <ul className="menu-list" role="listbox" aria-label={textes.selecteur.contextes}>
        {liste.map((c) => (
          <li key={c.name}>
            <button
              ref={c.name === ctx ? actif : undefined}
              type="button"
              role="option"
              aria-selected={c.name === ctx}
              data-menu-item
              className="menu-item"
              onClick={() => {
                menu.close();
                if (c.name !== ctx) setScope({ ctx: c.name });
              }}
            >
              <span className="menu-check">{c.name === ctx ? <Icon name="coche" size={14} strokeWidth={2} /> : null}</span>
              <Truncate className="menu-name">{c.name}</Truncate>
              {c.name === contexts.data.current ? <span className="menu-meta">{textes.selecteur.contexteCourant}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NamespaceMenu({ menu }) {
  const { namespaces, ns, setScope } = useScope();
  const [filtre, setFiltre] = useState('');
  const [saisie, setSaisie] = useState('');
  const [invalide, setInvalide] = useState(false);
  const champFiltre = useRef(null);
  const champSaisie = useRef(null);
  const actif = useRef(null);
  const n = namespaces.data;
  const items = n?.items ?? [];
  const terme = filtre.trim().toLowerCase();
  const visibles = terme ? items.filter((i) => i.name.includes(terme)) : items;
  const avecFiltre = items.length > 8;

  // Focus initial : le filtre s'il existe, sinon le namespace actif, sinon la saisie.
  useEffect(() => {
    if (!n) return;
    if (avecFiltre) champFiltre.current?.focus();
    else if (actif.current) actif.current.focus();
    else champSaisie.current?.focus();
  }, [avecFiltre, n]);

  const choisir = (nom) => {
    menu.close();
    if (nom !== ns) setScope({ ns: nom });
  };
  const valider = (e) => {
    e.preventDefault();
    const nom = saisie.trim();
    if (nom.length > 63 || !NOM_NS.test(nom)) {
      setInvalide(true);
      return;
    }
    choisir(nom);
  };

  return (
    <div className="menu" role="dialog" aria-label={textes.entete.choisirNamespace} onKeyDown={flechesListe}>
      {namespaces.status === 'loading' ? (
        <div className="menu-note" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Spinner size={14} /> {textes.selecteur.chargement}
        </div>
      ) : null}
      {namespaces.status === 'error' ? (
        <div className="menu-note">
          {textes.selecteur.erreurChargement} {namespaces.error.message}{' '}
          <button type="button" className="btn-link" onClick={namespaces.reload}>
            {textes.selecteur.reessayer}
          </button>
        </div>
      ) : null}
      {n && !n.listable ? (
        <div className="menu-note" style={{ display: 'flex', gap: 8 }}>
          <Icon name="cadenas" size={14} />
          <span>{textes.selecteur.listeInterdite}</span>
        </div>
      ) : null}
      {n?.listable ? (
        <>
          <div className="menu-title">{textes.selecteur.namespacesAccessibles(items.length)}</div>
          {avecFiltre ? (
            <div style={{ padding: '0 4px' }}>
              <label className="field field-sm">
                <Icon name="recherche" size={14} />
                <span className="sr-only">{textes.selecteur.filtrerNamespaces}</span>
                <input ref={champFiltre} type="search" value={filtre} placeholder={textes.selecteur.filtrer} onChange={(e) => setFiltre(e.target.value)} />
              </label>
            </div>
          ) : null}
          <ul className="menu-list" role="listbox" aria-label={textes.entete.namespace}>
            {visibles.map((i) => (
              <li key={i.name}>
                <button
                  ref={i.name === ns ? actif : undefined}
                  type="button"
                  role="option"
                  aria-selected={i.name === ns}
                  data-menu-item
                  className="menu-item"
                  onClick={() => choisir(i.name)}
                >
                  <span className="menu-check">{i.name === ns ? <Icon name="coche" size={14} strokeWidth={2} /> : null}</span>
                  <Truncate className="menu-name">{i.name}</Truncate>
                  {i.phase && i.phase !== 'Active' ? <span className="menu-meta">{i.phase}</span> : null}
                </button>
              </li>
            ))}
          </ul>
          {visibles.length === 0 ? <div className="menu-note">{textes.selecteur.aucunResultat}</div> : null}
          <div className="menu-sep" />
        </>
      ) : null}
      <form className="menu-form" onSubmit={valider} noValidate>
        <label htmlFor="ns-saisie" className="small mut">
          {textes.selecteur.saisieManuelle}
        </label>
        <div className="menu-form-row">
          <div className={`field field-sm field-mono${invalide ? ' is-invalid' : ''}`} style={{ flex: 1 }}>
            <input
              ref={champSaisie}
              id="ns-saisie"
              value={saisie}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={invalide}
              aria-describedby="ns-saisie-aide"
              onChange={(e) => {
                setSaisie(e.target.value);
                setInvalide(false);
              }}
            />
          </div>
          <button type="submit" className="btn btn-sm">
            {textes.selecteur.afficher}
          </button>
        </div>
        <div id="ns-saisie-aide" className={invalide ? 'field-error' : 'small mut'}>
          {invalide ? (
            <>
              <Icon name="alerte" size={14} />
              {textes.selecteur.saisieInvalide}
            </>
          ) : (
            textes.selecteur.saisieAide
          )}
        </div>
      </form>
    </div>
  );
}

export default function ScopeSelector() {
  const { ctx, ns, contexts } = useScope();
  const menuCtx = useMenu();
  const menuNs = useMenu();
  const nomCtx = ctx ?? contexts.data?.current;
  // Les écrans (liste vide, accès refusé) peuvent demander l'ouverture du menu des namespaces.
  const { setOpen, declencheur } = menuNs;
  useEffect(() => {
    const ouvrir = () => {
      declencheur.current?.scrollIntoView({ block: 'nearest' });
      setOpen(true);
    };
    window.addEventListener('ks:ouvrir-namespace', ouvrir);
    return () => window.removeEventListener('ks:ouvrir-namespace', ouvrir);
  }, [setOpen, declencheur]);
  return (
    <div className="scope">
      <div className="scope-part" ref={menuCtx.zone}>
        <ScopeButton menu={menuCtx} label={textes.entete.cluster} value={nomCtx} title={`${textes.entete.choisirCluster} (${nomCtx ?? ''})`} />
        {menuCtx.open && contexts.data ? <ContextMenu menu={menuCtx} /> : null}
      </div>
      <div className="scope-sep" />
      <div className="scope-part" ref={menuNs.zone}>
        <ScopeButton menu={menuNs} label={textes.entete.namespace} value={ns} title={`${textes.entete.choisirNamespace} (${ns ?? ''})`} />
        {menuNs.open && ctx ? <NamespaceMenu menu={menuNs} /> : null}
      </div>
    </div>
  );
}
