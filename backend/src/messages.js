// Messages d'erreur renvoyés au front, en français et en anglais. Chaque clé
// est un identifiant d'erreur stable : le front s'appuie sur la clé, jamais
// sur le texte. La langue est celle de l'interface (voir langueDe).
const fr = {
  KUBECONFIG_ABSENT:
    "Aucun kubeconfig trouvé. Définissez la variable KUBECONFIG ou créez le fichier ~/.kube/config.",
  KUBECONFIG_INVALIDE: 'Le kubeconfig ne peut pas être lu : {detail}',
  CONTEXTE_INCONNU: "Le contexte « {ctx} » n'existe pas dans le kubeconfig.",
  PARAMETRE_INVALIDE: 'Paramètre invalide : {detail}',
  ACCES_REFUSE: "Accès refusé : vos droits Kubernetes ne permettent pas cette opération.",
  NON_AUTHENTIFIE:
    "Le cluster a refusé vos identifiants : le jeton a peut-être expiré. Reconnectez-vous au cluster (par exemple avec l'outil de connexion de votre fournisseur), puis réessayez.",
  INTROUVABLE: "La ressource demandée n'existe pas (ou plus) sur le cluster.",
  CONFLIT: 'La ressource a été modifiée entre-temps. Réessayez.',
  CLUSTER_INJOIGNABLE:
    'Le cluster ne répond pas. Vérifiez votre connexion réseau, le VPN, ou que le cluster est démarré.',
  DELAI_DEPASSE: "Le cluster met trop de temps à répondre. Réessayez dans un instant.",
  API_INCOMPATIBLE:
    "Le cluster ne reconnaît pas cette ressource : sa version de Kubernetes est peut-être trop ancienne ou trop récente.",
  AUTH_EXTERNE_ECHEC:
    "La commande d'authentification du kubeconfig a échoué : {detail}",
  LOGS_PRECEDENT_ABSENT:
    "Il n'y a pas de conteneur précédent : ce conteneur n'a pas encore redémarré, ou ses anciens logs ont été effacés par le nœud.",
  CONTENEUR_EN_ATTENTE: "Le conteneur n'a pas encore démarré : il n'a donc pas encore de logs.",
  CONTENEUR_INCONNU: "Ce conteneur n'existe pas dans le Pod.",
  LOGS_INTERDITS: 'Accès refusé : vos droits ne permettent pas de lire les logs de ce Pod (pods/log).',
  SUIVI_INTERROMPU: 'Le suivi en direct des logs a été interrompu.',
  ORIGINE_REFUSEE: 'Requête refusée : elle ne provient pas de cette application.',
  HOTE_REFUSE: "Requête refusée : l'outil n'accepte que les connexions locales (127.0.0.1 ou localhost).",
  ACTION_IMPOSSIBLE: "Cette action n'est pas possible pour le type « {type} ».",
  REPLICAS_INVALIDE: 'Le nombre de réplicas doit être un entier entre 0 et {max}.',
  ROLLBACK_EN_PAUSE:
    'Ce Deployment est en pause : reprenez son déploiement avant de revenir à une version précédente.',
  REVISION_INCONNUE:
    "La révision {revision} n'existe plus : Kubernetes ne garde que les dernières versions (revisionHistoryLimit).",
  REVISION_ACTUELLE: 'La révision {revision} est déjà la version en service.',
  CONTENEUR_ABSENT: "Le conteneur « {container} » n'existe pas dans le modèle de {kind} {name}.",
  LIMITES_HPA_INVALIDES: 'Les limites doivent être des entiers, avec 1 ≤ minimum ≤ maximum ≤ {max}.',
  SANS_MODELE: "Ce CronJob n'a pas de modèle de Job : impossible de le lancer.",
  ERREUR_CLUSTER: 'Le cluster a renvoyé une erreur inattendue : {detail}',
  ERREUR_INTERNE: 'Erreur interne du serveur.',
};

const en = {
  KUBECONFIG_ABSENT: 'No kubeconfig found. Set the KUBECONFIG variable or create the ~/.kube/config file.',
  KUBECONFIG_INVALIDE: 'The kubeconfig cannot be read: {detail}',
  CONTEXTE_INCONNU: 'The context "{ctx}" does not exist in the kubeconfig.',
  PARAMETRE_INVALIDE: 'Invalid parameter: {detail}',
  ACCES_REFUSE: 'Access denied: your Kubernetes permissions do not allow this operation.',
  NON_AUTHENTIFIE:
    "The cluster rejected your credentials: the token may have expired. Log in to the cluster again (for example with your provider's login tool), then retry.",
  INTROUVABLE: 'The requested resource does not exist (or no longer exists) on the cluster.',
  CONFLIT: 'The resource was modified in the meantime. Please retry.',
  CLUSTER_INJOIGNABLE: 'The cluster is not responding. Check your network connection, the VPN, or that the cluster is running.',
  DELAI_DEPASSE: 'The cluster is taking too long to respond. Retry in a moment.',
  API_INCOMPATIBLE: 'The cluster does not recognize this resource: its Kubernetes version may be too old or too recent.',
  AUTH_EXTERNE_ECHEC: 'The kubeconfig authentication command failed: {detail}',
  LOGS_PRECEDENT_ABSENT:
    'There is no previous container: this container has not restarted yet, or its old logs were removed by the node.',
  CONTENEUR_EN_ATTENTE: 'The container has not started yet, so it has no logs yet.',
  CONTENEUR_INCONNU: 'This container does not exist in the Pod.',
  LOGS_INTERDITS: 'Access denied: your permissions do not allow reading the logs of this Pod (pods/log).',
  SUIVI_INTERROMPU: 'Live log following was interrupted.',
  ORIGINE_REFUSEE: 'Request refused: it does not come from this application.',
  HOTE_REFUSE: 'Request refused: the tool only accepts local connections (127.0.0.1 or localhost).',
  ACTION_IMPOSSIBLE: 'This action is not possible for the type "{type}".',
  REPLICAS_INVALIDE: 'The number of replicas must be an integer between 0 and {max}.',
  ROLLBACK_EN_PAUSE: 'This Deployment is paused: resume its rollout before going back to a previous version.',
  REVISION_INCONNUE: 'Revision {revision} no longer exists: Kubernetes only keeps the latest versions (revisionHistoryLimit).',
  REVISION_ACTUELLE: 'Revision {revision} is already the version in service.',
  CONTENEUR_ABSENT: 'The container "{container}" does not exist in the template of {kind} {name}.',
  LIMITES_HPA_INVALIDES: 'The limits must be integers, with 1 ≤ minimum ≤ maximum ≤ {max}.',
  SANS_MODELE: 'This CronJob has no Job template: it cannot be started.',
  ERREUR_CLUSTER: 'The cluster returned an unexpected error: {detail}',
  ERREUR_INTERNE: 'Internal server error.',
};

export const messages = { fr, en };
export const LANGUES = Object.keys(messages);

// Détail dont le texte dépend de la langue (sinon, une valeur simple : nom,
// message de Kubernetes…).
export const bilingue = (textFr, textEn) => ({ fr: textFr, en: textEn });

// Langue de l'interface qui a envoyé la requête : en-tête X-Langue (appels
// de l'API), sinon paramètre lang (flux temps réel, que le navigateur ouvre
// sans en-tête personnalisé). Français par défaut.
export function langueDe(req) {
  const l = String(req.get?.('x-langue') ?? req.query?.lang ?? '').toLowerCase();
  return LANGUES.includes(l) ? l : 'fr';
}

// Remplace les {variables} d'un message.
export function format(code, vars = {}, langue = 'fr') {
  const table = messages[langue] ?? fr;
  const modele = table[code] ?? table.ERREUR_INTERNE;
  return modele.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    if (v && typeof v === 'object') return v[langue] ?? v.fr ?? '';
    return (v ?? '').toString();
  });
}
