// Tableau générique avec tri par colonne et pagination côté client.
//
// columns : [{ key, label, sortValue?(row), render(row), className?, thClassName?, width? }]
import { useMemo } from 'react';
import Icon from './Icon.jsx';
import { useTable } from '../lib/useTable.js';
import fr from '../i18n/fr.js';

// En-tête de colonne triable (bouton + flèche indiquant le sens).
export function SortHeader({ label, sortKey, table }) {
  const actif = table.sort?.key === sortKey;
  return (
    <button
      type="button"
      className="th-sort"
      aria-pressed={actif}
      onClick={() => table.toggleSort(sortKey)}
      title={fr.tableau.trierPar(label.toLowerCase())}
    >
      {label}
      <Icon name={actif ? (table.sort.dir === 'asc' ? 'haut' : 'bas') : 'tri'} size={12} strokeWidth={2} />
    </button>
  );
}

export function ariaSort(table, key) {
  if (table.sort?.key !== key) return undefined;
  return table.sort.dir === 'asc' ? 'ascending' : 'descending';
}

// Pied de tableau : « 1–100 sur 500 » et boutons page précédente / suivante.
export function Pager({ table }) {
  if (table.pages <= 1) return null;
  const debut = table.page * table.pageSize + 1;
  const fin = Math.min(table.total, (table.page + 1) * table.pageSize);
  return (
    <div className="table-foot">
      <span>{fr.tableau.pagination(debut, fin, table.total)}</span>
      <button type="button" className="btn btn-icon" onClick={() => table.setPage(table.page - 1)} disabled={table.page === 0} aria-label={fr.tableau.pagePrecedente}>
        <Icon name="gauche" size={12} strokeWidth={2} />
      </button>
      <button type="button" className="btn btn-icon" onClick={() => table.setPage(table.page + 1)} disabled={table.page >= table.pages - 1} aria-label={fr.tableau.pageSuivante}>
        <Icon name="droite" size={12} strokeWidth={2} />
      </button>
    </div>
  );
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
  resetKey,
}) {
  const sortValues = useMemo(() => Object.fromEntries(columns.filter((c) => c.sortValue).map((c) => [c.key, c.sortValue])), [columns]);
  const table = useTable(rows, { sortValues, initialSort, pageSize, resetKey });

  return (
    <>
      <table className="table" style={{ minWidth }}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {showHeader ? (
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.thClassName ?? c.className} style={c.width ? { width: c.width } : undefined} aria-sort={ariaSort(table, c.key)}>
                  {c.sortValue ? <SortHeader label={c.label} sortKey={c.key} table={table} /> : c.label}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {table.rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} className={c.className} style={!showHeader && c.width ? { width: c.width } : undefined}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <Pager table={table} />
    </>
  );
}
