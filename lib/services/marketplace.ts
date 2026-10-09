import { http, asDict, asStr, asNum, asArr, ApiError, isAborted, type Dict } from "@/lib/http";
import { uzs } from "@/lib/money";
import { cleanDocTitle } from "@/lib/docTitle";
import { sellerTrustOf, type RatingStatus } from "./trust";
import { featureMissing, noteFeatureError } from "@/lib/endpointGate";

export type MarketCategory = { id: string; title: string; slug: string };

export type MarketService = {
  id: string;
  title: string;
  categoryId: string;
  categoryTitle: string;
  basePrice: number;
  selectedPrice: number;
  price: number;
  currency: string;
  deliveryMinutes: number;
  experienceNote: string;
  advokatRequired: boolean;
};

export type MarketPromotion = { active: boolean; packageTitle: string; daysLeft: number; boostScore: number; serviceId: string; serviceTitle: string };

export type MarketSeller = {
  id: string;
  userId: string;
  publicId: string;
  name: string;
  sellerType: string;
  verified: boolean;
  badgeLabel: string;
  rated: boolean;
  ratingStatus: RatingStatus;
  ratingLabel: string;
  verificationStatus: string;
  region: string;
  district: string;
  specializations: string[];
  languages: string[];
  bio: string;
  education: string;
  experienceYears: number;
  totalCases: number;
  winsCount: number;
  partialWins: number;
  successRate: number;
  rating: number;
  reviewsCount: number;
  servicesCount: number;
  serviceTitles: string[];
  categories: MarketCategory[];
  priceFrom: number;
  priceTo: number;
  completedOrders: number;
  responseRate: number;
  trustScore: number;
  promotion: MarketPromotion | null;
  onlineNow: boolean;
  available: boolean;
  services: MarketService[];
  licenseNumber: string;
  barAssociation: string;
  organizationName: string;
  createdAt: string;
};

export type MarketReview = { id: string; rating: number; comment: string; author: string; createdAt: string; reply: string };

export type MarketSellerDetail = MarketSeller & { reviews: MarketReview[] };

export type MarketMeta = {
  sellerTypes: string[];
  regions: string[];
  languages: string[];
  categories: MarketCategory[];
  services: { id: string; title: string; categoryId: string; basePrice: number }[];
  sortOptions: string[];
};

export type MarketList = { items: MarketSeller[]; total: number; meta: MarketMeta | null };

const strList = (v: unknown) => asArr(v).map((x) => asStr(x).trim()).filter(Boolean);

function normCategory(v: unknown): MarketCategory {
  const d = asDict(v);
  return { id: asStr(d.id), title: asStr(d.title ?? d.name), slug: asStr(d.slug) };
}

export function normMarketService(v: unknown): MarketService {
  const d = asDict(v);
  const base = uzs(d, "base_price");
  const selected = uzs(d, "selected_price");
  return {
    id: asStr(d.id ?? d.service_id),
    title: cleanDocTitle(asStr(d.title ?? d.name)),
    categoryId: asStr(d.category_id),
    categoryTitle: asStr(d.category_title),
    basePrice: base,
    selectedPrice: selected,
    price: selected || base,
    currency: asStr(d.currency, "UZS") || "UZS",
    deliveryMinutes: asNum(d.delivery_minutes),
    experienceNote: asStr(d.experience_note),
    advokatRequired: d.advokat_required === true,
  };
}

function normPromotion(v: unknown): MarketPromotion | null {
  if (v === undefined || v === null) return null;
  const d = asDict(v);
  return {
    active: d.active === true,
    packageTitle: asStr(d.package_title),
    daysLeft: asNum(d.days_left),
    boostScore: asNum(d.boost_score),
    serviceId: asStr(d.service_id),
    serviceTitle: asStr(d.service_title),
  };
}

export function normMarketSeller(v: unknown): MarketSeller {
  const d = asDict(v);
  const avail = asDict(d.availability);
  const services = asArr(d.services).map(normMarketService).filter((s) => s.id);
  const prices = services.map((s) => s.price).filter((p) => p > 0);
  const priceFrom = uzs(d, "price_from") || (prices.length ? Math.min(...prices) : 0);
  const priceTo = uzs(d, "price_to") || (prices.length ? Math.max(...prices) : 0);
  const exp = asNum(d.experience_years) || asNum(d.lawyer_experience_years);
  const trust = sellerTrustOf(d, asNum(d.rating), asNum(d.reviews_count));
  return {
    id: asStr(d.id),
    userId: asStr(d.user_id ?? d.id),
    publicId: asStr(d.public_id),
    name: asStr(d.lawyer_name ?? d.name).trim(),
    sellerType: asStr(d.seller_type).toLowerCase(),
    verified: trust.verified,
    badgeLabel: trust.badgeLabel,
    rated: trust.rated,
    ratingStatus: trust.ratingStatus,
    ratingLabel: trust.ratingLabel,
    verificationStatus: asStr(d.verification_status),
    region: asStr(d.region).trim(),
    district: asStr(d.district).trim(),
    specializations: strList(d.specializations),
    languages: strList(d.languages),
    bio: asStr(d.bio).trim(),
    education: asStr(d.education).trim(),
    experienceYears: exp,
    totalCases: asNum(d.total_cases),
    winsCount: asNum(d.wins_count),
    partialWins: asNum(d.partial_wins_count),
    successRate: asNum(d.success_rate),
    rating: asNum(d.rating),
    reviewsCount: asNum(d.reviews_count),
    servicesCount: asNum(d.services_count, services.length),
    serviceTitles: strList(d.service_titles).map((s) => cleanDocTitle(s)),
    categories: asArr(d.categories).map(normCategory).filter((c) => c.id || c.title),
    priceFrom,
    priceTo,
    completedOrders: asNum(d.completed_orders),
    responseRate: asNum(d.response_rate),
    trustScore: asNum(d.trust_score),
    promotion: normPromotion(d.promotion),
    onlineNow: d.online_now === true,
    available: asStr(avail.status, "available") !== "offline",
    services,
    licenseNumber: asStr(d.license_number).trim(),
    barAssociation: asStr(d.bar_association).trim(),
    organizationName: asStr(d.organization_name).trim(),
    createdAt: asStr(d.created_at),
  };
}

function normReview(v: unknown): MarketReview {
  const d = asDict(v);
  const p = asDict(d.payload);
  const author = asDict(d.author ?? d.client ?? d.reviewer);
  return {
    id: asStr(d.id),
    rating: asNum(d.rating ?? p.rating),
    comment: asStr(d.comment ?? p.comment).trim(),
    author: asStr(d.author_name ?? d.client_name ?? d.reviewer_name ?? author.name ?? p.client_name).trim(),
    createdAt: asStr(d.created_at ?? p.rated_at),
    reply: asStr(d.reply ?? d.seller_reply ?? p.reply).trim(),
  };
}

function normMeta(v: unknown): MarketMeta | null {
  if (!v || typeof v !== "object") return null;
  const d = asDict(v);
  const seen = new Set<string>();
  const services = asArr(d.services)
    .map((x) => {
      const s = asDict(x);
      return { id: asStr(s.id), title: cleanDocTitle(asStr(s.title)), categoryId: asStr(s.category_id), basePrice: uzs(s, "base_price") };
    })
    .filter((s) => s.id && !seen.has(s.id) && (seen.add(s.id), true));
  return {
    sellerTypes: strList(d.seller_types).map((s) => s.toLowerCase()),
    regions: strList(d.regions),
    languages: strList(d.languages),
    categories: asArr(d.categories).map(normCategory).filter((c) => c.id),
    services,
    sortOptions: strList(d.sort_options),
  };
}

export async function listMarketplace(opts: { sort?: string; offset?: number; includeMeta?: boolean } = {}): Promise<MarketList> {
  const qs = new URLSearchParams({ limit: "100", offset: String(opts.offset ?? 0) });
  if (opts.sort) qs.set("sort", opts.sort);
  if (opts.includeMeta) qs.set("include_meta", "true");
  const d = asDict(await http(`/marketplace/lawyers?${qs}`));
  // Public marketplace results must contain only LexGo-approved professionals.
  // Admin monitoring uses its own endpoint and is intentionally unaffected.
  const items = asArr(d.items).map(normMarketSeller).filter((s) => s.userId && s.verified);
  return { items, total: asNum(d.total, items.length), meta: normMeta(d.meta) };
}

export type MarketAiMatch = { userId: string; score: number; reasons: string[]; seller: MarketSeller | null };
export type MarketAiResult = { matches: MarketAiMatch[]; summary: string; disclaimer: string; total: number; hasMore: boolean };

export const marketAiAvailable = () => !featureMissing("marketAiSearch");

function normAiMatch(v: unknown): MarketAiMatch {
  const d = asDict(v);
  const raw = asNum(d.match_score ?? d.score ?? d.relevance ?? d.confidence, 0);
  const reasons = Array.from(new Set([...strList(d.match_reasons), asStr(d.reason ?? d.explanation ?? d.why ?? d.match_reason).trim()].filter(Boolean)));
  return {
    userId: asStr(d.user_id ?? d.lawyer_user_id ?? d.seller_user_id ?? d.lawyer_id ?? d.id),
    score: Math.max(0, Math.min(1, raw > 1 ? raw / 100 : raw)),
    reasons,
    seller: asStr(d.name ?? d.lawyer_name).trim() ? normMarketSeller(d) : null,
  };
}

export async function aiSearchMarketplace(
  query: string,
  opts: { region?: string; sellerType?: string; limit?: number; signal?: AbortSignal } = {},
): Promise<MarketAiResult | null> {
  if (featureMissing("marketAiSearch")) return null;
  const body: Dict = { query, limit: Math.max(1, Math.min(20, opts.limit ?? 20)) };
  if (opts.region) body.region = opts.region;
  if (opts.sellerType === "advokat" || opts.sellerType === "yurist") body.seller_type = opts.sellerType;
  try {
    const d = asDict(await http("/marketplace/ai-search", { method: "POST", body: JSON.stringify(body), signal: opts.signal }));
    const list = asArr(d.items ?? d.matches ?? d.results ?? d.lawyers);
    const seen = new Set<string>();
    // AI search can return a hydrated seller that did not come from the
    // verified-only catalogue list. Keep id-only matches so an existing
    // catalogue row can still be ranked, but never let an unverified
    // hydrated seller enter the public marketplace through the AI path.
    const matches = list.map(normAiMatch).filter((m) => m.userId && (!m.seller || m.seller.verified) && !seen.has(m.userId) && (seen.add(m.userId), true));
    return {
      matches,
      summary: asStr(d.summary ?? d.explanation ?? d.message),
      disclaimer: asStr(d.disclaimer).trim(),
      total: asNum(d.total, matches.length),
      hasMore: d.has_more === true,
    };
  } catch (e) {
    if (isAborted(e)) throw e;
    noteFeatureError("marketAiSearch", e);
    return null;
  }
}

export async function getMarketplaceSeller(userId: string): Promise<MarketSellerDetail> {
  const d = asDict(await http(`/marketplace/lawyers/${encodeURIComponent(userId)}`));
  return { ...normMarketSeller(d), reviews: asArr(d.reviews).map(normReview).filter((r) => r.rating > 0 || r.comment) };
}

export async function getMarketplaceSellerServices(userId: string): Promise<MarketService[]> {
  const d = asDict(await http(`/marketplace/lawyers/${encodeURIComponent(userId)}/services`));
  return asArr(d.items).map(normMarketService).filter((s) => s.id);
}

export type PreferredChannel = "chat" | "audio" | "video" | "meeting";
export const PREFERRED_CHANNELS: PreferredChannel[] = ["chat", "audio", "video", "meeting"];

export type MarketPurchase = {
  workId: string;
  orderId: string;
  status: string;
  amount: number;
  currency: string;
  telegramSent: boolean;
};

export async function requestMarketplacePurchase(
  lawyerUserId: string,
  serviceId: string,
  input: { note: string; preferredChannel: PreferredChannel; preferredTime: string },
): Promise<MarketPurchase> {
  const d = asDict(
    await http(`/marketplace/lawyers/${encodeURIComponent(lawyerUserId)}/services/${encodeURIComponent(serviceId)}/purchase-request`, {
      method: "POST",
      body: JSON.stringify({
        note: input.note.trim(),
        preferred_channel: input.preferredChannel,
        preferred_time: input.preferredTime.trim(),
      }),
    }),
  );
  const order = asDict(d.order);
  const payment = asDict(d.payment);
  const req = asDict(d.purchase_request);
  return {
    workId: asStr(d.work_id) || asStr(req.work_id) || asStr(asDict(order.details).work_id) || asStr(order.work_id),
    orderId: asStr(order.id ?? d.order_id),
    status: asStr(order.status ?? d.status),
    amount: uzs(payment, "amount") || uzs(order, "price"),
    currency: asStr(payment.currency ?? order.currency, "UZS") || "UZS",
    telegramSent: d.telegram_sent !== false,
  };
}

export type ActivePurchase = { orderId: string; workId: string; status: string };

export function activePurchaseOf(e: unknown): ActivePurchase | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const detail = asDict(e.data.detail);
  if (e.code !== "marketplace_order_already_active" && asStr(detail.code) !== "marketplace_order_already_active") return null;
  return { orderId: asStr(detail.order_id), workId: asStr(detail.work_id), status: asStr(detail.status) };
}

export type MarketOrder = {
  id: string;
  workId: string;
  status: string;
  paymentStatus: string;
  serviceTitle: string;
  price: number;
  currency: string;
  note: string;
  preferredChannel: string;
  preferredTime: string;
  clientName: string;
  clientPhone: string;
  clientUserId: string;
  lawyerName: string;
  lawyerPhone: string;
  lawyerUserId: string;
  roomId: string;
  canStartChat: boolean;
  canCreateCall: boolean;
  canCancel: boolean;
  canComplete: boolean;
  createdAt: string;
};

const ROOM_RE = /\/secure-chats\/([^/?#]+)/;

export function normMarketOrder(v: unknown): MarketOrder {
  const d = asDict(v);
  const details = asDict(d.details);
  const client = asDict(d.client);
  const lawyer = asDict(d.lawyer);
  const payment = asDict(d.payment);
  const chatUrl = asStr(d.chat_url);
  const roomId = asStr(d.secure_chat_room_id ?? details.secure_chat_room_id) || (ROOM_RE.exec(chatUrl)?.[1] ?? "");
  const status = asStr(d.status).toLowerCase();
  return {
    id: asStr(d.id ?? d.order_id),
    workId: asStr(d.work_id),
    status,
    paymentStatus: asStr(d.payment_status ?? payment.status).toLowerCase(),
    serviceTitle: cleanDocTitle(asStr(d.service_title ?? details.service_title)),
    price: uzs(d, "price") || uzs(payment, "amount"),
    currency: asStr(d.currency, "UZS") || "UZS",
    note: asStr(details.client_note ?? d.note).trim(),
    preferredChannel: asStr(details.preferred_channel ?? d.preferred_channel).toLowerCase(),
    preferredTime: asStr(details.preferred_time ?? d.preferred_time).trim(),
    clientName: asStr(client.name ?? d.client_name).trim(),
    clientPhone: asStr(client.phone ?? d.client_phone).trim(),
    clientUserId: asStr(d.client_user_id ?? client.id),
    lawyerName: asStr(d.lawyer_name ?? lawyer.name).trim(),
    lawyerPhone: asStr(lawyer.phone ?? d.lawyer_phone).trim(),
    lawyerUserId: asStr(d.lawyer_user_id ?? lawyer.id),
    roomId,
    canStartChat: d.can_start_chat === true && !!roomId,
    canCreateCall: d.can_create_call === true && !!roomId,
    canCancel: !!asStr(d.cancel_url),
    canComplete: !!asStr(d.complete_url),
    createdAt: asStr(d.created_at),
  };
}

export async function listMarketplaceOrders(roleView: "client" | "seller", opts: { signal?: AbortSignal } = {}): Promise<MarketOrder[]> {
  const d = await http(`/marketplace/me/orders?role_view=${roleView}`, { signal: opts.signal });
  const items = Array.isArray(d) ? d : asArr(asDict(d).items);
  return items.map(normMarketOrder).filter((o) => o.id);
}

function orderOf(v: unknown): Dict {
  return asDict(asDict(v).order);
}

export async function cancelMarketplaceOrder(orderId: string, reason: string): Promise<{ status: string; paymentStatus: string }> {
  const o = orderOf(
    await http(`/marketplace/me/orders/${encodeURIComponent(orderId)}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: reason.trim() }),
    }),
  );
  return { status: asStr(o.status, "cancelled").toLowerCase(), paymentStatus: asStr(o.payment_status, "cancelled").toLowerCase() };
}

export async function completeMarketplaceOrder(orderId: string, note: string): Promise<{ status: string }> {
  const o = orderOf(
    await http(`/marketplace/me/orders/${encodeURIComponent(orderId)}/complete`, {
      method: "POST",
      body: JSON.stringify({ note: note.trim() }),
    }),
  );
  return { status: asStr(o.status, "completed").toLowerCase() };
}

export const MARKET_EVENT = "lexgo:marketplace";

export type MarketSignal = { kind: "paid" | "rejected" | "requested" | "other"; orderId: string; workId: string; roomId: string; serviceTitle: string };

export function marketSignalOf(ev: { event: string } & Record<string, unknown>): MarketSignal | null {
  const name = ev.event;
  if (name === "support.assist_marketplace_purchase_requested") {
    const action = asDict(ev.action ?? asDict(ev.message).action);
    const order = asDict(action.order);
    const request = asDict(action.purchase_request);
    const details = asDict(order.details);
    const chat = asStr(order.chat_url ?? action.chat_url);
    return {
      kind: "requested",
      orderId: asStr(order.id ?? action.order_id),
      workId: asStr(action.work_id ?? order.work_id ?? request.work_id),
      roomId: asStr(order.secure_chat_room_id ?? action.room_id) || (ROOM_RE.exec(chat)?.[1] ?? ""),
      serviceTitle: asStr(order.service_title ?? details.service_title ?? request.service_title),
    };
  }
  if (name.startsWith("marketplace.")) {
    const kind = /paid|approved/.test(name) ? "paid" : /reject|cancel/.test(name) ? "rejected" : "other";
    const chat = asStr(ev.chat_url);
    return {
      kind,
      orderId: asStr(ev.order_id),
      workId: asStr(ev.work_id) || asStr(asDict(ev.purchase_request).work_id),
      roomId: asStr(ev.room_id) || (ROOM_RE.exec(chat)?.[1] ?? ""),
      serviceTitle: asStr(ev.service_title),
    };
  }
  if (name !== "notification.created") return null;
  const n = asDict(ev.notification);
  const data = asDict(n.data);
  const inner = asStr(data.event);
  if (inner === "order_payment_updated" && asStr(data.order_id)) {
    return { kind: "other", orderId: asStr(data.order_id), workId: "", roomId: "", serviceTitle: "" };
  }
  if (inner === "payment_paid" && asStr(data.target_type) === "marketplace_order" && asStr(data.target_id)) {
    return { kind: "other", orderId: asStr(data.target_id), workId: "", roomId: "", serviceTitle: "" };
  }
  if (!inner.startsWith("marketplace_")) return null;
  const kind = inner === "marketplace_purchase_approved" || inner === "marketplace_order_paid" ? "paid" : inner === "marketplace_purchase_rejected" ? "rejected" : inner === "marketplace_purchase_requested" ? "requested" : "other";
  return { kind, orderId: asStr(data.order_id), workId: asStr(data.work_id), roomId: asStr(data.room_id), serviceTitle: asStr(data.service_title) || asStr(n.body) };
}

export function isOrderPending(o: Pick<MarketOrder, "status" | "paymentStatus">): boolean {
  return o.status === "pending_payment" || o.status === "waiting_payment" || (o.status === "pending" && o.paymentStatus !== "paid");
}

export const MARKET_DONE = new Set(["completed", "rated", "done", "closed"]);
export const MARKET_STOPPED = new Set(["cancelled", "canceled", "declined", "rejected", "lost", "refunded"]);

export type MarketStage = "pending" | "active" | "completed" | "cancelled";

export function marketStageOf(o: Pick<MarketOrder, "status" | "paymentStatus">): MarketStage {
  if (MARKET_STOPPED.has(o.status)) return "cancelled";
  if (MARKET_DONE.has(o.status)) return "completed";
  if (isOrderPending(o)) return "pending";
  return "active";
}

export type MarketTrackPhase = "pending" | "paid" | "chat" | "completed" | "cancelled";

export function phaseOfStatus(status: string): MarketTrackPhase {
  const s = status.trim().toLowerCase();
  if (MARKET_STOPPED.has(s)) return "cancelled";
  if (MARKET_DONE.has(s)) return "completed";
  if (!s || s === "pending" || s === "pending_payment" || s === "waiting_payment") return "pending";
  return "paid";
}

export function trackPhaseOf(o: Pick<MarketOrder, "status" | "paymentStatus" | "canStartChat">): MarketTrackPhase {
  const stage = marketStageOf(o);
  if (stage !== "active") return stage;
  return o.canStartChat ? "chat" : "paid";
}

export function findMarketOrder(list: MarketOrder[], orderId: string, workId: string): MarketOrder | null {
  const byId = orderId ? list.find((o) => o.id === orderId) : undefined;
  if (byId) return byId;
  const byWork = workId ? list.find((o) => o.workId === workId) : undefined;
  return byWork ?? null;
}

export function marketChatHref(o: { roomId: string; workId?: string; serviceTitle?: string }): string {
  const qs = new URLSearchParams();
  if (o.workId) qs.set("wid", o.workId);
  if (o.serviceTitle) qs.set("svc", o.serviceTitle);
  const q = qs.toString();
  return `/portal/chat/${encodeURIComponent(o.roomId)}${q ? `?${q}` : ""}`;
}

const heldOrders = new Map<string, number>();

export function holdMarketOrder(orderId: string): () => void {
  if (!orderId) return () => {};
  heldOrders.set(orderId, (heldOrders.get(orderId) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = (heldOrders.get(orderId) ?? 1) - 1;
    if (left > 0) heldOrders.set(orderId, left);
    else heldOrders.delete(orderId);
  };
}

export function isMarketOrderHeld(orderId: string): boolean {
  return !!orderId && heldOrders.has(orderId);
}

const sellerCache = new Map<string, MarketSeller>();

export function rememberSellers(items: MarketSeller[]): void {
  for (const s of items) sellerCache.set(s.userId, s);
}

export function peekSeller(userId: string): MarketSeller | null {
  return sellerCache.get(userId) ?? null;
}
