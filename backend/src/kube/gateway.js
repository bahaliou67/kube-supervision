// Passerelle vers les clusters décrits dans le kubeconfig de la machine.
//
// Le kubeconfig est chargé avec la méthode standard de @kubernetes/client-node
// (variable KUBECONFIG avec fichiers multiples, sinon ~/.kube/config), ce qui
// prend en charge les authentifications par commande externe, jeton ou OIDC.
//
// Un jeu de clients est créé par contexte, à la demande, puis mis en cache :
// on peut ainsi changer de contexte à chaud sans redémarrer le serveur.
// Aucune donnée d'authentification (jeton, certificat) ne sort de ce module.
import * as k8s from '@kubernetes/client-node';
import { AppError } from '../errors.js';
import { openLogStream } from './logStream.js';

export class KubeGateway {
  constructor() {
    this.reload();
  }

  // (Re)lit le kubeconfig. Appelé au démarrage et quand le front redemande
  // la liste des contextes, pour prendre en compte un kubeconfig modifié.
  reload() {
    const kc = new k8s.KubeConfig();
    try {
      kc.loadFromDefault();
      this.loadError = null;
    } catch (err) {
      this.loadError = err;
    }
    this.kc = kc;
    this.cache = new Map();
  }

  // Liste des contextes : uniquement des noms, jamais d'identifiants.
  listContexts() {
    if (this.loadError) {
      throw new AppError(500, 'KUBECONFIG_INVALIDE', { detail: this.loadError.message });
    }
    const contexts = this.kc.getContexts().map((c) => ({
      name: c.name,
      cluster: c.cluster,
      namespace: c.namespace ?? null,
    }));
    if (contexts.length === 0) throw new AppError(500, 'KUBECONFIG_ABSENT');
    const current = contexts.some((c) => c.name === this.kc.getCurrentContext())
      ? this.kc.getCurrentContext()
      : contexts[0].name;
    return { contexts, current };
  }

  // Résout le nom de contexte demandé (contexte courant par défaut).
  resolveContext(ctx) {
    const { contexts, current } = this.listContexts();
    const nom = ctx || current;
    const trouve = contexts.find((c) => c.name === nom);
    if (!trouve) throw new AppError(400, 'CONTEXTE_INCONNU', { ctx: nom });
    return trouve;
  }

  // Namespace par défaut d'un contexte (celui du kubeconfig, sinon « default »).
  defaultNamespace(ctx) {
    return this.resolveContext(ctx).namespace || 'default';
  }

  // Clients d'API pour un contexte donné.
  clients(ctx) {
    const { name } = this.resolveContext(ctx);
    let c = this.cache.get(name);
    if (!c) {
      const kc = new k8s.KubeConfig();
      kc.loadFromOptions({
        clusters: this.kc.clusters,
        users: this.kc.users,
        contexts: this.kc.contexts,
        currentContext: name,
      });
      c = {
        kc,
        core: kc.makeApiClient(k8s.CoreV1Api),
        apps: kc.makeApiClient(k8s.AppsV1Api),
        batch: kc.makeApiClient(k8s.BatchV1Api),
        authz: kc.makeApiClient(k8s.AuthorizationV1Api),
        watch: new k8s.Watch(kc),
        openLogStream: (options) => openLogStream(kc, options),
      };
      this.cache.set(name, c);
    }
    return c;
  }
}
