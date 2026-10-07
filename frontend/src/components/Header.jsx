// En-tête permanent : nom de l'outil, cluster et namespace actifs,
// navigation, indicateur temps réel et bascule de thème.
import ScopeSelector from './ScopeSelector.jsx';
import LiveIndicator from './LiveIndicator.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import { useScope } from '../state/ScopeContext.jsx';
import { useLive } from '../state/LiveContext.jsx';
import fr from '../i18n/fr.js';

export default function Header() {
  const { route, link } = useScope();
  const live = useLive();
  // Écran actif : les fiches et les logs de Pods appartiennent aux charges de travail.
  const actif = (...prefixes) => (prefixes.some((p) => route.path.startsWith(p)) ? 'page' : undefined);
  const surAccueil = !['/charges', '/pods', '/reseau', '/configuration'].some((p) => route.path.startsWith(p));
  return (
    <header className="hdr">
      <div className="hdr-brand">{fr.app.nom}</div>
      <ScopeSelector />
      <nav className="hdr-nav" aria-label={fr.entete.navPrincipale}>
        <a href={link('/')} aria-current={surAccueil ? 'page' : undefined}>
          {fr.entete.accueil}
        </a>
        <a href={link('/charges')} aria-current={actif('/charges', '/pods')}>
          {fr.entete.charges}
        </a>
        <a href={link('/reseau')} aria-current={actif('/reseau')}>
          {fr.entete.reseau}
        </a>
        <a href={link('/configuration')} aria-current={actif('/configuration')}>
          {fr.entete.configuration}
        </a>
      </nav>
      <div className="hdr-end">
        <LiveIndicator connection={live?.connection} />
        <ThemeToggle />
      </div>
    </header>
  );
}
