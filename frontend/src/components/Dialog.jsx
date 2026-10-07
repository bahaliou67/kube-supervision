// Fenêtre modale (maquette 05) : fond assombri, focus gardé dans la fenêtre,
// Échap pour annuler, focus rendu à l'élément d'origine à la fermeture.
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLES = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';

// wide : fenêtre plus large, pour les formulaires en plusieurs colonnes.
export default function Dialog({ title, children, onClose, busy = false, initialFocus, wide = false }) {
  const boite = useRef(null);
  const titreId = useId();

  useEffect(() => {
    const origine = document.activeElement;
    // Focus initial : l'élément désigné (champ, bouton Annuler), sinon le premier focalisable.
    (initialFocus?.current ?? boite.current?.querySelector(FOCUSABLES))?.focus();
    return () => origine?.focus?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const touche = (e) => {
    if (e.key === 'Escape' && !busy) {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    // Le focus reste dans la fenêtre.
    const elements = [...boite.current.querySelectorAll(FOCUSABLES)];
    if (elements.length === 0) return;
    const premier = elements[0];
    const dernier = elements[elements.length - 1];
    if (e.shiftKey && document.activeElement === premier) {
      e.preventDefault();
      dernier.focus();
    } else if (!e.shiftKey && document.activeElement === dernier) {
      e.preventDefault();
      premier.focus();
    }
  };

  return createPortal(
    <div
      className="dialog-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div ref={boite} className={`dialog${wide ? ' dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titreId} onKeyDown={touche}>
        <h2 id={titreId} className="dialog-title">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// Encadré inversé qui rappelle où l'action va s'appliquer.
export function ScopeBox({ rows }) {
  return (
    <div className="scope-box">
      {rows.map(([label, valeur]) => (
        <div key={label} style={{ display: 'contents' }}>
          <span className="scope-label">{label}</span>
          <span className="scope-box-value">{valeur}</span>
        </div>
      ))}
    </div>
  );
}
