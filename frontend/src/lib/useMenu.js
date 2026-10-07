// Ouverture/fermeture d'un menu déroulant : clic extérieur et Échap ferment,
// le focus revient sur le bouton déclencheur.
import { useCallback, useEffect, useRef, useState } from 'react';

export function useMenu() {
  const [open, setOpen] = useState(false);
  const zone = useRef(null);
  const declencheur = useRef(null);

  const close = useCallback((rendreFocus = true) => {
    setOpen(false);
    if (rendreFocus) declencheur.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const clic = (e) => {
      if (zone.current && !zone.current.contains(e.target)) setOpen(false);
    };
    const touche = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', clic);
    document.addEventListener('keydown', touche);
    return () => {
      document.removeEventListener('mousedown', clic);
      document.removeEventListener('keydown', touche);
    };
  }, [open, close]);

  return { open, setOpen, toggle: () => setOpen((o) => !o), close, zone, declencheur };
}

// Navigation au clavier (flèches haut/bas) entre les éléments d'une liste.
export function flechesListe(e) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const items = [...e.currentTarget.querySelectorAll('[data-menu-item]')];
  if (items.length === 0) return;
  e.preventDefault();
  const i = items.indexOf(document.activeElement);
  const suivant = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
  items[i === -1 ? 0 : suivant].focus();
}
