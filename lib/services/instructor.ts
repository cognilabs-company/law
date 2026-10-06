import { http, asDict, asArr, isAborted, ApiError } from "@/lib/http";
import { featureMissing, noteFeatureError } from "@/lib/endpointGate";
import { guideHref, normPath, routeForKey, samePath } from "@/lib/guide/routes";
import { targetKind } from "@/lib/guide/targets";
import type { GuideRole, GuideStep, GuideTour, RegistryTarget, TargetInfo } from "@/lib/guide/types";
import { normSupportTicket, subjectFrom, type SupportTicket } from "@/lib/services/support";
import { AI_LAUNCHER_ID, isSelfTarget, selfHelpAsked } from "@/lib/ai/self";

export const INSTRUCTOR_CONTRACT = "2.0";
export const PAGE_TARGET = "ai-help:current-page";
export const SUPPORT_ACTION = "start_support_ticket";

const SHELL_TARGET = /^(ai-help|header|nav):/;

const VISIBLE_MAX = 70;
const TARGETS_MAX = 120;
const LABEL_MAX = 80;
const TURNS_MAX = 3;
const TURN_CHARS = 300;
const CHECKLIST_MAX = 8;
const NEEDS_MAX = 6;
const ITEM_CHARS = 240;
const PRIORITY_TARGETS = new Set(["plan:lexgo-ai-pro", "marketplace:ai-search", "button:create-document", "button:operator-support", "section:urgent-services", "list:document-requests"]);
const SKIP_STEP = new Set(["navigate", "suggest_next_step", "request_confirmation"]);
const CONFIRM_TYPES = new Set(["confirm", "preview_action", "request_confirmation", SUPPORT_ACTION]);
const ROLE_ROOT = /^\/portal\/[^/]+$/;
const REPR_TEXT = /['"](?:text|title|caption|label|description|name|step|instruction)['"]\s*:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/;

export type GuideAction =
  | { type: "navigate"; href: string }
  | { type: "scroll_to"; target: string }
  | { type: "highlight"; target: string }
  | { type: "tooltip"; target: string; text: string }
  | { type: "focus"; target: string }
  | { type: "confirm"; actionType: string; text: string };

export type InstructorV2Step = { action: string; routeKey: string; href: string; target: string; caption: string };

export type InstructorHighlight = { target: string; reason: string };

export type InstructorRoute = { href: string; reason: string };

export type InstructorSupport = { available: boolean; reason: string; confirmAction: string };

export type InstructorReply = {
  reply: string;
  intent: string;
  actions: GuideAction[];
  steps: InstructorV2Step[];
  checklist: string[];
  highlight: InstructorHighlight | null;
  route: InstructorRoute | null;
  suggestions: string[];
  requiresConfirmation: boolean;
  confirmActionType: string;
  missingRequirements: string[];
  supportFallback: InstructorSupport;
  provider: string;
  contractVersion: string;
  fallback: string;
};

export type InstructorTarget = { id: string; label: string; route: string; type: string; in_view: boolean };

export type InstructorTurn = { role: "user" | "assistant"; content: string };

export type InstructorRequest = {
  contract_version: typeof INSTRUCTOR_CONTRACT;
  message: string;
  current_path: string;
  visible_targets: string[];
  locale: string;
  session_id: string;
  page: { path: string; title: string; id: string; portal: GuideRole };
  targets: InstructorTarget[];
  state: Record<string, unknown>;
  history: InstructorTurn[];
};

export type HandoffPreview = { message: string; requiresConfirmation: boolean; canExecute: boolean; v2: boolean };

export type HandoffResult = { created: boolean; ticket: SupportTicket | null };

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function pick(...vals: unknown[]): string {
  for (const v of vals) {
    const s = typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
    if (s) return s;
  }
  return "";
}

function firstText(...vals: unknown[]): string {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return "";
}

const isObj = (v: unknown) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

export function instructorPath(path: string, role: GuideRole): string {
  const p = normPath(path);
  return role === "lawyer" ? p.replace(/^\/portal\/lawyer(?=\/|$)/, "/portal/advocate") : p;
}

export function instructorTargets(
  visible: TargetInfo[],
  registry: RegistryTarget[],
  currentPath: string,
  role: GuideRole,
  labelOf: (t: RegistryTarget) => string,
  question = "",
  launcherLabel = "",
): { targets: InstructorTarget[]; visible: string[] } {
  const route = instructorPath(currentPath, role);
  const self = selfHelpAsked(question);
  const usable = (id: string) => Boolean(id) && !SHELL_TARGET.test(id) && (self || !isSelfTarget(id));
  const out = new Map<string, InstructorTarget>();
  if (self) out.set(AI_LAUNCHER_ID, { id: AI_LAUNCHER_ID, label: clip(squash(launcherLabel) || AI_LAUNCHER_ID, LABEL_MAX), route, type: "button", in_view: true });
  for (const v of [...visible.filter((x) => x.in_view), ...visible.filter((x) => !x.in_view)]) {
    if (out.size >= VISIBLE_MAX) break;
    if (!usable(v.id) || out.has(v.id)) continue;
    out.set(v.id, { id: v.id, label: clip(squash(v.label) || v.id, LABEL_MAX), route, type: v.kind || targetKind(v.id), in_view: v.in_view });
  }
  const shown = [...out.keys()];
  for (const r of [...registry.filter((x) => PRIORITY_TARGETS.has(x.id)), ...registry]) {
    if (out.size >= TARGETS_MAX) break;
    if (!usable(r.id) || out.has(r.id)) continue;
    out.set(r.id, { id: r.id, label: clip(squash(labelOf(r)) || r.id, LABEL_MAX), route: instructorPath(r.route, role), type: targetKind(r.id), in_view: false });
  }
  return { targets: [...out.values()], visible: shown };
}

function selfGate(question?: string): (target: string) => boolean {
  if (question === undefined || selfHelpAsked(question)) return () => true;
  return (target: string) => !isSelfTarget(target);
}

export function instructorState(base: Record<string, unknown>, visible: TargetInfo[]): Record<string, unknown> {
  const tabs = asArr(base.active_tabs).map((x) => firstText(x)).filter(Boolean);
  const slugs = [...new Set(visible.filter((x) => x.id.startsWith("plan:")).map((x) => x.id.slice(5)).filter(Boolean))];
  return { ...base, selected_tab: tabs[0] ?? null, filters: {}, visible_plan_slugs: slugs };
}

export function instructorHistory(turns: { q: string; a: string }[]): InstructorTurn[] {
  const out: InstructorTurn[] = [];
  for (const { q, a } of turns.slice(-TURNS_MAX)) {
    const user = squash(q || "").slice(0, TURN_CHARS);
    const bot = squash(a || "").slice(0, TURN_CHARS);
    if (user) out.push({ role: "user", content: user });
    if (bot) out.push({ role: "assistant", content: bot });
  }
  return out;
}

function normAction(v: unknown): GuideAction | null {
  const d = asDict(v);
  const type = pick(d.type, d.action);
  const target = pick(d.target, d.target_id);
  if (type === "navigate" || type === "route") {
    const href = pick(d.href, d.route, d.path);
    return href.startsWith("/") ? { type: "navigate", href } : null;
  }
  if (type === "scroll_to" || type === "focus" || type === "highlight") return target ? { type, target } : null;
  if (type === "tooltip") return target ? { type, target, text: pick(d.text, d.caption) } : null;
  if (CONFIRM_TYPES.has(type)) {
    const nested = pick(d.type) && pick(d.action) !== type ? pick(d.action) : "";
    return { type: "confirm", actionType: pick(d.action_type, d.confirm_action, nested, type === SUPPORT_ACTION ? type : ""), text: pick(d.text, d.confirmation_text) };
  }
  return null;
}

function normStep(v: unknown): InstructorV2Step | null {
  if (!isObj(v)) return null;
  const d = asDict(v);
  const action = pick(d.action, d.type);
  if (!action) return null;
  return { action, routeKey: pick(d.route_key), href: pick(d.href, d.route), target: pick(d.target_id, d.target), caption: pick(d.caption, d.text) };
}

function itemText(v: unknown): string {
  let s = "";
  if (typeof v === "string") {
    s = squash(v);
    if (/^[[{].*[\]}]$/.test(s)) {
      const m = s.match(REPR_TEXT);
      s = (m?.[1] ?? m?.[2] ?? "").replace(/\\(['"\\])/g, "$1");
    }
  } else if (isObj(v)) {
    const d = asDict(v);
    s = firstText(d.text, d.title, d.caption, d.label, d.description, d.name, d.step, d.instruction);
  }
  return clip(squash(s).replace(/^(?:\d{1,2}[.)]|[-*•])\s+/, ""), ITEM_CHARS);
}

function textList(items: unknown[], max: number): string[] {
  const out: string[] = [];
  for (const item of items) {
    const s = itemText(item);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function normHighlight(v: unknown): InstructorHighlight | null {
  const d = asDict(v);
  const target = pick(d.target, d.target_id, d.id);
  return target ? { target, reason: firstText(d.reason, d.text) } : null;
}

function strayRoot(href: string, here: string): boolean {
  const path = normPath(href);
  return Boolean(here) && ROLE_ROOT.test(path) && !`${here}/`.startsWith(`${path}/`);
}

function normRoute(v: unknown, here: string): InstructorRoute | null {
  const d: Record<string, unknown> = typeof v === "string" ? { href: v } : asDict(v);
  const href = pick(d.href, d.path, d.route);
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  if ((here && normPath(href) === here) || strayRoot(href, here)) return null;
  return { href, reason: firstText(d.reason) };
}

function normSupport(v: unknown): InstructorSupport {
  const d = asDict(v);
  return { available: isObj(v) && d.available !== false, reason: firstText(d.reason), confirmAction: pick(d.confirm_action) || SUPPORT_ACTION };
}

export function normInstructorReply(raw: unknown, currentPath = "", question?: string): InstructorReply {
  const d = asDict(raw);
  const here = currentPath ? normPath(currentPath) : "";
  const goes = (href: string) => !strayRoot(href, here);
  const allowed = selfGate(question);
  const all = asArr(d.actions).map(normAction).filter((a): a is GuideAction => a !== null);
  const confirm = all.find((a): a is Extract<GuideAction, { type: "confirm" }> => a.type === "confirm");
  const support = normSupport(d.support_fallback);
  const rawSteps = asArr(d.steps);
  const explicit = d.requires_confirmation === true;
  const hl = normHighlight(d.highlight);
  return {
    reply: pick(d.reply, d.answer),
    intent: pick(d.intent) || "general_help",
    actions: all.filter((a) => a.type !== "confirm" && (a.type !== "navigate" || goes(a.href)) && (!("target" in a) || allowed(a.target))),
    steps: rawSteps.map(normStep).filter((s): s is InstructorV2Step => s !== null && (s.action !== "navigate" || Boolean(s.routeKey) || goes(s.href)) && (!s.target || allowed(s.target))),
    checklist: textList(rawSteps.filter((s) => !normStep(s)), CHECKLIST_MAX),
    highlight: hl && allowed(hl.target) ? hl : null,
    route: normRoute(d.route, here),
    suggestions: asArr(d.suggestions).map((s) => firstText(s)).filter(Boolean).slice(0, 3),
    requiresConfirmation: explicit || Boolean(confirm),
    confirmActionType: confirm?.actionType || pick(d.action_type) || (explicit ? support.confirmAction : ""),
    missingRequirements: textList(asArr(d.missing_requirements), NEEDS_MAX),
    supportFallback: support,
    provider: pick(d.ai_provider),
    contractVersion: pick(d.contract_version, d.frontend_contract_version),
    fallback: pick(d.fallback),
  };
}

export async function askInstructor(input: InstructorRequest, signal?: AbortSignal): Promise<InstructorReply | null> {
  if (featureMissing("instructor")) return null;
  try {
    return normInstructorReply(await http("/ai/platform-instructor", { method: "POST", body: JSON.stringify(input), signal }), input.current_path, input.message);
  } catch (e) {
    if (isAborted(e)) throw e;
    if (noteFeatureError("instructor", e)) return null;
    throw e;
  }
}

const generic = (r: InstructorReply) => r.intent === "general_help";

const keywordPlan = (r: InstructorReply) => !r.provider || r.provider === "fallback";

const realTarget = (r: InstructorReply, target: string) => Boolean(target) && (target !== PAGE_TARGET || !generic(r));

function leaves(href: string, role: GuideRole | undefined, currentPath: string): boolean {
  const to = role ? guideHref(href, role) : href;
  return Boolean(to) && !(currentPath && samePath(to, currentPath));
}

export function replyHasGuide(r: InstructorReply, role?: GuideRole, currentPath = ""): boolean {
  if (r.steps.some((s) => !SKIP_STEP.has(s.action) && realTarget(r, s.target))) return true;
  if (r.actions.some((a) => a.type !== "navigate" && a.type !== "confirm" && realTarget(r, a.target))) return true;
  if (r.highlight && realTarget(r, r.highlight.target)) return true;
  if (r.steps.some((s) => s.action === "navigate" && leaves(s.routeKey && role ? routeForKey(s.routeKey, role) : s.href, role, currentPath))) return true;
  if (r.actions.some((a) => a.type === "navigate" && leaves(a.href, role, currentPath))) return true;
  return Boolean(r.route && leaves(r.route.href, role, currentPath));
}

export function replyNeedsAssistant(r: InstructorReply, guided: boolean): boolean {
  if (!r.reply && !guided && !r.checklist.length) return true;
  if (!generic(r) || !keywordPlan(r)) return false;
  const acts = r.actions.some((a) => a.type === "navigate" || (a.type !== "confirm" && a.target !== PAGE_TARGET));
  return !acts && !r.steps.length && !(r.highlight && r.highlight.target !== PAGE_TARGET);
}

export function replyOffersSupport(r: InstructorReply, role: GuideRole, hasTour: boolean): boolean {
  if (role === "staff") return false;
  return r.intent === "support_guidance" || r.confirmActionType === SUPPORT_ACTION || (!hasTour && !r.checklist.length && r.supportFallback.available);
}

let seq = 0;
const tourId = () => `t${Date.now().toString(36)}${(++seq).toString(36)}`;

export function tourFromReply(reply: InstructorReply, role: GuideRole, captionFor: (target: string) => string, currentPath = "", question?: string): GuideTour {
  const steps: GuideStep[] = [];
  let navigate: string | undefined;
  const allowed = selfGate(question);
  const take = (target: string) => {
    let s = steps.find((x) => x.target === target);
    if (!s) {
      s = { target, caption: "", focus: true };
      steps.push(s);
    }
    return s;
  };
  const go = (href: string) => {
    if (navigate || !href) return;
    const to = guideHref(href, role);
    if (to) navigate = to;
  };
  for (const st of reply.steps) {
    if (st.action === "navigate") {
      go(st.routeKey ? routeForKey(st.routeKey, role) : st.href);
      continue;
    }
    if (!st.target || SKIP_STEP.has(st.action) || !allowed(st.target)) continue;
    const s = take(st.target);
    if (st.caption) s.caption = st.caption;
  }
  if (!navigate && !steps.length) {
    for (const a of reply.actions) {
      if (a.type === "navigate") {
        go(a.href);
        continue;
      }
      if (a.type === "confirm" || !allowed(a.target)) continue;
      const s = take(a.target);
      if (a.type === "tooltip" && a.text) s.caption = a.text;
    }
  }
  if (reply.route) go(reply.route.href);
  const hl = reply.highlight && allowed(reply.highlight.target) ? reply.highlight : null;
  if (hl && realTarget(reply, hl.target)) take(hl.target);
  steps.forEach((s, i) => {
    if (!s.caption && hl?.reason && s.target === hl.target) s.caption = hl.reason;
    if (!s.caption) s.caption = captionFor(s.target) || (i === 0 ? reply.reply : "");
  });
  if (!steps.length) steps.push({ target: PAGE_TARGET, caption: reply.reply, focus: true });
  if (!navigate && currentPath && steps[0].target !== PAGE_TARGET) navigate = normPath(currentPath);
  return { id: tourId(), source: "instructor", navigate, steps, reply: reply.reply };
}

export function newTourId(): string {
  return tourId();
}

export async function previewSupportHandoff(): Promise<HandoffPreview> {
  const d = asDict(
    await http("/ai/platform-instructor/actions/preview", {
      method: "POST",
      body: JSON.stringify({ action: SUPPORT_ACTION, target: "support" }),
    }),
  );
  return {
    message: firstText(d.message, d.summary, asDict(d.preview).summary),
    requiresConfirmation: d.requires_confirmation !== false,
    canExecute: d.can_execute !== false,
    v2: Boolean(firstText(d.confirm_url, d.user_role)),
  };
}

export async function confirmSupportHandoff(input: { message: string; category: string; priority?: string }): Promise<HandoffResult> {
  const message = input.message.trim();
  const d = asDict(
    await http("/ai/platform-instructor/actions/confirm", {
      method: "POST",
      body: JSON.stringify({ action: SUPPORT_ACTION, subject: subjectFrom(message).slice(0, 255), message, category: input.category, priority: input.priority || "normal" }),
    }),
  );
  const ticket = isObj(d.ticket) ? normSupportTicket(d.ticket) : null;
  return { created: d.created !== false, ticket: ticket?.id ? ticket : null };
}

export function confirmUnsupported(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 400 || e.status === 404 || e.status === 405);
}
