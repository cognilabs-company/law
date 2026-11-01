// A record counts as a test one only when the backend says so (is_test).
// There is no persisted test flag behind most records yet (backend answers
// 2026-11-01 G7), and a name is not one: "test" in a title proves nothing.
const QUIET_STATUSES: ReadonlySet<string> = new Set(["archived", "deleted", "removed"]);

export function isQuietStatus(status: string): boolean {
  return QUIET_STATUSES.has(String(status ?? "").trim().toLowerCase());
}

export function quietBand(title: string, status: string, isTest: boolean | null = null): 0 | 1 | 2 {
  void title; // kept so call sites stay uniform; the name decides nothing
  if (isQuietStatus(status)) return 2;
  if (isTest === true) return 1;
  return 0;
}

export function quietLastBy<T>(rows: readonly T[], band: (r: T) => number): T[] {
  return rows
    .map((row, index) => ({ row, index, band: band(row) }))
    .sort((a, b) => a.band - b.band || a.index - b.index)
    .map((x) => x.row);
}

export function quietLast<T>(rows: readonly T[], title: (r: T) => string, status: (r: T) => string, isTest?: (r: T) => boolean | null): T[] {
  return quietLastBy(rows, (r) => quietBand(title(r), status(r), isTest?.(r) ?? null));
}

export function isQuietRow(title: string, status: string, isTest: boolean | null = null): boolean {
  return quietBand(title, status, isTest) > 0;
}
