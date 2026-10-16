import { asArr, asDict, asNum } from "@/lib/http";
import type { LivePerson } from "@/lib/services/internalLive";

// The virtual monitor on an employee's desk (§10, §19): rebuilt from the
// safe route and workflow fields the heartbeat sends — never a screenshot,
// a form value or a message. The backend already strips and redacts; what
// is shown is redacted once more here, so a phone number, an e-mail or a
// token can never reach the screen by way of a label.

export type ScreenTab = { module: string; title: string; task: string; icon: string };
export type Screen = {
  module: string;
  icon: string;
  pageCode: string;
  pageTitle: string;
  section: string;
  task: string;
  workCode: string;
  route: string;
  progress: number | null;
  viewMode: string;
  at: string;
  tabs: ScreenTab[];
};

const PHONE = /\+?\d[\d\s()-]{7,}\d/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;
// A long run of digits is a phone number unless it reads as a date.
const phone = (m: string) => (/\d{4}-\d{2}-\d{2}/.test(m) || (!m.startsWith("+") && m.replace(/\D/g, "").length < 9) ? m : "•••");
export const safe = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v).trim().replace(JWT, "•••").replace(EMAIL, "•••").replace(PHONE, phone).slice(0, 140) : "");
const pick = (...vals: unknown[]) => {
  for (const v of vals) {
    const s = safe(v);
    if (s) return s;
  }
  return "";
};
// A route without its query or fragment.
const path = (v: unknown) => pick(v).replace(/[?#].*$/, "");

function tab(raw: unknown): ScreenTab | null {
  const d = asDict(raw);
  const c = asDict(d.screen_context);
  const t = { module: pick(d.module, c.module), title: pick(c.page_title, d.page_title, d.title), task: pick(c.task_label, d.task_label, d.action_label, d.action, d.label), icon: pick(c.icon_code, d.icon_code) };
  return t.module || t.title || t.task ? t : null;
}

export function screenOf(person: LivePerson, detail?: Record<string, unknown>): Screen | null {
  const r = person.raw;
  const emp = asDict(r.employee);
  const src = [r.virtual_monitor, r.monitor, asDict(r.presence).virtual_monitor, emp.virtual_monitor, detail?.virtual_monitor].find((x) => x && typeof x === "object" && Object.keys(asDict(x)).length);
  const d = asDict(src);
  const c = { ...asDict(r.screen_context), ...asDict(d.screen_context) };
  const a = person.activity;
  const mod = pick(d.module, c.module, a?.module);
  const task = pick(c.task_label, d.task_label, d.action_label, d.action, a?.label);
  if (!mod && !task && !Object.keys(c).length) return null;
  const p = c.progress ?? d.progress;
  const tabs = asArr(r.parallel_contexts ?? r.work_contexts ?? d.parallel_contexts ?? detail?.parallel_contexts)
    .map(tab)
    .filter((x): x is ScreenTab => !!x)
    .slice(0, 6);
  return {
    module: mod,
    icon: pick(c.icon_code, d.icon_code),
    pageCode: pick(c.page_code, d.page_code),
    pageTitle: pick(c.page_title, d.page_title),
    section: pick(c.section, d.section),
    task,
    workCode: pick(c.work_code, d.work_code, d.entity_id, a?.entityId),
    route: path(c.route ?? d.route ?? d.detail_url ?? a?.detailUrl),
    progress: p === undefined || p === null || p === "" ? null : Math.min(100, Math.max(0, asNum(p, 0))),
    viewMode: pick(c.view_mode, d.view_mode),
    at: pick(d.updated_at, d.last_seen_at, d.at, a?.at, person.lastSeenAt),
    tabs,
  };
}
