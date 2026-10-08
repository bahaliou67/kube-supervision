// Bascule de thème (conçue) : automatique → clair → sombre.
// « Automatique » suit la préférence du système ; le choix est mémorisé.
import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import textes from '../i18n/index.js';

const CLE = 'ks-theme';
const ORDRE = ['auto', 'light', 'dark'];

function lire() {
  try {
    const v = localStorage.getItem(CLE);
    return ORDRE.includes(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(lire);
  useEffect(() => {
    const racine = document.documentElement;
    if (theme === 'auto') delete racine.dataset.theme;
    else racine.dataset.theme = theme;
    try {
      localStorage.setItem(CLE, theme);
    } catch {
      /* stockage indisponible : le choix vaut pour la session */
    }
  }, [theme]);

  const libelle = { auto: textes.entete.themeAuto, light: textes.entete.themeClair, dark: textes.entete.themeSombre }[theme];
  const icone = { auto: 'auto', light: 'soleil', dark: 'lune' }[theme];
  return (
    <button
      type="button"
      className="btn btn-icon"
      onClick={() => setTheme(ORDRE[(ORDRE.indexOf(theme) + 1) % ORDRE.length])}
      title={`${libelle} — ${textes.entete.themeBascule}`}
      aria-label={`${libelle}. ${textes.entete.themeBascule}`}
    >
      <Icon name={icone} size={16} />
    </button>
  );
}
