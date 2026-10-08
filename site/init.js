// Langue et thème appliqués avant le premier affichage (évite un flash).
// Fichier séparé : la politique de sécurité du contenu interdit les scripts en ligne.
(function () {
  var racine = document.documentElement;
  var langue = null;
  var theme = null;
  try {
    langue = localStorage.getItem('ks-site-langue');
    theme = localStorage.getItem('ks-site-theme');
  } catch (e) {
    /* stockage indisponible : préférences du navigateur */
  }
  if (langue !== 'fr' && langue !== 'en') {
    var nav = ((navigator.languages && navigator.languages[0]) || navigator.language || '').toLowerCase();
    langue = nav.indexOf('fr') === 0 ? 'fr' : 'en';
  }
  racine.lang = langue;
  if (theme === 'light' || theme === 'dark') racine.dataset.theme = theme;
})();
