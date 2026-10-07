// États génériques : lignes fantômes du chargement (maquette 06).
// Aucun compteur n'affiche 0 tant que la réponse n'est pas arrivée.

const LARGEURS = [190, 150, 170];

export function Skeleton({ rows = 3 }) {
  return (
    <div className="skeleton-rows" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-row" key={i}>
          <div className="skeleton" style={{ width: 90 }} />
          <div className="skeleton" style={{ width: LARGEURS[i % LARGEURS.length] }} />
          <div className="skeleton" style={{ flex: 1 }} />
        </div>
      ))}
    </div>
  );
}
