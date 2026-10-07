// Filet de sécurité de l'affichage : une erreur imprévue dans un écran
// affiche un message lisible et des issues, jamais un écran blanc.
import { Component } from 'react';
import Card from './Card.jsx';
import Icon from './Icon.jsx';
import fr from '../i18n/fr.js';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { erreur: null };
  }

  static getDerivedStateFromError(erreur) {
    return { erreur };
  }

  componentDidCatch(erreur, info) {
    console.error('[affichage]', erreur, info?.componentStack);
  }

  render() {
    const { erreur } = this.state;
    if (!erreur) return this.props.children;
    const A = fr.erreurs.affichage;
    return (
      <main className="page">
        <Card className="state-card" role="alert">
          <div className="error-head">
            <span className="tone-err">
              <Icon name="alerte" size={20} strokeWidth={1.5} />
            </span>
            <h1 className="state-title">{A.titre}</h1>
          </div>
          <div className="mut">{A.texte}</div>
          <div className="error-actions">
            <a
              className="btn btn-primary"
              href="#/"
              onClick={() => this.setState({ erreur: null })}
            >
              {A.accueil}
            </a>
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              {A.recharger}
            </button>
          </div>
          <details className="small mut">
            <summary>{A.details}</summary>
            <pre className="kube-msg" style={{ whiteSpace: 'pre-wrap' }}>{String(erreur?.message ?? erreur)}</pre>
          </details>
        </Card>
      </main>
    );
  }
}
