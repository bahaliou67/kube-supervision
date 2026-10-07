// Chargement d'une ressource de l'API, avec état (chargement, données,
// erreur), relance manuelle et date de dernière mise à jour.
//
// revision : changer cette valeur relit la ressource en gardant les données
// affichées (rafraîchissement en direct, sans repasser par le chargement).
import { useCallback, useEffect, useState } from 'react';
import { ERREURS_PASSAGERES, apiGet } from '../api.js';

const VIDE = { status: 'loading', data: null, error: null, updatedAt: null };

export function useApi(path, params, { enabled = true, revision = 0 } = {}) {
  const cle = JSON.stringify([path, params]);
  const [etat, setEtat] = useState({ ...VIDE, key: cle });
  const [tentative, setTentative] = useState(0);

  useEffect(() => {
    if (!enabled || !path) return undefined;
    let annule = false;
    // Changement de ressource : on repart d'un état de chargement (pas de
    // données périmées d'un autre namespace). Même ressource : on garde les données.
    setEtat((e) => (e.key === cle ? { ...e, status: e.data ? 'refreshing' : 'loading' } : { ...VIDE, key: cle }));
    apiGet(path, params).then(
      (data) => !annule && setEtat({ status: 'ok', data, error: null, updatedAt: Date.now(), key: cle }),
      (error) => !annule && setEtat((e) => (e.key === cle ? { ...e, status: 'error', error } : { ...VIDE, status: 'error', error, key: cle })),
    );
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, tentative, enabled, revision]);

  const reload = useCallback(() => setTentative((t) => t + 1), []);
  // État d'une autre clé encore affiché le temps d'un rendu : on le masque.
  const valide = etat.key === cle ? etat : VIDE;
  return { ...valide, reload };
}

// Relance automatique d'une ressource dont le chargement a échoué pour une
// raison passagère (outil ou cluster injoignable, délai dépassé).
export function useAutoRetry(ressource, delaiMs = 5000) {
  const passager = ressource.status === 'error' && !ressource.data && ERREURS_PASSAGERES.has(ressource.error?.code);
  const { reload, error } = ressource;
  useEffect(() => {
    if (!passager) return undefined;
    const id = setTimeout(reload, delaiMs);
    return () => clearTimeout(id);
  }, [passager, reload, error, delaiMs]);
}
