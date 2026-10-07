// En-tête permanent : nom de l'outil, cluster et namespace actifs,
// navigation, indicateur temps réel et bascule de thème.
import ScopeSelector from './ScopeSelector.jsx';
import LiveIndicator from './LiveIndicator.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import { useScope } from '../state/ScopeContext.jsx';
import fr from '../i18n/fr.js';

export default function Header({ live }) {
  const { route, link } = useScope();
  const surCharges = route.path.startsWith('/charges') || route.path.startsWith('/pods');
  return (
    <header className="hdr">
      <div className="hdr-brand">{fr.app.nom}</div>
      <ScopeSelector />
      <nav className="hdr-nav" aria-label={fr.entete.navPrincipale}>
        <a href={link('/')} aria-current={!surCharges ? 'page' : undefined}>
          {fr.entete.accueil}
        </a>
        <a href={link('/charges')} aria-current={surCharges ? 'page' : undefined}>
          {fr.entete.charges}
        </a>
      </nav>
      <div className="hdr-end">
        <LiveIndicator online={live?.online} updatedAt={live?.updatedAt} />
        <ThemeToggle />
      </div>
    </header>
  );
}
