// Connexion Server-Sent Events qui se reconnecte seule.
//
// - Après une coupure (réseau, serveur redémarré, flux fermé), nouvelle
//   tentative avec un délai croissant : 2 s, 4 s, 8 s… jusqu'à 30 s.
// - Le serveur envoie un battement (« ping ») toutes les 15 s : sans nouvelles
//   pendant 35 s, la connexion est considérée comme perdue, même si le
//   navigateur ne l'a pas remarqué (proxy, connexion à moitié coupée).
// - « Réessayer » relance immédiatement.
//
// url() est appelée à chaque (re)connexion : elle peut changer de paramètres
// (par exemple reprendre à partir de la dernière ligne reçue).
const DELAI_MIN_S = 2;
const DELAI_MAX_S = 30;
const SILENCE_MAX_MS = 35000;

export function openEventStream({ url, events, onStatus, endEvents = ['end', 'failure'] }) {
  let source = null;
  let arrete = false;
  let delai = DELAI_MIN_S;
  let minuteur = null;
  let compte = null;
  let vuA = Date.now();

  const statut = (s) => onStatus?.(s);

  const garde = setInterval(() => {
    if (source && Date.now() - vuA > SILENCE_MAX_MS) planifier();
  }, 5000);

  function planifier() {
    // Plusieurs signaux peuvent arriver pour la même coupure : une seule relance.
    if (!source || arrete) return;
    source.close();
    source = null;
    let reste = delai;
    statut({ status: 'retry', retryIn: reste });
    compte = setInterval(() => {
      reste -= 1;
      if (reste > 0) statut({ status: 'retry', retryIn: reste });
    }, 1000);
    minuteur = setTimeout(connecter, delai * 1000);
    delai = Math.min(DELAI_MAX_S, delai * 2);
  }

  function connecter() {
    clearInterval(compte);
    clearTimeout(minuteur);
    if (arrete) return;
    statut({ status: 'connecting' });
    source = new EventSource(url());
    vuA = Date.now();
    const vu = () => {
      vuA = Date.now();
    };
    source.addEventListener('open', () => {
      vu();
      delai = DELAI_MIN_S;
      statut({ status: 'open' });
    });
    source.addEventListener('ping', vu);
    for (const [nom, gestionnaire] of Object.entries(events)) {
      source.addEventListener(nom, (ev) => {
        vu();
        gestionnaire(JSON.parse(ev.data));
      });
    }
    for (const nom of endEvents) source.addEventListener(nom, planifier);
    source.onerror = planifier;
  }

  connecter();

  return {
    close() {
      arrete = true;
      source?.close();
      source = null;
      clearInterval(garde);
      clearInterval(compte);
      clearTimeout(minuteur);
    },
    retryNow() {
      if (arrete) return;
      source?.close();
      source = null;
      delai = DELAI_MIN_S;
      connecter();
    },
  };
}
