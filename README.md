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
- Réseau : Services (Pods prêts derrière chaque Service, charges ciblées) et Ingress (hôtes, routes, HTTPS), avec diagnostic : « aucun Pod ne porte les labels app=wbe », « le Service api n'existe pas »…
- Configuration et stockage : volumes persistants (PVC) et ConfigMaps (noms des clés seulement), avec les charges de travail qui les utilisent et les ConfigMaps référencées mais absentes.
- Mise à l'échelle automatique (HPA) : limites et mesures affichées sur la charge de travail, mesures indisponibles signalées.
- Accueil : en plus des Pods, les Services, Ingress, volumes, ConfigMaps et autoscalers à vérifier.
- Mises à jour en temps réel, reconnexion automatique.
- Actions, toujours confirmées : redémarrer, changer le nombre de réplicas, supprimer un Pod ; et dans le menu « … » : changer l'image, les variables d'environnement, le CPU et la mémoire d'un conteneur, modifier les limites de l'autoscaler, mettre en pause ou reprendre un déploiement, revenir à une version précédente, suspendre ou lancer tout de suite un CronJob, supprimer une ressource (Deployment, StatefulSet, DaemonSet, Job, CronJob, Service, Ingress, ConfigMap, volume, autoscaler).
- Thèmes clair et sombre.
- Interface en français ou en anglais (English).

---

## Prérequis

| Élément | Détail |
| --- | --- |
| **Node.js 22.19 ou plus récent**, seulement pour `npx` ou les sources | Inutile avec l'exécutable autonome. `node --version` pour vérifier. Téléchargement : <https://nodejs.org> (version LTS). |
| **Un kubeconfig** | Celui que vous utilisez déjà avec `kubectl` : variable `KUBECONFIG` (plusieurs fichiers possibles), sinon `~/.kube/config`. |
| **L'accès réseau au cluster** | VPN éventuel compris : si `kubectl get pods` fonctionne, l'outil fonctionne. |
| **Le plugin d'authentification de votre fournisseur**, s'il y en a un | Par exemple `gke-gcloud-auth-plugin` (GKE), `aws` (EKS), `kubelogin` (AKS, OIDC). L'outil l'utilise exactement comme `kubectl`. |
| **Un navigateur récent** | Chrome, Edge, Firefox ou Safari, sur un écran d'au moins 1024 px de large. |

`kubectl` lui-même n'est **pas** nécessaire.

---

## Installation

### Exécutable autonome (recommandé)

Un seul fichier, **sans Node.js à installer**. Téléchargez celui de votre
système sur la [page des versions](../../releases/latest) :

| Système | Fichier |
| --- | --- |
| Windows (64 bits) | `kube-supervision-win-x64.exe` |
| macOS, puce Apple (M1 et suivantes) | `kube-supervision-macos-arm64` |
| macOS, processeur Intel | `kube-supervision-macos-x64` |
| Linux (x86-64) | `kube-supervision-linux-x64` |
| Linux (ARM 64 bits) | `kube-supervision-linux-arm64` |

**Windows** : double-cliquez sur le fichier. Le fichier n'étant pas signé,
Windows peut afficher « Windows a protégé votre ordinateur » : cliquez sur
**Informations complémentaires**, puis **Exécuter quand même**. Une fenêtre de
console s'ouvre avec le navigateur : la fermer arrête l'outil.

**macOS** : dans le Terminal, depuis le dossier de téléchargement :

```bash
xattr -d com.apple.quarantine kube-supervision-macos-arm64
chmod +x kube-supervision-macos-arm64
./kube-supervision-macos-arm64
```

(La première commande retire le blocage de macOS pour les fichiers téléchargés non signés.)

**Linux** :

```bash
chmod +x kube-supervision-linux-x64
./kube-supervision-linux-x64
```

Pour l'avoir partout dans le terminal, renommez-le `kube-supervision` et placez-le
dans un dossier du `PATH` (par exemple `~/.local/bin` ou `/usr/local/bin`).

**Vérifier un fichier** : chaque exécutable a une attestation de provenance signée
par GitHub (construit par ce dépôt, à partir du commit de la version). Avec la
[CLI GitHub](https://cli.github.com) :

```bash
gh attestation verify kube-supervision-win-x64.exe --repo bahaliou67/kube-supervision
```

À défaut, comparez son empreinte SHA-256 avec `SHA256SUMS.txt`, publié avec chaque version.

Les options ci-dessous s'utilisent de la même façon : `kube-supervision --port 8080`.

---

## Lancer l'outil

### En une commande (avec Node.js)

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
- **Charges de travail** : cliquez sur une ligne pour voir ses Pods, et son autoscaler (HPA) s'il en a un. La recherche trouve une charge de travail ou un Pod par son nom.
- **Réseau** : un Service en rouge n'envoie le trafic vers aucun Pod prêt ; la phrase sous son nom dit pourquoi. Un Ingress signale les routes vers un Service absent ou en panne.
- **Configuration** : volumes persistants et ConfigMaps, avec qui les utilise. Le contenu des ConfigMaps n'est jamais affiché.
- **Logs** : « Conteneur précédent » montre ce qui s'est passé juste avant un plantage. Le suivi en direct n'existe que pour le conteneur actuel.
- **Actions** : chaque action ouvre une fenêtre qui rappelle le cluster, le namespace et la cible, et explique la conséquence. Rien n'est fait sans confirmation. Pour supprimer une ressource, il faut en plus saisir son nom.
- **Corriger depuis le diagnostic** : sur la fiche d'un Pod arrêté pour mémoire dépassée (`OOMKilled`), le bouton « Modifier la limite mémoire » ouvre directement le bon formulaire ; sur un Pod dont l'image ne se télécharge pas, « Changer l'image ».
- **Image, variables, CPU et mémoire** (menu « … » d'un Deployment, StatefulSet, DaemonSet ou CronJob) : seule la valeur modifiée est envoyée, le reste du modèle n'est pas touché. Les variables lues dans une ConfigMap ou un Secret sont affichées avec leur origine (jamais la valeur d'un Secret) ; elles peuvent être retirées, pas modifiées.
- **Revenir à une version précédente** (menu « … » d'un Deployment) : la fenêtre liste les versions que Kubernetes a gardées, avec leurs images. Comme `kubectl rollout undo`, les Pods sont remplacés progressivement.
- **Thème** : bouton à droite de l'en-tête (automatique, clair, sombre).
- **Langue** : bouton « EN » / « FR » à droite de l'en-tête. Au premier lancement, l'outil suit la langue du navigateur (français si elle est le français, anglais sinon) ; le choix est ensuite mémorisé dans le navigateur. Les messages d'erreur du cluster et de l'outil suivent la même langue.
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
| Voir le réseau | `list`, `watch` · `services`, `endpointslices` (groupe `discovery.k8s.io`), `ingresses` (groupe `networking.k8s.io`) | Les types interdits sont masqués et signalés. Sans `endpointslices`, l'état des Pods ciblés est déduit des Pods. |
| Voir la configuration et le stockage | `list`, `watch` · `configmaps`, `persistentvolumeclaims` | Les types interdits sont masqués et signalés. |
| Voir les autoscalers | `list`, `watch` · `horizontalpodautoscalers` (groupe `autoscaling`, version v2) | Les HPA ne sont pas affichés. |
| Lire les logs | `get` · `pods/log` | Message « logs interdits ». |
| Lister les namespaces | `list` · `namespaces` (à l'échelle du cluster) | Saisie manuelle du namespace. |
| Redémarrer | `patch` · `deployments`, `statefulsets`, `daemonsets` | Bouton grisé avec explication. |
| Changer les réplicas | `patch` · `deployments/scale`, `statefulsets/scale` | Bouton grisé avec explication. |
| Supprimer un Pod | `delete` · `pods` | Bouton grisé avec explication. |
| Mettre en pause, reprendre | `patch` · `deployments` | Élément du menu grisé avec explication. |
| Revenir à une version précédente | `patch` · `deployments`, `list` · `replicasets` | Élément du menu grisé avec explication. |
| Suspendre, réactiver un CronJob | `patch` · `cronjobs` | Élément du menu grisé avec explication. |
| Lancer un CronJob maintenant | `create` · `jobs` (et `get` · `cronjobs`) | Élément du menu grisé avec explication. |
| Changer l'image, les variables, le CPU et la mémoire | `get` et `patch` · `deployments`, `statefulsets`, `daemonsets` (groupe `apps`), `cronjobs` (groupe `batch`) | Élément du menu grisé avec explication. |
| Modifier les limites d'un autoscaler | `patch` · `horizontalpodautoscalers` (groupe `autoscaling`) | Élément du menu grisé avec explication. |
| Supprimer une ressource | `delete` sur le type concerné : `deployments`, `statefulsets`, `daemonsets` (groupe `apps`), `jobs`, `cronjobs` (groupe `batch`), `services`, `configmaps`, `persistentvolumeclaims`, `ingresses` (groupe `networking.k8s.io`), `horizontalpodautoscalers` (groupe `autoscaling`) | Bouton ou élément du menu grisé avec explication. |
| Vérifier ses propres droits | `create` · `selfsubjectaccessreviews` (accordé à tout utilisateur authentifié par défaut) | Les actions restent possibles ; le cluster tranche au moment de l'action. |

L'outil **ne lit jamais les Secrets**. Des ConfigMaps, il n'affiche que le nom et la taille des clés, jamais leur contenu (le serveur les lit pour les compter, mais ne transmet pas les valeurs au navigateur).

Exemple de rôle pour un développeur, à adapter (lecture et diagnostic, plus
les actions courantes, sans suppression de ressources) dans un namespace :

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
  - apiGroups: [""]
    resources: [services, configmaps, persistentvolumeclaims]
    verbs: [list, watch]
  - apiGroups: [discovery.k8s.io]
    resources: [endpointslices]
    verbs: [list, watch]
  - apiGroups: [networking.k8s.io]
    resources: [ingresses]
    verbs: [list, watch]
  - apiGroups: [autoscaling]
    resources: [horizontalpodautoscalers]
    verbs: [list, watch]
  # Actions (à retirer pour un accès en lecture seule)
  - apiGroups: [apps]
    resources: [deployments, statefulsets, daemonsets, deployments/scale, statefulsets/scale]
    verbs: [patch]
  - apiGroups: [""]
    resources: [pods]
    verbs: [delete]
  - apiGroups: [batch]
    resources: [cronjobs]
    verbs: [patch]
  - apiGroups: [batch]
    resources: [jobs]
    verbs: [create]
  - apiGroups: [autoscaling]
    resources: [horizontalpodautoscalers]
    verbs: [patch]
  # Suppression de ressources : à n'accorder qu'aux personnes concernées, par exemple
  # - apiGroups: [apps]
  #   resources: [deployments, statefulsets, daemonsets]
  #   verbs: [delete]
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
- **Actions** : redémarrer (Deployments, StatefulSets, DaemonSets), changer les réplicas (Deployments, StatefulSets, de 0 à 1000), supprimer un Pod ; pause et retour à une version précédente pour les Deployments seulement ; suspendre et lancer pour les CronJobs. Image, variables d'environnement, CPU et mémoire modifiables pour les Deployments, StatefulSets, DaemonSets et CronJobs (pas pour un Job, dont le modèle ne peut plus changer). Les variables importées en bloc (`envFrom`) ne se modifient pas ici.
- **Suppression** : les objets dépendants sont supprimés avec la ressource (Pods d'un Job, ReplicaSets d'un Deployment…). Pour un volume persistant, ce que deviennent les données dépend de la classe de stockage. Les Secrets, namespaces et ressources du cluster entier ne peuvent pas être supprimés.
- **Retour à une version précédente** : seules les versions encore gardées par Kubernetes sont proposées (`revisionHistoryLimit`, 10 par défaut). Impossible pendant une pause.
- **Réseau, configuration, stockage** : lecture seule. Les volumes persistants (PersistentVolumes), classes de stockage, NetworkPolicies et ressources Gateway API ne sont pas affichés. Un volume en attente n'est pas relié à sa classe de stockage (qui est une ressource du cluster entier).
- **Hors périmètre** : édition de YAML, terminal dans un conteneur, graphiques de consommation CPU/mémoire, lecture des Secrets, gestion d'utilisateurs.
- **Liste des namespaces** : elle n'est pas mise à jour en direct ; un namespace créé apparaît au rechargement de la page.
- **Machine partagée** : l'outil n'a pas de mot de passe. Sur une machine où d'autres personnes ont une session ouverte en même temps, un autre utilisateur local pourrait interroger l'outil avec vos droits Kubernetes pendant qu'il tourne. Utilisez-le sur votre poste personnel.
- **Écran** : prévu pour une largeur d'au moins 1024 px.
- **Heures** : affichées dans le fuseau horaire du navigateur.
- **Langue** : interface en français et en anglais (textes dans `frontend/src/i18n/fr.js` et `en.js`). Les messages affichés dans le terminal restent en français. Les messages renvoyés par Kubernetes lui-même (détail d'une erreur, événements non traduits) sont en anglais.

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

Ouvrez les deux commandes `dev:` dans deux terminaux.

Exécutable autonome de la plateforme courante (Node 24 conseillé, c'est lui qui est embarqué) :

```bash
npm run build:exe      # → build-exe/kube-supervision-<os>-<arch>
```

### Publier une version

Numérotation [sémantique](https://semver.org/lang/fr/) `MAJEUR.MINEUR.CORRECTIF` :

| Changement | Commande | Exemple |
| --- | --- | --- |
| Correction de bug | `npm version patch` | 0.1.0 → 0.1.1 |
| Nouvelle fonctionnalité | `npm version minor` | 0.1.1 → 0.2.0 |
| Changement incompatible (option retirée, comportement modifié) | `npm version major` | 0.2.0 → 1.0.0 |

Depuis `main` à jour et sans modification en cours, la commande met à jour
`package.json` et `package-lock.json`, crée le commit « Version x.y.z » et le
tag `vx.y.z`. Il reste à pousser les deux :

```bash
npm version minor
git push --follow-tags
```

GitHub Actions (`.github/workflows/release.yml`) vérifie que le tag correspond
à `package.json`, lance les tests, construit les cinq exécutables, publie leur
attestation de provenance et crée la Release, avec des notes générées à partir
des commits. Un tag publié ne peut ni être déplacé ni supprimé (règles du dépôt).

### Sécurité du dépôt

- Les actions des workflows sont figées sur un commit (SHA) ; Dependabot propose
  leurs mises à jour, comme celles des paquets npm, une fois par semaine et au
  plus tôt 7 jours après leur publication (`.github/dependabot.yml`).
- Les workflows sont en lecture seule, sauf le job qui crée la Release.
- Faille de sécurité : voir [SECURITY.md](SECURITY.md). En développement, la
galerie des composants est disponible sur `#/composants`.

Structure :

```
bin/kube-supervision.js   lanceur (npx), sert le front compilé sur le même port
bin/lanceur.js            logique commune au lanceur npx et à l'exécutable autonome
packaging/                construction de l'exécutable autonome (Node SEA)
backend/src/              Express + @kubernetes/client-node
  kube/                   kubeconfig, lecture tolérante aux droits, watch, flux de logs
  mappers/                Pods, charges de travail, événements, réseau, configuration → données d'écran
  routes/                 API REST, flux temps réel (SSE), actions
  messages.js             messages d'erreur (français)
backend/test/             tests avec client Kubernetes simulé
frontend/src/             React + Vite, CSS avec variables (tokens du design)
  i18n/                   textes de l'interface (fr.js, en.js) et choix de la langue (index.js)
design/                   maquettes de référence (ne pas modifier)
```

API locale (toutes les routes acceptent `ctx` et `ns`) :

| Route | Rôle |
| --- | --- |
| `GET /api/contexts` | Contextes du kubeconfig, contexte courant |
| `GET /api/namespaces` | Namespaces accessibles |
| `GET /api/permissions` | Droits de l'utilisateur dans le namespace |
| `GET /api/workloads` | Charges de travail |
| `GET /api/resources` | Services, Ingress, ConfigMaps, PVC et HPA, avec leur diagnostic |
| `GET /api/pods`, `GET /api/pods/:nom` | Pods, détail d'un Pod avec conteneurs et événements |
| `GET /api/pods/:nom/logs` | Logs (`container`, `previous`, `tailLines`, `follow`) |
| `GET /api/stream` | Changements en direct (Server-Sent Events) |
| `POST /api/workloads/:type/:nom/restart` | Redémarrer |
| `POST /api/workloads/:type/:nom/scale` | Changer les réplicas (`{ "replicas": n }`) |
| `DELETE /api/pods/:nom` | Supprimer un Pod |
| `DELETE /api/resources/:type/:nom` | Supprimer une ressource (`deployments`, `services`, `configmaps`…) |
| `POST /api/workloads/deployments/:nom/pause` | Pause ou reprise (`{ "paused": true }`) |
| `GET /api/workloads/deployments/:nom/revisions` | Versions disponibles d'un Deployment |
| `POST /api/workloads/deployments/:nom/rollback` | Revenir à une version (`{ "revision": n }`) |
| `POST /api/workloads/cronjobs/:nom/suspend` | Suspendre ou réactiver (`{ "suspended": true }`) |
| `POST /api/workloads/cronjobs/:nom/trigger` | Lancer un Job maintenant |
| `GET /api/workloads/:type/:nom/containers` | Conteneurs du modèle de Pod : image, variables, CPU et mémoire |
| `POST /api/workloads/:type/:nom/containers/:conteneur` | Modifier `image`, `env` (`{ set, remove }`) ou `resources` |
| `POST /api/resources/horizontalpodautoscalers/:nom/limits` | Limites d'un autoscaler (`{ "min": 1, "max": 5 }`) |

Les erreurs ont toutes la même forme : `{ "error": { "code": "ACCES_REFUSE", "message": "…" } }`. Le message est en anglais si la requête porte l'en-tête `X-Langue: en` (ou, pour les flux temps réel, le paramètre `lang=en`), en français sinon.

---

## Licences

- Code : licence MIT (fichier `LICENSE`).
- Exécutables autonomes : ils embarquent Node.js (licence MIT, <https://github.com/nodejs/node/blob/main/LICENSE>) et les dépendances npm de l'outil, chacune sous sa propre licence.
- Polices IBM Plex Sans et IBM Plex Mono (fournies avec l'outil) : © IBM Corp., licence SIL Open Font License 1.1 (<https://openfontlicense.org>).
