// Badge de statut : icône + nom Kubernetes, couleur selon la catégorie.
// L'explication en langage simple est disponible au survol (et pour les
// lecteurs d'écran) ; les écrans l'affichent aussi en clair quand c'est utile.
import Icon from './Icon.jsx';
import { statusInfo } from '../lib/status.js';

export default function StatusBadge({ status, category, plain = false, size = 'sm', label, title }) {
  const info = statusInfo(status, category);
  const classes = ['badge', `badge-${info.tone}`];
  if (plain) classes.push('badge-plain');
  if (size === 'md') classes.push('badge-md');
  return (
    <span className={classes.join(' ')} title={title ?? info.explication}>
      <Icon name={info.icon} size={14} />
      <span className="trunc">{label ?? info.label}</span>
    </span>
  );
}
