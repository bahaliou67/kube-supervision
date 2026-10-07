// Bouton aux variantes des maquettes : primary, secondary (défaut), danger,
// danger-outline, warn-outline ; tailles sm, md (défaut), lg.
//
// disabledReason : action interdite. Le bouton reste focalisable
// (aria-disabled) pour que l'explication soit lisible au survol et au clavier.
import { useId } from 'react';
import Icon from './Icon.jsx';

export default function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  disabledReason,
  disabled,
  href,
  className = '',
  onClick,
  title,
  children,
  ...rest
}) {
  const idBulle = useId();
  const classes = ['btn'];
  if (variant !== 'secondary') classes.push(`btn-${variant}`);
  if (size !== 'md') classes.push(`btn-${size}`);
  if (className) classes.push(className);
  const contenu = (
    <>
      {disabledReason ? <Icon name="cadenas" size={14} /> : icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </>
  );
  if (href && !disabledReason && !disabled) {
    return (
      <a className={classes.join(' ')} href={href} title={title} {...rest}>
        {contenu}
      </a>
    );
  }
  const bloque = Boolean(disabledReason);
  const bouton = (
    <button
      type="button"
      className={classes.join(' ')}
      disabled={disabled}
      aria-disabled={bloque || undefined}
      aria-describedby={bloque ? idBulle : undefined}
      title={bloque ? undefined : title}
      onClick={bloque ? (e) => e.preventDefault() : onClick}
      {...rest}
    >
      {contenu}
    </button>
  );
  if (!bloque) return bouton;
  // Explication visible au survol et au focus clavier (bulle conçue, absente des maquettes).
  return (
    <span className="tip-wrap">
      {bouton}
      <span role="tooltip" id={idBulle} className="tip">
        {disabledReason}
      </span>
    </span>
  );
}
