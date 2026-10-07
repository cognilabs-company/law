import { ApiError, asArr, isAborted, isRouteMissing, logApiError, type Dict } from "@/lib/http";
import { getGuide, startTour, stopTour } from "@/lib/guide/store";
import { onGuideEvent, type GuideEvent, type TourEndReason } from "@/lib/guide/events";
import { guideHref, normPath, routeAllowed, routeForKey, samePath } from "@/lib/guide/routes";
import { revealTarget, settle } from "@/lib/guide/targets";
import type { GuideRole, GuideStep, GuideTour } from "@/lib/guide/types";
import { createSupportTicket, supportCategoryFor, type SupportTicket } from "@/lib/services/support";
import { confirmInstructorAction, isConfirmExpired, previewInstructorAction } from "@/lib/services/instructorV21";
import { toast } from "@/lib/toast";
import { aiSeg } from "./ids";
import { aiField, aiModalOpener } from "./registry";
import { legacyAliases } from "./aliases";
import { resolveAiTarget } from "./resolve";
import { domQuiet, modalAiId, openModalRoot } from "./dom";
import { aiLabel, currentRoute, nativeField, sensitiveInput, sensitiveName } from "./manifest";
import { askAction, askFill, dismissPrompts, freeAction } from "./prompts";
import { flushRuntime, queueAiEvent, setQueueRunning } from "./runtime";
import { markExecuted, wasExecuted, type AiScope } from "./session";
import { SELF_TARGET_BLOCKED, selfTargetBlocked } from "./self";
import { AI_COMMAND_TYPES, type ActionPreview, type ActionResult, type AiCommand, type AiEventType, type AiStep, type CmdState, type CmdStatus, type InstructorContract } from "./types";

export type RunLabels = {
  ticketCreated: (id: string) => string;
  ticketCreatedPlain: string;
  ticketShown: string;
  ticketWrite: string;
  actionDone?: (action: string, workId: string) => string;
};

export type AiHandoffTurn = { q: string; a: string; at?: string };

export type AiHandoff = { ai_history: AiHandoffTurn[]; ai_session_id: string };

export type RunCtx = {
  scope: AiScope;
  sessionId: string;
  role: GuideRole;
  contract: InstructorContract | null;
  message: string;
  answer: string;
  source?: "http" | "ws";
  captionFor?: (target: string) => string;
  closePanel?: () => void;
  labels?: RunLabels;
  handoffUi?: boolean;
  handoff?: () => AiHandoff;
  onTicket?: (ticketId: string, workId: string) => void;
};

export type RunSummary = { done: number; missing: number; failed: number; cancelled: number; skipped: number };

type Kind = "run" | "skip" | "dup" | "unknown" | "invalid" | "blocked";
type Step = { stop: boolean; reason: string };

const KNOWN = new Set<string>(AI_COMMAND_TYPES);
const STEP_TYPES = new Set(["highlight", "tooltip", "scroll_to", "focus_input"]);
const SELF_GUARDED = new Set(["highlight", "tooltip", "scroll_to", "focus_input", "open_modal"]);
const BACKEND_FLAGGED = new Set(["preview_action", "confirm_required", "support_handoff"]);
const FINAL = new Set<CmdStatus>(["done", "missing", "failed", "cancelled", "skipped"]);
const STATUSES = new Set<string>(["pending", "running", "done", "missing", "failed", "cancelled", "skipped"]);
const WS_BLOCKED = new Set(["preview_action", "confirm_required", "fill_form"]);
const OK: Step = { stop: false, reason: "" };
const MISSING_REASON = "DOM element with data-ai-id was not found";
const TG_MODAL = "pricing.telegram-request-modal";
const STATUS_KEY = "lexgo_ai_cmd_status";
const STATUS_MAX = 300;
const SUPPORT_ACTION = "start_support_ticket";
const HANDOFF_TURNS = 10;
const HANDOFF_CHARS = 600;
const SECRET_MIN = 4;
const TEXT_FIELD = "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([type=file]):not([type=range]):not([type=color]),textarea,[contenteditable=true],[contenteditable='']";

const isDict = (v: unknown): v is Dict => Boolean(v) && typeof v === "object" && !Array.isArray(v);

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

const tidy = (s: string) =>
  s
    .split(/\r?\n/)
    .map(squash)
    .filter(Boolean)
    .join("\n");

function privateValues(): string[] {
  if (typeof document === "undefined") return [];
  const out = new Set<string>();
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(TEXT_FIELD))) {
    if (!sensitiveInput(el)) continue;
    const raw = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : el.textContent || "";
    const v = squash(raw);
    if (v.length >= SECRET_MIN) out.add(v);
  }
  return [...out].sort((a, b) => b.length - a.length);
}

function scrubTurn(text: string, secrets: string[]): string {
  const flat = squash(text);
  let s = secrets.some((v) => flat.includes(v)) ? flat : tidy(text);
  for (const v of secrets) if (s.includes(v)) s = s.split(v).join("***");
  return s.length > HANDOFF_CHARS ? `${s.slice(0, HANDOFF_CHARS - 1).trimEnd()}…` : s;
}

const textOf = (v: unknown) => (typeof v === "string" ? v : "");

export function aiHandoff(turns: AiHandoffTurn[], sessionId: string): AiHandoff {
  const live = turns.filter((x) => squash(textOf(x.q)) || squash(textOf(x.a))).slice(-HANDOFF_TURNS);
  const secrets = live.length ? privateValues() : [];
  const ai_history = live.map((x) => {
    const at = textOf(x.at).trim();
    return { q: scrubTurn(textOf(x.q), secrets), a: scrubTurn(textOf(x.a), secrets), ...(at ? { at } : {}) };
  });
  return { ai_history, ai_session_id: sessionId };
}

function sharesHistory(payload: Dict): boolean {
  const ctx = payload.context;
  return isDict(ctx) && Array.isArray(ctx.ai_history) && ctx.ai_history.length > 0;
}

function pick(...vals: unknown[]): string {
  for (const v of vals) {
    const s = typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
    if (s) return s;
  }
  return "";
}

function num(...vals: unknown[]): number | null {
  for (const v of vals) {
    const n = typeof v === "number" ? v : typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim()) ? parseFloat(v) : NaN;
    if (Number.isFinite(n)) return n;
  }
  return null;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function normFields(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (k: string, val: unknown) => {
    const key = k.trim();
    const s = typeof val === "string" ? val : typeof val === "number" && Number.isFinite(val) ? String(val) : null;
    if (key && s !== null && !(key in out)) out[key] = s;
  };
  if (Array.isArray(v)) {
    for (const item of v) if (isDict(item)) put(pick(item.ai_id, item.target, item.field, item.name, item.id), item.value);
  } else if (isDict(v)) {
    for (const [k, val] of Object.entries(v)) put(k, val);
  }
  return out;
}

function normSteps(v: unknown): AiStep[] {
  const out: AiStep[] = [];
  for (const item of asArr(v)) {
    const text = typeof item === "string" ? item.trim() : isDict(item) ? pick(item.text, item.title, item.caption, item.label, item.description, item.step) : "";
    const target = isDict(item) ? pick(item.target, item.ai_id, item.target_id) : "";
    if (text || target) out.push({ text: text.slice(0, 240), target });
    if (out.length >= 8) break;
  }
  return out;
}

export function normCommand(v: unknown, index: number, batch: string): AiCommand | null {
  if (!isDict(v)) return null;
  let type = pick(v.type, v.command_type, v.command, v.kind).toLowerCase();
  let action = pick(v.action, v.action_type, v.action_name);
  if (!type && KNOWN.has(action.toLowerCase())) {
    type = action.toLowerCase();
    action = "";
  }
  if (!type) return null;
  return {
    id: pick(v.id, v.command_id) || `${batch}:${index}`,
    type,
    status: pick(v.status).toLowerCase() || "pending",
    requiresFrontend: v.requires_frontend !== false,
    href: pick(v.href, v.route, v.path, v.url),
    routeKey: pick(v.route_key),
    target: pick(v.target, v.target_id, v.ai_id, v.target_ai_id, v.element, v.element_id),
    modal: pick(v.modal, v.modal_id),
    text: pick(v.text, v.message, v.caption, v.tooltip, v.label, v.title),
    style: pick(v.style).toLowerCase(),
    durationMs: num(v.duration_ms, v.duration) ?? 0,
    fields: normFields(v.fields ?? v.values ?? v.form),
    action,
    payload: isDict(v.payload) ? v.payload : isDict(v.params) ? v.params : {},
    requiresConfirmation: v.requires_confirmation !== false,
    steps: normSteps(v.steps ?? v.items),
    reason: pick(v.reason),
    category: pick(v.category),
  };
}

export function normCommands(raw: unknown[], batch: string): AiCommand[] {
  const out: AiCommand[] = [];
  const ids = new Set<string>();
  raw.forEach((v, i) => {
    const c = normCommand(v, i, batch);
    if (!c) return;
    if (ids.has(c.id)) c.id = `${c.id}:${i}`;
    ids.add(c.id);
    out.push(c);
  });
  return out.slice(0, 20);
}

let statusSnap: ReadonlyMap<string, CmdState> | null = null;
const statusListeners = new Set<() => void>();

function loadStatuses(): Map<string, CmdState> {
  const map = new Map<string, CmdState>();
  try {
    const raw = typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(STATUS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (isDict(parsed)) {
      for (const [id, v] of Object.entries(parsed)) {
        const st = typeof v === "string" && STATUSES.has(v) ? (v as CmdStatus) : "cancelled";
        const live = st === "running" || st === "pending";
        map.set(id, { status: live ? "cancelled" : st, reason: live ? "interrupted" : "" });
      }
    }
  } catch {
    return map;
  }
  return map;
}

function statuses(): ReadonlyMap<string, CmdState> {
  if (!statusSnap) statusSnap = loadStatuses();
  return statusSnap;
}

function persistStatuses(map: ReadonlyMap<string, CmdState>): void {
  try {
    const entries = [...map.entries()].slice(-STATUS_MAX).map(([id, s]) => [id, s.status]);
    sessionStorage.setItem(STATUS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    return;
  }
}

export function cmdStatusSnapshot(): ReadonlyMap<string, CmdState> {
  return statuses();
}

const EMPTY_STATUS: ReadonlyMap<string, CmdState> = new Map();

export function cmdStatusServerSnapshot(): ReadonlyMap<string, CmdState> {
  return EMPTY_STATUS;
}

export function subscribeCmdStatus(fn: () => void): () => void {
  statusListeners.add(fn);
  return () => {
    statusListeners.delete(fn);
  };
}

function isFinal(id: string): boolean {
  const s = statuses().get(id);
  return Boolean(s && FINAL.has(s.status));
}

function setStatus(id: string, status: CmdStatus, reason = ""): void {
  const cur = statuses().get(id);
  if (cur && FINAL.has(cur.status)) return;
  if (cur && cur.status === status && cur.reason === reason) return;
  const next = new Map(statuses());
  next.delete(id);
  next.set(id, { status, reason });
  statusSnap = next;
  persistStatuses(next);
  statusListeners.forEach((fn) => fn());
}

function post(ctx: RunCtx, c: AiCommand, type: AiEventType, details: Dict = {}, target = ""): void {
  const status = type === "command_completed" || type === "element_clicked" ? "completed" : type === "command_cancelled" ? "cancelled" : "failed";
  const tgt = target || c.target || c.modal;
  const route = currentRoute();
  const reason = typeof details.reason === "string" ? details.reason : "";
  queueAiEvent({
    session_id: ctx.sessionId,
    event_type: type,
    command_id: c.id,
    command_type: c.type,
    status,
    ...(tgt ? { target: tgt } : {}),
    ...(reason ? { reason } : {}),
    current_route: route,
    details: { route, ...details },
  });
}

function selfBlocked(c: AiCommand, message: string): boolean {
  const target = c.target || c.modal;
  return SELF_GUARDED.has(c.type) && Boolean(target) && selfTargetBlocked(target, message);
}

function blockSelf(ctx: RunCtx, c: AiCommand): void {
  if (isFinal(c.id)) return;
  setStatus(c.id, "skipped", SELF_TARGET_BLOCKED);
  markExecuted(c.id, ctx.scope);
  post(ctx, c, "command_cancelled", { reason: SELF_TARGET_BLOCKED });
}

function settleCmd(ctx: RunCtx, c: AiCommand, status: CmdStatus, reason: string): boolean {
  if (isFinal(c.id)) return false;
  setStatus(c.id, status, reason);
  markExecuted(c.id, ctx.scope);
  return true;
}

function completed(ctx: RunCtx, c: AiCommand, details: Dict = {}, target = ""): void {
  if (settleCmd(ctx, c, "done", "")) post(ctx, c, "command_completed", details, target);
}

function targetMissing(ctx: RunCtx, c: AiCommand, reason = MISSING_REASON, extra: Dict = {}): void {
  if (settleCmd(ctx, c, "missing", "target_missing")) post(ctx, c, "target_missing", { reason, target_found: false, ...extra });
}

function commandFailed(ctx: RunCtx, c: AiCommand, reason: string, extra: Dict = {}): void {
  if (settleCmd(ctx, c, "failed", reason)) post(ctx, c, "command_failed", { reason, ...extra });
}

function commandCancelled(ctx: RunCtx, c: AiCommand, reason: string): void {
  if (settleCmd(ctx, c, "cancelled", reason)) post(ctx, c, "command_cancelled", { reason });
}

let tourSeq = 0;
const newTourId = () => `ai${Date.now().toString(36)}${(++tourSeq).toString(36)}`;
const ownTours = new Set<string>();

function playTour(tour: GuideTour, signal: AbortSignal, ctx: RunCtx, onEvent?: (e: GuideEvent) => void): Promise<TourEndReason> {
  if (!tour.navigate && !tour.steps.length) return Promise.resolve("done");
  ownTours.add(tour.id);
  const capMs = Math.min(180000, 15000 + tour.steps.length * 22000);
  return new Promise<TourEndReason>((resolve) => {
    let finished = false;
    let started = false;
    let off: () => void = () => {};
    let cap = 0;
    let grace = 0;
    const finish = (r: TourEndReason) => {
      if (finished) return;
      finished = true;
      off();
      window.clearTimeout(cap);
      window.clearTimeout(grace);
      signal.removeEventListener("abort", kill);
      ownTours.delete(tour.id);
      resolve(r);
    };
    function kill() {
      if (!started) {
        finish("stopped");
        return;
      }
      if (getGuide().tour?.id === tour.id) stopTour();
      grace = window.setTimeout(() => finish("stopped"), 1500);
    }
    off = onGuideEvent((e) => {
      if (e.tourId !== tour.id) return;
      if (e.type === "tour_end") {
        finish(e.reason);
        return;
      }
      onEvent?.(e);
    });
    signal.addEventListener("abort", kill);
    cap = window.setTimeout(kill, capMs);
    ctx.closePanel?.();
    window.setTimeout(() => {
      if (finished) return;
      if (signal.aborted) {
        finish("stopped");
        return;
      }
      started = true;
      startTour(tour);
    }, 60);
  });
}

const touch = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

function stepFor(c: AiCommand, ctx: RunCtx): GuideStep {
  const caption = c.text || ctx.captionFor?.(c.target) || "";
  if (c.type === "tooltip") return { target: c.target, caption, commandId: c.id, holdMs: clamp(c.durationMs || 5000, 1500, 15000) };
  if (c.type === "scroll_to") return { target: c.target, caption, commandId: c.id, holdMs: clamp(c.durationMs || 1200, 800, 5000), style: "soft", focusMode: "none" };
  if (c.type === "focus_input") return { target: c.target, caption, commandId: c.id, holdMs: clamp(c.durationMs || 1600, 800, 6000), style: "soft", focusMode: "force" };
  return { target: c.target, caption, commandId: c.id, holdMs: clamp(c.durationMs || 6000, 1500, 15000), style: c.style.includes("pulse") ? "pulse" : undefined };
}

function navTarget(raw: string, ctx: RunCtx): string {
  const to = raw ? guideHref(raw, ctx.role) : "";
  if (!to) return "";
  if (ctx.contract && !routeAllowed(to, ctx.contract.allowedRoutes, ctx.role)) return "";
  return to;
}

function hereIs(href: string): boolean {
  const qi = href.indexOf("?");
  const query = qi >= 0 ? href.slice(qi).split("#")[0] : "";
  return samePath(window.location.pathname, href) && (!query || window.location.search === query);
}

function endReasonText(r: TourEndReason, abortReason: string): string {
  switch (r) {
    case "done":
      return "";
    case "user_stop":
      return "user_stopped";
    case "route_change":
      return "route_changed";
    case "replaced":
      return "superseded";
    case "nav_failed":
      return "navigation_failed";
    case "clicked":
      return "element_clicked";
    default:
      return abortReason || "stopped";
  }
}

type Run = { ctrl: AbortController; reason: string; followUps: Set<string> };

let current: Run | null = null;

export function commandsRunning(): boolean {
  return current !== null;
}

export function abortCommands(reason = "superseded"): void {
  const run = current;
  if (!run) return;
  run.reason = reason;
  run.ctrl.abort();
  dismissPrompts();
  const g = getGuide();
  if (g.tour && ownTours.has(g.tour.id)) stopTour();
}

async function runSegment(seg: AiCommand[], ctx: RunCtx, run: Run): Promise<Step> {
  const signal = run.ctrl.signal;
  const nav = seg[0].type === "navigate" ? seg[0] : null;
  const steps = nav ? seg.slice(1) : seg;
  let href = "";
  if (nav) {
    setStatus(nav.id, "running");
    const to = navTarget(nav.href || (nav.routeKey ? routeForKey(nav.routeKey, ctx.role) : ""), ctx);
    if (!to) {
      commandFailed(ctx, nav, "route_not_allowed", { requested_href: nav.href || nav.routeKey });
      steps.forEach((s) => commandCancelled(ctx, s, "route_not_allowed"));
      return OK;
    }
    if (hereIs(to)) completed(ctx, nav, { already_there: true });
    else href = to;
  }
  if (!href && !steps.length) return OK;
  steps.forEach((s) => setStatus(s.id, "running"));
  let chain: Promise<void> = Promise.resolve();
  const later = (fn: () => void | Promise<void>) => {
    chain = chain.then(fn).catch((e: unknown) => logApiError("ai instructor segment", e));
  };
  const tour: GuideTour = { id: newTourId(), source: "instructor21", navigate: href || undefined, steps: steps.map((s) => stepFor(s, ctx)), reply: ctx.answer };
  const end = await playTour(tour, signal, ctx, (e) => {
    if (e.type === "nav_ok" && nav) {
      later(async () => {
        if (!e.already) await domQuiet(2000, 300, signal);
        await flushRuntime(true);
        completed(ctx, nav, { href: normPath(e.href) });
      });
    } else if (e.type === "nav_failed" && nav) {
      later(() => commandFailed(ctx, nav, e.reason, { href: e.href }));
    } else if (e.type === "step_shown") {
      const s = steps[e.index];
      if (!s || s.id !== e.commandId) return;
      if (s.type === "focus_input" && !e.focused) {
        later(() => commandFailed(ctx, s, "not_focusable", { target_found: true }));
        return;
      }
      const details: Dict = { target_found: true, resolved_by: e.by, requested_target: s.target, resolved_target: e.canonical };
      if (s.type === "focus_input" && touch()) details.keyboard = "not_guaranteed";
      later(() => completed(ctx, s, details));
    } else if (e.type === "step_missing") {
      const s = steps[e.index];
      if (!s || s.id !== e.commandId) return;
      later(async () => {
        targetMissing(ctx, s);
        await flushRuntime(true, { bypassHash: true });
      });
    } else if (e.type === "step_clicked") {
      const s = steps[e.index];
      if (s && s.id === e.commandId) later(() => post(ctx, s, "element_clicked", { target_found: true }, e.target));
    }
  });
  await chain;
  const reason = endReasonText(end, run.reason);
  seg.forEach((c) => commandCancelled(ctx, c, reason || "interrupted"));
  return end === "done" ? OK : { stop: true, reason: reason || "stopped" };
}

function waitFor(pred: () => boolean, ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (pred()) return resolve(true);
    const t0 = Date.now();
    const id = window.setInterval(() => {
      if (signal.aborted) {
        window.clearInterval(id);
        resolve(false);
        return;
      }
      if (pred()) {
        window.clearInterval(id);
        resolve(true);
        return;
      }
      if (Date.now() - t0 > ms) {
        window.clearInterval(id);
        resolve(false);
      }
    }, 120);
  });
}

function strictTarget(id: string): HTMLElement | null {
  const hit = resolveAiTarget(id, true, false);
  return hit && (hit.by === "exact" || hit.by === "alias") ? hit.el : null;
}

function modalIsOpen(id: string): boolean {
  const root = openModalRoot();
  if (!root) return false;
  if (modalAiId(root) === id) return true;
  const el = strictTarget(id);
  return Boolean(el && root.contains(el));
}

async function openModal(c: AiCommand, ctx: RunCtx, signal: AbortSignal): Promise<Step> {
  const id = c.modal || c.target;
  if (!id) {
    commandFailed(ctx, c, "missing_target");
    return OK;
  }
  if (modalIsOpen(id)) {
    completed(ctx, c, { already_open: true, target_found: true }, id);
    return OK;
  }
  const opener = aiModalOpener(id) ?? legacyAliases(id).map((a) => aiModalOpener(a.id)).find((fn) => Boolean(fn)) ?? null;
  let tried = false;
  if (opener) {
    opener();
    tried = true;
  } else tried = await revealTarget(id);
  if (!tried) {
    targetMissing(ctx, c, "no_opener");
    return OK;
  }
  const ok = await waitFor(() => modalIsOpen(id), 3000, signal);
  if (signal.aborted) return { stop: true, reason: "aborted" };
  if (!ok) {
    targetMissing(ctx, c, "modal_not_opened");
    return OK;
  }
  completed(ctx, c, { target_found: true }, id);
  await flushRuntime(true);
  return OK;
}

function setNative(el: HTMLElement, value: string): void {
  if (el instanceof HTMLSelectElement) {
    const opt = Array.from(el.options).find((o) => o.value === value || o.text.trim() === value.trim());
    if (!opt) throw new Error("no_option");
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(el, opt.value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

type Prepared = { aiId: string; label: string; value: string; apply: () => void; el: HTMLElement | null };

async function fillForm(c: AiCommand, ctx: RunCtx, signal: AbortSignal): Promise<Step> {
  const rows: Prepared[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const [aiId, value] of Object.entries(c.fields).slice(0, 10)) {
    if (!value.trim() || value.length > 500) {
      skipped.push({ id: aiId, reason: "invalid_value" });
      continue;
    }
    if (sensitiveName(aiId)) {
      skipped.push({ id: aiId, reason: "sensitive" });
      continue;
    }
    const el = strictTarget(aiId);
    const reg = aiField(aiId);
    if (reg) {
      if (reg.disabled || reg.fillable === false) {
        skipped.push({ id: aiId, reason: "not_fillable" });
        continue;
      }
      rows.push({ aiId, value, label: (el && aiLabel(el)) || aiId, apply: () => reg.set(value), el });
      continue;
    }
    const field = el ? nativeField(el) : null;
    if (!field) {
      skipped.push({ id: aiId, reason: el ? "not_fillable" : "target_missing" });
      continue;
    }
    if (field.tagName === "TEXTAREA" || sensitiveInput(field) || field.matches("[disabled],[readonly]")) {
      skipped.push({ id: aiId, reason: "not_fillable" });
      continue;
    }
    rows.push({ aiId, value, label: aiLabel(field) || (el && aiLabel(el)) || aiId, apply: () => setNative(field, value), el: field });
  }
  if (!rows.length) {
    commandFailed(ctx, c, "field_not_fillable", { skipped });
    return OK;
  }
  const ok = await askFill({ commandId: c.id, rows: rows.map(({ aiId, label, value }) => ({ aiId, label, value })) });
  if (signal.aborted) return { stop: true, reason: "aborted" };
  if (!ok) {
    commandCancelled(ctx, c, "user_declined");
    return OK;
  }
  const filled: string[] = [];
  for (const r of rows) {
    try {
      r.apply();
      filled.push(r.aiId);
    } catch {
      skipped.push({ id: r.aiId, reason: "apply_failed" });
    }
  }
  const first = rows.find((r) => r.el?.isConnected)?.el;
  if (first) await settle(first, signal);
  await flushRuntime(true);
  if (filled.length) completed(ctx, c, { filled, skipped });
  else commandFailed(ctx, c, "field_not_fillable", { skipped });
  return OK;
}

function supportPath(ctx: RunCtx, ticketId: string): string {
  const base = ctx.role === "staff" ? "/admin/call-center/support" : `/portal/${ctx.role}/support`;
  return `${base}${ticketId ? `?ticket=${encodeURIComponent(ticketId)}` : ""}`;
}

function showTicket(ctx: RunCtx, ticketId: string, workId: string): void {
  ctx.onTicket?.(ticketId, workId);
  const l = ctx.labels;
  if (l) toast(workId ? l.ticketCreated(workId) : l.ticketCreatedPlain, { tone: "ok" });
  const tour: GuideTour = {
    id: newTourId(),
    source: "local",
    navigate: supportPath(ctx, ticketId),
    steps: [
      { target: "support:chat", caption: l?.ticketShown ?? "", focus: false },
      { target: "support:message-input", caption: l?.ticketWrite ?? "", focus: true },
    ],
  };
  ctx.closePanel?.();
  window.setTimeout(() => startTour(tour), 60);
}

function guidedPlan(action: string, payload: Dict, ctx: RunCtx): { href: string; target: string } {
  const str = (...keys: string[]) => pick(...keys.map((k) => payload[k]));
  if (action === "prepare_subscription_purchase") {
    const slug = str("plan_slug", "slug", "plan");
    return { href: navTarget(`/portal/${ctx.role === "staff" ? "client" : ctx.role}/subscription`, ctx), target: slug ? `pricing.plan.${aiSeg(slug)}.buy` : "" };
  }
  if (action === "prepare_marketplace_purchase") {
    const seller = str("seller_user_id", "seller_id", "lawyer_user_id", "lawyer_id");
    const service = str("service_id", "marketplace_service_id");
    return {
      href: navTarget(seller ? `/portal/client/lawyers/${encodeURIComponent(seller)}` : "/portal/client/lawyers", ctx),
      target: seller && service ? `marketplace.seller.${aiSeg(seller)}.service.${aiSeg(service)}.buy` : seller ? `marketplace.seller.${aiSeg(seller)}` : "marketplace.results",
    };
  }
  if (action === "prepare_urgent_advokat_request") {
    const kind = str("service_kind", "kind", "service", "service_type");
    return { href: navTarget("/portal/client/urgent", ctx), target: kind ? `urgent_advokat.service.${aiSeg(kind).replace(/_/g, "-")}` : "urgent_advokat.services" };
  }
  if (action === "start_document_request") {
    const service = str("service_id");
    return {
      href: navTarget(service ? `/portal/client/services/document/${encodeURIComponent(service)}` : "/portal/client/services", ctx),
      target: service ? "documents.constructor.generate" : "documents.search.input",
    };
  }
  return { href: "", target: "" };
}

async function guided(c: AiCommand, ctx: RunCtx, run: Run, payload: Dict): Promise<Step> {
  const plan = guidedPlan(c.action, payload, ctx);
  const href = plan.href && !hereIs(plan.href) ? plan.href : "";
  if (!href && !plan.target) {
    commandFailed(ctx, c, "actions_unavailable");
    return OK;
  }
  const tour: GuideTour = {
    id: newTourId(),
    source: "instructor21",
    navigate: href || undefined,
    steps: plan.target ? [{ target: plan.target, caption: c.text, holdMs: 6000, style: "pulse" }] : [],
    reply: ctx.answer,
  };
  const seen = { shown: false, missing: false, navFailed: "" };
  const end = await playTour(tour, run.ctrl.signal, ctx, (e) => {
    if (e.type === "step_shown") seen.shown = true;
    else if (e.type === "step_missing") seen.missing = true;
    else if (e.type === "nav_failed") seen.navFailed = e.reason;
  });
  const reason = endReasonText(end, run.reason);
  const details: Dict = { mode: "guided", executed: false, target: plan.target || undefined };
  if (seen.shown || (end === "done" && !seen.missing)) completed(ctx, c, details);
  else if (seen.missing) {
    targetMissing(ctx, c, MISSING_REASON, details);
    await flushRuntime(true, { bypassHash: true });
  } else if (seen.navFailed) commandFailed(ctx, c, seen.navFailed, details);
  else commandCancelled(ctx, c, reason || "stopped");
  return end === "done" ? OK : { stop: true, reason: reason || "stopped" };
}

async function fallbackTicket(c: AiCommand, ctx: RunCtx, run: Run, payload: Dict): Promise<Step> {
  const message = pick(payload.message, payload.text, payload.subject) || ctx.message;
  const category = pick(payload.category, c.category) || supportCategoryFor(currentRoute(), message);
  const holder: { ticket: SupportTicket | null } = { ticket: null };
  const context: Dict = { current_path: currentRoute(), ...(isDict(payload.context) ? payload.context : {}) };
  const ok = await askAction(
    { commandId: c.id, action: SUPPORT_ACTION, generic: false, text: c.text, preview: null, free: true, sharesHistory: sharesHistory(payload) },
    {
      confirm: async () => {
        holder.ticket = await createSupportTicket({ message, category, priority: "normal", source: "ai_platform_instructor", context });
      },
    },
  );
  if (!ok) {
    commandCancelled(ctx, c, run.ctrl.signal.aborted ? run.reason || "aborted" : "user_declined");
    return { stop: true, reason: "user_declined" };
  }
  const tk = holder.ticket;
  completed(ctx, c, { confirmed: true, mode: "fallback_ticket", result_ref: tk?.id || undefined });
  showTicket(ctx, tk?.id ?? "", tk?.workId ?? "");
  return OK;
}

function actionPayload(c: AiCommand, ctx: RunCtx): Dict {
  const payload: Dict = { ...c.payload };
  if (c.action === "prepare_subscription_purchase" && !pick(payload.plan_slug, payload.plan_id, payload.slug, payload.plan)) {
    const m = /^pricing\.plan\.([^.]+)$/.exec(c.target);
    if (m) payload.plan_slug = m[1];
  }
  if (c.action !== SUPPORT_ACTION) return payload;
  const message = pick(payload.message, payload.text) || ctx.message;
  if (!pick(payload.message)) payload.message = message;
  if (!pick(payload.category)) payload.category = c.category || supportCategoryFor(currentRoute(), message);
  const handoff = ctx.handoff?.();
  if (handoff) payload.context = { ...(isDict(payload.context) ? payload.context : {}), current_path: currentRoute(), ...handoff };
  return payload;
}

function followable(x: AiCommand): boolean {
  const target = x.target || x.modal;
  return x.type === "navigate" || !target.startsWith(TG_MODAL) || modalIsOpen(TG_MODAL);
}

async function mutate(c: AiCommand, ctx: RunCtx, run: Run, list: AiCommand[], at: number): Promise<Step> {
  const signal = run.ctrl.signal;
  const blocking = c.type === "confirm_required";
  if (!c.action) {
    if (!blocking) {
      commandFailed(ctx, c, "missing_action");
      return OK;
    }
    const ok = await askAction({ commandId: c.id, action: "", generic: true, text: c.text, preview: null, free: false }, { confirm: async () => undefined });
    if (!ok) {
      commandCancelled(ctx, c, signal.aborted ? run.reason || "aborted" : "user_declined");
      return { stop: true, reason: "user_declined" };
    }
    completed(ctx, c, { confirmed: true });
    return OK;
  }
  const payload = actionPayload(c, ctx);
  const target = c.target ? { target: c.target } : {};
  let preview: ActionPreview;
  try {
    preview = await previewInstructorAction({ session_id: ctx.sessionId, command_id: c.id, action: c.action, ...target, payload }, signal);
  } catch (e) {
    if (isAborted(e) || signal.aborted) return { stop: true, reason: run.reason || "aborted" };
    if (isRouteMissing(e)) return c.action === SUPPORT_ACTION ? fallbackTicket(c, ctx, run, payload) : guided(c, ctx, run, payload);
    logApiError("ai instructor preview", e);
    commandFailed(ctx, c, "preview_failed", { status: e instanceof ApiError ? e.status : 0 });
    return blocking ? { stop: true, reason: "preview_failed" } : OK;
  }
  const state: { token: string; result: ActionResult | null } = { token: preview.confirmToken, result: null };
  const ok = await askAction(
    { commandId: c.id, action: c.action, generic: false, text: c.text, preview, free: freeAction(c.action, preview), sharesHistory: c.action === SUPPORT_ACTION && sharesHistory(payload) },
    {
      confirm: async () => {
        state.result = await confirmInstructorAction({
          session_id: ctx.sessionId,
          command_id: c.id,
          action: c.action,
          ...target,
          payload,
          confirm_token: state.token,
          idempotency_key: c.id,
        });
        return { pay: state.result.paymentUrl };
      },
      refresh: async () => {
        const p = await previewInstructorAction({ session_id: ctx.sessionId, command_id: c.id, action: c.action, ...target, payload });
        state.token = p.confirmToken;
        return p;
      },
      isExpired: isConfirmExpired,
    },
  );
  if (!ok) {
    commandCancelled(ctx, c, signal.aborted ? run.reason || "aborted" : "user_declined");
    return { stop: true, reason: "user_declined" };
  }
  const r = state.result;
  completed(ctx, c, { confirmed: true, ...(r?.resultRef ? { result_ref: r.resultRef } : {}), ...(r?.status ? { result_status: r.status } : {}) });
  if (!r || r.paymentUrl) return OK;
  if (r.ticketId || c.action === SUPPORT_ACTION) {
    showTicket(ctx, r.ticketId, r.ticketWorkId || r.workId);
    return OK;
  }
  const done = ctx.labels?.actionDone?.(c.action, r.workId) ?? "";
  if (done) toast(done, { tone: "ok" });
  const more = normCommands(r.commands, `${c.id}:next`).filter(followable);
  if (more.length) {
    more.forEach((x) => run.followUps.add(x.id));
    list.splice(at + 1, 0, ...more);
    return OK;
  }
  const next = r.nextHref ? navTarget(r.nextHref, ctx) : "";
  const nextTarget = r.nextTarget && (!r.nextTarget.startsWith(TG_MODAL) || modalIsOpen(TG_MODAL)) ? r.nextTarget : "";
  const go = next && !hereIs(next) ? next : undefined;
  if (go || nextTarget) {
    const tour: GuideTour = {
      id: newTourId(),
      source: "instructor21",
      navigate: go,
      steps: nextTarget ? [{ target: nextTarget, caption: r.message, holdMs: 6000, style: "pulse" }] : [],
      reply: ctx.answer,
    };
    await playTour(tour, signal, ctx);
  }
  return OK;
}

function classify(c: AiCommand, ctx: RunCtx): Kind {
  if (wasExecuted(c.id, ctx.scope)) return "dup";
  if (c.status !== "pending" || (!c.requiresFrontend && !BACKEND_FLAGGED.has(c.type))) return "skip";
  if (!KNOWN.has(c.type)) return "unknown";
  if (selfBlocked(c, ctx.message)) return "blocked";
  if (ctx.source === "ws" && (WS_BLOCKED.has(c.type) || (typeof document !== "undefined" && document.hidden))) return "skip";
  if (STEP_TYPES.has(c.type) && !c.target) return "invalid";
  if (c.type === "navigate" && !c.href && !c.routeKey) return "invalid";
  return "run";
}

async function interactive(c: AiCommand, ctx: RunCtx, run: Run, list: AiCommand[], at: number): Promise<Step> {
  setStatus(c.id, "running");
  if (c.type === "open_modal") return openModal(c, ctx, run.ctrl.signal);
  if (c.type === "fill_form") return fillForm(c, ctx, run.ctrl.signal);
  if (c.type === "preview_action" || c.type === "confirm_required") return mutate(c, ctx, run, list, at);
  if (c.type === "support_handoff") {
    completed(ctx, c, ctx.handoffUi === false ? { offered: false, reason: "not_applicable" } : { offered: true });
    return OK;
  }
  if (c.type === "show_steps") {
    completed(ctx, c, { rendered: true, count: c.steps.length });
    return OK;
  }
  commandFailed(ctx, c, "unsupported_command");
  return OK;
}

export async function runCommands(cmds: AiCommand[], ctx: RunCtx): Promise<RunSummary> {
  abortCommands("superseded");
  const run: Run = { ctrl: new AbortController(), reason: "", followUps: new Set() };
  current = run;
  setQueueRunning(true);
  const list = [...cmds];
  const kinds = new Map<AiCommand, Kind>();
  const kindOf = (c: AiCommand) => {
    let k = kinds.get(c);
    if (!k) {
      k = classify(c, ctx);
      kinds.set(c, k);
    }
    return k;
  };
  list.forEach((c) => {
    if (kindOf(c) === "run" && !isFinal(c.id)) setStatus(c.id, "pending");
  });
  try {
    let i = 0;
    while (i < list.length) {
      const c = list[i];
      if (run.ctrl.signal.aborted) {
        list.slice(i).forEach((x) => kindOf(x) === "run" && commandCancelled(ctx, x, run.reason || "aborted"));
        break;
      }
      const kind = kindOf(c);
      if (kind !== "run") {
        if (kind === "skip") setStatus(c.id, "skipped", c.requiresFrontend ? "display_only" : "backend_only");
        else if (kind === "blocked") blockSelf(ctx, c);
        else if (kind === "unknown") commandFailed(ctx, c, "unsupported_command");
        else if (kind === "invalid") commandFailed(ctx, c, c.type === "navigate" ? "missing_href" : "missing_target");
        i++;
        continue;
      }
      let step: Step;
      if (c.type === "navigate" || STEP_TYPES.has(c.type)) {
        const seg = [c];
        let j = i + 1;
        while (j < list.length && STEP_TYPES.has(list[j].type) && kindOf(list[j]) === "run") seg.push(list[j++]);
        step = await runSegment(seg, ctx, run);
        i = j;
      } else {
        step = await interactive(c, ctx, run, list, i);
        i++;
      }
      const why = (run.ctrl.signal.aborted && run.reason) || step.reason;
      if (step.stop && !isFinal(c.id)) commandCancelled(ctx, c, why || "aborted");
      if (step.stop) {
        list.slice(i).forEach((x) => kindOf(x) === "run" && commandCancelled(ctx, x, why || "stopped"));
        break;
      }
    }
  } catch (e) {
    logApiError("ai instructor commands", e);
    list.forEach((x) => kindOf(x) === "run" && commandFailed(ctx, x, "executor_error"));
  } finally {
    if (current === run) {
      current = null;
      setQueueRunning(false);
    }
  }
  const snap = statuses();
  const sum: RunSummary = { done: 0, missing: 0, failed: 0, cancelled: 0, skipped: 0 };
  for (const c of list) {
    if (run.followUps.has(c.id)) continue;
    const s = snap.get(c.id)?.status;
    if (s === "done") sum.done++;
    else if (s === "missing") sum.missing++;
    else if (s === "failed") sum.failed++;
    else if (s === "cancelled") sum.cancelled++;
    else if (s === "skipped") sum.skipped++;
  }
  return sum;
}

function replayHref(c: AiCommand, role: GuideRole): string {
  return c.type === "navigate" ? guideHref(c.href || (c.routeKey ? routeForKey(c.routeKey, role) : ""), role) : "";
}

function replayStep(c: AiCommand, question: string): boolean {
  return STEP_TYPES.has(c.type) && Boolean(c.target) && !selfBlocked(c, question);
}

export function tourFromCommands(cmds: AiCommand[], role: GuideRole, captionFor?: (target: string) => string, question = ""): GuideTour | null {
  let navigate: string | undefined;
  const steps: GuideStep[] = [];
  for (const c of cmds) {
    if (c.type === "navigate" && !navigate && !steps.length) {
      const to = replayHref(c, role);
      if (to) navigate = to;
      continue;
    }
    if (!replayStep(c, question)) continue;
    const caption = c.text || captionFor?.(c.target) || "";
    steps.push({ target: c.target, caption, holdMs: c.type === "scroll_to" ? 1500 : clamp(c.durationMs || 6000, 1500, 15000), style: c.style.includes("pulse") ? "pulse" : undefined });
  }
  if (!navigate && !steps.length) return null;
  return { id: newTourId(), source: "instructor21", navigate, steps };
}

export function canReplay(cmds: AiCommand[], role: GuideRole, question = ""): boolean {
  return cmds.some((c) => Boolean(replayHref(c, role)) || replayStep(c, question));
}

export function commandsKnown(raw: unknown[]): boolean {
  const snap = statuses();
  return raw.some((v) => {
    const id = isDict(v) ? pick(v.id, v.command_id) : "";
    return Boolean(id) && (snap.has(id) || wasExecuted(id));
  });
}

let supportSeq = 0;

export function supportCommand(base: AiCommand, question: string): AiCommand {
  return {
    ...base,
    id: `${base.id}:ticket:${Date.now().toString(36)}${(++supportSeq).toString(36)}`,
    type: "preview_action",
    status: "pending",
    requiresFrontend: true,
    action: SUPPORT_ACTION,
    payload: { ...base.payload, message: pick(base.payload.message) || question, ...(base.category ? { category: base.category } : {}) },
  };
}

export async function replayCommands(cmds: AiCommand[], ctx: RunCtx): Promise<void> {
  const tour = tourFromCommands(cmds, ctx.role, ctx.captionFor, ctx.message);
  if (!tour) return;
  await playTour(tour, new AbortController().signal, ctx);
}

const stepUsable = (s: AiStep, question: string) => Boolean(s.target) && !selfTargetBlocked(s.target, question);

export function hasStepTour(steps: AiStep[], question = ""): boolean {
  return steps.some((s) => stepUsable(s, question));
}

export function tourFromSteps(steps: AiStep[], question = ""): GuideTour | null {
  const list: GuideStep[] = steps.filter((s) => stepUsable(s, question)).map((s) => ({ target: s.target, caption: s.text, holdMs: 5000 }));
  return list.length ? { id: newTourId(), source: "instructor21", steps: list } : null;
}
