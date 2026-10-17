export type SxSortDir = "asc" | "desc";
export type SxSortState = { key: string; dir: SxSortDir };
export type SxGroupHead = { key: string; title: string; meta?: unknown };

type Value = string | number | null | undefined;

function isBlank(v: Value): boolean {
  return v === null || v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v));
}

export function compareSortValues(a: Value, b: Value, locale: string): number {
  const blankA = isBlank(a);
  const blankB = isBlank(b);
  if (blankA || blankB) return blankA === blankB ? 0 : blankA ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), locale, { numeric: true, sensitivity: "base" });
}

export function sortRows<T>(rows: readonly T[], value: (row: T) => Value, dir: SxSortDir, locale: string): T[] {
  const sign = dir === "desc" ? -1 : 1;
  return rows
    .map((row, index) => ({ row, index, v: value(row) }))
    .sort((x, y) => {
      const bx = isBlank(x.v);
      const by = isBlank(y.v);
      if (bx || by) return bx === by ? x.index - y.index : bx ? 1 : -1;
      return compareSortValues(x.v, y.v, locale) * sign || x.index - y.index;
    })
    .map((x) => x.row);
}

export function nextSort(current: SxSortState | null, key: string): SxSortState {
  if (current && current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: "asc" };
}

export function groupRows<T, G extends SxGroupHead>(rows: readonly T[], groupOf: (row: T) => G): { group: G; rows: T[] }[] {
  const out: { group: G; rows: T[] }[] = [];
  for (const row of rows) {
    const group = groupOf(row);
    const last = out[out.length - 1];
    if (last && last.group.key === group.key) last.rows.push(row);
    else out.push({ group, rows: [row] });
  }
  return out;
}

const INTERACTIVE = "a,button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='menuitem'],[role='checkbox'],[role='switch'],[contenteditable='true']";

export function isInteractiveTarget(target: EventTarget | null, row: Element): boolean {
  if (!(target instanceof Element)) return false;
  if (!row.contains(target)) return true;
  const hit = target.closest(INTERACTIVE);
  return !!hit && hit !== row && row.contains(hit);
}
