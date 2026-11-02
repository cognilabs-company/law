import type { useTranslations } from "next-intl";
import { TASK_STATUSES, type Task, type TaskCounts, type TaskError, type TaskPage, type TaskStatus } from "@/lib/services/taskManagement";

export type Tr = ReturnType<typeof useTranslations>;

export const PAGE = 30;
export const POLL_MS = 60_000;
export const ZERO: TaskCounts = { new: 0, in_progress: 0, testing: 0, ready: 0 };

export type Col = { items: Task[]; total: number; hasMore: boolean; busy: boolean };
export type Cols = Record<TaskStatus, Col>;
export type BoardState = { cols: Cols; counts: TaskCounts; ready: boolean; loading: boolean; error: string; legacy: boolean };

const EMPTY_COL: Col = { items: [], total: 0, hasMore: false, busy: false };
export const EMPTY_COLS: Cols = { new: EMPTY_COL, in_progress: EMPTY_COL, testing: EMPTY_COL, ready: EMPTY_COL };
export const EMPTY_BOARD: BoardState = { cols: EMPTY_COLS, counts: ZERO, ready: false, loading: true, error: "", legacy: false };

export function colsOf(pages: TaskPage[]): Cols {
  const out: Cols = { ...EMPTY_COLS };
  TASK_STATUSES.forEach((st, i) => {
    const p = pages[i];
    if (p) out[st] = { items: p.items, total: p.total, hasMore: p.hasMore, busy: false };
  });
  return out;
}

export function mapCols(cols: Cols, fn: (task: Task) => Task): Cols {
  const out: Cols = { ...cols };
  TASK_STATUSES.forEach((st) => {
    out[st] = { ...cols[st], items: cols[st].items.map(fn) };
  });
  return out;
}

export function loadedOf(cols: Cols): TaskCounts {
  return { new: cols.new.items.length, in_progress: cols.in_progress.items.length, testing: cols.testing.items.length, ready: cols.ready.items.length };
}

const holds = (b: BoardState, id: string) => TASK_STATUSES.some((st) => b.cols[st].items.some((x) => x.id === id));

export function dropTask(b: BoardState, id: string): BoardState {
  if (!holds(b, id)) return b;
  const cols: Cols = { ...b.cols };
  const counts: TaskCounts = { ...b.counts };
  TASK_STATUSES.forEach((st) => {
    const c = b.cols[st];
    if (!c.items.some((x) => x.id === id)) return;
    cols[st] = { ...c, items: c.items.filter((x) => x.id !== id), total: Math.max(0, c.total - 1) };
    counts[st] = Math.max(0, counts[st] - 1);
  });
  return { ...b, cols, counts };
}

export function placeTask(b: BoardState, task: Task): BoardState {
  if (!holds(b, task.id)) return b;
  const base = dropTask(b, task.id);
  const cols: Cols = { ...base.cols };
  const counts: TaskCounts = { ...base.counts };
  const c = base.cols[task.status];
  cols[task.status] = { ...c, items: [task, ...c.items], total: c.total + 1 };
  counts[task.status] = counts[task.status] + 1;
  return { ...base, cols, counts };
}

export function setColBusy(b: BoardState, st: TaskStatus, busy: boolean): BoardState {
  const cols: Cols = { ...b.cols };
  cols[st] = { ...b.cols[st], busy };
  return { ...b, cols };
}

export function appendCol(b: BoardState, st: TaskStatus, page: TaskPage): BoardState {
  const c = b.cols[st];
  const items = [...c.items, ...page.items.filter((x) => !c.items.some((y) => y.id === x.id))];
  const cols: Cols = { ...b.cols };
  cols[st] = { items, total: page.total, hasMore: page.hasMore, busy: false };
  return { ...b, cols };
}

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const PERIODS = ["today", "week", "month"] as const;
export type PeriodKey = (typeof PERIODS)[number];
export type Period = { key: PeriodKey | "custom" | ""; from: string; to: string };
export const NO_PERIOD: Period = { key: "", from: "", to: "" };

export function presetRange(key: PeriodKey): { from: string; to: string } {
  const now = new Date();
  if (key === "today") return { from: ymd(now), to: ymd(now) };
  if (key === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: ymd(start), to: ymd(end) };
  }
  return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
}

export function splitLocal(iso: string): { date: string; time: string } {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return { date: "", time: "" };
  return { date: ymd(d), time: hm(d) };
}

export function joinLocal(date: string, time: string): string {
  if (!date) return "";
  const d = new Date(`${date}T${time || "18:00"}:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export const DEADLINE_PRESETS = [
  { key: "today", days: 0, time: "18:00" },
  { key: "tomorrow", days: 1, time: "10:00" },
  { key: "days3", days: 3, time: "18:00" },
  { key: "week", days: 7, time: "18:00" },
] as const;

export type DeadlinePreset = { key: string; date: string; time: string };

export function deadlinePresets(): { today: string; presets: DeadlinePreset[] } {
  const now = new Date();
  return {
    today: ymd(now),
    presets: DEADLINE_PRESETS.map((p) => {
      const d = new Date(now);
      d.setDate(d.getDate() + p.days);
      return { key: p.key, date: ymd(d), time: p.time };
    }),
  };
}

export function errText(t: Tr, te: TaskError): string {
  return te.kind === "unavailable" ? t("err.unavailable") : te.kind === "network" ? t("err.network") : te.message || t("err.save");
}

export const isLate = (task: Task) => task.isOverdue && task.status !== "ready";

export function isSoon(task: Task, now: number): boolean {
  if (!now || !task.deadlineAt || task.status === "ready" || task.isOverdue) return false;
  const at = Date.parse(task.deadlineAt);
  return Number.isFinite(at) && at > now && at - now < 86_400_000;
}

const SCOPE_KEY = "lexgo_ccx_tasks_scope";
export const SCOPES = ["me", "", "unassigned"] as const;
export const isScope = (v: string) => (SCOPES as readonly string[]).includes(v);

export function readScope(): string {
  try {
    const v = localStorage.getItem(SCOPE_KEY);
    return v !== null && isScope(v) ? v : "me";
  } catch {
    return "me";
  }
}

export function saveScope(v: string) {
  if (!isScope(v)) return;
  try {
    localStorage.setItem(SCOPE_KEY, v);
  } catch {}
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";

export const toneOf = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % 3;

export const mb = (n: number) => `${Math.round((n / 1048576) * 10) / 10} MB`;
export const extOf = (name: string) => /\.[^.]+$/.exec(name.toLowerCase())?.[0] ?? "";
export const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
