// Données du namespace actif (Pods et charges de travail), partagées par
// l'Accueil et l'écran Charges de travail, tenues à jour en temps réel.
import { useLive } from './LiveContext.jsx';

export function useNamespaceData() {
  const { pods, workloads } = useLive();
  return { pods, workloads };
}
