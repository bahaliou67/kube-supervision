// Tableau générique avec tri par colonne et pagination côté client.
// Conçu pour rester fluide avec plusieurs centaines de lignes : seules les
// lignes de la page courante sont rendues.
//
// columns : [{ key, label, sortValue?(row), render(row), className?, thClassName?, width? }]
import { useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import fr from '../i18n/fr.js';

const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

function compare(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

export default function DataTable({
  columns,
  rows,
  rowKey,
  initialSort = null,
  pageSize = 100,
  minWidth = 640,
  caption,
  showHeader = true,
  rowClassName,
}) {
  const [sort, setSort] = useState(initialSort); // { key, dir: 'asc' | 'desc' }
  const [page, setPage] = useState(0);

  const tries = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const sens = sort.dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => sens * compare(col.sortValue(a), col.sortValue(b)));
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(tries.length / pageSize));
  const pageCourante = Math.min(page, pages - 1);
  const visibles = tries.slice(pageCourante * pageSize, (pageCourante + 1) * pageSize);

  const basculer = (key) => {
    setPage(0);
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  return (
    <>
      <table className="table" style={{ minWidth }}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {showHeader ? (
          <thead>
            <tr>
              {columns.map((c) => {
                const actif = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    className={c.thClassName ?? c.className}
                    style={c.width ? { width: c.width } : undefined}
                    aria-sort={actif ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {c.sortValue ? (
                      <button type="button" className="th-sort" aria-pressed={actif} onClick={() => basculer(c.key)} title={fr.tableau.trierPar(c.label.toLowerCase())}>
                        {c.label}
                        <Icon name={actif ? (sort.dir === 'asc' ? 'haut' : 'bas') : 'tri'} size={12} strokeWidth={2} />
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {visibles.map((row) => (
            <tr key={rowKey(row)} className={rowClassName?.(row)}>
              {columns.map((c) => (
                <td key={c.key} className={c.className} style={!showHeader && c.width ? { width: c.width } : undefined}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {pages > 1 ? (
        <div className="table-foot">
          <span>{fr.tableau.pagination(pageCourante * pageSize + 1, Math.min(tries.length, (pageCourante + 1) * pageSize), tries.length)}</span>
          <button type="button" className="btn btn-icon" onClick={() => setPage(pageCourante - 1)} disabled={pageCourante === 0} aria-label={fr.tableau.pagePrecedente}>
            <Icon name="gauche" size={12} strokeWidth={2} />
          </button>
          <button type="button" className="btn btn-icon" onClick={() => setPage(pageCourante + 1)} disabled={pageCourante >= pages - 1} aria-label={fr.tableau.pageSuivante}>
            <Icon name="droite" size={12} strokeWidth={2} />
          </button>
        </div>
      ) : null}
    </>
  );
}
