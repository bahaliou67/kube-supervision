// Contexte (cluster) et namespace actifs, partagés par tous les écrans.
//
// Au démarrage : contexte courant du kubeconfig et son namespace par défaut.
// Si le kubeconfig ne fixe pas de namespace, « default » ; si celui-ci n'est
// pas dans la liste des namespaces accessibles, le premier accessible.
import { createContext, useCallback, useContext, useMemo } from 'react';
import { navigate, useRoute } from '../lib/router.js';
import { useApi, useAutoRetry } from '../lib/useApi.js';

const ScopeCtx = createContext(null);

export function ScopeProvider({ children }) {
  const route = useRoute();
  const contexts = useApi('/contexts');

  const ctxNom = route.query.ctx || contexts.data?.current || null;
  const ctxObj = contexts.data?.contexts.find((c) => c.name === ctxNom) ?? null;

  const namespaces = useApi('/namespaces', { ctx: ctxNom }, { enabled: Boolean(ctxObj) });
  // L'outil ou le cluster ne répond pas encore : nouvelles tentatives automatiques.
  useAutoRetry(contexts);
  useAutoRetry(namespaces);

  let ns = route.query.ns || null;
  if (!ns && ctxObj) {
    ns = ctxObj.defaultNamespace;
    const n = namespaces.data;
    // Namespace par défaut absent de la liste accessible : on prend le premier.
    if (!ctxObj.namespace && n?.listable && n.items.length > 0 && !n.items.some((i) => i.name === ns)) {
      ns = n.items[0].name;
    }
  }

  // Change de contexte et/ou de namespace. Une fiche de Pod n'a plus de sens
  // dans un autre namespace : on revient alors à l'accueil.
  const setScope = useCallback(
    ({ ctx, ns: nouveauNs }) => {
      const ctxCible = ctx ?? ctxNom;
      const changeCtx = ctxCible !== ctxNom;
      const nsCible = changeCtx && !nouveauNs ? undefined : nouveauNs ?? ns;
      const chemin = route.path.startsWith('/pods') ? '/' : route.path;
      navigate(chemin, { ...route.query, ctx: ctxCible, ns: nsCible });
    },
    [ctxNom, ns, route],
  );

  const value = useMemo(
    () => ({
      route,
      contexts,
      namespaces,
      ctx: ctxObj ? ctxNom : null,
      ctxObj,
      ns,
      ready: Boolean(ctxObj && ns),
      setScope,
      // Lien interne qui conserve le contexte et le namespace.
      link: (path, extra = {}) => {
        const p = new URLSearchParams({ ...(ctxNom ? { ctx: ctxNom } : {}), ...(ns ? { ns } : {}), ...extra });
        return `#${path}?${p}`;
      },
    }),
    [route, contexts, namespaces, ctxNom, ctxObj, ns, setScope],
  );
  return <ScopeCtx.Provider value={value}>{children}</ScopeCtx.Provider>;
}

export function useScope() {
  return useContext(ScopeCtx);
}
