// Messages d'erreur renvoyés au front, regroupés ici pour faciliter une
// traduction ultérieure. Chaque clé est un identifiant d'erreur stable :
// le front s'appuie sur la clé, jamais sur le texte.
export const messages = {
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
  SANS_MODELE: "Ce CronJob n'a pas de modèle de Job : impossible de le lancer.",
  ERREUR_CLUSTER: 'Le cluster a renvoyé une erreur inattendue : {detail}',
  ERREUR_INTERNE: 'Erreur interne du serveur.',
};

// Remplace les {variables} d'un message.
export function format(code, vars = {}) {
  const modele = messages[code] ?? messages.ERREUR_INTERNE;
  return modele.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '').toString());
}
