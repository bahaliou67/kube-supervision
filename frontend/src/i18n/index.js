// Langue de l'interface et textes correspondants.
//
// La langue est choisie au chargement de la page : le choix mémorisé (bouton
// FR/EN de l'en-tête), sinon celle du navigateur (français si elle commence
// par « fr », anglais sinon). Changer de langue recharge la page : les textes
// sont lus une fois, au chargement des modules.
import fr from './fr.js';
import en from './en.js';

const CLE = 'ks-langue';
const DICTIONNAIRES = { fr, en };

function detecter() {
  // Hors navigateur (tests) : français, la langue de référence.
  if (typeof window === 'undefined') return 'fr';
  try {
    const choix = window.localStorage.getItem(CLE);
    if (choix in DICTIONNAIRES) return choix;
  } catch {
    /* stockage indisponible : langue du navigateur */
  }
  const navigateur = (window.navigator.languages?.[0] ?? window.navigator.language ?? '').toLowerCase();
  return navigateur.startsWith('fr') ? 'fr' : 'en';
}

export const langue = detecter();
// Locale des formats de dates et des tris (heures sur 24 h dans les deux langues).
export const locale = langue === 'en' ? 'en-GB' : 'fr-FR';

export function changerLangue(nouvelle) {
  try {
    window.localStorage.setItem(CLE, nouvelle);
  } catch {
    /* stockage indisponible : le choix ne sera pas mémorisé */
  }
  window.location.reload();
}

const textes = DICTIONNAIRES[langue];
export default textes;
