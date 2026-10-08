// Tri et pagination côté client, partagés par les tableaux.
// Seule la page courante est rendue : les listes de plusieurs centaines de
// lignes restent fluides.
import { useEffect, useMemo, useState } from 'react';
import { locale } from '../i18n/index.js';

const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });

export function compare(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

// sortValues : { cle: (ligne) => valeur }. resetKey : réinitialise la page
// quand il change (nouvelle recherche, nouveau filtre…).
export function useTable(rows, { sortValues, initialSort = null, pageSize = 100, resetKey = '' }) {
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [resetKey]);

  const tries = useMemo(() => {
    const f = sort && sortValues[sort.key];
    if (!f) return rows;
    const sens = sort.dir === 'desc' ? -1 : 1;
    // Tri stable : à valeur égale, l'ordre d'origine est conservé.
    return rows
      .map((r, i) => [r, i])
      .sort((a, b) => sens * compare(f(a[0]), f(b[0])) || a[1] - b[1])
      .map(([r]) => r);
  }, [rows, sort, sortValues]);

  const pages = Math.max(1, Math.ceil(tries.length / pageSize));
  const courante = Math.min(page, pages - 1);
  return {
    sort,
    toggleSort: (key) => {
      setPage(0);
      setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
    },
    rows: tries.slice(courante * pageSize, (courante + 1) * pageSize),
    total: tries.length,
    page: courante,
    pages,
    pageSize,
    setPage,
  };
}
