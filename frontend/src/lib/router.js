// Routeur minimal par hash : #/chemin?ctx=…&ns=…
// Le contexte et le namespace sont dans l'adresse : un rechargement ou un
// lien partagé conserve ce que l'utilisateur regardait.
import { useEffect, useState } from 'react';

export function parseHash(hash = window.location.hash) {
  const brut = hash.replace(/^#/, '') || '/';
  const [chemin, recherche = ''] = brut.split('?');
  return { path: chemin || '/', query: Object.fromEntries(new URLSearchParams(recherche)) };
}

export function buildHref(path, query = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) p.set(k, v);
  const s = p.toString();
  return `#${path}${s ? `?${s}` : ''}`;
}

export function navigate(path, query) {
  window.location.hash = buildHref(path, query).slice(1);
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash());
  useEffect(() => {
    const maj = () => setRoute(parseHash());
    window.addEventListener('hashchange', maj);
    return () => window.removeEventListener('hashchange', maj);
  }, []);
  return route;
}
