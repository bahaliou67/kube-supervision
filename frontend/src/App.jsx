// Étape 1 : affichage brut des Pods du namespace par défaut du contexte courant.
import { useEffect, useState } from 'react';
import { apiGet } from './api.js';

export default function App() {
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { current, contexts } = await apiGet('/contexts');
        const ctx = contexts.find((c) => c.name === current);
        // ?ns=… dans l'URL permet de choisir un autre namespace (le sélecteur arrive à l'étape 2).
        const ns = new URLSearchParams(window.location.search).get('ns') || ctx.defaultNamespace;
        setDonnees(await apiGet('/pods', { ctx: current, ns }));
      } catch (e) {
        setErreur(e);
      }
    })();
  }, []);

  if (erreur) return <p>Erreur {erreur.code} : {erreur.message}</p>;
  if (!donnees) return <p>Chargement…</p>;
  return (
    <main>
      <h1>
        Pods de {donnees.ns} sur {donnees.ctx} ({donnees.items.length})
      </h1>
      <table border="1" cellPadding="4">
        <thead>
          <tr>
            <th>Nom</th>
            <th>Statut</th>
            <th>Prêts</th>
            <th>Redémarrages</th>
            <th>Dernier arrêt</th>
            <th>Propriétaire</th>
            <th>Âge (s)</th>
          </tr>
        </thead>
        <tbody>
          {donnees.items.map((p) => (
            <tr key={p.uid}>
              <td>{p.name}</td>
              <td>{p.status}</td>
              <td>{p.ready}</td>
              <td>{p.restarts}</td>
              <td>{p.lastTermination?.reason ?? ''}</td>
              <td>{p.owner ? `${p.owner.kind} ${p.owner.name}` : '—'}</td>
              <td>{p.age}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
