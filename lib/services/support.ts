import { http, asDict, asStr, asNum, asArr, isAborted, isRouteMissing, type Dict } from "@/lib/http";
import { featureMissing, noteFeatureError } from "@/lib/endpointGate";
import type { Page } from "@/lib/usePaged";

export const SUPPORT_CATEGORIES = ["general", "subscription", "payment", "marketplace", "documents", "urgent_advokat", "account", "technical"] as const;
export const SUPPORT_PRIORITIES = ["low", "normal", "high"] as const;
export const SUPPORT_STATUSES = ["waiting_operator", "claimed", "transferred", "reopened", "closed"] as const;

export type SupportTicket = {
  id: string;
  workId: string;
  title: string;
  status: string;
  category: string;
  priority: string;
  lastMessage: string;
  clientUserId: string;
  clientName: string;
  operatorUserId: string;
  operatorName: string;
  resolution: string;
  createdAt: string;
  updatedAt: string;
};

export type SupportAttachment = { name: string; url: string; size: number; mime: string };

export type SupportMessage = {
  id: string;
  ticketId: string;
  senderUserId: string;
  senderName: string;
  senderRole: string;
  content: string;
  attachments: SupportAttachment[];
  createdAt: string;
};

const person = (v: unknown) => {
  const d = asDict(v);
  return asStr(d.name ?? d.full_name ?? d.lawyer_name).trim();
};

export function normSupportTicket(v: unknown): SupportTicket {
  const d = asDict(v);
  const client = asDict(d.client);
  const op = asDict(d.assigned_operator ?? d.operator);
  return {
    id: asStr(d.id ?? d.ticket_id),
    workId: asStr(d.work_id),
    title: asStr(d.title).trim(),
    status: asStr(d.status, "waiting_operator"),
    category: asStr(d.category, "general"),
    priority: asStr(d.priority, "normal"),
    lastMessage: asStr(d.last_message).trim(),
    clientUserId: asStr(d.client_user_id ?? client.id),
    clientName: asStr(d.client_name).trim() || person(client),
    operatorUserId: asStr(d.assigned_operator_user_id ?? op.id),
    operatorName: asStr(d.assigned_operator_name ?? d.operator_name).trim() || person(op),
    resolution: asStr(d.resolution).trim(),
    createdAt: asStr(d.created_at),
    updatedAt: asStr(d.updated_at ?? d.created_at),
  };
}

export function normSupportMessage(v: unknown, ticketId = ""): SupportMessage {
  const d = asDict(v);
  const sender = asDict(d.sender);
  return {
    id: asStr(d.id ?? d.message_id),
    ticketId: asStr(d.ticket_id, ticketId),
    senderUserId: asStr(d.sender_user_id ?? sender.id),
    senderName: asStr(d.sender_name).trim() || person(sender),
    senderRole: asStr(d.sender_role ?? sender.role),
    content: asStr(d.content ?? d.text ?? d.message),
    attachments: asArr(d.attachments).map((a) => {
      const x = asDict(a);
      return { name: asStr(x.name ?? x.file_name ?? x.filename), url: asStr(x.url ?? x.download_url), size: asNum(x.size ?? x.size_bytes), mime: asStr(x.mime ?? x.content_type) };
    }),
    createdAt: asStr(d.created_at),
  };
}

function pageOf<T>(d: Dict, norm: (v: unknown) => T): Page<T> {
  const items = asArr(d.items ?? d.data ?? d.tickets ?? d.messages).map(norm);
  const offset = asNum(d.offset);
  const total = asNum(d.total, offset + items.length);
  return { items, total, hasMore: typeof d.has_more === "boolean" ? d.has_more : offset + items.length < total };
}

async function gated<T>(key: "support" | "supportQueue", fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isAborted(e)) noteFeatureError(key, e);
    throw e;
  }
}

export const supportAvailable = () => !featureMissing("support");
export const supportQueueAvailable = () => !featureMissing("supportQueue");

export function createSupportTicket(input: { message: string; category: string; priority: string; context?: Dict }): Promise<SupportTicket> {
  return gated("support", async () =>
    normSupportTicket(
      await http("/support/tickets", {
        method: "POST",
        body: JSON.stringify({ message: input.message, category: input.category, priority: input.priority, context: input.context ?? {} }),
      }),
    ),
  );
}

export function listMySupportTickets(offset: number, limit: number, signal?: AbortSignal): Promise<Page<SupportTicket>> {
  return gated("support", async () => pageOf(asDict(await http(`/support/tickets/me?limit=${limit}&offset=${offset}`, { signal })), normSupportTicket));
}

export async function getSupportTicket(id: string, signal?: AbortSignal): Promise<SupportTicket | null> {
  try {
    return normSupportTicket(await http(`/support/tickets/${encodeURIComponent(id)}`, { signal }));
  } catch (e) {
    if (!isRouteMissing(e)) throw e;
  }
  return null;
}

export function listSupportQueue(
  opts: { status?: string; assignedToMe?: boolean; offset: number; limit: number },
  signal?: AbortSignal,
): Promise<Page<SupportTicket>> {
  const qs = new URLSearchParams({ limit: String(opts.limit), offset: String(opts.offset) });
  if (opts.status) qs.set("status", opts.status);
  if (opts.assignedToMe) qs.set("assigned_to_me", "true");
  return gated("supportQueue", async () => pageOf(asDict(await http(`/call-center/support/tickets?${qs.toString()}`, { signal })), normSupportTicket));
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
    await http(`/call-center/support/tickets/${encodeURIComponent(id)}/close`, { method: "POST", body: JSON.stringify({ resolution }) }),
  );
}

export async function listSupportMessages(id: string, offset: number, limit: number, signal?: AbortSignal): Promise<Page<SupportMessage>> {
  const d = asDict(await http(`/support/tickets/${encodeURIComponent(id)}/messages?limit=${limit}&offset=${offset}`, { signal }));
  return pageOf(d, (v) => normSupportMessage(v, id));
}

export async function sendSupportMessage(id: string, content: string): Promise<SupportMessage> {
  const d = asDict(
    await http(`/support/tickets/${encodeURIComponent(id)}/messages`, { method: "POST", body: JSON.stringify({ content, attachments: [] }) }),
  );
  return normSupportMessage(d.message ?? d, id);
}

export type SupportEventKind = "created" | "claimed" | "transferred" | "closed" | "message" | "updated";
export type SupportEvent = { kind: SupportEventKind; ticketId: string; ticket: SupportTicket | null; message: SupportMessage | null; operatorUserId: string };

const EVENT_KIND: Record<string, SupportEventKind> = {
  "support.ticket_created": "created",
  "support.ticket_claimed": "claimed",
  "support.ticket_transferred": "transferred",
  "support.ticket_closed": "closed",
  "support.ticket_message": "message",
};

export function supportEventOf(e: Dict): SupportEvent | null {
  const name = asStr(e.event);
  if (!name.startsWith("support.")) return null;
  const kind = EVENT_KIND[name] ?? "updated";
  const ticket = e.ticket ? normSupportTicket(e.ticket) : null;
  const ticketId = asStr(e.ticket_id) || ticket?.id || asStr(asDict(e.message).ticket_id);
  if (!ticketId) return null;
  const message = kind === "message" && (e.message || e.content) ? normSupportMessage(e.message ?? e, ticketId) : null;
  return { kind, ticketId, ticket: ticket && ticket.id ? ticket : null, message, operatorUserId: asStr(e.operator_user_id ?? e.to_operator_user_id) };
}

export function supportCategoryFor(path: string, message = ""): string {
  const p = path.toLowerCase();
  const m = message.toLowerCase();
  if (/to.?lov|payme|click|karta|pul/.test(m) || p.includes("/payments")) return "payment";
  if (p.includes("/subscription") || /tarif|obuna|paket/.test(m)) return "subscription";
  if (p.includes("/lawyers") || p.includes("/marketplace") || /advokat|yurist/.test(m)) return "marketplace";
  if (p.includes("/services") || p.includes("/documents") || /hujjat|ariza|shartnoma/.test(m)) return "documents";
  if (p.includes("/urgent") || /tezkor/.test(m)) return "urgent_advokat";
  if (p.includes("/profile")) return "account";
  return "general";
}
