// Interactions de la page : langue, thème, système détecté, onglets d'installation.
// La langue et le thème initiaux sont appliqués plus tôt par init.js.
(function () {
  var racine = document.documentElement;
  var DEPOT = 'https://github.com/bahaliou67/kube-supervision';
  var TELECHARGEMENT = DEPOT + '/releases/latest/download/';

  var TITRES = {
    fr: 'kube-supervision — diagnostic Kubernetes sans terminal',
    en: 'kube-supervision — Kubernetes troubleshooting without a terminal',
  };

  function memoriser(cle, valeur) {
    try {
      localStorage.setItem(cle, valeur);
    } catch (e) {
      /* stockage indisponible : le choix vaut pour cette page seulement */
    }
  }

  // ---------- Langue ----------
  function appliquerLangue(langue) {
    racine.lang = langue;
    document.title = TITRES[langue];
  }
  appliquerLangue(racine.lang === 'en' ? 'en' : 'fr');
  document.getElementById('bouton-langue').addEventListener('click', function () {
    var langue = racine.lang === 'fr' ? 'en' : 'fr';
    appliquerLangue(langue);
    memoriser('ks-site-langue', langue);
  });

  // ---------- Thème ----------
  document.getElementById('bouton-theme').addEventListener('click', function () {
    var sombre = racine.dataset.theme
      ? racine.dataset.theme === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = sombre ? 'light' : 'dark';
    racine.dataset.theme = theme;
    memoriser('ks-site-theme', theme);
  });

  // ---------- Onglets d'installation ----------
  var onglets = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
  function choisirOnglet(onglet, focus) {
    onglets.forEach(function (o) {
      var actif = o === onglet;
      o.setAttribute('aria-selected', String(actif));
      o.tabIndex = actif ? 0 : -1;
      document.getElementById(o.getAttribute('aria-controls')).hidden = !actif;
    });
    if (focus) onglet.focus();
  }
  onglets.forEach(function (onglet, i) {
    onglet.addEventListener('click', function () {
      choisirOnglet(onglet, false);
    });
    onglet.addEventListener('keydown', function (e) {
      var pas = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!pas) return;
      e.preventDefault();
      choisirOnglet(onglets[(i + pas + onglets.length) % onglets.length], true);
    });
  });

  // ---------- Système détecté : bon fichier et bon onglet ----------
  var ua = navigator.userAgent;
  var plateforme = ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '').toLowerCase();
  var systeme = null;
  if (/win/.test(plateforme) || /Windows/.test(ua)) systeme = 'windows';
  else if (/mac/.test(plateforme) || /Mac OS X/.test(ua)) systeme = /iPhone|iPad/.test(ua) ? null : 'macos';
  else if (/linux/.test(plateforme) && !/Android/.test(ua)) systeme = 'linux';

  var FICHIERS = {
    windows: { nom: 'Windows', fichier: 'kube-supervision-win-x64.exe' },
    macos: { nom: 'macOS', fichier: 'kube-supervision-macos-arm64' },
    linux: { nom: 'Linux', fichier: 'kube-supervision-linux-x64' },
  };

  function proposer(choix) {
    var bouton = document.getElementById('telecharger');
    bouton.href = TELECHARGEMENT + choix.fichier;
    // Un libellé par langue : « Télécharger pour Windows », « Download for Windows ».
    document.querySelectorAll('#telecharger [lang]').forEach(function (s) {
      var element = s.querySelector('.systeme');
      if (element) element.textContent = (s.lang === 'en' ? ' for ' : ' pour ') + choix.nom;
    });
    document.getElementById('telecharger-fichier').textContent = choix.fichier;
  }

  if (systeme) {
    var choix = FICHIERS[systeme];
    proposer(choix);
    choisirOnglet(document.getElementById('onglet-' + systeme), false);
    // Mac Intel ou Linux ARM : l'architecture n'est connue que des navigateurs Chromium.
    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues && systeme !== 'windows') {
      navigator.userAgentData
        .getHighEntropyValues(['architecture'])
        .then(function (v) {
          if (systeme === 'macos' && v.architecture === 'x86') proposer({ nom: 'macOS (Intel)', fichier: 'kube-supervision-macos-x64' });
          if (systeme === 'linux' && v.architecture === 'arm') proposer({ nom: 'Linux (ARM)', fichier: 'kube-supervision-linux-arm64' });
        })
        .catch(function () {});
    }
  }

  // ---------- Numéro de la dernière version ----------
  if (window.fetch) {
    fetch('https://api.github.com/repos/bahaliou67/kube-supervision/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (release) {
        if (!release || !release.tag_name) return;
        var lien = document.getElementById('version-courante');
        lien.href = release.html_url;
        lien.querySelector('[lang="fr"]').textContent = 'Dernière version : ' + release.tag_name;
        lien.querySelector('[lang="en"]').textContent = 'Latest release: ' + release.tag_name;
      })
      .catch(function () {});
  }
})();
