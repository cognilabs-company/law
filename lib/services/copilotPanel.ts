import { ApiError, aiQuotaOf, asArr, asDict, asNum, asStr, http, isAborted, type Dict } from "@/lib/http";
import { aiFeedback } from "@/lib/services/backend";
import { listArtifacts, newRequestId, type Artifact, type CopilotMode } from "@/lib/services/aiCopilot";
import { aiRouteFor } from "@/lib/aiPages";
import type { Role } from "@/lib/auth";

export const COPILOT_CLIENT_SURFACES = [
  "client_dashboard",
  "service_catalog",
  "lawyer_marketplace",
  "client_work_detail",
  "client_document_detail",
  "client_chat",
  "client_case_detail",
  "client_meeting",
  "client_support",
] as const;

export const COPILOT_LAWYER_SURFACES = [
  "lawyer_dashboard",
  "lawyer_work_detail",
  "lawyer_case_detail",
  "lawyer_chat",
  "lawyer_document_request",
  "lawyer_editor",
  "lawyer_meeting",
  "lawyer_checklist",
  "lawyer_work_queue",
] as const;

export type CopilotClientSurface = (typeof COPILOT_CLIENT_SURFACES)[number];
export type CopilotLawyerSurface = (typeof COPILOT_LAWYER_SURFACES)[number];
export type CopilotSurface = CopilotClientSurface | CopilotLawyerSurface;
export type CopilotPanelMode = Exclude<CopilotMode, "system_instructor">;
export type CopilotEntityType = "service_order" | "legal_case" | "secure_chat";
export type CopilotEntityRef = { type: CopilotEntityType; id: string; title?: string; code?: string };
export type CopilotPageContext = Record<string, string | number | boolean>;

export const COPILOT_TIMEOUT_MS = 75_000;

const ENTITY_ALIASES = new Map<string, CopilotEntityType>([
  ["service_order", "service_order"],
  ["marketplace_order", "service_order"],
  ["order", "service_order"],
  ["legal_case", "legal_case"],
  ["case", "legal_case"],
  ["secure_chat", "secure_chat"],
  ["chat", "secure_chat"],
  ["chat_room", "secure_chat"],
]);

const SURFACES = new Set<string>([...COPILOT_CLIENT_SURFACES, ...COPILOT_LAWYER_SURFACES]);

export function isCopilotSurface(v: unknown): v is CopilotSurface {
  return typeof v === "string" && SURFACES.has(v);
}

export function surfaceBelongsTo(surface: CopilotSurface, mode: CopilotPanelMode): boolean {
  return mode === "lawyer_copilot" ? (COPILOT_LAWYER_SURFACES as readonly string[]).includes(surface) : (COPILOT_CLIENT_SURFACES as readonly string[]).includes(surface);
}

export const copilotClip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

export function copilotEntityType(v: unknown): CopilotEntityType | null {
  return ENTITY_ALIASES.get(asStr(v).trim().toLowerCase()) ?? null;
}

export function copilotEntity(v: unknown): CopilotEntityRef | null {
  const d = asDict(v);
  const type = copilotEntityType(d.type);
  const id = copilotClip(asStr(d.id), 128);
  if (!type || !id) return null;
  const title = copilotClip(d.title, 140);
  const code = copilotClip(d.code, 60);
  return { type, id, ...(title ? { title } : {}), ...(code ? { code } : {}) };
}

export function copilotEntityKey(e: CopilotEntityRef | null | undefined): string {
  return e ? `${e.type}:${e.id}` : "none";
}

const SENSITIVE_PART = /token|secret|passw|cookie|bearer/i;
const SENSITIVE_SEG = new Set(["auth", "authorization", "session", "phone", "tel", "email", "mail", "passport", "pinfl", "inn", "card", "iban", "address", "history", "messages", "message", "json", "body", "payload"]);

function sensitiveKey(key: string): boolean {
  return SENSITIVE_PART.test(key) || key.toLowerCase().split(/_+/).some((s) => SENSITIVE_SEG.has(s));
}

export function sanitizeCopilotContext(v: unknown): CopilotPageContext {
  const out: CopilotPageContext = {};
  for (const [k, x] of Object.entries(asDict(v))) {
    if (Object.keys(out).length >= 12) break;
    const key = k.trim().slice(0, 40);
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || sensitiveKey(key)) continue;
    if (typeof x === "string") {
      const s = copilotClip(x, 160);
      if (s) out[key] = s;
    } else if (typeof x === "number" && Number.isFinite(x)) out[key] = x;
    else if (typeof x === "boolean") out[key] = x;
  }
  return out;
}

const LAWYER_ROLES = new Set(["advokat", "yurist", "advokat_tashkiloti"]);

export function copilotModeFor(s: { backendRole?: string | null } | null | undefined): CopilotPanelMode | null {
  const backend = (s?.backendRole ?? "").trim().toLowerCase();
  return backend === "client" ? "client_copilot" : LAWYER_ROLES.has(backend) ? "lawyer_copilot" : null;
}

export function copilotPortalRole(backendRole: string | null | undefined): Role | null {
  const b = (backendRole ?? "").trim().toLowerCase();
  return b === "client" ? "client" : b === "yurist" ? "lawyer" : b === "advokat" || b === "advokat_tashkiloti" ? "advocate" : null;
}

export const newCopilotId = newRequestId;

export function copilotClientTime(d = new Date()): string {
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${off >= 0 ? "+" : "-"}${pad(off / 60)}:${pad(off % 60)}`;
}

export type CopilotTool = { name: string; risk: string; description: string };
export type CopilotPage = { pageId: string; title: string; route: string; capabilities: string[] };
export type CopilotCapabilities = { role: string; permissions: string[]; tools: CopilotTool[]; pages: CopilotPage[] };

const strs = (v: unknown) => asArr(v).map((x) => asStr(x)).filter(Boolean);

export async function getCopilotCapabilities(signal?: AbortSignal): Promise<CopilotCapabilities> {
  const d = asDict(await http("/api/ai/capabilities", { signal }));
  return {
    role: asStr(d.role),
    permissions: strs(d.permissions),
    tools: asArr(d.tools)
      .map((x) => {
        const t = asDict(x);
        return { name: asStr(t.name), risk: asStr(t.risk), description: asStr(t.description) };
      })
      .filter((t) => t.name),
    pages: asArr(d.pages)
      .map((x) => {
        const p = asDict(x);
        return { pageId: asStr(p.page_id), title: asStr(p.title), route: asStr(p.route), capabilities: strs(p.capabilities) };
      })
      .filter((p) => p.pageId),
  };
}

export function isCopilotRoleDenied(e: unknown): boolean {
  if (!(e instanceof ApiError) || e.status !== 403) return false;
  return /_copilot_role_required/.test(`${e.code ?? ""} ${e.detail ?? ""}`);
}

export type CopilotCapsAccess = { status: "ok" | "denied" | "error"; role: string; tools: string[] };

const access = new Map<string, Promise<CopilotCapsAccess>>();
const resolved = new Map<string, CopilotCapsAccess>();

export function peekCopilotAccess(owner: string): CopilotCapsAccess | undefined {
  return resolved.get(owner);
}

export function loadCopilotAccess(owner: string): Promise<CopilotCapsAccess> {
  const hit = access.get(owner);
  if (hit) return hit;
  const p = getCopilotCapabilities().then(
    (c): CopilotCapsAccess => {
      const r: CopilotCapsAccess = { status: "ok", role: c.role, tools: c.tools.map((t) => t.name) };
      resolved.set(owner, r);
      return r;
    },
    (e): CopilotCapsAccess => {
      if (e instanceof ApiError && e.status === 403) {
        const r: CopilotCapsAccess = { status: "denied", role: "", tools: [] };
        resolved.set(owner, r);
        return r;
      }
      access.delete(owner);
      return { status: "error", role: "", tools: [] };
    },
  );
  access.set(owner, p);
  return p;
}

export const COPILOT_INTENTS = ["answer", "navigation", "search", "read_data", "action_preview", "clarification", "permission_denied", "unsupported"] as const;
export type CopilotIntent = (typeof COPILOT_INTENTS)[number];

export const COPILOT_DRAFT_TYPES = [
  "save_draft",
  "save_note",
  "save_work_plan",
  "save_timeline",
  "save_evidence_map",
  "save_meeting_summary",
  "draft_client_reply",
  "draft_complaint",
  "draft_document",
  "create_handoff",
] as const;
const DRAFT_TYPES = new Set<string>(COPILOT_DRAFT_TYPES);

export type CopilotNavigation = { type: string; route: string; params: Record<string, string>; pageId: string; title: string };
export type CopilotHighlight = { target: string; style: string };
export type CopilotActionPreview = {
  id: string;
  type: string;
  title: string;
  content: string;
  entityType: string;
  entityId: string;
  requiresConfirmation: boolean;
  route: string;
  saveable: boolean;
};
export type CopilotSourceRef = { type: string; id: string; title: string; route: string };
export type CopilotToolResult = { name: string; ok: boolean; status: number | null };
export type CopilotReply = {
  requestId: string;
  sessionId: string;
  intent: CopilotIntent;
  answer: string;
  confidence: number | null;
  navigation: CopilotNavigation | null;
  highlight: CopilotHighlight | null;
  actions: CopilotActionPreview[];
  sources: CopilotSourceRef[];
  toolResults: CopilotToolResult[];
  provider: string;
  providerError: string;
  limited: boolean;
  partial: boolean;
};

const LIMITED = new Set(["openai_text_fallback", "fallback", "local_navigation"]);
export const isLimitedProvider = (p: string) => LIMITED.has(p);

function strMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(asDict(v))) {
    if (typeof x === "string" || typeof x === "number") out[k] = String(x);
  }
  return out;
}

function normHighlight(v: unknown): CopilotHighlight | null {
  if (typeof v === "string") return v.trim() ? { target: v.trim(), style: "red_pulse" } : null;
  const h = asDict(v);
  const target = asStr(h.target ?? h.ai_id ?? h.id).trim();
  return target ? { target, style: asStr(h.style).trim() || "red_pulse" } : null;
}

export function normCopilotReply(raw: unknown, requestId: string, sessionId: string): CopilotReply {
  const d = asDict(raw);
  const nav = asDict(d.navigation);
  const navRoute = asStr(nav.route ?? nav.url).trim();
  const navPage = asStr(nav.page_id).trim();
  const navigation: CopilotNavigation | null =
    navRoute || navPage ? { type: asStr(nav.type) || "route", route: navRoute, params: strMap(nav.params), pageId: navPage, title: asStr(nav.title ?? nav.label).trim() } : null;
  const rawIntent = asStr(d.intent);
  const intent: CopilotIntent = (COPILOT_INTENTS as readonly string[]).includes(rawIntent) ? (rawIntent as CopilotIntent) : navigation ? "navigation" : "answer";
  const conf = typeof d.confidence === "number" && Number.isFinite(d.confidence) ? Math.min(1, Math.max(0, d.confidence)) : null;
  const meta = asDict(d.metadata);
  const provider = asStr(meta.provider);
  const toolResults = asArr(d.tool_results)
    .map((x): CopilotToolResult => {
      const t = asDict(x);
      const r = asDict(t.result ?? t.output);
      const failed = r.ok === false || t.ok === false;
      const code = asNum(r.status_code ?? t.status_code, 0);
      return { name: asStr(t.name ?? t.tool ?? r.tool), ok: !failed, status: code > 0 ? code : null };
    })
    .filter((t) => t.name);
  return {
    requestId: asStr(d.request_id) || requestId,
    sessionId: asStr(d.session_id) || sessionId,
    intent,
    answer: asStr(d.answer ?? d.message ?? d.text),
    confidence: conf,
    navigation,
    highlight: normHighlight(d.highlight),
    actions: asArr(d.actions)
      .map((x): CopilotActionPreview => {
        const a = asDict(x);
        const p = asDict(a.payload ?? a.preview);
        const type = asStr(a.type ?? a.action_type ?? a.kind);
        return {
          id: asStr(a.action_id ?? a.id) || type,
          type,
          title: asStr(a.title ?? a.label ?? p.title ?? a.name),
          content: asStr(p.content ?? a.content ?? a.preview_content ?? a.text ?? (typeof a.preview === "string" ? a.preview : "")),
          entityType: asStr(a.entity_type ?? p.entity_type),
          entityId: asStr(a.entity_id ?? p.entity_id),
          requiresConfirmation: a.requires_confirmation !== false,
          route: asStr(a.route),
          saveable: DRAFT_TYPES.has(type),
        };
      })
      .filter((a) => a.id && (a.title || a.content)),
    sources: asArr(d.sources)
      .map((x) => {
        const s = asDict(x);
        return { type: asStr(s.type ?? s.kind), id: asStr(s.id ?? s.page_id), title: asStr(s.title ?? s.label ?? s.name), route: asStr(s.route ?? s.url) };
      })
      .filter((s) => s.title),
    toolResults,
    provider,
    providerError: asStr(meta.provider_error),
    limited: isLimitedProvider(provider),
    partial: toolResults.some((t) => !t.ok),
  };
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, outer: AbortSignal | undefined, ms: number): Promise<T> {
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, ms);
  const relay = () => ctl.abort();
  if (outer?.aborted) ctl.abort();
  else outer?.addEventListener("abort", relay, { once: true });
  try {
    return await run(ctl.signal);
  } catch (e) {
    if (timedOut && !outer?.aborted) throw new ApiError(0, "timeout");
    throw e;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", relay);
  }
}

export type CopilotAskInput = {
  message: string;
  sessionId: string;
  mode: CopilotPanelMode;
  entity?: { type: string; id: string } | null;
  locale: string;
  page: { route: string; pageId: string; title: string; context?: CopilotPageContext };
  requestId?: string;
  timeoutMs?: number;
};

export async function askCopilotFull(input: CopilotAskInput, signal?: AbortSignal): Promise<CopilotReply> {
  const requestId = input.requestId || newCopilotId();
  const type = input.entity?.id ? copilotEntityType(input.entity.type) : null;
  const body: Dict = {
    message: input.message,
    session_id: input.sessionId,
    request_id: requestId,
    mode: input.mode,
    entity_type: type ?? "",
    entity_id: type && input.entity ? input.entity.id : "",
    locale: input.locale,
    client_time: copilotClientTime(),
    current_page: { route: input.page.route, page_id: input.page.pageId, title: input.page.title, context: sanitizeCopilotContext(input.page.context) },
  };
  if (type === "secure_chat" && input.entity) body.room_id = input.entity.id;
  const raw = await withTimeout(
    (s) => http("/api/ai/assistant", { method: "POST", body: JSON.stringify(body), signal: s }),
    signal,
    Math.max(60_000, input.timeoutMs ?? COPILOT_TIMEOUT_MS),
  );
  return normCopilotReply(raw, requestId, input.sessionId);
}

export type CopilotExecuteStatus = "saved" | "confirmation_required" | "not_executed";
export type CopilotExecuteResult = { status: CopilotExecuteStatus; message: string; artifactId: string };

export async function executeCopilotDraft(
  input: { requestId: string; actionId: string; actionType: string; title: string; content: string; entity?: { type: string; id: string } | null; surface: string },
  signal?: AbortSignal,
): Promise<CopilotExecuteResult> {
  const type = input.entity?.id ? copilotEntityType(input.entity.type) : null;
  const d = asDict(
    await http("/api/ai/actions/execute", {
      method: "POST",
      signal,
      body: JSON.stringify({
        request_id: input.requestId,
        action_id: input.actionId,
        confirmed: true,
        payload: {
          title: input.title,
          content: input.content,
          entity_type: type ?? "",
          entity_id: type && input.entity ? input.entity.id : "",
          metadata: { source_surface: input.surface, action_type: input.actionType },
        },
      }),
    }),
  );
  const raw = asStr(d.status).trim().toLowerCase();
  const art = asDict(d.artifact);
  const artifactId = asStr(d.artifact_id ?? art.id);
  const status: CopilotExecuteStatus =
    raw === "confirmation_required" ? "confirmation_required" : raw === "not_executed" ? "not_executed" : /saved|executed|completed|created|stored|success|^ok$|^done$/.test(raw) || (!raw && artifactId) ? "saved" : "not_executed";
  return { status, message: asStr(d.message ?? d.detail), artifactId };
}

export function sendCopilotFeedback(requestId: string, rating: number, opts?: { comment?: string; useful?: boolean }): Promise<void> {
  const r = Math.min(5, Math.max(1, Math.round(rating)));
  return aiFeedback(requestId, r, { comment: (opts?.comment ?? "").trim().slice(0, 500), ...(opts?.useful === undefined ? {} : { useful: opts.useful }) });
}

export type CopilotDraft = Artifact;

export function listCopilotDrafts(entity: { type: string; id: string } | null, signal?: AbortSignal): Promise<CopilotDraft[]> {
  const type = entity?.id ? copilotEntityType(entity.type) : null;
  return listArtifacts(type && entity ? { type, id: entity.id } : null, signal);
}

export type CopilotErrorKind = "aborted" | "timeout" | "network" | "auth" | "role" | "notFound" | "mode" | "content" | "quota" | "rate" | "server" | "other";

export function copilotErrorKind(e: unknown): CopilotErrorKind {
  if (isAborted(e)) return "aborted";
  if (!(e instanceof ApiError)) return "other";
  if (e.status === 0) return e.detail === "timeout" ? "timeout" : "network";
  if (e.status === 401) return "auth";
  if (e.status === 403) return isCopilotRoleDenied(e) ? "role" : "other";
  if (e.status === 404) return "notFound";
  if (aiQuotaOf(e)) return "quota";
  if (e.status === 429) return "rate";
  if (e.status === 422) {
    const s = `${e.code ?? ""} ${e.detail ?? ""}`;
    if (/ai_mode_invalid/.test(s)) return "mode";
    if (/ai_action_content_required/.test(s)) return "content";
    return "other";
  }
  if (e.status >= 500) return "server";
  return "other";
}

const LOCALE_PREFIX = /^\/(uz|ru|en)(?=\/|$|\?)/;
const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}|\[([A-Za-z0-9_]+)\]|(?<=\/):([A-Za-z_][A-Za-z0-9_]*)/g;
const own = (o: Record<string, string> | undefined, k: string) => (o && Object.prototype.hasOwnProperty.call(o, k) && typeof o[k] === "string" ? o[k] : "");

const DOT_SEGMENT = /(^|\/|%2f|%5c)(\.|%2e){1,2}(\/|%2f|%5c|$)/i;

function normalPath(route: string): boolean {
  const path = route.split(/[?#]/)[0];
  if (DOT_SEGMENT.test(path)) return false;
  try {
    return new URL(path, "http://x").pathname === path;
  } catch {
    return false;
  }
}

function inScope(route: string, role: Role): boolean {
  if (!normalPath(route)) return false;
  const path = route.split(/[?#]/)[0];
  if (path === "/admin" || path.startsWith("/admin/")) return false;
  const m = /^\/portal\/([^/?#]+)/.exec(path);
  return !m || m[1] === role || m[1] === "chat";
}

function rewrite(route: string, role: Role): string {
  let r = route.replace(LOCALE_PREFIX, "") || "/";
  const lawyers = /^\/marketplace\/lawyers(?:\/([^/?#]+))?(?:\/services)?\/?$/.exec(r);
  if (lawyers && role === "client") r = lawyers[1] ? `/portal/client/lawyers/${lawyers[1]}` : "/portal/client/lawyers";
  if (role === "lawyer") r = r.replace(/^\/portal\/(advocate|advokat|yurist)(?=\/|$|\?)/, "/portal/lawyer");
  if (role === "advocate") r = r.replace(/^\/portal\/(lawyer|advokat|yurist)(?=\/|$|\?)/, "/portal/advocate");
  return r;
}

export function copilotRoute(input: { route?: string; pageId?: string; params?: Record<string, string> }, role: Role): string {
  let raw = (input.route ?? "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//") || /[\s\\]/.test(raw)) raw = "";
  if (raw) {
    let missing = false;
    raw = raw.replace(PLACEHOLDER, (_m, a?: string, b?: string, c?: string) => {
      const v = own(input.params, a ?? b ?? c ?? "");
      if (!v) {
        missing = true;
        return "";
      }
      return encodeURIComponent(v);
    });
    if (missing) raw = "";
  }
  if (raw && !normalPath(raw)) raw = "";
  if (raw) {
    const direct = aiRouteFor("", rewrite(raw, role), role);
    if (direct && inScope(direct, role)) return direct;
  }
  const byPage = input.pageId ? aiRouteFor(input.pageId, "", role) : "";
  return byPage && inScope(byPage, role) ? byPage : "";
}

const OPEN_ASK = /(^|[\s,.!?;:"'«(])(och|ochib|ochish|oching|ochgin|ochsang|o['ʻ’`]ting|open|go\s+to|take\s+me|navigate|открой|открыть|откройте|перейди|перейти|перейдите)(?=$|[\s,.!?;:"'»)])/i;

export function askedToOpen(message: string): boolean {
  return OPEN_ASK.test(message);
}
