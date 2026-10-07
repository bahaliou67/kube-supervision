// Applique le thème mémorisé avant le premier affichage (évite un flash).
// Fichier séparé plutôt que script en ligne : la politique de sécurité du
// contenu (CSP) servie par l'outil interdit les scripts en ligne.
try {
  var t = localStorage.getItem('ks-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {
  /* stockage indisponible : thème du système */
}
