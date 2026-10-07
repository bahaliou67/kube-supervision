// Racine de l'application : en-tête permanent et écran correspondant à l'adresse.
import Header from './components/Header.jsx';
import Card from './components/Card.jsx';
import Button from './components/Button.jsx';
import { Spinner } from './components/Icon.jsx';
import Accueil from './pages/Accueil.jsx';
import Charges from './pages/Charges.jsx';
import Galerie from './pages/Galerie.jsx';
import PodDetail from './pages/PodDetail.jsx';
import Logs from './pages/Logs.jsx';
import { ScopeProvider, useScope } from './state/ScopeContext.jsx';
import { LiveProvider } from './state/LiveContext.jsx';
import ConnectionBanner from './components/ConnectionBanner.jsx';
import { navigate } from './lib/router.js';
import fr from './i18n/fr.js';

function Ecran() {
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
        <Card padded style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          <h1 style={{ fontSize: 18 }}>{contexts.error.code === 'SERVEUR_INJOIGNABLE' ? fr.connexion.outilMuet : fr.demarrage.erreurTitre}</h1>
          <div>{contexts.error.message}</div>
          <Button onClick={contexts.reload}>{fr.commun.reessayer}</Button>
        </Card>
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
    const nom = decodeURIComponent(fiche[1]);
    return fiche[2] ? <Logs key={`${nom}|${route.query.ns}`} name={nom} /> : <PodDetail key={`${nom}|${route.query.ns}`} name={nom} />;
  }
  if (route.path.startsWith('/charges')) return <Charges />;
  return <Accueil />;
}

export default function App() {
  return (
    <ScopeProvider>
      <LiveProvider>
        <Header />
        <ConnectionBanner />
        <Ecran />
      </LiveProvider>
    </ScopeProvider>
  );
}
