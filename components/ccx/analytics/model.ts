import { todayIso, type CallAnalyticsFull, type DashFilter } from "@/lib/services/dash";
import { dayBefore } from "@/lib/demoStats";

export type Period = "" | "today" | "d7" | "d30" | "d90" | "custom";
export type Mode = "" | "today" | "custom";
export type DrillKind = "total" | "answered" | "missed" | "avg";

export const PERIODS: Period[] = ["", "today", "d7", "d30", "d90", "custom"];

const SPAN: Record<"today" | "d7" | "d30" | "d90", number> = { today: 1, d7: 7, d30: 30, d90: 90 };

export const EMPTY_CALLS: CallAnalyticsFull = { fetchedAt: "", total: 0, answered: 0, missed: 0, avgDurationSec: 0, byDay: [], topAgents: [] };

export function mmss(s: number): string {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, "0")}`;
}

export function periodOf(f: DashFilter, mode: Mode): Period {
  const dated = Boolean(f.from || f.to);
  if (f.preset) return f.preset;
  if (mode === "today" && dated) return "today";
  if (mode === "custom" || dated) return "custom";
  return "";
}

export function modeOf(p: Period): Mode {
  return p === "custom" ? "custom" : p === "today" ? "today" : "";
}

export function applyPeriod(f: DashFilter, p: Period): DashFilter {
  if (p === "custom") return { ...f, preset: "" };
  if (p === "") return { ...f, from: "", to: "", preset: "" };
  const today = todayIso();
  return { ...f, from: dayBefore(today, SPAN[p] - 1), to: today, preset: p === "today" ? "" : p };
}

export function rates(a: CallAnalyticsFull): { answer: number; miss: number } {
  const answer = a.total ? Math.round((a.answered / a.total) * 100) : 0;
  return { answer, miss: a.total ? 100 - answer : 0 };
}

export function niceTicks(max: number, count = 4): number[] {
  const raw = Math.max(1, max) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = Math.max(1, (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag);
  const parts = Math.max(1, Math.ceil(max / step));
  return Array.from({ length: parts + 1 }, (_, i) => i * step);
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function smoothPath(pts: [number, number][]): string {
  const n = pts.length;
  if (!n) return "";
  if (n === 1) return `M${r1(pts[0][0])},${r1(pts[0][1])}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push(dx[i] ? (pts[i + 1][1] - pts[i][1]) / dx[i] : 0);
  }
  const tan: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) tan.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  tan.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      tan[i] = 0;
      tan[i + 1] = 0;
      continue;
    }
    const a = tan[i] / m[i];
    const b = tan[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      tan[i] = k * a * m[i];
      tan[i + 1] = k * b * m[i];
    }
  }
  let d = `M${r1(pts[0][0])},${r1(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${r1(pts[i][0] + h)},${r1(pts[i][1] + tan[i] * h)} ${r1(pts[i + 1][0] - h)},${r1(pts[i + 1][1] - tan[i + 1] * h)} ${r1(pts[i + 1][0])},${r1(pts[i + 1][1])}`;
  }
  return d;
}
