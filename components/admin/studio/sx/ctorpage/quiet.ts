const TEST_TITLE = /(^|[^\p{L}])(test|тест|sinov)/iu;
const QUIET_STATUSES: ReadonlySet<string> = new Set(["archived", "deleted", "removed"]);

export function isTestTitle(title: string): boolean {
  return TEST_TITLE.test(String(title ?? "").trim());
}

export function isQuietStatus(status: string): boolean {
  return QUIET_STATUSES.has(String(status ?? "").trim().toLowerCase());
}

export function quietBand(title: string, status: string, isTest: boolean | null = null): 0 | 1 | 2 {
  if (isQuietStatus(status)) return 2;
  if (isTest ?? isTestTitle(title)) return 1;
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
