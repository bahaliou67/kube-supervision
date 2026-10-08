// Point d'entrée du front.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import textes, { langue } from './i18n/index.js';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';

// Langue de la page (lecteurs d'écran, césure) et titre de l'onglet.
document.documentElement.lang = langue;
document.title = textes.app.titre;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
