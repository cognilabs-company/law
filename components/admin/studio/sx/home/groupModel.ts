import type { StudioConstructor, StudioGroup, StudioJourney } from "@/lib/services/studio";

export type GroupStepState = "done" | "next" | "blocked" | "open";
export type GroupStepRow = { code: string; step: number; ctor: StudioConstructor | null; state: GroupStepState; missing: string[] };

const isBlocked = (ctor: StudioConstructor | null, missing: readonly string[]) => ctor?.availability === "blocked" || missing.length > 0;

function pickNext(nextCode: string, rows: readonly { code: string; done: boolean; blocked: boolean }[]): string {
  const named = nextCode ? rows.find((r) => r.code === nextCode) : undefined;
  if (named && !named.done) return named.code;
  return rows.find((r) => !r.done && !r.blocked)?.code ?? rows.find((r) => !r.done)?.code ?? "";
}

export function groupSteps(g: StudioGroup, items: readonly StudioConstructor[]): GroupStepRow[] {
  const byCode = new Map<string, StudioConstructor>();
  for (const c of items) if (c.code && !byCode.has(c.code)) byCode.set(c.code, c);
  const codes: string[] = [];
  for (const c of g.codes) if (c && !codes.includes(c)) codes.push(c);
  for (const c of items) if (c.code && c.navigation?.groupKey === g.key && !codes.includes(c.code)) codes.push(c.code);
  const sorted = codes
    .map((code, index) => {
      const ctor = byCode.get(code) ?? null;
      const nav = ctor?.navigation?.step ?? 0;
      return { code, index, ctor, nav, rank: nav > 0 ? nav : index + 1000 };
    })
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
  const facts = sorted.map((r) => {
    const missing = r.ctor ? [...r.ctor.missingRequired] : [];
    return { ...r, missing, done: r.ctor?.completed === true, blocked: isBlocked(r.ctor, missing) };
  });
  const next = pickNext(g.nextCode, facts);
  return facts.map((r, i) => ({
    code: r.code,
    step: r.nav > 0 ? r.nav : i + 1,
    ctor: r.ctor,
    missing: r.missing,
    state: r.done ? "done" : r.code === next ? "next" : r.blocked ? "blocked" : "open",
  }));
}

export function groupProgress(rows: readonly GroupStepRow[]): { done: number; total: number } {
  return { done: rows.filter((r) => r.state === "done").length, total: rows.length };
}

export function groupNext(g: StudioGroup, rows: readonly GroupStepRow[]): GroupStepRow | null {
  const facts = rows.map((r) => ({ code: r.code, done: r.state === "done", blocked: r.state === "blocked" || isBlocked(r.ctor, r.missing) }));
  const code = pickNext(g.nextCode, facts);
  return code ? (rows.find((r) => r.code === code) ?? null) : null;
}

export function groupOfCode(code: string, groups: readonly StudioGroup[], items: readonly StudioConstructor[]): string {
  const c = String(code ?? "").trim();
  if (!c) return "";
  const item = items.find((x) => x.code === c) ?? items.find((x) => x.code.toUpperCase() === c.toUpperCase());
  if (item?.navigation?.groupKey) return item.navigation.groupKey;
  const real = item?.code ?? c;
  return groups.find((g) => g.codes.includes(real))?.key ?? groups.find((g) => g.codes.some((x) => x.toUpperCase() === real.toUpperCase()))?.key ?? "";
}

export function launchSteps(j: StudioJourney, items: readonly StudioConstructor[]): GroupStepRow[] {
  const firstOpen = j.steps.findIndex((s) => !s.completed);
  return j.steps.map((s, i) => {
    const missing = [...s.missingRequired];
    const state: GroupStepState = s.completed ? "done" : i === firstOpen ? "next" : s.blocked || missing.length ? "blocked" : "open";
    return { code: s.code, step: s.step, ctor: items.find((c) => c.code === s.code) ?? null, state, missing };
  });
}
