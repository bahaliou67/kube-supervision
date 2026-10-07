// Menu « Plus d'actions » d'une ligne de tableau. Une action interdite reste
// visible, grisée, avec la raison en clair (comme les boutons).
//
// items : [{ key, label, icon?, danger?, disabledReason?, onClick }] ; 'sep' pour un séparateur.
import Icon from './Icon.jsx';
import { flechesListe, useMenu } from '../lib/useMenu.js';

export default function ActionMenu({ label, items }) {
  const menu = useMenu();
  const visibles = items.filter(Boolean);
  if (!visibles.some((i) => i !== 'sep')) return null;
  return (
    <span className="action-menu" ref={menu.zone}>
      <button
        ref={menu.declencheur}
        type="button"
        className="btn btn-sm btn-icon"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-label={label}
        title={label}
        onClick={menu.toggle}
      >
        <Icon name="plus" size={14} />
      </button>
      {menu.open ? (
        <div className="menu menu-end" role="menu" aria-label={label} onKeyDown={flechesListe}>
          {visibles.map((item, n) =>
            item === 'sep' ? (
              <div key={`sep-${n}`} className="menu-sep" role="separator" />
            ) : (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                data-menu-item
                className={`menu-item${item.danger ? ' is-danger' : ''}`}
                aria-disabled={item.disabledReason ? true : undefined}
                onClick={() => {
                  if (item.disabledReason) return;
                  // Le focus revient sur le bouton du menu : la fenêtre de
                  // confirmation l'y rendra à sa fermeture.
                  menu.close();
                  item.onClick();
                }}
              >
                <span className="menu-check">{item.disabledReason ? <Icon name="cadenas" size={14} /> : item.icon ? <Icon name={item.icon} size={14} /> : null}</span>
                <span className="menu-body">
                  <span>{item.label}</span>
                  {item.disabledReason ? <span className="menu-reason">{item.disabledReason}</span> : null}
                </span>
              </button>
            ),
          )}
        </div>
      ) : null}
    </span>
  );
}
