// Bouton aux variantes des maquettes : primary, secondary (défaut), danger,
// danger-outline, warn-outline ; tailles sm, md (défaut), lg.
//
// disabledReason : action interdite. Le bouton reste focalisable
// (aria-disabled) pour que l'explication soit lisible au survol et au clavier.
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
  return (
    <button
      type="button"
      className={classes.join(' ')}
      disabled={disabled}
      aria-disabled={bloque || undefined}
      title={disabledReason || title}
      onClick={bloque ? (e) => e.preventDefault() : onClick}
      {...rest}
    >
      {contenu}
    </button>
  );
}
