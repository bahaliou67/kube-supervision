// Remplit un gabarit de texte « Les {n} Pods de {ns} » avec des valeurs qui
// peuvent être des éléments React (par exemple un nom en police mono).
// Les textes restent ainsi entiers dans fr.js et en.js, ce qui facilite la traduction.
import { Fragment } from 'react';

export function tpl(modele, valeurs = {}) {
  const morceaux = String(modele).split(/\{(\w+)\}/g);
  return morceaux.map((m, i) => {
    if (i % 2 === 0) return m ? <Fragment key={i}>{m}</Fragment> : null;
    const v = valeurs[m];
    return <Fragment key={i}>{v ?? `{${m}}`}</Fragment>;
  });
}

// Version texte seul (attributs title, aria-label…).
export function tplText(modele, valeurs = {}) {
  return String(modele).replace(/\{(\w+)\}/g, (_, k) => (valeurs[k] ?? `{${k}}`).toString());
}

// Nom technique en police mono.
export function Mono({ children, className = '' }) {
  return <span className={`mono ${className}`}>{children}</span>;
}
