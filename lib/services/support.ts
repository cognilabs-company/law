import { http, asDict, asStr, asNum, asArr, isAborted, type Dict } from "@/lib/http";
import { featureMissing, noteFeatureError } from "@/lib/endpointGate";
import type { Page } from "@/lib/usePaged";

export const SUPPORT_CATEGORIES = ["general", "subscription", "payment", "marketplace", "documents", "urgent_advokat", "account", "technical"] as const;
export const SUPPORT_PRIORITIES = ["low", "normal", "high"] as const;
export const SUPPORT_STATUSES = ["ai_handling", "waiting_operator", "claimed", "transferred", "waiting_client_confirm", "reopened", "closed"] as const;
export const SUPPORT_ACTIVE_STATUSES = ["ai_handling", "waiting_operator", "claimed", "transferred", "waiting_client_confirm", "reopened"] as const;
export const SUPPORT_PAGE_MAX = 100;

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

export function isActiveTicket(t: Pick<SupportTicket, "status">): boolean {
  return t.status !== "closed";
}

export function isWaitingTicket(t: Pick<SupportTicket, "status">): boolean {
  return t.status === "waiting_operator" || t.status === "reopened";
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

function pageOf<T>(d: Dict, norm: (v: unknown) => T): Page<T> {
  const items = asArr(d.items ?? d.data ?? d.tickets ?? d.messages).map(norm);
  const offset = asNum(d.offset);
  const limit = asNum(d.limit);
  const full = limit > 0 ? items.length >= limit : items.length > 0;
  const claimed = typeof d.has_more === "boolean" ? d.has_more : offset + items.length < asNum(d.total, offset + items.length);
  const hasMore = claimed && full;
  const total = hasMore ? Math.max(asNum(d.total, 0), offset + items.length + 1) : offset + items.length;
  return { items, total, hasMore };
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
  return gated("support", async () => pageOf(asDict(await http(`/support/tickets/me?${qs.toString()}`, { signal })), normSupportTicket));
}

export async function listMyActiveSupportTickets(signal?: AbortSignal): Promise<SupportTicket[]> {
  const settled = await Promise.allSettled(SUPPORT_ACTIVE_STATUSES.map((s) => listMySupportTickets(0, 50, signal, s)));
  const failed = settled.flatMap((r) => (r.status === "rejected" ? [r.reason as unknown] : []));
  const aborted = failed.find((e) => isAborted(e));
  if (aborted !== undefined) throw aborted;
  if (failed.length === settled.length && failed.length) throw failed[0];
  const seen = new Set<string>();
  return settled
    .flatMap((r) => (r.status === "fulfilled" ? r.value.items : []))
    .filter((t) => t.id && !seen.has(t.id) && (seen.add(t.id), true))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

export function listSupportQueue(
  opts: { status?: string; assignedToMe?: boolean; offset: number; limit: number },
  signal?: AbortSignal,
): Promise<Page<SupportTicket>> {
  const qs = new URLSearchParams({ limit: String(cap(opts.limit)), offset: String(Math.max(0, opts.offset)) });
  if (opts.status) qs.set("status", opts.status);
  if (opts.assignedToMe) qs.set("assigned_to_me", "true");
  return gated("supportQueue", async () => pageOf(asDict(await http(`/call-center/support/tickets?${qs.toString()}`, { signal })), normSupportTicket));
}

const QUEUE_WALK = 5;

export async function listSupportQueueAll(opts: { status?: string; assignedToMe?: boolean }, signal?: AbortSignal): Promise<Page<SupportTicket>> {
  const seen = new Set<string>();
  const items: SupportTicket[] = [];
  let offset = 0;
  for (let i = 0; i < QUEUE_WALK; i++) {
    const page = await listSupportQueue({ ...opts, offset, limit: SUPPORT_PAGE_MAX }, signal);
    for (const t of page.items) {
      if (!t.id || seen.has(t.id)) continue;
      seen.add(t.id);
      items.push(t);
    }
    offset += page.items.length;
    if (!page.hasMore || page.items.length < SUPPORT_PAGE_MAX) break;
  }
  return { items, total: items.length, hasMore: false };
}

export async function claimSupportTicket(id: string): Promise<SupportTicket> {
  return normSupportTicket(await http(`/call-center/support/tickets/${encodeURIComponent(id)}/claim`, { method: "POST" }));
}

export async function transferSupportTicket(id: string, operatorUserId: string, reason: string): Promise<SupportTicket> {
  return normSupportTicket(
    await http(`/call-center/support/tickets/${encodeURIComponent(id)}/transfer`, {
      method: "POST",
      body: JSON.stringify({ operator_user_id: operatorUserId, reason }),
    }),
  );
}

export async function closeSupportTicket(id: string, resolution: string): Promise<SupportTicket> {
  return normSupportTicket(
    await http(`/call-center/support/tickets/${encodeURIComponent(id)}/close`, {
      method: "POST",
      body: JSON.stringify({ note: resolution, resolution }),
    }),
  );
}

export type MessageOrder = "asc" | "desc";

export type MessageChunk = {
  items: SupportMessage[];
  order: MessageOrder;
  ticket: SupportTicket | null;
};

const byTime = (a: SupportMessage, b: SupportMessage) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);

async function fetchMessages(id: string, offset: number, limit: number, signal?: AbortSignal, clientUserId = ""): Promise<MessageChunk & { raw: number }> {
  const d = asDict(await http(`/support/tickets/${encodeURIComponent(id)}/messages?limit=${cap(limit)}&offset=${Math.max(0, offset)}`, { signal }));
  const ticket = d.ticket ? normSupportTicket(d.ticket) : null;
  const owner = clientUserId || ticket?.clientUserId || "";
  const raw = asArr(d.items ?? d.data ?? d.messages).map((v) => normSupportMessage(v, id, owner));
  const first = raw[0]?.createdAt ?? "";
  const last = raw[raw.length - 1]?.createdAt ?? "";
  const order: MessageOrder = raw.length > 1 && first > last ? "desc" : "asc";
  const visible = raw.filter((m) => m.content.trim() || m.attachments.length || m.messageType === "system");
  return { items: visible.sort(byTime), order, ticket, raw: raw.length };
}

export type MessageCursor = { order: MessageOrder; loaded: number; hasOlder: boolean };

const WALK_PAGES = 20;

export async function loadLatestMessages(id: string, limit = 50, signal?: AbortSignal): Promise<MessageChunk & { cursor: MessageCursor }> {
  const size = SUPPORT_PAGE_MAX;
  const head = await fetchMessages(id, 0, size, signal);
  if (head.order === "desc") {
    return { ...head, cursor: { order: "desc", loaded: head.raw, hasOlder: head.raw >= size } };
  }
  let items = head.items;
  let loaded = head.raw;
  let ticket = head.ticket;
  let page = head.raw;
  for (let i = 1; page >= size && i < WALK_PAGES; i++) {
    const next = await fetchMessages(id, loaded, size, signal, ticket?.clientUserId);
    items = items.concat(next.items);
    loaded += next.raw;
    page = next.raw;
    ticket = next.ticket ?? ticket;
  }
  const keep = Math.max(cap(limit), items.length);
  return { items: items.slice(-keep), order: "asc", ticket, cursor: { order: "asc", loaded, hasOlder: false } };
}

export async function loadOlderMessages(id: string, cursor: MessageCursor, limit = 50, clientUserId = ""): Promise<{ items: SupportMessage[]; cursor: MessageCursor }> {
  if (!cursor.hasOlder || cursor.order !== "desc") return { items: [], cursor: { ...cursor, hasOlder: false } };
  const size = cap(limit);
  const chunk = await fetchMessages(id, cursor.loaded, size, undefined, clientUserId);
  return { items: chunk.items, cursor: { ...cursor, loaded: cursor.loaded + chunk.raw, hasOlder: chunk.raw >= size } };
}

export async function loadNewMessages(id: string, cursor: MessageCursor, clientUserId = ""): Promise<{ items: SupportMessage[]; cursor: MessageCursor; ticket: SupportTicket | null }> {
  if (cursor.order === "desc") {
    const chunk = await fetchMessages(id, 0, 50, undefined, clientUserId);
    return { items: chunk.items, ticket: chunk.ticket, cursor };
  }
  const chunk = await fetchMessages(id, cursor.loaded, SUPPORT_PAGE_MAX, undefined, clientUserId);
  return { items: chunk.items, ticket: chunk.ticket, cursor: { ...cursor, loaded: cursor.loaded + chunk.raw } };
}

export async function getSupportTicket(id: string, signal?: AbortSignal): Promise<SupportTicket | null> {
  try {
    const chunk = await fetchMessages(id, 0, 1, signal);
    return chunk.ticket;
  } catch (e) {
    if (isAborted(e)) throw e;
    return null;
  }
}

export async function sendSupportMessage(id: string, content: string, clientUserId = ""): Promise<SupportMessage> {
  const text = content.trim();
  const d = asDict(
    await http(`/support/tickets/${encodeURIComponent(id)}/messages`, {
      method: "POST",
      body: JSON.stringify({ message: text, content: text, message_type: "text", attachments: [] }),
    }),
  );
  return normSupportMessage(d.message ?? d, id, clientUserId);
}

export type SupportEventKind = "created" | "claimed" | "transferred" | "closed" | "message" | "updated";
export type SupportEvent = { kind: SupportEventKind; ticketId: string; ticket: SupportTicket | null; message: SupportMessage | null; operatorUserId: string };

const EVENT_KIND: Record<string, SupportEventKind> = {
  "support.ticket_created": "created",
  "support.ticket_claimed": "claimed",
  "support.ticket_transferred": "transferred",
  "support.ticket_transferred_to_you": "transferred",
  "support.ticket_closed": "closed",
  "support.ticket_message": "message",
};

export function supportEventOf(e: Dict): SupportEvent | null {
  let name = asStr(e.event);
  let src: Dict = e;
  if (name === "notification.created") {
    const n = asDict(e.notification);
    const nd = asDict(n.data);
    name = asStr(nd.event ?? n.kind);
    src = nd;
  }
  if (!name.startsWith("support.")) return null;
  const kind = EVENT_KIND[name] ?? "updated";
  const ticket = src.ticket ? normSupportTicket(src.ticket) : null;
  const ticketId = asStr(src.ticket_id) || ticket?.id || asStr(asDict(src.message).ticket_id) || asStr(asDict(asDict(src.message).payload).ticket_id);
  if (!ticketId) return null;
  const message = kind === "message" && src.message ? normSupportMessage(src.message, ticketId, ticket?.clientUserId ?? "") : null;
  return {
    kind,
    ticketId,
    ticket: ticket && ticket.id ? ticket : null,
    message,
    operatorUserId: asStr(src.operator_user_id ?? src.to_operator_user_id ?? src.from_operator_user_id),
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
