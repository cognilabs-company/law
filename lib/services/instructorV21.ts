import { API_BASE, ApiError, asArr, asDict, currentTokenOwner, http, isAborted, isRouteMissing, parseServerTime, type Dict } from "@/lib/http";
import { clearFeatureMissing, featureMissing, noteFeatureError } from "@/lib/endpointGate";
import { safePaymentUrl } from "@/lib/services/backend";
import {
  MUTATING_ACTIONS,
  type ActionPreview,
  type ActionResult,
  type AiActor,
  type AiChatRequest,
  type AiChatResponse,
  type AiEndpoints,
  type AiEventBody,
  type AiRuntimeRequest,
  type InstructorContract,
  type InstructorMode,
} from "@/lib/ai/types";

const MISSING_TTL = 10 * 60 * 1000;
const RETRY_TTL = 60 * 1000;
const CONTRACT_TTL = 30 * 60 * 1000;
const ENDPOINT_RE = /^\/ai\/instructor\/[A-Za-z0-9_\-/]*$/;

export const DEFAULT_ENDPOINTS: AiEndpoints = {
  events: "/ai/instructor/events",
  runtime: "/ai/instructor/runtime",
  preview: "/ai/instructor/actions/preview",
  confirm: "/ai/instructor/actions/confirm",
};

let endpoints: AiEndpoints = DEFAULT_ENDPOINTS;

type ProbeEntry = { at: number; value: InstructorContract | null; pending: Promise<InstructorContract | null> | null };

const probes = new Map<string, ProbeEntry>();

export function instructorMode(): InstructorMode {
  const v = (process.env.NEXT_PUBLIC_AI_INSTRUCTOR || "").trim().toLowerCase();
  return v === "v20" || v === "v21" ? v : "auto";
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
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() && /^-?\d+(\.\d+)?$/.test(v.trim()) ? parseFloat(v) : NaN;
    if (Number.isFinite(n)) return n;
  }
  return null;
}

const isDict = (v: unknown): v is Dict => Boolean(v) && typeof v === "object" && !Array.isArray(v);

function strList(v: unknown): string[] {
  const out: string[] = [];
  for (const item of asArr(v)) {
    const s = typeof item === "string" ? item.trim() : isDict(item) ? pick(item.route, item.path, item.href, item.name, item.type, item.id) : "";
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

function textList(v: unknown, max: number): string[] {
  const out: string[] = [];
  for (const item of asArr(v)) {
    const s = typeof item === "string" ? item.trim() : isDict(item) ? pick(item.text, item.title, item.label, item.message, item.description) : "";
    if (s && !out.includes(s)) out.push(s.slice(0, 240));
    if (out.length >= max) break;
  }
  return out;
}

function versionOk(v: string): boolean {
  const m = /^(\d+)(?:\.(\d+))?/.exec(v);
  if (!m) return false;
  const major = parseInt(m[1], 10);
  const minor = m[2] ? parseInt(m[2], 10) : 0;
  return major > 2 || (major === 2 && minor >= 1);
}

function unwrap(raw: unknown, keys: string[]): Dict {
  const d = asDict(raw);
  if (keys.some((k) => k in d)) return d;
  const inner = isDict(d.data) ? d.data : isDict(d.result) ? d.result : null;
  return inner && keys.some((k) => k in inner) ? inner : d;
}

export function normInstructorContract(raw: unknown): InstructorContract | null {
  if (!isDict(raw)) return null;
  const d = unwrap(raw, ["contract_version", "command_types"]);
  const version = pick(d.contract_version, d.version, d.frontend_contract_version);
  const commandTypes = strList(d.command_types ?? d.commands ?? d.supported_commands);
  if (!versionOk(version) && !commandTypes.length) return null;
  return {
    version: version || "2.1",
    commandTypes,
    mutatingActions: [...new Set<string>([...MUTATING_ACTIONS, ...strList(d.mutating_actions)])],
    capabilities: strList(d.required_frontend_capabilities ?? d.capabilities),
    role: pick(d.role, d.user_role),
    allowedRoutes: strList(d.allowed_routes ?? d.routes).filter((r) => r.startsWith("/") && !r.startsWith("//")),
  };
}

const probeKey = (role: string) => `${currentTokenOwner()}|${role}`;

export function instructorV21Missing(role: string): boolean {
  if (instructorMode() === "v20") return true;
  const e = probes.get(probeKey(role));
  if (e?.value) return false;
  if (e && !e.pending && Date.now() - e.at < MISSING_TTL) return true;
  return featureMissing("instructorV21");
}

export function cachedInstructorContract(role: string): InstructorContract | null {
  const e = probes.get(probeKey(role));
  return e?.value ?? null;
}

export function noteInstructorV21Missing(e: unknown, role?: string): boolean {
  if (!isRouteMissing(e)) return false;
  noteFeatureError("instructorV21", e);
  const now = Date.now();
  if (role) probes.set(probeKey(role), { at: now, value: null, pending: null });
  else for (const [k, entry] of probes) probes.set(k, { ...entry, at: now, value: null, pending: null });
  return true;
}

export async function ensureInstructorContract(role: string, signal?: AbortSignal): Promise<InstructorContract | null> {
  if (instructorMode() === "v20") return null;
  const key = probeKey(role);
  const now = Date.now();
  const cur = probes.get(key);
  if (cur?.pending) return cur.pending;
  if (cur?.value && now - cur.at < CONTRACT_TTL) return cur.value;
  if (cur && !cur.value && now - cur.at < MISSING_TTL) return null;
  const pending = (async () => {
    try {
      const value = normInstructorContract(await http("/ai/instructor/contract", { signal }));
      probes.set(key, { at: Date.now(), value, pending: null });
      if (value) clearFeatureMissing("instructorV21");
      return value;
    } catch (e) {
      if (noteInstructorV21Missing(e, role)) return null;
      const aborted = isAborted(e);
      const status = !aborted && e instanceof ApiError ? e.status : 0;
      if (status === 403) {
        probes.set(key, { at: Date.now(), value: null, pending: null });
        return null;
      }
      if (cur?.value) {
        probes.set(key, { at: cur.at, value: cur.value, pending: null });
        return cur.value;
      }
      if (!aborted && (status === 401 || cur)) {
        probes.set(key, { at: Date.now() - MISSING_TTL + RETRY_TTL, value: null, pending: null });
        return null;
      }
      probes.delete(key);
      throw e;
    }
  })();
  probes.set(key, { at: now, value: cur?.value ?? null, pending });
  return pending;
}

export function resetInstructorContracts(): void {
  probes.clear();
}

function safeEndpoint(v: unknown, fallback: string): string {
  const s = typeof v === "string" ? v.trim().split(/[?#]/)[0] : "";
  return s && ENDPOINT_RE.test(s) && !s.includes("..") && !s.includes("//") ? s : fallback;
}

export function normInstructorChat(raw: unknown, sentSessionId = ""): AiChatResponse {
  const d = unwrap(raw, ["answer", "reply", "commands", "session_id"]);
  return {
    contractVersion: pick(d.contract_version, d.version),
    sessionId: pick(d.session_id, d.sessionId, asDict(d.session).id, sentSessionId),
    responseId: pick(d.response_id, d.message_id, d.id, d.request_id),
    answer: pick(d.answer, d.reply, d.text),
    intent: pick(d.intent) || "general_help",
    rawCommands: asArr(d.commands ?? d.actions),
    toolResults: isDict(d.tool_results) ? d.tool_results : {},
    suggestions: textList(d.suggestions, 3),
    endpoints: {
      events: safeEndpoint(d.event_url ?? d.events_url, DEFAULT_ENDPOINTS.events),
      runtime: safeEndpoint(d.runtime_url, DEFAULT_ENDPOINTS.runtime),
      preview: safeEndpoint(d.actions_preview_url ?? d.preview_url, DEFAULT_ENDPOINTS.preview),
      confirm: safeEndpoint(d.actions_confirm_url ?? d.confirm_url, DEFAULT_ENDPOINTS.confirm),
    },
  };
}

export function setInstructorEndpoints(next: AiEndpoints): void {
  endpoints = next;
}

export function instructorEndpoints(): AiEndpoints {
  return endpoints;
}

export function isUnknownSession(e: unknown): boolean {
  if (!(e instanceof ApiError) || isRouteMissing(e)) return false;
  if (e.status !== 404 && e.status !== 410) return false;
  const code = (e.code || "").toLowerCase();
  return code.includes("session") || /session|sessiya|сесси/i.test(e.detail || "");
}

export async function instructorChat(body: AiChatRequest, signal?: AbortSignal): Promise<AiChatResponse> {
  const res = normInstructorChat(await http("/ai/instructor/chat", { method: "POST", body: JSON.stringify(body), signal }), body.session_id || "");
  endpoints = res.endpoints;
  return res;
}

export async function postInstructorRuntime(body: AiRuntimeRequest, signal?: AbortSignal): Promise<void> {
  await http(endpoints.runtime, { method: "POST", body: JSON.stringify(body), signal });
}

export async function postInstructorEvent(body: AiEventBody): Promise<void> {
  await http(endpoints.events, { method: "POST", body: JSON.stringify(body), keepalive: true });
}

export async function getInstructorSession(id: string, signal?: AbortSignal): Promise<Dict> {
  return asDict(await http(`/ai/instructor/session/${encodeURIComponent(id)}`, { signal }));
}

function normActor(v: unknown): AiActor | null {
  if (!isDict(v)) return null;
  const userId = pick(v.user_id, v.id);
  const name = pick(v.name, v.full_name, v.display_name);
  const role = pick(v.role, v.user_role);
  return userId || name ? { userId, name, role } : null;
}

export function normActionPreview(raw: unknown, action: string): ActionPreview {
  const d = unwrap(raw, ["confirm_token", "title", "summary", "amount", "requires_confirmation", "preview"]);
  const p = isDict(d.preview) ? d.preview : d;
  const pay = asDict(p.payment ?? p.price_info);
  return {
    action: pick(p.action, d.action, action),
    title: pick(p.title, p.action_title),
    summary: pick(p.summary, p.description, p.what, p.message, d.message),
    amount: num(p.amount, p.price, p.total, p.estimated_amount, pay.amount),
    currency: pick(p.currency, pay.currency) || "UZS",
    amountText: pick(p.amount_text, p.price_text, pay.amount_text),
    billingPeriod: pick(p.billing_period, p.period),
    onBehalfOf: normActor(p.on_behalf_of ?? d.on_behalf_of ?? p.actor),
    requiresConfirmation: p.requires_confirmation !== false,
    canExecute: p.can_execute !== false && d.can_execute !== false,
    confirmToken: pick(p.confirm_token, d.confirm_token, p.token),
    expiresAt: (() => {
      const t = parseServerTime(p.expires_at ?? d.expires_at);
      return Number.isFinite(t) ? t : 0;
    })(),
    warnings: textList(p.warnings ?? d.warnings, 4),
    details: textList(p.details ?? p.items ?? p.lines, 6),
    message: pick(d.message, p.message),
  };
}

export function normActionResult(raw: unknown): ActionResult {
  const d = asDict(raw);
  const r = isDict(d.result) ? d.result : d;
  const ticket = asDict(r.ticket ?? d.ticket);
  const next = asDict(r.next ?? d.next);
  const ticketId = pick(ticket.id, ticket.ticket_id, r.ticket_id, d.ticket_id);
  return {
    status: pick(d.status, r.status) || "confirmed",
    ticketId,
    ticketWorkId: pick(ticket.work_id, asDict(ticket.payload).work_id, r.work_id),
    paymentUrl: safePaymentUrl(r.payment_url ?? d.payment_url ?? r.checkout_url ?? asDict(r.payment).payment_url ?? asDict(r.invoice).payment_url),
    nextHref: pick(next.href, next.route, r.href, r.redirect, d.href),
    nextTarget: pick(next.target, next.ai_id, r.target),
    resultRef: pick(ticketId, r.order_id, r.request_id, r.record_id, r.payment_id, r.subscription_id, r.id),
    commands: asArr(r.commands ?? d.commands),
    message: pick(d.message, r.message),
  };
}

export async function previewInstructorAction(
  body: { session_id: string; command_id: string; action: string; payload: Record<string, unknown> },
  signal?: AbortSignal,
): Promise<ActionPreview> {
  return normActionPreview(await http(endpoints.preview, { method: "POST", body: JSON.stringify(body), signal }), body.action);
}

export async function confirmInstructorAction(body: {
  session_id: string;
  command_id: string;
  action: string;
  payload: Record<string, unknown>;
  confirm_token: string;
  idempotency_key: string;
}): Promise<ActionResult> {
  const headers: Record<string, string> = API_BASE.startsWith("/") ? { "Idempotency-Key": body.idempotency_key } : {};
  return normActionResult(await http(endpoints.confirm, { method: "POST", body: JSON.stringify(body), headers }));
}

export function isConfirmExpired(e: unknown): boolean {
  if (!(e instanceof ApiError)) return false;
  if (e.status === 410) return true;
  const code = (e.code || "").toLowerCase();
  return (e.status === 409 || e.status === 400 || e.status === 422) && (code.includes("expired") || code.includes("token") || /expire|muddat|eskir|истек|истёк/i.test(e.detail || ""));
}
