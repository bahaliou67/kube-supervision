// Racine de l'application : en-tête permanent et écran correspondant à l'adresse.
import Header from './components/Header.jsx';
import Card from './components/Card.jsx';
import Button from './components/Button.jsx';
import { Spinner } from './components/Icon.jsx';
import { ErrorState } from './components/States.jsx';
import Accueil from './pages/Accueil.jsx';
import Charges from './pages/Charges.jsx';
import Galerie from './pages/Galerie.jsx';
import PodDetail from './pages/PodDetail.jsx';
import Logs from './pages/Logs.jsx';
import { ScopeProvider, useScope } from './state/ScopeContext.jsx';
import { LiveProvider } from './state/LiveContext.jsx';
import { ActionsProvider } from './state/ActionsContext.jsx';
import ConnectionBanner from './components/ConnectionBanner.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { navigate } from './lib/router.js';
import fr from './i18n/fr.js';

// Nom présent dans l'adresse ; un encodage invalide (lien abîmé) est lu tel quel.
function decoderNom(brut) {
  try {
    return decodeURIComponent(brut);
  } catch {
    return brut;
  }
}

function Ecran() {
  const { route } = useScope();
  // Le filet de sécurité est remis à zéro à chaque changement d'écran.
  return (
    <ErrorBoundary key={route.path}>
      <EcranCourant />
    </ErrorBoundary>
  );
}

function EcranCourant() {
  const { route, contexts, ctxObj, ready } = useScope();

  if (import.meta.env.DEV && route.path === '/composants') return <Galerie />;

  if (contexts.status === 'loading') {
    return (
      <main className="page">
        <div className="mut" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Spinner /> {fr.demarrage.chargement}
        </div>
      </main>
    );
  }
  if (contexts.status === 'error') {
    return (
      <main className="page">
        <ErrorState error={contexts.error} onRetry={contexts.reload} />
      </main>
    );
  }
  if (!ctxObj) {
    return (
      <main className="page">
        <Card padded style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          <div>{fr.demarrage.contexteInconnu(route.query.ctx)}</div>
          <Button onClick={() => navigate('/', {})}>{fr.demarrage.revenirContexteCourant}</Button>
        </Card>
      </main>
    );
  }
  if (!ready) return null;

  // /pods/<nom> et /pods/<nom>/logs
  const fiche = /^\/pods\/([^/]+)(\/logs)?$/.exec(route.path);
  if (fiche) {
    const nom = decoderNom(fiche[1]);
    return fiche[2] ? <Logs key={`${nom}|${route.query.ns}`} name={nom} /> : <PodDetail key={`${nom}|${route.query.ns}`} name={nom} />;
  }
  if (route.path.startsWith('/charges')) return <Charges />;
  return <Accueil />;
}

export default function App() {
  return (
    <ScopeProvider>
      <LiveProvider>
        <ActionsProvider>
          <Header />
          <ConnectionBanner />
          <Ecran />
        </ActionsProvider>
      </LiveProvider>
    </ScopeProvider>
  );
}
