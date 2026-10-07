import { ApiError, http, asDict, asStr, asNum, asArr, isAborted, parseServerTime, type Dict } from "@/lib/http";
import { featureMissing, noteFeatureError } from "@/lib/endpointGate";
import { uzsOpt } from "@/lib/money";
import { docPayPhase } from "@/lib/services/backend";
import type { Page } from "@/lib/usePaged";

export const SUPPORT_CATEGORIES = ["general", "subscription", "payment", "marketplace", "documents", "urgent_advokat", "account", "technical"] as const;
export const SUPPORT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const SUPPORT_ACTIVE_STATUSES = ["ai_handling", "waiting_operator", "claimed", "transferred", "waiting_client_confirm", "reopened"] as const;
export const SUPPORT_CLOSED_STATUSES = ["closed", "resolved", "cancelled"] as const;
export const SUPPORT_STATUSES = [...SUPPORT_ACTIVE_STATUSES, ...SUPPORT_CLOSED_STATUSES] as const;
export const SUPPORT_PAGE_MAX = 100;

const CLOSED_SET = new Set<string>(SUPPORT_CLOSED_STATUSES);
const SUPERVISOR_ROLES = new Set(["admin", "manager"]);
const GENERIC_TITLES = new Set(["support so'rovi", "support so‘rovi", "ai instruktor orqali support", "support message", "support"]);

export type SupportTicket = {
  id: string;
  workId: string;
  title: string;
  description: string;
  status: string;
  category: string;
  priority: string;
  source: string;
  lastMessage: string;
  lastMessageAt: string;
  clientUserId: string;
  clientName: string;
  clientLexgoId: string;
  operatorUserId: string;
  operatorName: string;
  resolution: string;
  reopenReason: string;
  transferReason: string;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string;
};

export type SupportAttachment = { name: string; url: string; size: number; mime: string };

export type SupportMessage = {
  id: string;
  ticketId: string;
  senderUserId: string;
  senderName: string;
  senderRole: string;
  messageType: string;
  content: string;
  attachments: SupportAttachment[];
  createdAt: string;
};

const person = (v: unknown) => {
  const d = asDict(v);
  return asStr(d.name ?? d.full_name ?? d.lawyer_name).trim();
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function isClosedStatus(status: string): boolean {
  return CLOSED_SET.has(status);
}

export function isActiveTicket(t: Pick<SupportTicket, "status">): boolean {
  return !CLOSED_SET.has(t.status);
}

export function isWaitingTicket(t: Pick<SupportTicket, "status">): boolean {
  return t.status === "waiting_operator" || t.status === "reopened";
}

export function isUrgentPriority(priority: string): boolean {
  return priority === "high" || priority === "urgent";
}

export function isSupportSupervisor(role: string | undefined): boolean {
  return SUPERVISOR_ROLES.has((role ?? "").trim().toLowerCase());
}

export function ticketTitle(t: Pick<SupportTicket, "title" | "description" | "lastMessage">, fallback: string): string {
  const title = t.title.trim();
  if (title && !GENERIC_TITLES.has(title.toLowerCase())) return title;
  const text = (t.description || t.lastMessage).replace(/\s+/g, " ").trim();
  return text ? clip(text, 70) : fallback;
}

export function subjectFrom(message: string): string {
  const text = message.replace(/\s+/g, " ").trim();
  const first = text.split(/(?<=[.!?])\s/)[0] || text;
  return clip(first, 80);
}

export function normSupportTicket(v: unknown): SupportTicket {
  const d = asDict(v);
  const p = asDict(d.payload);
  const client = asDict(d.client);
  const op = asDict(d.assigned_operator ?? d.operator);
  const description = asStr(d.description ?? p.description).trim();
  return {
    id: asStr(d.id ?? d.ticket_id),
    workId: asStr(d.work_id ?? p.work_id),
    title: asStr(d.subject ?? d.title).trim(),
    description,
    status: asStr(d.status, "waiting_operator"),
    category: asStr(d.category ?? p.category, "general"),
    priority: asStr(d.priority ?? p.priority, "normal"),
    source: asStr(d.source ?? p.source),
    lastMessage: (asStr(d.last_message) || asStr(p.last_message) || description).trim(),
    lastMessageAt: asStr(d.last_message_at ?? p.last_message_at),
    clientUserId: asStr(d.client_user_id ?? client.id ?? d.owner_user_id),
    clientName: asStr(d.client_name ?? p.client_name).trim() || person(client),
    clientLexgoId: asStr(d.client_lexgo_id ?? p.client_lexgo_id ?? client.lexgo_id),
    operatorUserId: asStr(d.assigned_operator_user_id ?? p.assigned_operator_user_id ?? op.id),
    operatorName: asStr(d.assigned_operator_name ?? p.assigned_operator_name ?? d.operator_name).trim() || person(op),
    resolution: asStr(d.resolution ?? p.resolution ?? p.resolution_note).trim(),
    reopenReason: asStr(d.reopen_reason ?? p.reopen_reason).trim(),
    transferReason: asStr(d.transfer_reason ?? p.transfer_reason).trim(),
    unreadCount: Math.max(0, Math.floor(asNum(d.unread_count ?? p.unread_count, 0))),
    createdAt: asStr(d.created_at),
    updatedAt: asStr(d.updated_at ?? d.created_at),
    closedAt: asStr(d.closed_at ?? p.closed_at),
  };
}

export function normSupportMessage(v: unknown, ticketId = "", clientUserId = ""): SupportMessage {
  const d = asDict(v);
  const p = asDict(d.payload);
  const sender = asDict(d.sender);
  const senderUserId = asStr(d.sender_user_id ?? p.sender_user_id ?? sender.id ?? d.owner_user_id);
  const messageType = asStr(d.message_type ?? p.message_type, "text");
  const explicitRole = asStr(d.sender_role ?? p.sender_role ?? sender.role);
  const derivedRole = messageType === "system" ? "system" : clientUserId ? (senderUserId === clientUserId ? "client" : "operator") : "";
  const rawTitle = asStr(d.title).trim();
  const content = asStr(d.content ?? p.message ?? p.content ?? d.message ?? d.text) || (rawTitle && rawTitle !== "Support message" && !d.payload ? rawTitle : "");
  return {
    id: asStr(d.id ?? d.message_id),
    ticketId: asStr(d.ticket_id ?? p.ticket_id, ticketId),
    senderUserId,
    senderName: asStr(d.sender_name ?? p.sender_name).trim() || person(sender),
    senderRole: explicitRole || derivedRole,
    messageType,
    content,
    attachments: asArr(d.attachments ?? p.attachments).map((a) => {
      const x = asDict(a);
      return { name: asStr(x.name ?? x.file_name ?? x.filename), url: asStr(x.url ?? x.download_url), size: asNum(x.size ?? x.size_bytes), mime: asStr(x.mime ?? x.content_type) };
    }),
    createdAt: asStr(d.created_at),
  };
}

export function timeOf(iso: string): number {
  const n = parseServerTime(iso);
  return Number.isFinite(n) ? n : 0;
}

export function byMessageTime(a: SupportMessage, b: SupportMessage): number {
  return timeOf(a.createdAt) - timeOf(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function isVisibleMessage(m: SupportMessage): boolean {
  return Boolean(m.content.trim() || m.attachments.length || m.messageType === "system");
}

export function ticketActivity(t: Pick<SupportTicket, "lastMessageAt" | "updatedAt" | "createdAt">): number {
  return Math.max(timeOf(t.lastMessageAt), timeOf(t.updatedAt), timeOf(t.createdAt));
}

function listOf(raw: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(raw)) return raw;
  const d = asDict(raw);
  for (const k of keys) if (Array.isArray(d[k])) return d[k] as unknown[];
  return [];
}

function pageOf<T>(raw: unknown, norm: (v: unknown) => T): Page<T> {
  const d = asDict(raw);
  const items = listOf(raw, "items", "data", "tickets", "messages").map(norm);
  const offset = Math.max(0, asNum(d.offset));
  const seen = offset + items.length;
  const total = Math.max(asNum(d.total, seen), seen);
  const hasMore = typeof d.has_more === "boolean" ? d.has_more : seen < total;
  return { items, total, hasMore: hasMore && items.length > 0 };
}

async function gated<T>(key: "support" | "supportQueue", fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isAborted(e)) noteFeatureError(key, e);
    throw e;
  }
}

const cap = (n: number) => Math.max(1, Math.min(SUPPORT_PAGE_MAX, Math.floor(n) || 1));
const enc = encodeURIComponent;

export const supportAvailable = () => !featureMissing("support");
export const supportQueueAvailable = () => !featureMissing("supportQueue");

export function createSupportTicket(input: {
  message: string;
  category: string;
  priority: string;
  subject?: string;
  source?: string;
  context?: Dict;
}): Promise<SupportTicket> {
  const message = input.message.trim();
  return gated("support", async () =>
    normSupportTicket(
      await http("/support/tickets", {
        method: "POST",
        body: JSON.stringify({
          subject: (input.subject || subjectFrom(message)).slice(0, 255),
          message,
          description: message,
          category: input.category,
          priority: input.priority,
          source: input.source || "client",
          context: input.context ?? {},
        }),
      }),
    ),
  );
}

export function listMySupportTickets(offset: number, limit: number, signal?: AbortSignal, status?: string): Promise<Page<SupportTicket>> {
  const qs = new URLSearchParams({ limit: String(cap(limit)), offset: String(Math.max(0, offset)) });
  if (status) qs.set("status", status);
  return gated("support", async () => pageOf(await http(`/support/tickets/me?${qs.toString()}`, { signal }), normSupportTicket));
}

export function listSupportQueue(
  opts: { status?: string; assignedToMe?: boolean; offset: number; limit: number },
  signal?: AbortSignal,
): Promise<Page<SupportTicket>> {
  const qs = new URLSearchParams({ limit: String(cap(opts.limit)), offset: String(Math.max(0, opts.offset)) });
  if (opts.status) qs.set("status", opts.status);
  if (opts.assignedToMe) qs.set("assigned_to_me", "true");
  return gated("supportQueue", async () => pageOf(await http(`/call-center/support/tickets?${qs.toString()}`, { signal }), normSupportTicket));
}

export async function claimSupportTicket(id: string): Promise<SupportTicket> {
  return normSupportTicket(await http(`/call-center/support/tickets/${enc(id)}/claim`, { method: "POST" }));
}

export async function transferSupportTicket(id: string, operatorUserId: string, reason: string): Promise<SupportTicket> {
  return normSupportTicket(
    await http(`/call-center/support/tickets/${enc(id)}/transfer`, {
      method: "POST",
      body: JSON.stringify({ operator_user_id: operatorUserId, reason }),
    }),
  );
}

export async function closeSupportTicket(id: string, resolution: string): Promise<SupportTicket> {
  return normSupportTicket(
    await http(`/call-center/support/tickets/${enc(id)}/close`, {
      method: "POST",
      body: JSON.stringify({ note: resolution, resolution }),
    }),
  );
}

export async function reopenSupportTicket(id: string, reason = ""): Promise<SupportTicket> {
  return normSupportTicket(
    await http(`/support/tickets/${enc(id)}/reopen`, {
      method: "POST",
      body: JSON.stringify({ reason: reason.trim() }),
    }),
  );
}

export type SupportOperator = { id: string; name: string; lexgoId: string; role: string; status: string };

export async function listSupportOperators(q: string, limit = 30, signal?: AbortSignal): Promise<SupportOperator[]> {
  const qs = new URLSearchParams({ limit: String(cap(limit)) });
  const needle = q.trim();
  if (needle) qs.set("q", needle);
  const raw = await http(`/call-center/support/operators?${qs.toString()}`, { signal });
  return listOf(raw, "items", "data", "operators")
    .map((v) => {
      const x = asDict(v);
      return {
        id: asStr(x.id ?? x.user_id),
        name: asStr(x.name ?? x.full_name).trim(),
        lexgoId: asStr(x.lexgo_id).trim(),
        role: asStr(x.role).trim(),
        status: asStr(x.account_status ?? x.status).trim(),
      };
    })
    .filter((o) => o.id);
}

export type SupportMetaOption = { key: string; label: string };
export type SupportMeta = { categories: SupportMetaOption[]; priorities: SupportMetaOption[]; statuses: string[]; loaded: boolean };

export const SUPPORT_META_FALLBACK: SupportMeta = {
  categories: SUPPORT_CATEGORIES.map((key) => ({ key, label: "" })),
  priorities: SUPPORT_PRIORITIES.map((key) => ({ key, label: "" })),
  statuses: [...SUPPORT_STATUSES],
  loaded: false,
};

let metaNow: SupportMeta = SUPPORT_META_FALLBACK;
let metaLoad: Promise<SupportMeta> | null = null;
const metaListeners = new Set<() => void>();

function metaOptions(v: unknown): SupportMetaOption[] {
  return asArr(v)
    .map((x) => {
      if (typeof x === "string") return { key: x.trim(), label: "" };
      const o = asDict(x);
      return { key: asStr(o.key ?? o.value ?? o.id).trim(), label: asStr(o.label ?? o.title ?? o.name).trim() };
    })
    .filter((o) => o.key);
}

export function supportMetaSnapshot(): SupportMeta {
  return metaNow;
}

export function subscribeSupportMeta(fn: () => void): () => void {
  metaListeners.add(fn);
  return () => {
    metaListeners.delete(fn);
  };
}

export function loadSupportMeta(): Promise<SupportMeta> {
  if (!metaLoad) {
    metaLoad = http("/support/meta")
      .then((raw) => {
        const d = asDict(raw);
        const categories = metaOptions(d.categories);
        const priorities = metaOptions(d.priorities);
        const statuses = metaOptions(d.statuses).map((o) => o.key);
        metaNow = {
          categories: categories.length ? categories : SUPPORT_META_FALLBACK.categories,
          priorities: priorities.length ? priorities : SUPPORT_META_FALLBACK.priorities,
          statuses: statuses.length ? statuses : SUPPORT_META_FALLBACK.statuses,
          loaded: true,
        };
        metaListeners.forEach((fn) => fn());
        return metaNow;
      })
      .catch(() => metaNow);
  }
  return metaLoad;
}

export type MessageOrder = "asc" | "desc";

export type MessageChunk = {
  items: SupportMessage[];
  order: MessageOrder;
  ticket: SupportTicket | null;
};

export type MessageCursor = { order: MessageOrder; loaded: number; start: number; hasOlder: boolean };

type MessagePage = { items: SupportMessage[]; raw: number; total: number; hasMore: boolean; ascending: boolean; ticket: SupportTicket | null };

const NEW_PAGE = 20;
const NEW_PAGES_MAX = 5;

async function fetchMessagePage(
  id: string,
  opts: { order: MessageOrder; offset: number; limit: number; signal?: AbortSignal; clientUserId?: string },
): Promise<MessagePage> {
  const offset = Math.max(0, Math.floor(opts.offset));
  const limit = cap(opts.limit);
  const qs = new URLSearchParams({ order: opts.order, limit: String(limit), offset: String(offset) });
  const raw = await http(`/support/tickets/${enc(id)}/messages?${qs.toString()}`, { signal: opts.signal });
  const d = asDict(raw);
  const ticket = d.ticket ? normSupportTicket(d.ticket) : null;
  const owner = opts.clientUserId || ticket?.clientUserId || "";
  const list = listOf(raw, "items", "data", "messages").map((v) => normSupportMessage(v, id, owner));
  const total = asNum(d.total, NaN);
  const hasMore = typeof d.has_more === "boolean" ? d.has_more : Number.isFinite(total) ? offset + list.length < total : list.length >= limit;
  const first = list[0];
  const last = list[list.length - 1];
  const ascending = list.length > 1 && Boolean(first && last) && timeOf(first.createdAt) < timeOf(last.createdAt);
  return { items: list.filter(isVisibleMessage), raw: list.length, total, hasMore: hasMore && list.length > 0, ascending, ticket };
}

const sortAsc = (items: SupportMessage[]) => [...items].sort(byMessageTime);

export async function loadLatestMessages(id: string, limit = 50, signal?: AbortSignal): Promise<MessageChunk & { cursor: MessageCursor }> {
  const size = cap(limit);
  const head = await fetchMessagePage(id, { order: "desc", offset: 0, limit: size, signal });
  if (!head.ascending) {
    return { items: sortAsc(head.items), order: "desc", ticket: head.ticket, cursor: { order: "desc", loaded: head.raw, start: 0, hasOlder: head.hasMore } };
  }
  const owner = head.ticket?.clientUserId ?? "";
  if (head.hasMore && Number.isFinite(head.total) && head.total > head.raw) {
    const start = Math.max(0, head.total - size);
    const tail = await fetchMessagePage(id, { order: "asc", offset: start, limit: size, signal, clientUserId: owner });
    if (tail.raw) {
      return { items: sortAsc(tail.items), order: "asc", ticket: tail.ticket ?? head.ticket, cursor: { order: "asc", loaded: start + tail.raw, start, hasOlder: start > 0 } };
    }
  }
  return { items: sortAsc(head.items), order: "asc", ticket: head.ticket, cursor: { order: "asc", loaded: head.raw, start: 0, hasOlder: false } };
}

export async function loadOlderMessages(id: string, cursor: MessageCursor, limit = 50, clientUserId = ""): Promise<{ items: SupportMessage[]; cursor: MessageCursor }> {
  if (!cursor.hasOlder) return { items: [], cursor: { ...cursor, hasOlder: false } };
  const size = cap(limit);
  if (cursor.order === "desc") {
    const page = await fetchMessagePage(id, { order: "desc", offset: cursor.loaded, limit: size, clientUserId });
    return { items: sortAsc(page.items), cursor: { ...cursor, loaded: cursor.loaded + page.raw, hasOlder: page.hasMore && page.raw > 0 } };
  }
  const from = Math.max(0, cursor.start - size);
  const span = cursor.start - from;
  if (span <= 0) return { items: [], cursor: { ...cursor, hasOlder: false } };
  const page = await fetchMessagePage(id, { order: "asc", offset: from, limit: span, clientUserId });
  return { items: sortAsc(page.items), cursor: { ...cursor, start: from, hasOlder: from > 0 } };
}

export async function loadNewMessages(
  id: string,
  cursor: MessageCursor,
  clientUserId = "",
  known?: ReadonlySet<string>,
): Promise<{ items: SupportMessage[]; cursor: MessageCursor; ticket: SupportTicket | null }> {
  if (cursor.order === "asc") {
    const page = await fetchMessagePage(id, { order: "asc", offset: cursor.loaded, limit: SUPPORT_PAGE_MAX, clientUserId });
    return { items: sortAsc(page.items), ticket: page.ticket, cursor: { ...cursor, loaded: cursor.loaded + page.raw } };
  }
  const items: SupportMessage[] = [];
  let ticket: SupportTicket | null = null;
  let offset = 0;
  for (let i = 0; i < NEW_PAGES_MAX; i++) {
    const page = await fetchMessagePage(id, { order: "desc", offset, limit: NEW_PAGE, clientUserId });
    ticket = ticket ?? page.ticket;
    items.push(...page.items);
    offset += page.raw;
    if (!known || !page.hasMore || page.raw < NEW_PAGE || page.items.some((m) => known.has(m.id))) break;
  }
  return { items: sortAsc(items), ticket, cursor };
}

export async function getSupportTicket(id: string, signal?: AbortSignal): Promise<SupportTicket | null> {
  try {
    return normSupportTicket(await http(`/support/tickets/${enc(id)}`, { signal }));
  } catch (e) {
    if (isAborted(e)) throw e;
    if (!(e instanceof ApiError && e.status === 404)) return null;
  }
  try {
    const page = await fetchMessagePage(id, { order: "desc", offset: 0, limit: 1, signal });
    return page.ticket;
  } catch (e) {
    if (isAborted(e)) throw e;
    return null;
  }
}

export async function sendSupportMessage(id: string, content: string, clientUserId = ""): Promise<SupportMessage> {
  const text = content.trim();
  const d = asDict(
    await http(`/support/tickets/${enc(id)}/messages`, {
      method: "POST",
      body: JSON.stringify({ message: text, content: text, message_type: "text", attachments: [] }),
    }),
  );
  const wrapped = d.message && typeof d.message === "object" && !Array.isArray(d.message) ? d.message : null;
  return normSupportMessage(wrapped ?? d, id, clientUserId);
}

export type SupportCallKind = "audio" | "video";
export type SupportCallSession = { id: string; workId: string; roomId: string; callType: SupportCallKind; title: string; status: string; joinUrl: string };

export function supportCallHref(roomId: string, callId: string): string {
  return `/portal/chat/${enc(roomId)}?join=${enc(callId)}`;
}

export async function startSupportCall(ticketId: string, callType: SupportCallKind, title?: string, maxDurationMinutes = 30): Promise<SupportCallSession> {
  const d = asDict(
    await http(`/call-center/support/tickets/${enc(ticketId)}/calls`, {
      method: "POST",
      body: JSON.stringify({ call_type: callType, ...(title ? { title } : {}), max_duration_minutes: maxDurationMinutes }),
    }),
  );
  return {
    id: asStr(d.id ?? d.call_id),
    workId: asStr(d.work_id),
    roomId: asStr(d.room_id),
    callType: asStr(d.call_type, callType) === "video" ? "video" : "audio",
    title: asStr(d.title),
    status: asStr(d.status),
    joinUrl: asStr(d.join_url),
  };
}

export const SUPPORT_ASSIST_EVENTS = [
  "support.assist_subscription_preview_created",
  "support.assist_subscription_checkout_created",
  "support.assist_document_request_created",
  "support.assist_marketplace_purchase_requested",
  "support.assist_urgent_advokat_request_created",
] as const;

export type SupportAssistKind = "subscription_preview" | "subscription_checkout" | "document_request" | "marketplace_purchase" | "urgent_advokat";

const ASSIST_KIND: Record<string, SupportAssistKind> = {
  "support.assist_subscription_preview_created": "subscription_preview",
  "support.assist_subscription_checkout_created": "subscription_checkout",
  "support.assist_document_request_created": "document_request",
  "support.assist_marketplace_purchase_requested": "marketplace_purchase",
  "support.assist_urgent_advokat_request_created": "urgent_advokat",
};

export type SupportAssistPay = "" | "pending" | "sent" | "approved" | "rejected";

export type SupportAssistInfo = {
  kind: SupportAssistKind;
  workId: string;
  title: string;
  amount: number;
  currency: string;
  status: string;
  telegramSent: boolean | null;
  targetId: string;
  pay: SupportAssistPay;
};

const ASSIST_POOL = new Set(["open_pool", "lawyer_review_requested", "claimed", "lawyer_review", "in_progress", "review"]);

function assistDocPay(a: Dict, request: Dict, lawyerRequest: Dict, gate: Dict): SupportAssistPay {
  const statuses = [request.status, lawyerRequest.status, lawyerRequest.pool_status, a.status].map((s) => asStr(s).toLowerCase()).filter(Boolean);
  const gateStatus = asStr(gate.status).toLowerCase();
  const phases = statuses.map((s) => docPayPhase(s, true));
  if (phases.includes("cancelled") || gateStatus === "rejected" || gateStatus === "cancelled") return "rejected";
  if (a.payment_required === true || request.payment_required === true || gateStatus === "pending" || phases.includes("wait")) return "pending";
  if (gateStatus === "approved" || gateStatus === "paid") return "approved";
  return statuses.some((s) => ASSIST_POOL.has(s)) ? "sent" : "";
}

export function assistInfoOf(name: string, action: unknown, locale = ""): SupportAssistInfo | null {
  const kind = ASSIST_KIND[name];
  if (!kind) return null;
  const a = asDict(action);
  const plan = asDict(a.plan);
  const request = asDict(a.request);
  const lawyerRequest = asDict(a.lawyer_request);
  const order = asDict(a.order);
  const purchase = asDict(a.purchase_request);
  const payment = asDict(a.payment);
  const gate = asDict(a.payment_gate ?? request.payment_gate ?? lawyerRequest.payment_gate);
  const urgent = kind === "urgent_advokat" ? asDict(a.urgent_request ?? a.urgent_advokat_request ?? a.record ?? (request.id ? request : a)) : {};
  const planName = locale ? asStr(asDict(plan.name)[locale]).trim() : "";
  const workId =
    asStr(a.work_id).trim() ||
    asStr(urgent.work_id).trim() ||
    asStr(asDict(urgent.payload).work_id).trim() ||
    asStr(request.work_id).trim() ||
    asStr(lawyerRequest.work_id).trim() ||
    asStr(asDict(lawyerRequest.payload).work_id).trim() ||
    asStr(order.work_id).trim() ||
    asStr(purchase.work_id).trim();
  const title = planName || asStr(plan.title).trim() || asStr(urgent.title).trim() || asStr(request.title).trim() || asStr(order.service_title).trim() || asStr(purchase.title).trim();
  const amount = uzsOpt(a, "amount") ?? uzsOpt(gate, "amount") ?? uzsOpt(urgent, "price") ?? uzsOpt(request, "price") ?? uzsOpt(order, "price") ?? uzsOpt(payment, "amount") ?? 0;
  const targetId =
    kind === "urgent_advokat"
      ? asStr(urgent.id ?? urgent.record_id ?? a.record_id)
      : kind === "document_request"
        ? asStr(request.id ?? lawyerRequest.document_request_id ?? a.document_request_id)
        : kind === "marketplace_purchase"
          ? asStr(order.id ?? a.order_id)
          : asStr(a.id ?? purchase.id);
  return {
    kind,
    workId,
    title,
    amount: Math.max(0, amount),
    currency: asStr(a.currency ?? gate.currency ?? urgent.currency ?? order.currency ?? request.currency ?? payment.currency, "UZS"),
    status: asStr(a.status ?? urgent.status ?? request.status ?? order.status),
    telegramSent: typeof a.telegram_sent === "boolean" ? a.telegram_sent : typeof gate.telegram_sent === "boolean" ? gate.telegram_sent : null,
    targetId,
    pay: kind === "document_request" ? assistDocPay(a, request, lawyerRequest, gate) : "",
  };
}

export type SupportEventKind = "created" | "claimed" | "transferred" | "closed" | "reopened" | "message" | "call" | "assist" | "updated";

export type SupportCall = { callId: string; roomId: string; callType: SupportCallKind; title: string; status: string };

export type SupportEvent = {
  name: string;
  kind: SupportEventKind;
  ticketId: string;
  ticket: SupportTicket | null;
  message: SupportMessage | null;
  messages: SupportMessage[];
  call: SupportCall | null;
  action: Dict | null;
  clientUserId: string;
  operatorUserId: string;
  senderUserId: string;
  createdAt: string;
};

const EVENT_KIND: Record<string, SupportEventKind> = {
  "support.ticket_created": "created",
  "support.ticket_claimed": "claimed",
  "support.ticket_transferred": "transferred",
  "support.ticket_transferred_to_you": "transferred",
  "support.ticket_closed": "closed",
  "support.ticket_reopened": "reopened",
  "support.ticket_message": "message",
  "support.call_created": "call",
};

function callOf(src: Dict): SupportCall | null {
  const m = asDict(src.message);
  const c = asDict(m.call ?? src.call);
  const callId = asStr(m.call_id ?? src.call_id ?? c.id);
  const roomId = asStr(m.room_id ?? src.room_id ?? c.room_id);
  if (!callId || !roomId) return null;
  return { callId, roomId, callType: asStr(c.call_type) === "video" ? "video" : "audio", title: asStr(c.title), status: asStr(c.status) };
}

export function supportEventOf(e: Dict): SupportEvent | null {
  let name = asStr(e.event);
  let src: Dict = e;
  if (name === "notification.created") {
    const n = asDict(e.notification);
    const nd = asDict(n.data ?? n.meta);
    name = asStr(nd.event ?? n.kind);
    src = nd;
  }
  if (!name.startsWith("support.")) return null;
  const kind: SupportEventKind = ASSIST_KIND[name] || name.startsWith("support.assist_") ? "assist" : (EVENT_KIND[name] ?? "updated");
  const raw = asDict(src.message);
  const parsed = src.ticket ? normSupportTicket(src.ticket) : null;
  const ticket = parsed && parsed.id ? parsed : null;
  const ticketId = asStr(src.ticket_id) || ticket?.id || asStr(raw.ticket_id) || asStr(asDict(raw.payload).ticket_id);
  if (!ticketId) return null;
  const clientUserId = asStr(src.client_user_id ?? raw.client_user_id) || ticket?.clientUserId || "";
  const hasMessage = (kind === "message" || kind === "created") && Boolean(raw.id || raw.content || raw.message);
  const message = hasMessage ? normSupportMessage(raw, ticketId, clientUserId) : null;
  const action = kind === "assist" ? asDict(src.action ?? raw.action) : null;
  return {
    name,
    kind,
    ticketId,
    ticket,
    message,
    messages: message && message.id ? [message] : [],
    call: kind === "call" ? callOf(src) : null,
    action,
    clientUserId,
    operatorUserId: asStr(src.operator_user_id ?? raw.operator_user_id) || ticket?.operatorUserId || "",
    senderUserId: message?.senderUserId || asStr(src.sender_user_id),
    createdAt: asStr(src.created_at ?? raw.created_at),
  };
}

export function mergeSupportEvents(a: SupportEvent, b: SupportEvent): SupportEvent {
  const ids = new Set(a.messages.map((m) => m.id));
  const messages = [...a.messages, ...b.messages.filter((m) => !ids.has(m.id))].sort(byMessageTime);
  const action = b.action && Object.keys(b.action).length ? b.action : a.action;
  return {
    name: b.ticket || !a.ticket ? b.name : a.name,
    kind: b.kind,
    ticketId: b.ticketId || a.ticketId,
    ticket: b.ticket ?? a.ticket,
    message: messages[messages.length - 1] ?? b.message ?? a.message,
    messages,
    call: b.call ?? a.call,
    action,
    clientUserId: b.clientUserId || a.clientUserId,
    operatorUserId: b.operatorUserId || a.operatorUserId,
    senderUserId: b.senderUserId || a.senderUserId,
    createdAt: b.createdAt || a.createdAt,
  };
}

export function supportCategoryFor(path: string, message = ""): string {
  const p = path.toLowerCase();
  const m = message.toLowerCase();
  if (/to.?lov|payme|click|karta|pul|оплат|payment/.test(m) || p.includes("/payments")) return "payment";
  if (p.includes("/subscription") || /tarif|obuna|paket|тариф|подписк|plan/.test(m)) return "subscription";
  if (p.includes("/lawyers") || p.includes("/marketplace") || /advokat|yurist|адвокат|юрист|lawyer/.test(m)) return "marketplace";
  if (p.includes("/services") || p.includes("/documents") || /hujjat|ariza|shartnoma|документ|document/.test(m)) return "documents";
  if (p.includes("/urgent") || /tezkor|срочн|urgent/.test(m)) return "urgent_advokat";
  if (p.includes("/profile") || /parol|login|kirish|hisob|аккаунт|account/.test(m)) return "account";
  return "general";
}
