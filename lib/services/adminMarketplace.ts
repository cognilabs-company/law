import { http, asDict, asStr, asArr, asNum, type Dict } from "@/lib/http";
import { uzs } from "@/lib/money";
import { cleanDocTitle } from "@/lib/docTitle";

export const MKM_STATUSES = ["pending_payment", "paid", "completed", "cancelled"] as const;
export const MKM_PAGE = 50;

export type MkmScope = { status: string; sellerUserId: string; clientUserId: string; dateFrom: string; dateTo: string };

export type MkmStatusCount = { status: string; count: number };

export type MkmStats = {
  ordersTotal: number;
  paidOrders: number;
  activeOrders: number;
  completedOrders: number;
  pendingPaymentOrders: number;
  cancelledOrders: number;
  revenuePaid: number;
  sellersCount: number;
  clientsCount: number;
  byStatus: MkmStatusCount[];
};

export type MkmPerson = { id: string; lexgoId: string; role: string; name: string; phone: string; accountStatus: string };

export type MkmPayment = {
  workId: string;
  provider: string;
  status: string;
  amount: number;
  paidAmount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

export type MkmOrder = {
  id: string;
  workId: string;
  orderWorkId: string;
  status: string;
  paymentStatus: string;
  serviceTitle: string;
  sellerType: string;
  price: number;
  currency: string;
  note: string;
  preferredChannel: string;
  preferredTime: string;
  requestedAt: string;
  client: MkmPerson;
  seller: MkmPerson;
  payment: MkmPayment | null;
  roomId: string;
  canStartChat: boolean;
  canCreateCall: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MkmDelivery = { chatId: string; ok: boolean; messageId: string; error: string };

export type MkmConfirm = {
  id: string;
  workId: string;
  status: string;
  serviceTitle: string;
  categoryTitle: string;
  amount: number;
  currency: string;
  deliveries: MkmDelivery[];
  reviewedByChatId: string;
  reviewedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type MkmActivity = {
  id: string;
  action: string;
  title: string;
  detail: string;
  ip: string;
  outcome: string;
  createdAt: string;
};

export type MkmOrderDetail = { order: MkmOrder; confirms: MkmConfirm[]; activity: MkmActivity[] };

export type MkmSeller = {
  userId: string;
  lexgoId: string;
  name: string;
  phone: string;
  accountStatus: string;
  sellerType: string;
  region: string;
  district: string;
  rating: number;
  reviewsCount: number;
  isVerified: boolean;
  verificationStatus: string;
  servicesCount: number;
  ordersTotal: number;
  activeOrders: number;
  pendingPaymentOrders: number;
  completedOrders: number;
  paidOrders: number;
  revenuePaid: number;
  lastOrderAt: string;
};

export type MkmPage<T> = { items: T[]; total: number; limit: number; offset: number };

const ROOM_RE = /\/secure-chats\/([^/?#]+)/;
const low = (v: unknown) => asStr(v).trim().toLowerCase();

function query(params: Record<string, string | number>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

function scopeParams(s: MkmScope): Record<string, string> {
  return {
    status: s.status,
    seller_user_id: s.sellerUserId,
    client_user_id: s.clientUserId,
    date_from: s.dateFrom,
    date_to: s.dateTo,
  };
}

function statusRank(status: string): number {
  const i = (MKM_STATUSES as readonly string[]).indexOf(status);
  return i < 0 ? MKM_STATUSES.length : i;
}

function normStats(v: unknown): MkmStats {
  const d = asDict(v);
  const byStatus = Object.entries(asDict(d.by_status))
    .map(([status, n]) => ({ status: status.toLowerCase(), count: asNum(n) }))
    .filter((x) => x.status && x.count > 0)
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || b.count - a.count);
  return {
    ordersTotal: asNum(d.orders_total),
    paidOrders: asNum(d.paid_orders),
    activeOrders: asNum(d.active_orders),
    completedOrders: asNum(d.completed_orders),
    pendingPaymentOrders: asNum(d.pending_payment_orders),
    cancelledOrders: asNum(d.cancelled_orders),
    revenuePaid: uzs(d, "revenue_paid"),
    sellersCount: asNum(d.sellers_count),
    clientsCount: asNum(d.clients_count),
    byStatus,
  };
}

function normPerson(v: unknown, fallback: { id: unknown; name: unknown; phone?: unknown }): MkmPerson {
  const d = asDict(v);
  return {
    id: asStr(d.id ?? fallback.id),
    lexgoId: asStr(d.lexgo_id),
    role: low(d.role),
    name: asStr(d.name ?? fallback.name).trim() || [d.first_name, d.last_name].map((x) => asStr(x).trim()).filter(Boolean).join(" "),
    phone: asStr(d.phone ?? fallback.phone).trim(),
    accountStatus: low(d.account_status),
  };
}

function normPayment(v: unknown): MkmPayment | null {
  const d = asDict(v);
  if (!Object.keys(d).length) return null;
  return {
    workId: asStr(d.work_id),
    provider: low(d.provider),
    status: low(d.status),
    amount: uzs(d, "amount"),
    paidAmount: uzs(d, "paid_amount"),
    currency: asStr(d.currency, "UZS") || "UZS",
    createdAt: asStr(d.created_at),
    updatedAt: asStr(d.updated_at),
  };
}

export function normMkmOrder(v: unknown): MkmOrder {
  const d = asDict(v);
  const details = asDict(d.details);
  const payment = normPayment(d.payment);
  const chatUrl = asStr(d.chat_url);
  const roomId = asStr(d.secure_chat_room_id ?? details.secure_chat_room_id) || (ROOM_RE.exec(chatUrl)?.[1] ?? "");
  const seller = normPerson(d.lawyer, { id: d.lawyer_user_id, name: d.lawyer_name ?? details.lawyer_name });
  return {
    id: asStr(d.id),
    workId: asStr(d.work_id ?? details.work_id),
    orderWorkId: asStr(d.order_work_id),
    status: low(d.status),
    paymentStatus: low(d.payment_status) || (payment?.status ?? ""),
    serviceTitle: cleanDocTitle(asStr(d.service_title ?? details.service_title)),
    sellerType: low(details.seller_type) || seller.role,
    price: uzs(d, "price") || (payment?.amount ?? 0),
    currency: asStr(d.currency, "UZS") || "UZS",
    note: asStr(details.client_note).trim(),
    preferredChannel: low(details.preferred_channel),
    preferredTime: asStr(details.preferred_time).trim(),
    requestedAt: asStr(details.requested_at),
    client: normPerson(d.client, { id: d.client_user_id, name: details.client_name }),
    seller,
    payment,
    roomId,
    canStartChat: d.can_start_chat === true && !!roomId,
    canCreateCall: d.can_create_call === true && !!roomId,
    createdAt: asStr(d.created_at),
    updatedAt: asStr(d.updated_at),
  };
}

function normDelivery(v: unknown): MkmDelivery {
  const d = asDict(v);
  return {
    chatId: asStr(d.chat_id),
    ok: d.ok === true,
    messageId: asStr(d.message_id),
    error: asStr(d.error ?? d.description).trim(),
  };
}

function normConfirm(v: unknown): MkmConfirm {
  const d = asDict(v);
  const p = asDict(d.payload);
  return {
    id: asStr(d.id),
    workId: asStr(d.work_id ?? p.work_id),
    status: low(d.status),
    serviceTitle: cleanDocTitle(asStr(p.service_title ?? d.title)),
    categoryTitle: asStr(p.category_title).trim(),
    amount: uzs(p, "amount") || uzs(d, "price"),
    currency: asStr(p.currency ?? d.currency, "UZS") || "UZS",
    deliveries: asArr(p.telegram_results).map(normDelivery).filter((x) => x.chatId),
    reviewedByChatId: asStr(p.reviewed_by_chat_id),
    reviewedAt: asStr(p.reviewed_at),
    createdAt: asStr(d.created_at),
    updatedAt: asStr(d.updated_at),
  };
}

function normActivity(v: unknown): MkmActivity {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    action: low(d.action),
    title: asStr(d.title_uz ?? d.title).trim(),
    detail: asStr(d.detail).trim(),
    ip: asStr(d.ip).trim(),
    outcome: low(d.outcome),
    createdAt: asStr(d.created_at),
  };
}

function normSeller(v: unknown): MkmSeller {
  const d = asDict(v);
  const u = asDict(d.seller);
  return {
    userId: asStr(u.id ?? d.seller_user_id ?? d.user_id),
    lexgoId: asStr(u.lexgo_id),
    name: asStr(u.name).trim() || [u.first_name, u.last_name].map((x) => asStr(x).trim()).filter(Boolean).join(" "),
    phone: asStr(u.phone).trim(),
    accountStatus: low(u.account_status),
    sellerType: low(d.seller_type ?? u.role),
    region: asStr(d.region).trim(),
    district: asStr(d.district).trim(),
    rating: asNum(d.rating),
    reviewsCount: asNum(d.reviews_count),
    isVerified: d.is_verified === true,
    verificationStatus: low(d.verification_status),
    servicesCount: asNum(d.services_count),
    ordersTotal: asNum(d.orders_total),
    activeOrders: asNum(d.active_orders),
    pendingPaymentOrders: asNum(d.pending_payment_orders),
    completedOrders: asNum(d.completed_orders),
    paidOrders: asNum(d.paid_orders),
    revenuePaid: uzs(d, "revenue_paid"),
    lastOrderAt: asStr(d.last_order_at),
  };
}

function pageOf<T>(d: Dict, items: T[], limit: number, offset: number): MkmPage<T> {
  return { items, total: asNum(d.total, items.length), limit: asNum(d.limit, limit) || limit, offset: asNum(d.offset, offset) };
}

export async function getMarketplaceOverview(scope: MkmScope): Promise<MkmStats> {
  const d = asDict(await http(`/admin/marketplace/overview${query(scopeParams(scope))}`));
  return normStats(d.stats);
}

export async function listAdminMarketplaceOrders(scope: MkmScope, offset = 0, limit = MKM_PAGE): Promise<MkmPage<MkmOrder>> {
  const d = asDict(await http(`/admin/marketplace/orders${query({ ...scopeParams(scope), limit, offset })}`));
  return pageOf(d, asArr(d.items).map(normMkmOrder).filter((o) => o.id), limit, offset);
}

export async function getAdminMarketplaceOrder(orderId: string): Promise<MkmOrderDetail> {
  const d = asDict(await http(`/admin/marketplace/orders/${encodeURIComponent(orderId)}`));
  return {
    order: normMkmOrder(d.order),
    confirms: asArr(d.purchase_requests).map(normConfirm),
    activity: asArr(d.activity)
      .map(normActivity)
      .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)),
  };
}

export async function listAdminMarketplaceSellers(opts: { q: string; dateFrom: string; dateTo: string; offset?: number; limit?: number }): Promise<MkmPage<MkmSeller>> {
  const limit = opts.limit ?? MKM_PAGE;
  const offset = opts.offset ?? 0;
  const d = asDict(await http(`/admin/marketplace/sellers${query({ q: opts.q.trim(), date_from: opts.dateFrom, date_to: opts.dateTo, limit, offset })}`));
  return pageOf(d, asArr(d.items).map(normSeller).filter((s) => s.userId), limit, offset);
}
