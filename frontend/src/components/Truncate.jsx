// Noms longs : tronqués, nom complet au survol (attribut title).
//
// - Truncate : coupe la fin par CSS (points de suspension), selon la place.
// - MiddleName : coupe le milieu et garde la fin, qui distingue souvent les
//   ressources générées (api-7d9f8b6c5-m8ztw, mon-job-28391-x7k2p…).
export default function Truncate({ children, max, className = '', as: Tag = 'span', ...rest }) {
  const texte = typeof children === 'string' ? children : undefined;
  return (
    <Tag className={`trunc ${className}`} style={max ? { maxWidth: max } : undefined} title={texte} {...rest}>
      {children}
    </Tag>
  );
}

export function couperMilieu(nom, max) {
  if (!nom || nom.length <= max) return nom;
  const fin = Math.ceil((max - 1) * 0.45);
  const debut = max - 1 - fin;
  return `${nom.slice(0, debut)}…${nom.slice(nom.length - fin)}`;
}

export function MiddleName({ name, max = 40 }) {
  const court = couperMilieu(name, max);
  return court === name ? name : <span title={name}>{court}</span>;
}
