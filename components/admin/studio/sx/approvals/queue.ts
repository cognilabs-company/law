import { matchesSearch } from "@/lib/searchText";
import type { StudioLabels } from "../useStudioLabels";
import { APPR_WORK, compareRows, type ApprRow, type ApprSection, type ApprWork } from "./model";
import type { ApprQuery } from "./urlState";

export const APPR_PAGE = 20;

export type ApprFilter = Pick<ApprQuery, "status" | "ctor" | "group" | "need" | "q" | "mine">;
export type ApprServed = { q: boolean; mine: boolean };

export const NOT_SERVED: ApprServed = { q: false, mine: false };

export function isFiltered(f: ApprFilter): boolean {
  return !!(f.status || f.ctor || f.group || f.need || f.q.trim() || f.mine);
}

export function rowMatches(row: ApprRow, f: ApprFilter, labels: Pick<StudioLabels, "ctorName" | "status">, served: ApprServed = NOT_SERVED): boolean {
  const byServer = row.src === "queue";
  if (f.status && row.status !== f.status) return false;
  if (f.ctor && row.code !== f.ctor) return false;
  if (f.group && row.group !== f.group) return false;
  if (f.need && row.kind !== f.need) return false;
  if (f.mine && !(byServer && served.mine) && row.section !== "mine") return false;
  if (!f.q.trim() || (byServer && served.q)) return true;
  return matchesSearch([row.title, labels.ctorName(row.code), row.code, row.by, row.version, labels.status(row.statusRaw)].join(" "), f.q);
}

export function sectionRows(rows: readonly ApprRow[], section: ApprSection): ApprRow[] {
  return rows.filter((r) => r.section === section).sort(compareRows);
}

export function workRows(rows: readonly ApprRow[]): ApprRow[] {
  return rows.filter((r) => r.section !== "done").sort(compareRows);
}

export function pageSlice<T>(rows: readonly T[], page: number, size: number = APPR_PAGE): { rows: T[]; from: number; to: number; total: number; page: number } {
  const per = Number.isFinite(size) && size > 0 ? Math.floor(size) : APPR_PAGE;
  const total = rows.length;
  const last = Math.max(0, Math.ceil(total / per) - 1);
  const at = Math.min(last, Math.max(0, Number.isFinite(page) ? Math.floor(page) : 0));
  const start = at * per;
  const slice = rows.slice(start, start + per);
  return { rows: slice, from: total ? start + 1 : 0, to: start + slice.length, total, page: at };
}

export function workCounts(rows: readonly ApprRow[]): Readonly<Record<ApprWork, number>> {
  const out: Record<ApprWork, number> = { review: 0, publish: 0, returned: 0 };
  for (const r of rows) if ((APPR_WORK as readonly string[]).includes(r.kind)) out[r.kind as ApprWork] += 1;
  return out;
}

export function showDone(f: ApprFilter): boolean {
  return !f.need && !f.mine && (!f.status || f.status === "published");
}

export function showWork(f: ApprFilter): boolean {
  return f.status !== "published";
}
