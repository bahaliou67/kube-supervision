// GET /api/stream?ctx=…&ns=… : changements en direct (Server-Sent Events).
//
// Événements envoyés :
//   snapshot  { pods, workloads, resources, forbidden, unavailable, health }  état complet, à la connexion
//   changes   { pods: { upsert, remove }, workloads?, resources?, touched }   différences depuis l'envoi précédent
//             (workloads et resources : liste complète, seulement si elle a changé)
//             (touched : noms des Pods modifiés ou ayant de nouveaux événements, pour rafraîchir une fiche)
//   health    { ok, code?, message?, retryAt? }                    santé de la connexion au cluster
//   ping      { health }                                           battement toutes les 15 s
import { Router } from 'express';
import { buildOwnerIndex, mapPod } from '../mappers/pod.js';
import { mapWorkloads } from '../mappers/workload.js';
import { TYPES_RESSOURCES, mapResources } from '../mappers/resources.js';
import { langueDe } from '../messages.js';
import { scope } from './scope.js';

const BATTEMENT_MS = 15000;
// Les changements arrivent souvent par rafales (un déploiement touche
// plusieurs objets) : on les regroupe avant de les envoyer.
const REGROUPEMENT_MS = 400;

// Empreinte d'un objet pour savoir s'il a changé ; l'âge (qui avance tout
// seul) est ignoré, le front le recalcule à partir de la date de création.
const empreinte = (o) => JSON.stringify(o, (k, v) => (k === 'age' ? undefined : v));

// Vue calculée à partir du watcher, partagée entre les abonnés et recalculée
// seulement si l'état a changé depuis le dernier calcul.
const caches = new WeakMap();
function vue(watcher) {
  const c = caches.get(watcher);
  if (c && c.version === watcher.version) return c;
  const now = Date.now();
  const owners = buildOwnerIndex(watcher.list('replicasets'), watcher.list('jobs'));
  const pods = (watcher.list('pods') ?? []).map((p) => mapPod(p, now, owners));
  const workloads = mapWorkloads({
    deployments: watcher.list('deployments'),
    statefulsets: watcher.list('statefulsets'),
    daemonsets: watcher.list('daemonsets'),
    jobs: watcher.list('jobs'),
    cronjobs: watcher.list('cronjobs'),
  });
  const resources = mapResources({
    ...Object.fromEntries(TYPES_RESSOURCES.map((t) => [t, watcher.list(t)])),
    pods: watcher.list('pods'),
    replicasets: watcher.list('replicasets'),
    jobs: watcher.list('jobs'),
  });
  const v = {
    version: watcher.version,
    pods,
    empreintes: new Map(pods.map((p) => [p.uid, empreinte(p)])),
    workloads,
    empreinteWorkloads: empreinte(workloads),
    resources,
    empreinteResources: empreinte(resources),
  };
  caches.set(watcher, v);
  return v;
}

export function streamRouter(kube, hub) {
  const r = Router();

  r.get('/stream', (req, res) => {
    const { ctx, ns } = scope(kube, req);
    const langue = langueDe(req);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const envoyer = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);

    const { watcher, unsubscribe } = hub.subscribe(ctx, ns);
    const envoyes = new Map(); // uid → empreinte du dernier envoi
    let empreinteWorkloads = null;
    let empreinteResources = null;
    let instantaneEnvoye = false;
    let touches = new Set();
    let minuteur = null;

    const instantane = () => {
      const v = vue(watcher);
      envoyes.clear();
      for (const [uid, e] of v.empreintes) envoyes.set(uid, e);
      empreinteWorkloads = v.empreinteWorkloads;
      empreinteResources = v.empreinteResources;
      instantaneEnvoye = true;
      touches = new Set();
      envoyer('snapshot', {
        ctx,
        ns,
        pods: v.pods,
        workloads: v.workloads,
        resources: v.resources,
        forbidden: watcher.forbidden(),
        unavailable: watcher.unavailable(),
        health: watcher.health(langue),
      });
    };

    const vider = () => {
      minuteur = null;
      if (!instantaneEnvoye) return;
      const v = vue(watcher);
      const upsert = [];
      for (const p of v.pods) {
        const e = v.empreintes.get(p.uid);
        if (envoyes.get(p.uid) !== e) {
          upsert.push(p);
          envoyes.set(p.uid, e);
        }
      }
      const remove = [];
      for (const uid of envoyes.keys()) {
        if (!v.empreintes.has(uid)) remove.push(uid);
      }
      for (const uid of remove) envoyes.delete(uid);
      const changes = { pods: { upsert, remove }, touched: [...touches] };
      if (v.empreinteWorkloads !== empreinteWorkloads) {
        changes.workloads = v.workloads;
        empreinteWorkloads = v.empreinteWorkloads;
      }
      if (v.empreinteResources !== empreinteResources) {
        changes.resources = v.resources;
        empreinteResources = v.empreinteResources;
      }
      touches = new Set();
      if (upsert.length || remove.length || changes.workloads || changes.resources || changes.touched.length) envoyer('changes', changes);
    };

    const surChangement = (type, obj) => {
      if (type === 'pods' && obj?.metadata?.name) touches.add(obj.metadata.name);
      if (type === 'events' && obj?.involvedObject?.kind === 'Pod') touches.add(obj.involvedObject.name);
      if (!minuteur) minuteur = setTimeout(vider, REGROUPEMENT_MS);
    };
    const surPret = () => {
      if (!instantaneEnvoye) instantane();
    };
    // L'événement porte la santé en français : on la reformule dans la langue de l'abonné.
    const surSante = () => envoyer('health', watcher.health(langue));

    watcher.on('change', surChangement);
    watcher.on('ready', surPret);
    watcher.on('health', surSante);
    if (watcher.ready) instantane();
    // Le cluster ne répond pas encore : on le signale tout de suite.
    else if (!watcher.health().ok) surSante();

    const battement = setInterval(() => envoyer('ping', { health: watcher.health(langue) }), BATTEMENT_MS);

    res.on('close', () => {
      clearInterval(battement);
      clearTimeout(minuteur);
      watcher.off('change', surChangement);
      watcher.off('ready', surPret);
      watcher.off('health', surSante);
      unsubscribe();
    });
  });

  return r;
}
