# Design de référence — Supervision Kubernetes (MVP)

Maquettes extraites de l'export HTML de Claude Design et converties en HTML
standard (styles en ligne, aucun script). Chaque fichier s'ouvre directement
dans un navigateur. Largeur de référence : 1440 px.

## Écrans

| Fichier | Écran |
|---|---|
| `01-accueil.html` | Accueil — santé du namespace |
| `02-charges-de-travail.html` | Charges de travail (Deployments, StatefulSets) |
| `03-fiche-pod-clair.html` | Fiche d'un Pod, thème clair |
| `03-fiche-pod-sombre.html` | Fiche d'un Pod, thème sombre |
| `04-logs.html` | Logs d'un Pod |
| `05-confirmations.html` | Fenêtres de confirmation des trois actions |
| `06-etats.html` | Statuts, « tout fonctionne », chargement, vide, connexion perdue |

## Tokens de couleur

Les maquettes déclarent ces variables CSS sur leur conteneur racine.

| Variable | Rôle | Clair | Sombre |
|---|---|---|---|
| `--bg` | Fond de page | `#F4F5F7` | `#0F1215` |
| `--sf` | Surface (cartes, en-tête) | `#FFFFFF` | `#171B20` |
| `--ink` | Texte principal | `#15181C` | `#E7EAEE` |
| `--mut` | Texte secondaire | `#56606B` | `#9BA5B1` |
| `--bd` | Bordures | `#D9DDE3` | `#2A3038` |
| `--sub` | Séparateurs légers | `#ECEEF1` | `#1F242B` |
| `--ok` / `--okbg` | Statut sain | `#17694A` / `#E3F3EB` | `#62CC9C` / `#12301F` |
| `--warn` / `--warnbg` | Statut en attente | `#7A4F00` / `#FBEFD2` | `#E6B552` / `#33290F` |
| `--err` / `--errbg` | Statut en erreur | `#A8221B` / `#FCE7E4` | `#FF9087` / `#351614` |
| `--inv` / `--invink` | Sélecteur cluster/namespace (inversé) | `#15181C` / `#FFFFFF` | `#E7EAEE` / `#0F1215` |

## Typographie

- Interface : **IBM Plex Sans** (400, 500, 600), taille de base 14 px, interligne 1,45.
- Noms techniques, logs : **IBM Plex Mono** (400, 500).
- Fichiers dans `fonts/` (sous-ensemble latin, licence SIL Open Font License).

## Les données des maquettes sont des exemples

Tout ce qui est affiché (cluster `docker-desktop`, namespace `personnes`, Pods
`api-…`, `front-…`, `db-0`, événements, logs) sert uniquement à illustrer.
L'application est un outil généraliste : elle doit fonctionner sur n'importe
quel cluster, et ces valeurs viennent toujours du cluster de l'utilisateur.

## Ce que les maquettes ne couvrent pas

Les maquettes montrent un petit namespace (5 Pods) et un utilisateur qui a
tous les droits. Les éléments suivants sont nécessaires à un outil généraliste
et restent à concevoir, dans le même style :

| Besoin | Élément à concevoir |
|---|---|
| Listes de plusieurs centaines de lignes | Recherche, tri, filtre par statut, pagination ou virtualisation |
| Noms de ressources très longs | Troncature, nom complet au survol |
| Pods à plusieurs conteneurs | Détail par conteneur dans la fiche ; sélecteur de conteneur dans les logs |
| Autres charges de travail | DaemonSets, Jobs, CronJobs, Pods sans propriétaire dans le tableau |
| Utilisateur aux droits limités | Action grisée avec explication ; message « accès refusé » sur un écran |
| Liste des namespaces interdite | Saisie manuelle du namespace |
| Plusieurs contextes dans le kubeconfig | Menu déroulant du sélecteur de cluster |
| Jeton expiré, cluster injoignable | Variantes de l'état « connexion perdue », avec bouton pour réessayer |
| Bascule de thème | Commande clair / sombre dans l'en-tête |

Principes à conserver pour ces ajouts : la couleur est réservée aux statuts,
un statut ne repose jamais sur la seule couleur, les noms techniques sont en
IBM Plex Mono, et le cluster et le namespace actifs restent toujours visibles.

## À savoir

- Les styles sont en ligne dans les maquettes : à l'implémentation, les
  factoriser en composants et en variables CSS plutôt que de les recopier.
- Les maquettes sont dessinées pour une largeur de 1440 px ; l'application
  doit rester utilisable sur une fenêtre plus étroite (à partir de 1024 px).
- Ne pas modifier ce dossier : il sert de référence pendant tout le projet.