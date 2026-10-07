// Chargement d'une ressource de l'API, avec état (chargement, données,
// erreur), relance manuelle et date de dernière mise à jour.
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '../api.js';

export function useApi(path, params, { enabled = true } = {}) {
  const cle = JSON.stringify([path, params]);
  const [etat, setEtat] = useState({ status: 'loading', data: null, error: null, updatedAt: null, key: cle });
  const [tentative, setTentative] = useState(0);
  const courant = useRef(cle);
  courant.current = cle;

  useEffect(() => {
    if (!enabled || !path) return undefined;
    let annule = false;
    // Changement de ressource : on repart d'un état de chargement (pas de données périmées d'un autre namespace).
    setEtat((e) => (e.key === cle ? { ...e, status: e.data ? 'refreshing' : 'loading' } : { status: 'loading', data: null, error: null, updatedAt: null, key: cle }));
    apiGet(path, params).then(
      (data) => !annule && setEtat({ status: 'ok', data, error: null, updatedAt: Date.now(), key: cle }),
      (error) => !annule && setEtat((e) => ({ ...e, status: 'error', error, key: cle })),
    );
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, tentative, enabled]);

  const reload = useCallback(() => setTentative((t) => t + 1), []);
  // État d'une autre clé encore affiché le temps d'un rendu : on le masque.
  const valide = etat.key === cle ? etat : { status: 'loading', data: null, error: null, updatedAt: null };
  return { ...valide, reload, setData: (f) => setEtat((e) => ({ ...e, data: f(e.data) })) };
}
