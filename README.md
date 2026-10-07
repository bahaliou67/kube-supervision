# Supervision Kubernetes

Un outil web pour **voir l'état d'un cluster Kubernetes et diagnostiquer un
problème sans terminal**. Quand une application tombe, l'écran d'accueil dit
en quelques secondes laquelle, et pourquoi : « Le conteneur `api` plante puis
redémarre en boucle. Dernier arrêt : mémoire dépassée (OOMKilled), limite
192 Mi ».

L'outil tourne sur votre poste, avec **votre** kubeconfig et **vos** droits.
Il fonctionne avec n'importe quel cluster : local (Docker Desktop, kind,
minikube) ou managé (EKS, GKE, AKS, OpenShift…).

- Santé du namespace : Pods en erreur, en attente, en bon état, avec la cause en langage simple.
- Charges de travail : Deployments, StatefulSets, DaemonSets, Jobs, CronJobs et Pods sans propriétaire, avec recherche, filtres et tri.
- Fiche d'un Pod : raison du dernier arrêt, conteneurs, événements traduits.
- Logs : conteneur actuel ou précédent, recherche, suivi en direct.
- Mises à jour en temps réel, reconnexion automatique.
- Trois actions, toujours confirmées : redémarrer, changer le nombre de réplicas, supprimer un Pod.
- Thèmes clair et sombre.

---

## Prérequis

| Élément | Détail |
| --- | --- |
| **Node.js 22.19 ou plus récent** | `node --version` pour vérifier. Téléchargement : <https://nodejs.org> (version LTS). |
| **Un kubeconfig** | Celui que vous utilisez déjà avec `kubectl` : variable `KUBECONFIG` (plusieurs fichiers possibles), sinon `~/.kube/config`. |
| **L'accès réseau au cluster** | VPN éventuel compris : si `kubectl get pods` fonctionne, l'outil fonctionne. |
| **Le plugin d'authentification de votre fournisseur**, s'il y en a un | Par exemple `gke-gcloud-auth-plugin` (GKE), `aws` (EKS), `kubelogin` (AKS, OIDC). L'outil l'utilise exactement comme `kubectl`. |
| **Un navigateur récent** | Chrome, Edge, Firefox ou Safari, sur un écran d'au moins 1024 px de large. |

`kubectl` lui-même n'est **pas** nécessaire.

---

## Lancer l'outil

### En une commande

```bash
npx kube-supervision
```

L'outil démarre sur <http://127.0.0.1:7420> et ouvre le navigateur. Il
s'ouvre sur le contexte courant du kubeconfig et sur son namespace par défaut
(ou `default`). Pour arrêter : **Ctrl+C** dans le terminal.

> Si le package n'est pas encore publié sur le registre npm, lancez-le depuis
> une archive (`npx ./kube-supervision-0.1.0.tgz`), générée par `npm pack` dans
> les sources, ou depuis les sources (ci-dessous).

### Options

| Option | Effet |
| --- | --- |
| `--port <n>` | Port local d'écoute (défaut : `7420`). |
| `--no-open` | Ne pas ouvrir le navigateur. |
| `--version`, `--help` | Version, aide. |

| Variable d'environnement | Effet |
| --- | --- |
| `KUBE_SUPERVISION_PORT` | Port d'écoute, si `--port` n'est pas donné. |
| `KUBECONFIG` | Fichier(s) kubeconfig à utiliser, comme pour `kubectl` (séparés par `:` sous Linux et macOS, par `;` sous Windows). |

Exemples :

```bash
npx kube-supervision --port 8080
KUBECONFIG=~/.kube/config:~/.kube/prod.yaml npx kube-supervision --no-open
```

### Depuis les sources

```bash
npm install
npm run build
npm start
```

---

## Utilisation

- **Cluster et namespace** sont choisis dans le bloc noir de l'en-tête, et restent visibles en permanence. La liste des clusters reprend les contextes du kubeconfig ; un contexte ajouté au kubeconfig apparaît au rechargement de la page.
- **Accueil** : les Pods à examiner d'abord, avec la cause et les boutons « Voir la fiche » et « Voir les logs ».
- **Charges de travail** : cliquez sur une ligne pour voir ses Pods. La recherche trouve une charge de travail ou un Pod par son nom.
- **Logs** : « Conteneur précédent » montre ce qui s'est passé juste avant un plantage. Le suivi en direct n'existe que pour le conteneur actuel.
- **Actions** : chaque action ouvre une fenêtre qui rappelle le cluster, le namespace et la cible. Rien n'est fait sans confirmation.
- **Thème** : bouton à droite de l'en-tête (automatique, clair, sombre).
- **L'adresse de la page** contient le cluster, le namespace et l'écran : un rechargement, un favori ou un lien partagé (sur la même machine) rouvre le même écran.

Le statut Kubernetes est toujours affiché tel quel (`CrashLoopBackOff`,
`OOMKilled`…), accompagné d'une explication en français.

---

## Permissions Kubernetes nécessaires

L'outil agit **avec vos droits**, ni plus ni moins. Si un droit manque, l'écran
concerné l'explique (accès refusé, action grisée avec sa raison) : ce n'est pas
une panne.

| Usage | Droits (verbe · ressource) | Sans ce droit |
| --- | --- | --- |
| Voir les Pods | `list`, `watch` · `pods` | Écran « Accès refusé » pour ce namespace. |
| Voir la fiche d'un Pod | `get` · `pods` | — |
| Voir les charges de travail | `list`, `watch` · `deployments`, `replicasets`, `statefulsets`, `daemonsets` (groupe `apps`), `jobs`, `cronjobs` (groupe `batch`) | Les types interdits sont masqués et signalés. |
| Voir les événements | `list`, `watch` · `events` | La fiche s'affiche sans événements, avec une explication. |
| Lire les logs | `get` · `pods/log` | Message « logs interdits ». |
| Lister les namespaces | `list` · `namespaces` (à l'échelle du cluster) | Saisie manuelle du namespace. |
| Redémarrer | `patch` · `deployments`, `statefulsets`, `daemonsets` | Bouton grisé avec explication. |
| Changer les réplicas | `patch` · `deployments/scale`, `statefulsets/scale` | Bouton grisé avec explication. |
| Supprimer un Pod | `delete` · `pods` | Bouton grisé avec explication. |
| Vérifier ses propres droits | `create` · `selfsubjectaccessreviews` (accordé à tout utilisateur authentifié par défaut) | Les actions restent possibles ; le cluster tranche au moment de l'action. |

L'outil **ne lit jamais les Secrets**.

Exemple de rôle pour un développeur, à adapter (lecture et diagnostic, plus
les trois actions) dans un namespace :

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: supervision
  namespace: mon-namespace
rules:
  - apiGroups: [""]
    resources: [pods, events]
    verbs: [get, list, watch]
  - apiGroups: [""]
    resources: [pods/log]
    verbs: [get]
  - apiGroups: [apps]
    resources: [deployments, replicasets, statefulsets, daemonsets]
    verbs: [get, list, watch]
  - apiGroups: [batch]
    resources: [jobs, cronjobs]
    verbs: [get, list, watch]
  # Actions (à retirer pour un accès en lecture seule)
  - apiGroups: [apps]
    resources: [deployments, statefulsets, daemonsets, deployments/scale, statefulsets/scale]
    verbs: [patch]
  - apiGroups: [""]
    resources: [pods]
    verbs: [delete]
```

---

## Sécurité

- Le serveur **n'écoute que sur `127.0.0.1`** : il n'est pas joignable depuis une autre machine.
- Il refuse toute requête dont l'en-tête `Host` n'est pas une adresse locale (protection contre le « DNS rebinding »).
- Les **actions** n'acceptent que les requêtes venant de la page de l'outil lui-même (même origine) : un autre site ouvert dans le navigateur ne peut pas en déclencher.
- **Aucun contenu du kubeconfig** (jeton, certificat, mot de passe) n'est envoyé au navigateur ni écrit dans les journaux. Le terminal n'affiche que les actions réalisées (par exemple « redémarrage de Deployment api — personnes sur docker-desktop »).
- La page est servie avec une politique de sécurité du contenu stricte (scripts de l'outil uniquement, pas d'intégration dans un autre site).

---

## Limites connues

- **Un namespace à la fois** : pas de vue de plusieurs namespaces ou de plusieurs clusters simultanément.
- **Logs** : seules les dernières lignes sont lues (500 par défaut, 5000 au plus, 4 Mo au plus). Le suivi en direct ne concerne que le conteneur actuel. Les logs d'un conteneur plus ancien que le précédent ne sont plus disponibles (Kubernetes ne les garde pas).
- **Événements** : Kubernetes ne les conserve qu'environ une heure ; au-delà, la fiche n'en montre plus.
- **« Prochain redémarrage »** d'un conteneur qui plante en boucle : c'est une estimation (Kubernetes ne publie pas cette valeur).
- **Actions** : seulement redémarrer (Deployments, StatefulSets, DaemonSets), changer les réplicas (Deployments, StatefulSets, de 0 à 1000) et supprimer un Pod. Pas d'action sur les Jobs et CronJobs.
- **Hors périmètre** : édition de YAML, terminal dans un conteneur, graphiques de consommation CPU/mémoire, lecture des Secrets, gestion d'utilisateurs.
- **Liste des namespaces** : elle n'est pas mise à jour en direct ; un namespace créé apparaît au rechargement de la page.
- **Machine partagée** : l'outil n'a pas de mot de passe. Sur une machine où d'autres personnes ont une session ouverte en même temps, un autre utilisateur local pourrait interroger l'outil avec vos droits Kubernetes pendant qu'il tourne. Utilisez-le sur votre poste personnel.
- **Écran** : prévu pour une largeur d'au moins 1024 px.
- **Heures** : affichées dans le fuseau horaire du navigateur.
- **Langue** : interface en français (textes regroupés dans `frontend/src/i18n/fr.js` en vue d'une traduction).

---

## Dépannage

| Symptôme | Que faire |
| --- | --- |
| « Le port 7420 est déjà utilisé » | Une autre instance tourne sans doute : fermez-la (Ctrl+C dans son terminal), ou lancez `npx kube-supervision --port 7421`. |
| « Le cluster refuse vos identifiants » | Votre session a expiré : reconnectez-vous avec l'outil de votre fournisseur (par exemple `gcloud auth login`, `aws sso login`, `az login`), puis cliquez sur « Réessayer ». |
| « La commande d'authentification du kubeconfig a échoué » | Le plugin d'authentification est absent ou mal configuré : vérifiez que `kubectl get pods` fonctionne dans le même terminal. |
| « Connexion à … impossible » | Réseau, VPN ou cluster arrêté. L'outil réessaie seul toutes les quelques secondes. |
| « Configuration Kubernetes introuvable » | Définissez `KUBECONFIG` ou créez `~/.kube/config`, puis relancez l'outil. |
| « Node.js … est trop ancien » | Installez Node.js 22.19 ou plus récent. |
| Le navigateur ne s'ouvre pas | Ouvrez à la main l'adresse affichée dans le terminal. |

---

## Développement

```bash
npm install
npm run dev:backend    # API sur http://127.0.0.1:7420, rechargée à chaque modification
npm run dev:frontend   # interface sur http://127.0.0.1:5173 (redirige /api vers l'API)
npm test               # tests du backend (client Kubernetes simulé) et de la logique du front
```

Ouvrez les deux commandes `dev:` dans deux terminaux. En développement, la
galerie des composants est disponible sur `#/composants`.

Structure :

```
bin/kube-supervision.js   lanceur (npx), sert le front compilé sur le même port
backend/src/              Express + @kubernetes/client-node
  kube/                   kubeconfig, lecture tolérante aux droits, watch, flux de logs
  mappers/                Pods, charges de travail, événements → données d'écran
  routes/                 API REST, flux temps réel (SSE), actions
  messages.js             messages d'erreur (français)
backend/test/             tests avec client Kubernetes simulé
frontend/src/             React + Vite, CSS avec variables (tokens du design)
  i18n/fr.js              tous les textes de l'interface
design/                   maquettes de référence (ne pas modifier)
```

API locale (toutes les routes acceptent `ctx` et `ns`) :

| Route | Rôle |
| --- | --- |
| `GET /api/contexts` | Contextes du kubeconfig, contexte courant |
| `GET /api/namespaces` | Namespaces accessibles |
| `GET /api/permissions` | Droits de l'utilisateur dans le namespace |
| `GET /api/workloads` | Charges de travail |
| `GET /api/pods`, `GET /api/pods/:nom` | Pods, détail d'un Pod avec conteneurs et événements |
| `GET /api/pods/:nom/logs` | Logs (`container`, `previous`, `tailLines`, `follow`) |
| `GET /api/stream` | Changements en direct (Server-Sent Events) |
| `POST /api/workloads/:type/:nom/restart` | Redémarrer |
| `POST /api/workloads/:type/:nom/scale` | Changer les réplicas (`{ "replicas": n }`) |
| `DELETE /api/pods/:nom` | Supprimer un Pod |

Les erreurs ont toutes la même forme : `{ "error": { "code": "ACCES_REFUSE", "message": "…" } }`.

---

## Licences

- Code : licence MIT (fichier `LICENSE`).
- Polices IBM Plex Sans et IBM Plex Mono (fournies avec l'outil) : © IBM Corp., licence SIL Open Font License 1.1 (<https://openfontlicense.org>).
