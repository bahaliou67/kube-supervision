// Tous les textes de l'interface, regroupés pour une traduction ultérieure.
// Les fonctions gèrent les pluriels et les valeurs variables.

// Accord simple : « 1 Pod », « 2 Pods », « 0 redémarrage ».
export const pluriel = (n, singulier, plurielForme = `${singulier}s`) =>
  `${n} ${n === 0 || n === 1 ? singulier : plurielForme}`;

const fr = {
  app: {
    nom: 'Supervision',
    titre: 'Supervision Kubernetes',
  },

  entete: {
    cluster: 'Cluster',
    namespace: 'Namespace',
    choisirCluster: 'Changer de cluster',
    choisirNamespace: 'Changer de namespace',
    navPrincipale: 'Navigation principale',
    accueil: 'Accueil',
    charges: 'Charges de travail',
    themeAuto: 'Thème : automatique (suit le système)',
    themeClair: 'Thème : clair',
    themeSombre: 'Thème : sombre',
    themeBascule: 'Changer de thème',
  },

  selecteur: {
    contextes: 'Contextes du kubeconfig',
    contexteCourant: 'contexte courant du kubeconfig',
    filtrer: 'Filtrer…',
    filtrerNamespaces: 'Filtrer les namespaces',
    aucunResultat: 'Aucun namespace ne correspond.',
    namespacesAccessibles: (n) => pluriel(n, 'namespace accessible', 'namespaces accessibles'),
    listeInterdite:
      "Vos droits ne permettent pas de lister les namespaces de ce cluster. Saisissez le nom d'un namespace auquel vous avez accès.",
    saisieManuelle: 'Saisir un namespace',
    saisieLabel: 'Nom du namespace',
    saisieAide: 'Lettres minuscules, chiffres et tirets.',
    saisieInvalide: 'Ce nom de namespace est invalide.',
    afficher: 'Afficher',
    chargement: 'Chargement des namespaces…',
    erreurChargement: 'Impossible de lister les namespaces :',
    reessayer: 'Réessayer',
  },

  direct: {
    enDirect: (depuis) => `En direct · mis à jour ${depuis}`,
    horsLigne: (depuis) => `Hors ligne · dernières données ${depuis}`,
    connexion: 'Connexion…',
  },

  temps: {
    ilYa: (duree) => `il y a ${duree}`,
    dans: (duree) => `dans ${duree}`,
    maintenant: "à l'instant",
    s: (n) => `${n} s`,
    min: (n) => `${n} min`,
    h: (n) => `${n} h`,
    j: (n) => `${n} j`,
  },

  tableau: {
    trierPar: (col) => `Trier par ${col}`,
    croissant: 'tri croissant',
    decroissant: 'tri décroissant',
    pagePrecedente: 'Page précédente',
    pageSuivante: 'Page suivante',
    pagination: (debut, fin, total) => `${debut}–${fin} sur ${total}`,
  },

  // Statuts de Pod : nom Kubernetes affiché tel quel + explication simple.
  statuts: {
    Running: "En cours d'exécution : le Pod a démarré et fonctionne.",
    RunningNonPret: "Démarré mais pas prêt : le Pod tourne mais ne reçoit pas encore de trafic.",
    Pending: "En attente : le Pod n'a pas encore démarré (image en cours de téléchargement, ou pas de place sur un nœud).",
    ContainerCreating: 'Création du conteneur en cours (téléchargement de l\'image, montage des volumes).',
    PodInitializing: 'Initialisation : les conteneurs d\'initialisation s\'exécutent.',
    CrashLoopBackOff:
      "Plante en boucle : le conteneur s'arrête peu après chaque démarrage, Kubernetes espace les nouvelles tentatives.",
    OOMKilled: 'Mémoire dépassée : le conteneur a été arrêté de force car il a dépassé sa limite de mémoire.',
    Error: "Erreur : le conteneur s'est arrêté avec un code d'erreur.",
    ImagePullBackOff: "Image introuvable : Kubernetes n'arrive pas à télécharger l'image du conteneur et réessaie.",
    ErrImagePull: "Échec du téléchargement de l'image du conteneur.",
    InvalidImageName: "Nom d'image invalide.",
    CreateContainerConfigError:
      'Configuration invalide : il manque probablement un ConfigMap ou un Secret référencé par le conteneur.',
    CreateContainerError: "Le conteneur n'a pas pu être créé.",
    RunContainerError: "Le conteneur n'a pas pu être lancé.",
    ContainerCannotRun: "Le conteneur n'a pas pu être lancé (commande introuvable ou droits insuffisants).",
    Completed: "Terminé : le Pod a fini son travail normalement (cas habituel d'un Job).",
    Succeeded: "Terminé : le Pod a fini son travail normalement (cas habituel d'un Job).",
    Failed: "Échec : le Pod s'est arrêté en erreur et ne sera pas relancé.",
    Evicted: 'Évincé : le nœud a manqué de ressources et a expulsé le Pod.',
    DeadlineExceeded: "Délai dépassé : le Job a dépassé sa durée maximale.",
    Terminating: 'Arrêt en cours : le Pod est en train d\'être supprimé.',
    Unknown: "État inconnu : le nœud qui héberge le Pod ne répond plus.",
    NodeLost: "Nœud perdu : le nœud qui héberge le Pod ne répond plus.",
    Init: (detail) => `Initialisation : ${detail}.`,
    InitEtape: (i, n) => `conteneurs d'initialisation terminés : ${i} sur ${n}`,
    ExitCode: (code) => `Arrêté avec le code de sortie ${code}.`,
    Signal: (sig) => `Arrêté par le signal ${sig}.`,
    inconnu: 'Statut rapporté par Kubernetes.',
  },

  categories: {
    ok: 'En bon état',
    attente: 'En attente',
    erreur: 'En erreur',
    arret: 'Arrêt en cours',
    termine: 'Terminé',
  },

  commun: {
    chargement: 'Chargement…',
    reessayer: 'Réessayer',
    annuler: 'Annuler',
    fermer: 'Fermer',
    erreur: 'Erreur',
    aucun: '—',
  },

  pods: {
    titre: 'Pods',
    nb: (n) => pluriel(n, 'Pod'),
    dans: 'dans',
    colStatut: 'Statut',
    colNom: 'Nom',
    colProprietaire: 'Géré par',
    colRedemarrages: 'Redémarrages',
    colAge: 'Âge',
    redemarrages: (n) => pluriel(n, 'redémarrage'),
    sansProprietaire: 'Pod sans propriétaire',
  },

  provisoire: {
    charges: 'Écran des charges de travail : étape 3.',
  },

  demarrage: {
    chargement: 'Lecture du kubeconfig…',
    erreurTitre: 'Impossible de lire la configuration Kubernetes',
    contexteInconnu: (ctx) => `Le contexte « ${ctx} » n'existe pas dans le kubeconfig.`,
    revenirContexteCourant: 'Revenir au contexte courant',
  },

  erreurs: {
    // Messages de secours si le backend ne répond pas du tout.
    SERVEUR_INJOIGNABLE: "L'outil de supervision ne répond pas. Vérifiez qu'il est toujours lancé.",
  },
};

export default fr;
