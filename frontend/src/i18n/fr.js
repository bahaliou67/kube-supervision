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
    afficherTout: (n) => `Afficher les ${n}`,
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
    nb: (n) => pluriel(n, 'Pod'),
    redemarrages: (n) => pluriel(n, 'redémarrage'),
    sansProprietaire: 'Pod sans propriétaire',
    voirFiche: 'Voir la fiche',
    voirLogs: 'Voir les logs',
    fiche: 'Fiche',
    logs: 'Logs',
    rechercher: 'Rechercher un Pod',
    aucunResultat: 'Aucun Pod ne correspond à « {q} ».',
  },

  // Types de ressources, au singulier et au pluriel (noms Kubernetes).
  types: {
    Deployment: ['Deployment', 'Deployments'],
    StatefulSet: ['StatefulSet', 'StatefulSets'],
    DaemonSet: ['DaemonSet', 'DaemonSets'],
    Job: ['Job', 'Jobs'],
    CronJob: ['CronJob', 'CronJobs'],
    ReplicaSet: ['ReplicaSet', 'ReplicaSets'],
    Pod: ['Pod', 'Pods'],
    pods: ['Pod', 'Pods'],
    deployments: ['Deployment', 'Deployments'],
    statefulsets: ['StatefulSet', 'StatefulSets'],
    daemonsets: ['DaemonSet', 'DaemonSets'],
    jobs: ['Job', 'Jobs'],
    cronjobs: ['CronJob', 'CronJobs'],
    replicasets: ['ReplicaSet', 'ReplicaSets'],
    events: ['Événement', 'Événements'],
  },

  accueil: {
    titre: 'Santé du namespace',
    sousTitre: (n) => (n <= 1 ? '{n} Pod dans {ns}' : '{n} Pods dans {ns}'),
    cartes: {
      ok: { titre: 'En bon état', sous: (n) => (n <= 1 ? 'Pod démarré et prêt' : 'Pods démarrés et prêts') },
      erreur: { titre: 'En erreur', sous: (n) => (n <= 1 ? 'Pod qui ne démarre pas ou plante' : 'Pods qui ne démarrent pas ou plantent') },
      attente: { titre: 'En attente', sous: (n) => (n <= 1 ? 'Pod pas encore démarré' : 'Pods pas encore démarrés') },
    },
    aExaminer: (n) => `À examiner · ${pluriel(n, 'Pod')}`,
    enAttente: (n) => `En attente · ${pluriel(n, 'Pod')}`,
    enBonEtat: (n) => `En bon état · ${pluriel(n, 'Pod')}`,
    autres: (n) => `Terminés ou en cours d'arrêt · ${pluriel(n, 'Pod')}`,
    afficherAutres: (n) => `Afficher ${n === 1 ? "l'autre Pod" : `les ${n} autres Pods`} à examiner`,
    masquerAutres: 'Afficher moins',
    meta: '{owner} · {restarts} · {age}',
    toutFonctionne: 'Tout fonctionne',
    tousEnBonEtat: (n) => (n === 1 ? 'Le Pod de {ns} est en bon état.' : 'Les {n} Pods de {ns} sont en bon état.'),
    comptes: { ok: 'en bon état', erreur: 'en erreur', attente: 'en attente' },
    aucunRedemarrage: 'Aucun redémarrage depuis la création des Pods.',
    aucunRedemarrageDepuis: 'Aucun redémarrage depuis {duree}.',
    dernierIncident: 'Dernier incident : {cible}, {raison}, résolu {quand}.',
    voirCharges: 'Voir les charges de travail',
    vide: {
      titre: 'Aucun Pod dans {ns}',
      texte:
        "Ce namespace ne contient aucun Pod sur le cluster {ctx}. Vérifiez que vous regardez le bon namespace, ou que l'appli a bien été déployée.",
    },
  },

  // Phrase de diagnostic d'un Pod en erreur ou en attente ({c} = conteneur).
  diagnostic: {
    CrashLoopBackOff: 'Le conteneur {c} plante puis redémarre en boucle.',
    OOMKilled: 'Le conteneur {c} a été arrêté : mémoire dépassée.',
    ImagePullBackOff: "L'image du conteneur {c} ne peut pas être téléchargée.",
    ErrImagePull: "L'image du conteneur {c} ne peut pas être téléchargée.",
    ErrImageNeverPull: "L'image du conteneur {c} est absente du nœud.",
    InvalidImageName: "Le nom de l'image du conteneur {c} est invalide.",
    CreateContainerConfigError: 'Le conteneur {c} ne peut pas démarrer : sa configuration est invalide.',
    CreateContainerError: 'Le conteneur {c} ne peut pas être créé.',
    RunContainerError: 'Le conteneur {c} ne peut pas être lancé.',
    StartError: 'Le conteneur {c} ne peut pas être lancé.',
    ContainerCannotRun: 'Le conteneur {c} ne peut pas être lancé.',
    Error: "Le conteneur {c} s'est arrêté en erreur.",
    ExitCode: "Le conteneur {c} s'est arrêté en erreur.",
    Signal: 'Le conteneur {c} a été arrêté par un signal.',
    Evicted: 'Le Pod a été évincé de son nœud, faute de ressources.',
    Failed: "Le Pod s'est arrêté en échec et ne sera pas relancé.",
    DeadlineExceeded: 'Le Pod a dépassé sa durée maximale.',
    Unknown: 'Le nœud qui héberge le Pod ne répond plus.',
    NodeLost: 'Le nœud qui héberge le Pod ne répond plus.',
    ContainerStatusUnknown: "L'état du conteneur {c} est inconnu.",
    init: "Le conteneur d'initialisation {c} empêche le Pod de démarrer.",
    defaut: 'Le Pod est en erreur ({s}).',
    // Pods en attente
    Unschedulable: 'Aucun nœud ne peut accueillir le Pod pour le moment.',
    ContainerCreating: 'Les conteneurs sont en cours de création.',
    PodInitializing: "Les conteneurs d'initialisation s'exécutent.",
    Pending: "Le Pod attend d'être démarré.",
    RunningNonPret: "Le Pod tourne mais n'est pas encore prêt à recevoir du trafic.",
    InitEtape: "Les conteneurs d'initialisation s'exécutent ({i} sur {n}).",
    attenteDefaut: 'Le Pod démarre ({s}).',
    // Lignes de détail
    dernierArret: 'Dernier arrêt : ',
    codeSortie: 'Code de sortie {code}.',
    consequence: (pret, voulu) =>
      `Conséquence : le {kind} {name} n'a que ${pret} ${pret <= 1 ? 'réplica prêt' : 'réplicas prêts'} sur ${voulu}.`,
    messageKube: 'Message de Kubernetes : ',
    pretTrafic: 'Prêt, reçoit du trafic',
    pret: 'Prêt',
    termine: 'Terminé normalement',
    arretEnCours: "En cours d'arrêt",
    limite: 'limite {limite}',
  },

  // Raison d'un arrêt de conteneur : libellé simple + précision.
  arrets: {
    OOMKilled: {
      libelle: 'mémoire dépassée',
      detail: 'le conteneur a utilisé plus que sa limite de {limite}.',
      detailSansLimite: 'le nœud a manqué de mémoire et a arrêté le conteneur.',
    },
    Error: { libelle: 'erreur', detail: "l'application s'est arrêtée avec une erreur." },
    Completed: { libelle: 'terminé normalement', detail: "l'application s'est arrêtée d'elle-même." },
    ContainerCannotRun: { libelle: 'lancement impossible', detail: 'la commande du conteneur n\'a pas pu être exécutée.' },
    StartError: { libelle: 'échec du démarrage', detail: 'la commande du conteneur n\'a pas pu être exécutée.' },
    DeadlineExceeded: { libelle: 'durée maximale dépassée', detail: '' },
    Evicted: { libelle: 'évincé', detail: 'le nœud a manqué de ressources.' },
    ContainerStatusUnknown: { libelle: 'état inconnu', detail: 'le conteneur a disparu sans laisser de trace.' },
    defaut: { libelle: 'arrêt', detail: '' },
    // Signaux courants déduits du code de sortie.
    code137: 'arrêt forcé (SIGKILL)',
    code143: 'arrêt demandé (SIGTERM)',
  },

  charges: {
    titre: 'Charges de travail',
    aucune: 'Aucune charge de travail',
    colNom: 'Nom',
    colType: 'Type',
    colReplicas: 'Réplicas prêts',
    colImage: 'Image et version',
    colAge: 'Âge',
    colActions: 'Actions',
    redemarrer: 'Redémarrer',
    changerReplicas: 'Changer les réplicas',
    actionsBientot: 'Les actions seront disponibles à une prochaine étape.',
    afficherPods: 'Afficher les Pods de {name}',
    masquerPods: 'Masquer les Pods de {name}',
    podsDe: (n) => `Pods de {name} · ${n}`,
    aucunPod: 'Aucun Pod pour le moment.',
    aide: 'Cliquez sur une ligne pour afficher ses Pods.',
    sansProprietaire: 'Pods sans propriétaire',
    sansProprietaireType: 'Aucun',
    sansProprietaireAide: "Pods créés directement, sans charge de travail pour les recréer s'ils s'arrêtent.",
    replicas: {
      erreur: (n) => ` · ${n} en erreur`,
      attente: (n) => ` · ${n} en attente`,
      arrete: '0/0 · arrêté',
      jobTermine: (s, c) => (c ? `${s}/${c} terminé${s > 1 ? 's' : ''}` : `${s} terminé${s > 1 ? 's' : ''}`),
      jobEnCours: (a) => `En cours · ${a} actif${a > 1 ? 's' : ''}`,
      jobEchec: 'Échec',
      jobSuspendu: 'Suspendu',
      cronPlanifie: 'Planifié',
      cronSuspendu: 'Suspendu',
      cronActif: (n) => `${n} en cours`,
      pods: (n) => pluriel(n, 'Pod'),
    },
    cronInfo: 'Planification : {schedule}',
    cronDernier: 'dernière exécution {quand}',
    jobEchecInfo: 'Échec : {raison}',
    bloque: 'Déploiement bloqué : la nouvelle version ne démarre pas dans le délai prévu (ProgressDeadlineExceeded).',
    resumeOrphelins: (n) => `${pluriel(n, "Pod")} sans propriétaire`,
    recherche: 'Rechercher une charge de travail ou un Pod',
    filtreStatut: 'Filtrer par statut',
    filtreType: 'Filtrer par type',
    tous: 'Tous',
    tousTypes: 'Tous les types',
    filtres: { erreur: 'En erreur', attente: 'En attente', ok: 'En bon état' },
    aucunResultat: 'Aucune charge de travail ne correspond à ces critères.',
    effacerFiltres: 'Effacer les filtres',
    vide: {
      titre: 'Aucune charge de travail dans {ns}',
      texte:
        "Ce namespace ne contient ni Deployment, ni StatefulSet, ni DaemonSet, ni Job, ni CronJob sur le cluster {ctx}. Vérifiez que vous regardez le bon namespace, ou que l'appli a bien été déployée.",
    },
    changerNamespace: 'Changer de namespace',
    interdits: 'Vos droits ne permettent pas de voir : {types}. Ces éléments n\'apparaissent pas ci-dessous.',
    indisponibles: 'Ce cluster ne propose pas : {types} (version de Kubernetes différente).',
  },

  etats: {
    chargement: "Lecture de l'état de {ns} sur {ctx}…",
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
