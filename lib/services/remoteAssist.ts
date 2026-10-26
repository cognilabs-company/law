import { http, asDict, asStr, asNum, asArr, ApiError, type Dict } from "@/lib/http";

// Remote assistance (contract 1.0, 2026-10-26): during an active support call
// the operator helps the client inside LexGo only — never the OS, never pixels.
// The client's tab publishes the registered components on its screen
// (page_id, component_id, label, allowed actions, sensitivity, coarse state —
// never a value), the operator sends semantic commands against them, and the
// client's tab runs each through the centralized executor and acknowledges
// it. The client consents first and can pause, resume, revoke or end at any
// moment; supervisors can emergency-revoke.
//
// Modes, actions and capabilities come from GET /remote-assistance/meta and
// the session's own `capabilities`; nothing here re-derives them.

const enc = encodeURIComponent;

export type RaPhase = "pending" | "active" | "paused" | "closed";
export type RaSensitivity = "normal" | "personal" | "secret";
export const RA_STATES = ["empty", "filled", "invalid", "disabled", "selected", "unselected", "loading", "ready", "hidden"] as const;
export type RaState = (typeof RA_STATES)[number];

// The two scopes the contract names outside the action table: seeing the page
// context at all, and touching fields marked personal.
export const RA_VIEW_SCOPE = "view_page_context";
export const RA_PERSONAL_SCOPE = "personal_form_fill";

export type RaElement = {
  componentId: string;
  label: string;
  actions: string[];
  sensitivity: RaSensitivity;
  state: string;
};

export type RaParty = { id: string; name: string; lexgoId: string; role: string };

export type RaCaps = {
  canConsent: boolean;
  canPause: boolean;
  canResume: boolean;
  canRevoke: boolean;
  canCommand: boolean;
  canEnd: boolean;
};

export type RaSession = {
  id: string;
  ticketId: string;
  callId: string;
  status: string;
  phase: RaPhase;
  mode: string;
  reason: string;
  requestedScopes: string[];
  grantedScopes: string[];
  client: RaParty;
  operator: RaParty;
  currentPageId: string;
  currentRoute: string;
  clientUiRevision: number;
  manifest: RaElement[];
  consentVersion: string;
  durationMinutes: number;
  createdAt: string;
  expiresAt: string;
  lastClientSeenAt: string;
  pausedAt: string;
  endedAt: string;
  endReason: string;
  // null when the payload carried no capabilities object (a socket event's
  // partial session): keep the last known ones instead of guessing.
  caps: RaCaps | null;
};

export type RaCommand = {
  id: string;
  idempotencyKey: string;
  actionId: string;
  pageId: string;
  componentId: string;
  payload: Dict;
  expectedUiRevision: number;
  requiresConfirmation: boolean;
  status: string;
  failureCode: string;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
};

export type RaAudit = {
  id: string;
  eventType: string;
  actor: RaParty;
  metadata: Dict;
  createdAt: string;
  previousHash: string;
  eventHash: string;
};

export type RaActionMeta = { id: string; scope: string; modes: string[]; componentRequired: boolean; confirm: boolean };
export type RaModeMeta = { key: string; scopes: string[] };
export type RaMeta = {
  contractVersion: string;
  consentVersion: string;
  modes: RaModeMeta[];
  actions: RaActionMeta[];
  maxMinutes: number;
  idlePauseSeconds: number;
  commandTtlSeconds: number;
  security: Record<string, boolean>;
  capabilities: Record<string, boolean>;
  loaded: boolean;
};

// Until /meta answers nothing is offered: no modes, no actions, no rights.
export const RA_EMPTY_META: RaMeta = {
  contractVersion: "",
  consentVersion: "1.0",
  modes: [],
  actions: [],
  maxMinutes: 30,
  idlePauseSeconds: 90,
  commandTtlSeconds: 20,
  security: {},
  capabilities: {},
  loaded: false,
};

const TERMINAL = new Set(["denied", "revoked", "ended", "expired", "emergency_revoked"]);

export function raPhaseOf(status: string): RaPhase {
  const s = status.toLowerCase();
  if (s === "pending_consent") return "pending";
  if (s === "active") return "active";
  if (s === "paused") return "paused";
  if (TERMINAL.has(s)) return "closed";
  // Unknown non-terminal values are treated as still waiting, never as live.
  return s ? "pending" : "closed";
}

const strs = (v: unknown): string[] => asArr(v).map((x) => (typeof x === "string" ? x : asStr(asDict(x).key ?? asDict(x).id))).filter(Boolean);
const bool = (v: unknown) => v === true;

function sensitivityOf(v: unknown): RaSensitivity {
  const s = asStr(v).toLowerCase();
  return s === "secret" || s === "personal" ? s : "normal";
}

export function normRaElement(v: unknown): RaElement {
  const d = asDict(v);
  return {
    componentId: asStr(d.component_id),
    label: asStr(d.label),
    actions: strs(d.actions),
    sensitivity: sensitivityOf(d.sensitivity),
    state: asStr(d.state, "ready"),
  };
}

function partyOf(v: unknown): RaParty {
  const d = asDict(v);
  return { id: asStr(d.id), name: asStr(d.name ?? d.full_name).trim(), lexgoId: asStr(d.lexgo_id), role: asStr(d.role) };
}

function capsOf(v: unknown): RaCaps | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Dict;
  return {
    canConsent: bool(d.can_consent),
    canPause: bool(d.can_pause),
    canResume: bool(d.can_resume),
    canRevoke: bool(d.can_revoke),
    canCommand: bool(d.can_command),
    canEnd: bool(d.can_end),
  };
}

// Session payloads arrive bare (REST) or wrapped ({session}) in socket events.
function sessionDict(raw: unknown): Dict {
  const d = asDict(raw);
  const inner = asDict(d.session);
  return inner.id ? inner : d;
}

export function normRaSession(raw: unknown): RaSession {
  const d = sessionDict(raw);
  const status = asStr(d.status).toLowerCase();
  return {
    id: asStr(d.id),
    ticketId: asStr(d.ticket_id),
    callId: asStr(d.call_id),
    status,
    phase: raPhaseOf(status),
    mode: asStr(d.mode),
    reason: asStr(d.reason),
    requestedScopes: strs(d.requested_scopes),
    grantedScopes: strs(d.granted_scopes),
    client: partyOf(d.client),
    operator: partyOf(d.operator),
    currentPageId: asStr(d.current_page_id),
    currentRoute: asStr(d.current_route),
    clientUiRevision: asNum(d.client_ui_revision),
    manifest: asArr(d.manifest).map(normRaElement).filter((e) => e.componentId),
    consentVersion: asStr(d.consent_version),
    durationMinutes: asNum(d.duration_minutes),
    createdAt: asStr(d.created_at),
    expiresAt: asStr(d.expires_at),
    lastClientSeenAt: asStr(d.last_client_seen_at),
    pausedAt: asStr(d.paused_at),
    endedAt: asStr(d.ended_at ?? d.revoked_at),
    endReason: asStr(d.end_reason),
    caps: capsOf(d.capabilities),
  };
}

// A fresh payload over what we had: a socket event may carry only part of the
// session, so empty fields keep their previous values.
export function mergeRaSession(prev: RaSession | null, next: RaSession): RaSession {
  if (!prev || prev.id !== next.id) return next;
  return {
    ...next,
    mode: next.mode || prev.mode,
    ticketId: next.ticketId || prev.ticketId,
    callId: next.callId || prev.callId,
    reason: next.reason || prev.reason,
    requestedScopes: next.requestedScopes.length ? next.requestedScopes : prev.requestedScopes,
    grantedScopes: next.grantedScopes.length ? next.grantedScopes : prev.grantedScopes,
    client: next.client.id || next.client.name ? next.client : prev.client,
    operator: next.operator.id || next.operator.name ? next.operator : prev.operator,
    expiresAt: next.expiresAt || prev.expiresAt,
    status: next.status || prev.status,
    phase: next.status ? next.phase : prev.phase,
    caps: next.caps ?? prev.caps,
    ...(next.clientUiRevision >= prev.clientUiRevision && (next.currentPageId || next.manifest.length)
      ? {}
      : { currentPageId: prev.currentPageId, currentRoute: prev.currentRoute, clientUiRevision: prev.clientUiRevision, manifest: prev.manifest }),
  };
}

export function normRaCommand(v: unknown): RaCommand {
  const d = asDict(asDict(v).command ?? v);
  return {
    id: asStr(d.id ?? d.command_id),
    idempotencyKey: asStr(d.idempotency_key),
    actionId: asStr(d.action_id),
    pageId: asStr(d.page_id),
    componentId: asStr(d.component_id),
    payload: asDict(d.payload),
    expectedUiRevision: asNum(d.expected_ui_revision),
    requiresConfirmation: bool(d.requires_confirmation ?? d.requires_client_confirmation),
    status: asStr(d.status, "pending").toLowerCase(),
    failureCode: asStr(d.failure_code),
    createdAt: asStr(d.created_at),
    expiresAt: asStr(d.expires_at),
    updatedAt: asStr(d.acknowledged_at ?? d.updated_at ?? d.created_at),
  };
}

function normAudit(v: unknown): RaAudit {
  const d = asDict(v);
  const actor = partyOf(d.actor);
  return {
    id: asStr(d.id),
    eventType: asStr(d.event_type ?? d.event),
    actor: { ...actor, name: actor.name || asStr(d.actor_name).trim(), role: actor.role || asStr(d.actor_role) },
    metadata: asDict(d.metadata ?? d.meta),
    createdAt: asStr(d.created_at),
    previousHash: asStr(d.previous_hash),
    eventHash: asStr(d.event_hash),
  };
}

const itemsOf = (raw: unknown): unknown[] => (Array.isArray(raw) ? raw : asArr(asDict(raw).items));
export type RaPage<T> = { items: T[]; count: number };
function pageOf<T>(raw: unknown, norm: (v: unknown) => T): RaPage<T> {
  const items = itemsOf(raw).map(norm);
  return { items, count: Math.max(asNum(asDict(raw).count, items.length), items.length) };
}

// ---- meta ----

export function normRaMeta(raw: unknown): RaMeta {
  const d = asDict(raw);
  const session = asDict(d.session);
  const flags = (v: unknown) => Object.fromEntries(Object.entries(asDict(v)).map(([k, x]) => [k, x === true]));
  return {
    contractVersion: asStr(d.contract_version),
    consentVersion: asStr(d.consent_version, "1.0"),
    modes: asArr(d.modes)
      .map((m) => ({ key: asStr(asDict(m).key), scopes: strs(asDict(m).scopes) }))
      .filter((m) => m.key),
    actions: asArr(d.actions)
      .map((a) => {
        const x = asDict(a);
        return {
          id: asStr(x.action_id),
          scope: asStr(x.scope),
          modes: strs(x.modes),
          componentRequired: bool(x.component_required),
          confirm: bool(x.requires_client_confirmation),
        };
      })
      .filter((a) => a.id),
    maxMinutes: asNum(session.max_minutes, 30),
    idlePauseSeconds: asNum(session.idle_pause_seconds, 90),
    commandTtlSeconds: asNum(session.command_ttl_seconds, 20),
    security: flags(d.security),
    capabilities: flags(d.capabilities),
    loaded: true,
  };
}

let metaCache: RaMeta | null = null;
let metaReq: Promise<RaMeta> | null = null;

// Once per signed-in runtime; a failure is not cached so the next caller retries.
export function loadRaMeta(): Promise<RaMeta> {
  if (metaCache) return Promise.resolve(metaCache);
  metaReq ??= http("/remote-assistance/meta")
    .then((raw) => (metaCache = normRaMeta(raw)))
    .catch(() => {
      metaReq = null;
      return RA_EMPTY_META;
    });
  return metaReq;
}

export function forgetRaMeta(): void {
  metaCache = null;
  metaReq = null;
}

// The scopes an operator may ask for in a mode: the mode's own list when the
// backend sends one, else every scope its actions need, plus the two
// contract-level scopes (page context always; personal fields where the mode
// can change values).
export function raModeScopes(meta: RaMeta, mode: string): string[] {
  const own = meta.modes.find((m) => m.key === mode)?.scopes ?? [];
  if (own.length) return own;
  const acts = meta.actions.filter((a) => a.modes.includes(mode));
  const out = new Set<string>([RA_VIEW_SCOPE]);
  for (const a of acts) if (a.scope) out.add(a.scope);
  if (acts.some((a) => a.id.startsWith("form.") || a.id === "draft.prepare")) out.add(RA_PERSONAL_SCOPE);
  return [...out];
}

// The one-click request: the offered mode (capability not switched off)
// whose scope list is the widest, so a single "Request" covers what the
// session may need; ties keep the backend's order.
export function raBestMode(meta: RaMeta): string {
  let best = "";
  let n = -1;
  for (const m of meta.modes) {
    if (meta.capabilities[m.key] === false) continue;
    const k = raModeScopes(meta, m.key).length;
    if (k > n) {
      best = m.key;
      n = k;
    }
  }
  return best;
}

// One-click consent: the client grants exactly what was asked, nothing more.
export function raConsentScopes(requested: readonly string[], decision: "accept" | "deny"): string[] {
  return decision === "accept" ? [...new Set(requested)].slice(0, 20) : [];
}

// Actions the granted mode + scopes permit, straight from the meta table.
export function raGrantedActions(meta: RaMeta, mode: string, scopes: string[]): Set<string> {
  const granted = new Set(scopes);
  const out = new Set<string>();
  for (const a of meta.actions) {
    if (!a.modes.includes(mode)) continue;
    if (a.scope && !granted.has(a.scope)) continue;
    out.add(a.id);
  }
  return out;
}

const VALUE_ACTIONS = new Set(["form.set_value", "form.select_option", "form.toggle", "draft.prepare", "element.focus"]);

// What the operator may do to one published element in this session: the
// element's own actions ∩ the granted ones; a personal field's value actions
// also need the separate personal_form_fill scope; secret never.
export function raElementActions(el: RaElement, granted: Set<string>, scopes: string[]): string[] {
  if (el.sensitivity === "secret") return [];
  const personalOk = scopes.includes(RA_PERSONAL_SCOPE);
  return el.actions.filter((a) => granted.has(a) && !(el.sensitivity === "personal" && VALUE_ACTIONS.has(a) && !personalOk));
}

// ---- device session + keys ----

const DEVICE_KEY = "lexgo_ra_device";

function randomId(): string {
  const c: Crypto | undefined = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (!c) throw new Error("crypto_unavailable");
  c.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

// One cryptographically random id per authenticated tab runtime (no hardware
// or fingerprint data). The consent, every published state and every ack carry
// it; the backend revokes access when it changes.
export function raDeviceSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = sessionStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `web-${randomId()}`;
      sessionStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return (memDevice ??= `web-${randomId()}`);
  }
}
let memDevice: string | undefined;

export function forgetRaDevice(): void {
  memDevice = undefined;
  try {
    sessionStorage.removeItem(DEVICE_KEY);
  } catch {
    /* nothing stored */
  }
}

// One key per operator intent (made when they press the button); retries of
// the same intent reuse it so the backend returns the original command.
export function raIdempotencyKey(actionId: string): string {
  return `ra-${actionId.replace(/[^a-z0-9]+/gi, "-")}-${randomId()}`.slice(0, 120);
}

// A message key for a dotted id ("form.set_value" → "form_set_value"):
// next-intl reads dots as nesting.
export const raKey = (id: string): string => id.replace(/[^A-Za-z0-9_]+/g, "_");

// ---- errors ----

export function raErrorCode(e: unknown): string {
  if (!(e instanceof ApiError)) return "";
  if (e.code) return e.code;
  return asStr(asDict(e.data.detail).code);
}

// Extra fields of an error's detail (session_id on 409 already-active,
// retry_after_seconds on 429).
export function raErrorDetail(e: unknown): Dict {
  return e instanceof ApiError ? asDict(e.data.detail) : {};
}

// ---- endpoints ----

export async function requestRemoteAssist(
  ticketId: string,
  input: { callId: string; mode: string; scopes: string[]; reason: string; durationMinutes: number },
): Promise<RaSession> {
  return normRaSession(
    await http(`/call-center/support/tickets/${enc(ticketId)}/remote-assist/sessions`, {
      method: "POST",
      body: JSON.stringify({
        call_id: input.callId,
        mode: input.mode,
        requested_scopes: input.scopes.slice(0, 20),
        reason: input.reason.slice(0, 500),
        duration_minutes: Math.round(input.durationMinutes),
      }),
    }),
  );
}

export async function listPendingRemoteAssist(signal?: AbortSignal): Promise<RaPage<RaSession>> {
  const p = pageOf(await http("/remote-assistance/sessions/pending?limit=20&offset=0", { signal }), normRaSession);
  return { items: p.items.filter((s) => s.id), count: p.count };
}

export async function getRemoteAssist(id: string, signal?: AbortSignal): Promise<RaSession> {
  return normRaSession(await http(`/remote-assistance/sessions/${enc(id)}`, { signal }));
}

export async function consentRemoteAssist(
  id: string,
  input: { decision: "accept" | "deny"; mode: string; grantedScopes: string[]; consentVersion: string },
): Promise<RaSession> {
  return normRaSession(
    await http(`/remote-assistance/sessions/${enc(id)}/consent`, {
      method: "POST",
      body: JSON.stringify({
        decision: input.decision,
        mode: input.mode,
        granted_scopes: input.decision === "accept" ? input.grantedScopes.slice(0, 20) : [],
        device_session_id: raDeviceSessionId(),
        consent_version: input.consentVersion || "1.0",
      }),
    }),
  );
}

export type RaStateBody = { pageId: string; route: string; uiRevision: number; elements: RaElement[] };

// The wire shape of a client state, shared by REST and the socket.
export function clientStateBody(s: RaStateBody): Dict {
  return {
    device_session_id: raDeviceSessionId(),
    page_id: s.pageId.slice(0, 160),
    route: s.route.slice(0, 500),
    ui_revision: Math.max(1, Math.floor(s.uiRevision)),
    elements: s.elements.slice(0, 300).map((e) => ({
      component_id: e.componentId.slice(0, 200),
      label: e.label.slice(0, 200),
      actions: e.actions.slice(0, 20),
      sensitivity: e.sensitivity,
      state: e.state,
    })),
  };
}

export async function publishClientState(id: string, state: RaStateBody): Promise<void> {
  await http(`/remote-assistance/sessions/${enc(id)}/client-state`, { method: "POST", body: JSON.stringify(clientStateBody(state)) });
}

const reasonBody = (reason = "") => JSON.stringify({ reason: reason.slice(0, 255) });

export async function pauseRemoteAssist(id: string, reason = ""): Promise<RaSession> {
  return normRaSession(await http(`/remote-assistance/sessions/${enc(id)}/pause`, { method: "POST", body: reasonBody(reason) }));
}
export async function resumeRemoteAssist(id: string): Promise<RaSession> {
  return normRaSession(await http(`/remote-assistance/sessions/${enc(id)}/resume`, { method: "POST", body: reasonBody() }));
}
export async function revokeRemoteAssist(id: string, reason = ""): Promise<RaSession> {
  return normRaSession(await http(`/remote-assistance/sessions/${enc(id)}/revoke`, { method: "POST", body: reasonBody(reason) }));
}
export async function endRemoteAssist(id: string, reason = ""): Promise<RaSession> {
  return normRaSession(await http(`/remote-assistance/sessions/${enc(id)}/end`, { method: "POST", body: reasonBody(reason) }));
}

const isNetworkError = (e: unknown) => e instanceof ApiError && e.status === 0 && e.detail !== "aborted";

export async function sendRaCommand(
  id: string,
  input: { idempotencyKey: string; actionId: string; pageId: string; componentId?: string; payload?: Dict; expectedUiRevision: number },
): Promise<RaCommand> {
  const body = JSON.stringify({
    idempotency_key: input.idempotencyKey,
    action_id: input.actionId,
    page_id: input.pageId,
    component_id: input.componentId ?? "",
    payload: input.payload ?? {},
    expected_ui_revision: Math.max(1, Math.floor(input.expectedUiRevision)),
  });
  const send = async () => normRaCommand(await http(`/remote-assistance/sessions/${enc(id)}/commands`, { method: "POST", body }));
  try {
    return await send();
  } catch (e) {
    // A timeout may have reached the server: the same key returns the
    // original command instead of creating a second one.
    if (!isNetworkError(e)) throw e;
    return send();
  }
}

export async function listRaCommands(id: string, status = "", signal?: AbortSignal): Promise<RaCommand[]> {
  const qs = new URLSearchParams({ status, limit: "50", offset: "0" });
  return itemsOf(await http(`/remote-assistance/sessions/${enc(id)}/commands?${qs.toString()}`, { signal }))
    .map(normRaCommand)
    .filter((c) => c.id);
}

export type RaAckStatus = "executed" | "rejected" | "confirmation_required" | "confirmed" | "cancelled";
export type RaAck = { status: RaAckStatus; failureCode?: string; result?: Dict };

export function ackBody(commandId: string, ack: RaAck): Dict {
  return {
    command_id: commandId,
    device_session_id: raDeviceSessionId(),
    status: ack.status,
    failure_code: (ack.failureCode ?? "").slice(0, 120),
    result: ack.result ?? {},
  };
}

export async function ackRaCommand(id: string, commandId: string, ack: RaAck): Promise<void> {
  const { command_id: _omit, ...body } = ackBody(commandId, ack);
  void _omit;
  await http(`/remote-assistance/sessions/${enc(id)}/commands/${enc(commandId)}/ack`, { method: "POST", body: JSON.stringify(body) });
}

export async function raAudit(id: string, signal?: AbortSignal): Promise<RaAudit[]> {
  return itemsOf(await http(`/remote-assistance/sessions/${enc(id)}/audit?limit=100&offset=0`, { signal })).map(normAudit);
}

// ---- admin ----

export async function listRaSessions(
  filters: { status?: string; operatorUserId?: string; clientUserId?: string; ticketId?: string; limit?: number; offset?: number },
  signal?: AbortSignal,
): Promise<RaPage<RaSession>> {
  const qs = new URLSearchParams({
    status: filters.status ?? "",
    operator_user_id: filters.operatorUserId ?? "",
    client_user_id: filters.clientUserId ?? "",
    ticket_id: filters.ticketId ?? "",
    limit: String(filters.limit ?? 50),
    offset: String(filters.offset ?? 0),
  });
  const p = pageOf(await http(`/admin/remote-assistance/sessions?${qs.toString()}`, { signal }), normRaSession);
  return { items: p.items.filter((s) => s.id), count: p.count };
}

export type RaMonitoring = {
  active: number;
  pendingConsent: number;
  paused: number;
  todayTotal: number;
  todayRejectedCommands: number;
  sessions: RaSession[];
};

export function normRaMonitoring(raw: unknown): RaMonitoring {
  const d = asDict(raw);
  const n = (...keys: string[]) => {
    for (const k of keys) if (d[k] !== undefined && d[k] !== null) return asNum(d[k]);
    return 0;
  };
  return {
    active: n("active", "active_count"),
    pendingConsent: n("pending_consent", "pending_consent_count"),
    paused: n("paused", "paused_count"),
    todayTotal: n("today_total", "total_today"),
    todayRejectedCommands: n("today_rejected_commands", "today_rejected_command_count", "rejected_commands_today"),
    sessions: asArr(d.active_sessions ?? d.sessions).map(normRaSession).filter((s) => s.id),
  };
}

export async function raMonitoring(signal?: AbortSignal): Promise<RaMonitoring> {
  return normRaMonitoring(await http("/admin/remote-assistance/monitoring", { signal }));
}

export async function emergencyRevokeRemoteAssist(id: string, reason: string): Promise<RaSession> {
  return normRaSession(await http(`/admin/remote-assistance/sessions/${enc(id)}/emergency-revoke`, { method: "POST", body: reasonBody(reason) }));
}
