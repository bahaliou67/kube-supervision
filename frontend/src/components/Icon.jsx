// Icônes reprises des maquettes (trait, viewBox 16×16, couleur courante).
// Les icônes soleil, lune, auto, clé, crayon et cadenas ont été dessinées dans
// le même style pour les éléments absents des maquettes.

const TRACES = {
  ok: (
    <>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M5.2 8.2l1.9 1.9 3.7-4" />
    </>
  ),
  alerte: (
    <>
      <path d="M8 2.2l6.3 11H1.7z" />
      <path d="M8 6.5v3.2" />
      <path d="M8 11.6v.2" />
    </>
  ),
  attente: (
    <>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 4.8V8l2.2 1.4" />
    </>
  ),
  boucle: (
    <>
      <path d="M13 8a5 5 0 1 1-1.5-3.5" />
      <path d="M13 2.5v3h-3" />
    </>
  ),
  memoire: (
    <>
      <rect x="4" y="4" width="8" height="8" rx="1" />
      <path d="M6.5 1.5V4M9.5 1.5V4M6.5 12v2.5M9.5 12v2.5M1.5 6.5H4M1.5 9.5H4M12 6.5h2.5M12 9.5h2.5" />
    </>
  ),
  arret: (
    <>
      <circle cx="8" cy="8" r="6.5" strokeDasharray="2.6 2.6" />
      <path d="M5.5 8h5" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 7.4v3.4" />
      <path d="M8 5.1v.2" />
    </>
  ),
  horsLigne: (
    <>
      <path d="M2 6.2a8.6 8.6 0 0 1 12 0" />
      <path d="M4.3 8.7a5.3 5.3 0 0 1 7.4 0" />
      <path d="M8 11.8v.2" />
      <path d="M2.5 2.5l11 11" />
    </>
  ),
  corbeille: (
    <>
      <path d="M2.5 4.5h11" />
      <path d="M6 4.5V2.8h4v1.7" />
      <path d="M4 4.5l.6 8.7h6.8l.6-8.7" />
    </>
  ),
  fleche: (
    <>
      <path d="M2.5 8h11" />
      <path d="M9.5 4l4 4-4 4" />
    </>
  ),
  recherche: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5l3.5 3.5" />
    </>
  ),
  bas: <path d="M4 6l4 4 4-4" />,
  haut: <path d="M4 10l4-4 4 4" />,
  droite: <path d="M6 4l4 4-4 4" />,
  gauche: <path d="M10 4l-4 4 4 4" />,
  coche: <path d="M3.5 8.4l3 3 6-6.4" />,
  croix: <path d="M4 4l8 8M12 4l-8 8" />,
  // Dessinées pour la bascule de thème et les droits (absentes des maquettes).
  soleil: (
    <>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
    </>
  ),
  lune: <path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z" />,
  auto: (
    <>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 1.5v13" />
      <path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" stroke="none" />
    </>
  ),
  cadenas: (
    <>
      <rect x="3" y="7" width="10" height="7" rx="1.2" />
      <path d="M5.3 7V5a2.7 2.7 0 0 1 5.4 0v2" />
    </>
  ),
  crayon: (
    <>
      <path d="M10.8 2.7l2.5 2.5-7.8 7.8H3v-2.5z" />
      <path d="M9.2 4.3l2.5 2.5" />
    </>
  ),
  tri: (
    <>
      <path d="M5 6.5l3-3 3 3" />
      <path d="M5 9.5l3 3 3-3" />
    </>
  ),
};

export default function Icon({ name, size = 14, strokeWidth = 1.6, className, title }) {
  const trace = TRACES[name];
  if (!trace) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {trace}
    </svg>
  );
}

// Indicateur de chargement (arc qui tourne), repris de la maquette 06.
export function Spinner({ size = 16 }) {
  return (
    <svg className="spinner" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M8 1.8a6.2 6.2 0 1 1-6.2 6.2" />
    </svg>
  );
}
