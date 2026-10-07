// Données du namespace actif (Pods et charges de travail), partagées par
// l'Accueil et l'écran Charges de travail.
// L'étape 6 y branchera le flux temps réel.
import { useEffect } from 'react';
import { useApi } from '../lib/useApi.js';
import { useScope } from './ScopeContext.jsx';

export function useNamespaceData({ onUpdate } = {}) {
  const { ctx, ns } = useScope();
  const pods = useApi('/pods', { ctx, ns });
  const workloads = useApi('/workloads', { ctx, ns });
  useEffect(() => {
    if (pods.updatedAt) onUpdate?.(pods.updatedAt);
  }, [pods.updatedAt, onUpdate]);
  return { pods, workloads };
}
