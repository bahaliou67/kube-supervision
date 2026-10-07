// Lecture des ressources d'un namespace, tolérante aux droits partiels.
//
// Chaque type de ressource est lu séparément : si l'utilisateur n'a pas le
// droit de lister les CronJobs (403), ou si le cluster ne connaît pas cette
// API (404, version de Kubernetes différente), les autres types restent
// affichés et le front signale ce qui manque.
import { toAppError, withTimeout } from '../errors.js';

// Description des types lus : méthode du client et groupe d'API.
export const RESSOURCES = {
  pods: { api: 'core', list: 'listNamespacedPod' },
  replicasets: { api: 'apps', list: 'listNamespacedReplicaSet' },
  deployments: { api: 'apps', list: 'listNamespacedDeployment' },
  statefulsets: { api: 'apps', list: 'listNamespacedStatefulSet' },
  daemonsets: { api: 'apps', list: 'listNamespacedDaemonSet' },
  jobs: { api: 'batch', list: 'listNamespacedJob' },
  cronjobs: { api: 'batch', list: 'listNamespacedCronJob' },
  events: { api: 'core', list: 'listNamespacedEvent' },
  services: { api: 'core', list: 'listNamespacedService' },
  endpointslices: { api: 'discovery', list: 'listNamespacedEndpointSlice' },
  ingresses: { api: 'networking', list: 'listNamespacedIngress' },
  configmaps: { api: 'core', list: 'listNamespacedConfigMap' },
  persistentvolumeclaims: { api: 'core', list: 'listNamespacedPersistentVolumeClaim' },
  horizontalpodautoscalers: { api: 'autoscaling', list: 'listNamespacedHorizontalPodAutoscaler' },
};

const TAILLE_PAGE = 500;

// Lit toutes les pages d'une liste (paramètre continue de l'API).
export async function listAll(k, type, namespace, extra = {}) {
  const { api, list } = RESSOURCES[type];
  const items = [];
  let suite;
  let resourceVersion = null;
  do {
    const page = await withTimeout(k[api][list]({ namespace, limit: TAILLE_PAGE, _continue: suite, ...extra }));
    items.push(...(page.items ?? []));
    suite = page.metadata?._continue || undefined;
    resourceVersion = page.metadata?.resourceVersion ?? resourceVersion;
  } while (suite);
  return { items, resourceVersion };
}

// Lit plusieurs types. Renvoie { data: { type: [objets] | null }, forbidden: [types], unavailable: [types] }.
// Les erreurs autres que 403/404 (cluster injoignable, jeton expiré…) sont propagées.
export async function readNamespace(k, namespace, types) {
  const resultats = await Promise.allSettled(types.map((t) => listAll(k, t, namespace)));
  const data = {};
  const forbidden = [];
  const unavailable = [];
  resultats.forEach((r, i) => {
    const type = types[i];
    if (r.status === 'fulfilled') {
      data[type] = r.value.items;
      return;
    }
    const e = toAppError(r.reason);
    data[type] = null;
    if (e.code === 'ACCES_REFUSE') forbidden.push(type);
    else if (e.code === 'INTROUVABLE' || e.code === 'API_INCOMPATIBLE') unavailable.push(type);
    else throw r.reason;
  });
  return { data, forbidden, unavailable };
}
