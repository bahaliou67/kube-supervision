// Bascule français / anglais. Le bouton affiche la langue vers laquelle il
// bascule (« EN » quand l'interface est en français) ; le changement recharge
// la page, qui garde son adresse (cluster, namespace, écran).
import textes, { changerLangue, langue } from '../i18n/index.js';

export default function LanguageToggle() {
  const autre = langue === 'fr' ? 'en' : 'fr';
  return (
    <button
      type="button"
      className="btn btn-icon btn-langue"
      lang={autre}
      onClick={() => changerLangue(autre)}
      title={textes.entete.langueAide}
      aria-label={textes.entete.langueAide}
    >
      {textes.entete.langue}
    </button>
  );
}
