import type { GroupStepRow, GroupStepState } from "../groupModel";

export type GroupFilter = "" | GroupStepState;
export type GroupView = "steps" | "table";
export type GroupQuery = { f: GroupFilter; q: string; view: GroupView };

export const GROUP_FILTERS: readonly Exclude<GroupFilter, "">[] = ["done", "next", "open", "blocked"];
export const GROUP_Q_MAX = 120;
export const EMPTY_GROUP_QUERY: GroupQuery = { f: "", q: "", view: "steps" };

type Params = { get(name: string): string | null } | null | undefined;

export function groupQueryOf(sp: Params): GroupQuery {
  const f = (sp?.get("f") ?? "").trim();
  const view = (sp?.get("view") ?? "").trim();
  return {
    f: (GROUP_FILTERS as readonly string[]).includes(f) ? (f as GroupFilter) : "",
    q: (sp?.get("q") ?? "").slice(0, GROUP_Q_MAX),
    view: view === "table" ? "table" : "steps",
  };
}

export function writeGroupQuery(q: GroupQuery): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const p = url.searchParams;
  if (q.f) p.set("f", q.f);
  else p.delete("f");
  const term = q.q.trim() ? q.q.slice(0, GROUP_Q_MAX) : "";
  if (term) p.set("q", term);
  else p.delete("q");
  if (q.view === "table") p.set("view", "table");
  else p.delete("view");
  const qs = p.toString();
  const next = `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`;
  const now = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== now) window.history.replaceState(window.history.state, "", next);
}

export function fold(s: string): string {
  return s
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ʻʼ‘’`´']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesGroupQuery(row: GroupStepRow, q: GroupQuery, text: (row: GroupStepRow) => string): boolean {
  if (q.f && row.state !== q.f) return false;
  const term = fold(q.q);
  if (!term) return true;
  return fold(text(row)).includes(term);
}

export function stateCounts(rows: readonly GroupStepRow[]): Record<GroupStepState, number> {
  const out: Record<GroupStepState, number> = { done: 0, next: 0, open: 0, blocked: 0 };
  for (const r of rows) out[r.state] += 1;
  return out;
}
