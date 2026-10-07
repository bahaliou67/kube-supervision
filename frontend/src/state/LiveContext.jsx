// Données en temps réel du namespace actif.
//
// 1. Chargement initial par l'API REST (/api/pods, /api/workloads) : affichage
//    rapide et erreurs précises (accès refusé, cluster injoignable…).
// 2. Puis flux /api/stream (Server-Sent Events) : état complet à la connexion,
//    puis différences au fil de l'eau. Le flux se reconnecte seul.
// 3. En cas de coupure, les dernières données restent affichées avec leur
//    date, et l'état « connexion perdue » est exposé aux écrans.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useApi, useAutoRetry } from '../lib/useApi.js';
import { openEventStream } from '../lib/eventStream.js';
import { useScope } from './ScopeContext.jsx';

const LiveCtx = createContext(null);

const INITIAL = {
  status: 'connecting', // connecting | live | offline
  reason: null, // { code, message } quand hors ligne
  retryIn: null, // secondes avant la prochaine tentative (flux vers l'outil)
  retryAt: null, // date de la prochaine tentative (côté cluster)
  lastSync: null,
  pods: null, // Map uid → Pod, une fois le flux établi
  workloads: null,
  forbidden: [],
  unavailable: [],
  revisions: {}, // nom de Pod → compteur, incrémenté à chaque changement
  epoch: 0, // incrémenté à chaque état complet (après une reconnexion, tout a pu changer)
};

// État de santé du cluster renvoyé par le backend.
function appliquerSante(e, h) {
  if (!h) return e;
  if (h.ok) return { ...e, status: 'live', reason: null, retryAt: null, retryIn: null, lastSync: Date.now() };
  return { ...e, status: 'offline', reason: { code: h.code, message: h.message }, retryAt: h.retryAt ?? null, retryIn: null };
}

export function LiveProvider({ children }) {
  const { ctx, ns, ready } = useScope();
  const podsRest = useApi('/pods', { ctx, ns }, { enabled: ready });
  const workloadsRest = useApi('/workloads', { ctx, ns }, { enabled: ready });
  const [live, setLive] = useState(INITIAL);
  const flux = useRef(null);

  // Le flux n'est ouvert que si le chargement initial a réussi : un refus
  // d'accès ou un namespace invalide est affiché par l'écran, pas réessayé en boucle.
  const restOk = podsRest.status !== 'error' || Boolean(podsRest.data);
  useEffect(() => {
    setLive(INITIAL);
    if (!ready || !restOk) return undefined;
    const params = new URLSearchParams({ ctx, ns });
    flux.current = openEventStream({
      url: () => `/api/stream?${params}`,
      onStatus: (s) => {
        if (s.status === 'retry') {
          // L'outil lui-même ne répond plus (arrêté, redémarrage…).
          setLive((e) => ({ ...e, status: 'offline', reason: { code: 'SERVEUR_INJOIGNABLE' }, retryIn: s.retryIn, retryAt: null }));
        }
      },
      events: {
        snapshot: (d) =>
          setLive((e) =>
            appliquerSante(
              {
                ...e,
                pods: new Map(d.pods.map((p) => [p.uid, p])),
                workloads: d.workloads,
                forbidden: d.forbidden,
                unavailable: d.unavailable,
                // Tout a pu changer pendant la coupure : les fiches se rafraîchissent.
                epoch: e.epoch + 1,
              },
              d.health,
            ),
          ),
        changes: (d) =>
          setLive((e) => {
            const pods = new Map(e.pods ?? []);
            for (const p of d.pods.upsert) pods.set(p.uid, p);
            for (const uid of d.pods.remove) pods.delete(uid);
            const revisions = { ...e.revisions };
            for (const nom of d.touched) revisions[nom] = (revisions[nom] ?? 0) + 1;
            return { ...e, pods, workloads: d.workloads ?? e.workloads, revisions, lastSync: e.status === 'live' ? Date.now() : e.lastSync };
          }),
        health: (h) => setLive((e) => appliquerSante(e, h)),
        ping: (d) => setLive((e) => appliquerSante(e, d.health)),
      },
    });
    return () => {
      flux.current?.close();
      flux.current = null;
    };
  }, [ctx, ns, ready, restOk]);

  // Chargement initial en échec passager : nouvelle tentative toutes les 5 s.
  useAutoRetry(podsRest);
  useAutoRetry(workloadsRest);

  // « Réessayer » : relance le flux et, si besoin, le chargement initial.
  const retry = useCallback(() => {
    if (podsRest.status === 'error') podsRest.reload();
    if (workloadsRest.status === 'error') workloadsRest.reload();
    flux.current?.retryNow();
  }, [podsRest, workloadsRest]);

  const value = useMemo(() => {
    const items = live.pods ? [...live.pods.values()] : podsRest.data?.items;
    const pods = items
      ? { status: 'ok', data: { items, forbidden: live.pods ? live.forbidden.filter((t) => t === 'replicasets' || t === 'jobs') : podsRest.data.forbidden }, error: null, reload: retry }
      : { status: podsRest.status, data: null, error: podsRest.error, reload: podsRest.reload };
    const wItems = live.workloads ?? workloadsRest.data?.items;
    const types = ['deployments', 'statefulsets', 'daemonsets', 'jobs', 'cronjobs'];
    const workloads = wItems
      ? {
          status: 'ok',
          data: live.workloads
            ? { items: wItems, forbidden: live.forbidden.filter((t) => types.includes(t)), unavailable: live.unavailable.filter((t) => types.includes(t)) }
            : workloadsRest.data,
          error: null,
          reload: retry,
        }
      : { status: workloadsRest.status, data: null, error: workloadsRest.error, reload: workloadsRest.reload };

    // Avant le flux, la date du chargement REST fait foi.
    const lastSync = live.lastSync ?? podsRest.updatedAt;
    const status = live.status === 'connecting' && podsRest.data ? 'live' : live.status;
    return {
      pods,
      workloads,
      connection: { status, reason: live.reason, retryIn: live.retryIn, retryAt: live.retryAt, lastSync, retry },
      online: status === 'live',
      revision: (nom) => `${live.epoch}-${live.revisions[nom] ?? 0}`,
    };
  }, [live, podsRest, workloadsRest, retry]);

  return <LiveCtx.Provider value={value}>{children}</LiveCtx.Provider>;
}

export function useLive() {
  return useContext(LiveCtx);
}
