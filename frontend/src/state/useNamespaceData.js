// Données du namespace actif (Pods, charges de travail, Services, Ingress,
// ConfigMaps, PVC, HPA), partagées par les écrans, tenues à jour en temps réel.
import { useLive } from './LiveContext.jsx';

export function useNamespaceData() {
  const { pods, workloads, resources } = useLive();
  return { pods, workloads, resources };
}
