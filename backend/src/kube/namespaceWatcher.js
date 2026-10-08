// Surveillance en temps réel d'un namespace (mécanisme « watch » de Kubernetes).
//
// Pour chaque type de ressource : une liste initiale, puis un watch à partir
// de la version obtenue (resourceVersion). Quand le watch se termine (délai du
// serveur, coupure), il reprend à la dernière version connue ; si cette
// version est expirée (410 Gone), la liste est relue. En cas d'erreur
// (cluster injoignable, jeton expiré), nouvelle tentative avec un délai
// croissant (2 s → 30 s) et l'état de santé est signalé aux abonnés.
//
// Un seul NamespaceWatcher par (contexte, namespace), partagé par tous les
// onglets ouverts ; il s'arrête 30 s après le départ du dernier abonné.
import { EventEmitter } from 'node:events';
import { toAppError } from '../errors.js';
import { listAll } from './namespaceData.js';

// Chemin d'API de chaque type pour le watch.
const CHEMINS = {
  pods: (ns) => `/api/v1/namespaces/${ns}/pods`,
  events: (ns) => `/api/v1/namespaces/${ns}/events`,
  replicasets: (ns) => `/apis/apps/v1/namespaces/${ns}/replicasets`,
  deployments: (ns) => `/apis/apps/v1/namespaces/${ns}/deployments`,
  statefulsets: (ns) => `/apis/apps/v1/namespaces/${ns}/statefulsets`,
  daemonsets: (ns) => `/apis/apps/v1/namespaces/${ns}/daemonsets`,
  jobs: (ns) => `/apis/batch/v1/namespaces/${ns}/jobs`,
  cronjobs: (ns) => `/apis/batch/v1/namespaces/${ns}/cronjobs`,
  services: (ns) => `/api/v1/namespaces/${ns}/services`,
  endpointslices: (ns) => `/apis/discovery.k8s.io/v1/namespaces/${ns}/endpointslices`,
  ingresses: (ns) => `/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses`,
  configmaps: (ns) => `/api/v1/namespaces/${ns}/configmaps`,
  persistentvolumeclaims: (ns) => `/api/v1/namespaces/${ns}/persistentvolumeclaims`,
  horizontalpodautoscalers: (ns) => `/apis/autoscaling/v2/namespaces/${ns}/horizontalpodautoscalers`,
};
export const TYPES_SURVEILLES = Object.keys(CHEMINS);

const DELAI_MIN_S = 2;
const DELAI_MAX_S = 30;
// Le serveur ferme proprement le watch après ce délai ; on le relance aussitôt.
const WATCH_TIMEOUT_S = 240;

// 410 Gone : la version demandée est trop ancienne, il faut relire la liste.
function estExpire(err) {
  return err?.statusCode === 410 || err?.code === 410 || /too old resource version|410/i.test(err?.message ?? '');
}

export class NamespaceWatcher extends EventEmitter {
  constructor(k, ns, { delaiMin = DELAI_MIN_S, delaiMax = DELAI_MAX_S } = {}) {
    super();
    this.k = k;
    this.ns = ns;
    this.delaiMin = delaiMin;
    this.delaiMax = delaiMax;
    this.arrete = false;
    // Incrémenté à chaque changement : permet de ne recalculer la vue qu'au besoin.
    this.version = 0;
    // Par type : objets par uid, état (loading, ok, forbidden, unavailable, error), version.
    this.types = Object.fromEntries(
      TYPES_SURVEILLES.map((t) => [t, { items: new Map(), status: 'loading', rv: null, abort: null, timer: null, delai: delaiMin, error: null }]),
    );
  }

  changed(type, obj) {
    this.version += 1;
    this.emit('change', type, obj);
  }

  start() {
    for (const t of TYPES_SURVEILLES) this.lister(t);
    return this;
  }

  stop() {
    this.arrete = true;
    for (const s of Object.values(this.types)) {
      clearTimeout(s.timer);
      s.abort?.abort();
    }
    this.removeAllListeners();
  }

  // Toutes les listes initiales ont-elles abouti (avec succès ou non) ?
  get ready() {
    return Object.values(this.types).every((s) => s.status !== 'loading');
  }

  // Liste des objets d'un type (null si interdit ou indisponible).
  list(type) {
    const s = this.types[type];
    if (s.status === 'forbidden' || s.status === 'unavailable') return null;
    return [...s.items.values()];
  }

  forbidden() {
    return TYPES_SURVEILLES.filter((t) => this.types[t].status === 'forbidden');
  }

  unavailable() {
    return TYPES_SURVEILLES.filter((t) => this.types[t].status === 'unavailable');
  }

  // Santé : ok, ou la première erreur rencontrée (message dans la langue
  // demandée) et le délai avant la prochaine tentative.
  health(langue = 'fr') {
    const enErreur = Object.values(this.types).find((s) => s.status === 'error');
    if (!enErreur) return { ok: true };
    return { ok: false, code: enErreur.error.code, message: enErreur.error.messageDans(langue), retryAt: enErreur.retryAt ?? null };
  }

  // Relance immédiate des types en erreur (bouton « Réessayer »).
  retryNow() {
    for (const [t, s] of Object.entries(this.types)) {
      if (s.status !== 'error') continue;
      clearTimeout(s.timer);
      s.delai = this.delaiMin;
      this.lister(t);
    }
  }

  async lister(type) {
    const s = this.types[type];
    if (this.arrete) return;
    try {
      const { items, resourceVersion } = await listAll(this.k, type, this.ns);
      if (this.arrete) return;
      s.items = new Map(items.map((o) => [o.metadata?.uid ?? o.metadata?.name, o]));
      s.rv = resourceVersion;
      const etaitEnErreur = s.status === 'error';
      s.status = 'ok';
      s.error = null;
      s.delai = this.delaiMin;
      this.changed(type, null);
      if (etaitEnErreur) this.emit('health', this.health());
      this.surveiller(type);
    } catch (err) {
      const e = toAppError(err);
      if (e.code === 'ACCES_REFUSE') s.status = 'forbidden';
      else if (e.code === 'INTROUVABLE' || e.code === 'API_INCOMPATIBLE') s.status = 'unavailable';
      else return this.echec(type, e);
      s.items = new Map();
      this.changed(type, null);
    } finally {
      if (this.ready) this.emit('ready');
    }
  }

  // Erreur réseau ou d'authentification : nouvelle tentative plus tard.
  echec(type, e) {
    const s = this.types[type];
    if (this.arrete) return;
    s.status = 'error';
    s.error = e;
    s.retryAt = Date.now() + s.delai * 1000;
    s.timer = setTimeout(() => this.lister(type), s.delai * 1000);
    s.delai = Math.min(this.delaiMax, s.delai * 2);
    this.emit('health', this.health());
  }

  async surveiller(type) {
    const s = this.types[type];
    if (this.arrete) return;
    let fini = false;
    const debut = Date.now();
    const relancer = (err) => {
      if (fini || this.arrete) return;
      fini = true;
      s.abort = null;
      if (!err || err.name === 'TimeoutError' || err.name === 'AbortError') {
        // Fin normale du watch : reprise immédiate, sauf s'il a été fermé
        // aussitôt ouvert (on évite alors une boucle de requêtes).
        if (Date.now() - debut < 1000) {
          s.timer = setTimeout(() => this.surveiller(type), 1000);
          return undefined;
        }
        return this.surveiller(type);
      }
      if (estExpire(err)) return this.lister(type);
      return this.echec(type, toAppError(err));
    };
    try {
      s.abort = await this.k.watch.watch(
        CHEMINS[type](this.ns),
        { resourceVersion: s.rv, allowWatchBookmarks: true, timeoutSeconds: WATCH_TIMEOUT_S },
        (phase, obj) => {
          if (phase === 'ERROR') {
            // Objet Status renvoyé dans le flux (souvent 410 Gone).
            relancer(Object.assign(new Error(obj?.message ?? 'watch error'), { code: obj?.code }));
            s.abort?.abort();
            return;
          }
          const rv = obj?.metadata?.resourceVersion;
          if (rv) s.rv = rv;
          if (phase === 'BOOKMARK') return;
          const cle = obj?.metadata?.uid ?? obj?.metadata?.name;
          if (phase === 'DELETED') s.items.delete(cle);
          else s.items.set(cle, obj);
          this.changed(type, obj);
        },
        relancer,
      );
      if (this.arrete) s.abort?.abort();
    } catch (err) {
      relancer(err);
    }
  }
}

// Registre des surveillances : une par (contexte, namespace), avec abonnés.
export class WatchHub {
  constructor(kube, { arretApresMs = 30000 } = {}) {
    this.kube = kube;
    this.arretApresMs = arretApresMs;
    this.entrees = new Map();
  }

  // Renvoie le watcher et une fonction de désabonnement.
  subscribe(ctx, ns) {
    const cle = `${ctx}\u0000${ns}`;
    let e = this.entrees.get(cle);
    if (!e) {
      const watcher = new NamespaceWatcher(this.kube.clients(ctx), ns);
      watcher.setMaxListeners(0);
      e = { watcher, abonnes: 0, arret: null };
      this.entrees.set(cle, e);
      watcher.start();
    } else if (!e.watcher.health().ok) {
      // Un nouvel abonné (page rechargée, « Réessayer ») relance sans attendre.
      e.watcher.retryNow();
    }
    clearTimeout(e.arret);
    e.abonnes += 1;
    let parti = false;
    return {
      watcher: e.watcher,
      unsubscribe: () => {
        if (parti) return;
        parti = true;
        e.abonnes -= 1;
        if (e.abonnes > 0) return;
        e.arret = setTimeout(() => {
          e.watcher.stop();
          this.entrees.delete(cle);
        }, this.arretApresMs);
      },
    };
  }

  stopAll() {
    for (const e of this.entrees.values()) {
      clearTimeout(e.arret);
      e.watcher.stop();
    }
    this.entrees.clear();
  }
}
