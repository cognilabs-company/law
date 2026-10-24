import { http, asDict, asStr, asNum, asArr, ApiError, isAborted, parseServerTime, type Dict } from "@/lib/http";
import { uzs } from "@/lib/money";
import { cleanDocTitle } from "@/lib/docTitle";
import { sellerTrustOf, type RatingStatus } from "./trust";
import { featureMissing, noteFeatureError } from "@/lib/endpointGate";
import { gatedPhone, phoneGateOf } from "./clientPhone";
import { resolutionOf, type OrderResolution } from "./resolution";
import { MARKET_ACTION_TAIL, RUNTIME_ERROR_CODES, completeOrderV2, completeV2Path, marketActionPath, normDuration, normNegotiation, normCancellationReview, type RuntimeDuration, type Negotiation, type CancellationReview, type ChecklistProgress } from "./marketRuntime";

export { marketActionPath };

export type MarketCategory = { id: string; title: string; slug: string };

export type MarketService = {
  id: string;
  title: string;
  categoryId: string;
  categoryTitle: string;
  basePrice: number;
  selectedPrice: number;
  price: number;
  // The backend lowered the provider's own price to today's maximum.
  priceCapped?: boolean;
  currency: string;
  deliveryMinutes: number;
  experienceNote: string;
  advokatRequired: boolean;
  isSponsored: boolean;
};

export type MarketPromotion = { id: string; active: boolean; packageTitle: string; daysLeft: number; boostScore: number; serviceId: string; serviceTitle: string };

export type MarketPromotionSurface = {
  id: string;
  placement: "banner" | "profile_boost" | "service_boost" | string;
  sellerUserId: string;
  sellerName: string;
  serviceId: string;
  serviceTitle: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaUrl: string;
  imageUrl: string;
  boostScore: number;
  isSponsored: boolean;
  // banner_mode "profile_card": a banner bought without a picture is drawn as
  // the seller's own card, from seller_profile.
  bannerMode: string;
  // Whole days until ends_at, counted when the answer arrived (0 = ends today,
  // -1 = no end given).
  daysLeft: number;
  seller: { rating: number; reviews: number; verified: boolean; type: string; specialization: string; region: string; experience: number; headline: string } | null;
  draft?: { auto?: ("title" | "subtitle" | "cta")[]; ph?: string };
};

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
  // A seller's license number, education and verification state are the
  // owner's and the verifiers' business only (getMyLawyer, the admin
  // seller list). This is the public shape of a seller, so it does not carry
  // them even when a backend response still includes them — only `verified`
  // and its badge, which are public.
  region: string;
  district: string;
  specializations: string[];
  languages: string[];
  bio: string;
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
  barAssociation: string;
  organizationName: string;
  createdAt: string;
  isSponsored: boolean;
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

export type MarketList = { items: MarketSeller[]; total: number; meta: MarketMeta | null; sponsored: MarketPromotionSurface[]; sponsoredProfiles: MarketPromotionSurface[]; banners: MarketPromotionSurface[] };

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
    // The payable price is the backend's capped one; the provider's own
    // figure is context only (contract §19).
    price: uzs(d, "effective_price") || selected || base,
    priceCapped: d.price_capped === true,
    currency: asStr(d.currency, "UZS") || "UZS",
    deliveryMinutes: asNum(d.delivery_minutes),
    experienceNote: asStr(d.experience_note),
    advokatRequired: d.advokat_required === true,
    isSponsored: d.is_sponsored === true || asDict(d.promotion).is_sponsored === true || asDict(d.promotion).active === true,
  };
}

function normPromotion(v: unknown): MarketPromotion | null {
  if (v === undefined || v === null) return null;
  const d = asDict(v);
  return {
    id: asStr(d.id ?? d.promotion_id),
    active: d.active === true,
    packageTitle: asStr(d.package_title),
    daysLeft: asNum(d.days_left),
    boostScore: asNum(d.boost_score),
    serviceId: asStr(d.service_id),
    serviceTitle: asStr(d.service_title),
  };
}

function daysUntil(iso: string): number {
  const end = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(end)) return -1;
  return Math.max(0, Math.floor((end - Date.now()) / 86_400_000));
}

export function normPromotionSurface(v: unknown): MarketPromotionSurface {
  const d = asDict(v);
  const seller = asDict(d.seller);
  const service = asDict(d.service);
  const profile = asDict(d.seller_profile);
  return {
    id: asStr(d.id ?? d.promotion_id),
    placement: asStr(d.placement),
    sellerUserId: asStr(d.seller_user_id ?? d.user_id ?? seller.user_id ?? seller.id),
    sellerName: asStr(d.seller_name ?? seller.name ?? seller.lawyer_name),
    serviceId: asStr(d.service_id ?? service.id),
    serviceTitle: cleanDocTitle(asStr(d.service_title ?? service.title ?? service.name)),
    title: asStr(d.title),
    subtitle: asStr(d.subtitle),
    ctaLabel: asStr(d.cta_label),
    ctaUrl: asStr(d.cta_url),
    imageUrl: asStr(d.image_url ?? d.banner_image_url),
    boostScore: asNum(d.boost_score),
    isSponsored: d.is_sponsored !== false,
    bannerMode: asStr(d.banner_mode),
    daysLeft: daysUntil(asStr(d.ends_at)),
    seller: Object.keys(profile).length
      ? {
          rating: asNum(profile.rating),
          reviews: asNum(profile.reviews_count),
          verified: profile.is_verified === true || asStr(profile.verification_status) === "approved",
          type: asStr(profile.seller_type ?? profile.role ?? seller.role),
          specialization: asStr(profile.specialization ?? asArr(profile.specializations)[0]),
          region: asStr(profile.region),
          experience: asNum(profile.experience_years) || asNum(profile.lawyer_experience_years),
          headline: asStr(profile.headline),
        }
      : null,
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
    region: asStr(d.region).trim(),
    district: asStr(d.district).trim(),
    specializations: strList(d.specializations),
    languages: strList(d.languages),
    bio: asStr(d.bio).trim(),
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
    isSponsored: d.is_sponsored === true || asDict(d.promotion).is_sponsored === true,
    onlineNow: d.online_now === true,
    available: asStr(avail.status, "available") !== "offline",
    services,
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
  const sponsored = asArr(d.sponsored).map(normPromotionSurface).filter((item) => item.id || item.sellerUserId || item.serviceId);
  const banners = asArr(d.banners).map(normPromotionSurface).filter((item) => item.id || item.imageUrl || item.title);
  const sponsoredProfiles = asArr(d.sponsored_profiles).map(normPromotionSurface).filter((item) => item.id || item.sellerUserId);
  return { items, total: asNum(d.total, items.length), meta: normMeta(d.meta), sponsored, sponsoredProfiles, banners };
}

export async function searchMarketplaceSellers(
  q: string,
  opts: { sellerType?: string; limit?: number; signal?: AbortSignal } = {},
): Promise<{ items: MarketSeller[]; total: number }> {
  const qs = new URLSearchParams({ q: q.trim(), limit: String(Math.max(1, Math.min(opts.limit ?? 5, 100))) });
  if (opts.sellerType === "advokat" || opts.sellerType === "yurist") qs.set("seller_type", opts.sellerType);
  const d = asDict(await http(`/marketplace/lawyers?${qs}`, { signal: opts.signal }));
  const items = asArr(d.items).map(normMarketSeller).filter((s) => s.userId && s.verified);
  return { items, total: Math.max(asNum(d.total, items.length), items.length) };
}

export type MarketAiMatch = { userId: string; score: number; reasons: string[]; seller: MarketSeller | null };
export type MarketAiResult = { matches: MarketAiMatch[]; summary: string; disclaimer: string; total: number; hasMore: boolean; sponsored: MarketPromotionSurface[]; sponsoredProfiles: MarketPromotionSurface[]; banners: MarketPromotionSurface[]; suggestedServices: MarketMeta["services"] };

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
      sponsored: asArr(d.sponsored ?? asDict(d.meta).sponsored).map(normPromotionSurface).filter((item) => item.id || item.sellerUserId || item.serviceId),
      sponsoredProfiles: asArr(d.sponsored_profiles ?? asDict(d.meta).sponsored_profiles).map(normPromotionSurface).filter((item) => item.id || item.sellerUserId),
      banners: asArr(asDict(d.meta).banners ?? d.banners).map(normPromotionSurface).filter((item) => item.id || item.imageUrl || item.title),
      suggestedServices: asArr(d.suggested_services ?? asDict(d.meta).suggested_services).map((x) => {
        const s = asDict(x);
        return { id: asStr(s.id ?? s.service_id), title: cleanDocTitle(asStr(s.title ?? s.name)), categoryId: asStr(s.category_id), basePrice: uzs(s, "base_price") };
      }).filter((item) => item.id),
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
// The purchase request accepts chat, audio and video (2026-10-18 contract);
// "meeting" stays in the type for orders made before it.
export const PREFERRED_CHANNELS: PreferredChannel[] = ["chat", "audio", "video"];

export type MarketPurchase = {
  workId: string;
  orderId: string;
  status: string;
  amount: number;
  currency: string;
  telegramSent: boolean;
};

// How soon the client needs it (2026-10-18 contract), and what they sent
// with the request: workspace files uploaded first, by id — up to 20 files
// and 10 voice messages.
export const PURCHASE_URGENCIES = ["today", "tomorrow", "later"] as const;
export type PurchaseUrgency = (typeof PURCHASE_URGENCIES)[number];
export const CONTACT_SPEEDS = ["within_15_min", "within_1_hour", "today", "tomorrow"] as const;
export type ContactSpeed = (typeof CONTACT_SPEEDS)[number];
export function isContactSpeed(v: unknown): v is ContactSpeed {
  return typeof v === "string" && (CONTACT_SPEEDS as readonly string[]).includes(v);
}
export const MAX_PURCHASE_FILES = 20;
export const MAX_PURCHASE_VOICES = 10;
export type PurchaseAttachment = { fileId: string; title: string };
export type PurchaseVoice = { fileId: string; seconds: number };
export type PurchaseInput = {
  note: string;
  preferredChannel: PreferredChannel;
  preferredTime?: string;
  contactSpeed?: ContactSpeed | "";
  selectedOptionIds?: string[];
  urgency?: PurchaseUrgency | "";
  attachments?: PurchaseAttachment[];
  voiceMessages?: PurchaseVoice[];
};

export function purchaseBodyOf(input: PurchaseInput): Record<string, unknown> {
  const note = input.note.trim();
  const body: Record<string, unknown> = {
    selected_option_ids: input.selectedOptionIds ?? [],
    note,
    preferred_channel: input.preferredChannel,
  };
  const time = (input.preferredTime ?? "").trim();
  if (time) body.preferred_time = time;
  if (input.contactSpeed) body.contact_speed = input.contactSpeed;
  if (input.contactSpeed !== undefined) {
    const details: Record<string, unknown> = { note, contact_channel: input.preferredChannel };
    if (input.contactSpeed) details.contact_speed = input.contactSpeed;
    if (input.urgency) details.urgency = input.urgency;
    body.details = details;
  }
  if (input.urgency) body.urgency = input.urgency;
  if (input.attachments?.length) body.attachments = input.attachments.slice(0, MAX_PURCHASE_FILES).map((a) => ({ file_id: a.fileId, title: a.title }));
  if (input.voiceMessages?.length) body.voice_messages = input.voiceMessages.slice(0, MAX_PURCHASE_VOICES).map((v) => ({ file_id: v.fileId, duration_seconds: Math.max(1, Math.round(v.seconds)) }));
  return body;
}

function purchaseBody(input: PurchaseInput): string {
  return JSON.stringify(purchaseBodyOf(input));
}

export async function requestMarketplacePurchase(lawyerUserId: string, serviceId: string, input: PurchaseInput): Promise<MarketPurchase> {
  return purchaseOf(
    await http(`/marketplace/lawyers/${encodeURIComponent(lawyerUserId)}/services/${encodeURIComponent(serviceId)}/purchase-request`, {
      method: "POST",
      body: purchaseBody(input),
    }),
  );
}

export function packagePurchasePath(packageId: string, lawyerUserId: string): string {
  return `/marketplace/service-packages/${encodeURIComponent(packageId)}/lawyers/${encodeURIComponent(lawyerUserId)}/purchase-request`;
}

export async function requestPackagePurchase(packagePurchaseUrl: string, input: PurchaseInput, target?: { packageId: string; lawyerUserId: string }): Promise<MarketPurchase> {
  const given = packagePurchaseUrl.trim().replace(/^https?:\/\/[^/]+/i, "");
  const path = given || (target?.packageId && target.lawyerUserId ? packagePurchasePath(target.packageId, target.lawyerUserId) : "");
  if (!path) throw new ApiError(404);
  return purchaseOf(await http(path, { method: "POST", body: purchaseBody(input) }));
}

export function purchaseOf(raw: unknown): MarketPurchase {
  const d = asDict(raw);
  const order = asDict(d.order);
  const payment = asDict(d.payment);
  const req = asDict(d.purchase_request);
  const gate = asDict(d.payment_gate);
  return {
    workId: asStr(d.work_id) || asStr(req.work_id) || asStr(asDict(order.details).work_id) || asStr(order.work_id),
    orderId: asStr(order.id ?? d.order_id),
    status: asStr(order.status ?? d.status),
    amount: uzs(payment, "amount") || uzs(order, "price"),
    currency: asStr(payment.currency ?? order.currency, "UZS") || "UZS",
    // Omitted delivery metadata is unknown, not proof that Telegram sent it.
    telegramSent: d.telegram_sent === true || payment.telegram_sent === true || gate.telegram_sent === true,
  };
}

export type ActivePurchase = { orderId: string; workId: string; status: string };

export const MARKET_ERROR_CODES = [
  "marketplace_order_already_active",
  "marketplace_package_order_already_active",
  "package_seller_not_eligible",
  "package_not_available_for_seller",
  "unknown_price_options",
  "duplicate_price_option",
  "negative_price_adjustment_forbidden",
  "additional_payment_must_increase_price",
  "additional_payment_not_allowed",
  "marketplace_result_required",
  "rating_window_closed",
  "ticket_closed",
  ...RUNTIME_ERROR_CODES,
] as const;
export const PRICE_OPTION_ERRORS: readonly string[] = ["unknown_price_options", "duplicate_price_option", "negative_price_adjustment_forbidden"];
export const PACKAGE_SELLER_ERRORS: readonly string[] = ["package_seller_not_eligible", "package_not_available_for_seller"];
const ACTIVE_ORDER_ERRORS: readonly string[] = ["marketplace_order_already_active", "marketplace_package_order_already_active"];

export function marketErrorCode(e: unknown): string {
  if (!(e instanceof ApiError)) return "";
  return e.code || asStr(asDict(e.data.detail).code) || asStr(e.data.code);
}

export function activePurchaseOf(e: unknown): ActivePurchase | null {
  if (!(e instanceof ApiError) || e.status !== 409 || !ACTIVE_ORDER_ERRORS.includes(marketErrorCode(e))) return null;
  const detail = asDict(e.data.detail);
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
  contactSpeed: string;
  contactSpeedLabel: string;
  clientName: string;
  clientPhone: string;
  clientPhoneVisible: boolean | null;
  clientPhoneHiddenReason: string;
  clientUserId: string;
  lawyerName: string;
  lawyerPhone: string;
  lawyerUserId: string;
  roomId: string;
  canStartChat: boolean;
  canCreateCall: boolean;
  callTypes: CallKind[];
  canCancel: boolean;
  canComplete: boolean;
  createdAt: string;
  serviceId: string;
  packageId: string;
  packageTitle: string;
  packageTier: string;
  selectedOptions: OrderOption[];
  resultText: string;
  resultFiles: ResultFile[];
  completedAt: string;
  rating: OrderRating;
  ratingUrl: string;
  complaint: OrderComplaint;
  warranty: OrderWarranty;
  // Set while the call center resolves a declined or expired assignment.
  resolution: OrderResolution | null;
  supplemental: SupplementalPayment | null;
  workPaused: boolean;
  startedAt: string;
  expectedCompletedAt: string;
  duration: RuntimeDuration | null;
  deadlinePaused: boolean;
  deadlineRemainingSeconds: number | null;
  chatReadOnly: boolean;
  callsAllowed: boolean;
  lockExplicit: boolean;
  negotiation: Negotiation | null;
  negotiationAvailable: boolean | null;
  cancellationReview: CancellationReview | null;
  checklistProgress: ChecklistProgress | null;
  canStart: boolean;
  canRequestCancellation: boolean | null;
  canNegotiate: boolean | null;
  explicit: { start: boolean; complete: boolean; cancel: boolean };
  urls: { start: string; checklist: string; negotiations: string; cancellationReview: string; secondOpinion: string; complete: string; cancel: string; chat: string; callCreate: string; secondOpinionPromotion?: string };
  pricing: OrderPricing | null;
};

// The price as the backend fixed it when the order was placed
// (details.pricing_snapshot, details.financial_snapshot). Every amount and
// percent is the backend's own; nothing here is worked out. The factors
// (`modifiers`, read with readPriceModifiers) set the seller's allowed
// ceiling; the seller then chose `selected` inside [min, max].
export type OrderPricing = {
  modifiers: unknown;
  selected: number;
  final: number;
  min: number;
  max: number;
  base: number;
  capped: boolean;
  advance: { percent: number | null; amount: number } | null;
  rest: { percent: number | null; amount: number } | null;
  // The platform's share and the seller's net: for the seller and staff
  // only — the client view never shows it, whatever the API sends.
  commission: { percent: number | null; platform: number; net: number } | null;
  // Extras the client picked (details.option_quote.breakdown), on top of
  // the seller's price.
  options: { label: string; percent: number | null; amount: number }[];
  // The immutable snapshot's parts in the backend's order; they add up to
  // the final price there, and are shown as sent.
  components: { code: string; amount: number; percent: number | null; label: Record<string, string> }[];
  // An old order normalised on read: its eligibility rules were not kept.
  historical: boolean;
};

const present = (v: unknown) => v !== null && v !== undefined && v !== "";
const pctOf = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

function orderPricingOf(d: Dict, details: Dict): OrderPricing | null {
  const p = asDict(details.pricing_snapshot ?? d.pricing_snapshot);
  const f = asDict(details.financial_snapshot ?? d.financial_snapshot);
  if (!Object.keys(p).length && !Object.keys(f).length) return null;
  const pay = asDict(f.payment);
  const com = asDict(f.commission);
  const advance = uzs(pay, "advance_amount");
  const rest = uzs(pay, "final_amount");
  const platform = uzs(com, "platform_amount");
  const quote = asDict(details.option_quote ?? d.option_quote);
  const options = asArr(quote.breakdown)
    .map((x) => {
      const o = asDict(x);
      return { label: asStr(o.label ?? o.title).trim(), percent: asStr(o.adjustment_type) === "percent" ? pctOf(o.value) : null, amount: uzs(o, "amount") };
    })
    .filter((o) => o.label && o.amount !== 0);
  return {
    modifiers: p.modifiers ?? null,
    selected: uzs(p, "selected_price"),
    final: uzs(p, "final_price") || uzs(f, "gross_amount"),
    min: uzs(p, "min_allowed"),
    max: uzs(p, "max_allowed"),
    base: uzs(p, "base_price", "base"),
    capped: p.price_capped === true,
    advance: advance > 0 ? { percent: pctOf(pay.advance_percent), amount: advance } : null,
    rest: rest > 0 ? { percent: pctOf(pay.final_percent), amount: rest } : null,
    commission: platform > 0 || present(com.effective_percent) ? { percent: pctOf(com.effective_percent), platform, net: uzs(com, "seller_net_amount") } : null,
    options,
    components: asArr(p.components).map((x) => {
      const c = asDict(x);
      const ex = c.explanation;
      const label: Record<string, string> = typeof ex === "string" ? { uz: ex } : Object.fromEntries(Object.entries(asDict(ex)).map(([k, v]) => [k, asStr(v)]));
      return { code: asStr(c.code), amount: uzs(c, "amount"), percent: pctOf(c.percent), label };
    }),
    historical: p.historical_policy_exact === false,
  };
}

// The order's actual payment rows and settlement (GET …/financials): each
// stage's status as the payment provider reported it to the backend.
export type OrderPaymentRow = { id: string; stage: string; status: string; amount: number; paid: number };
export type OrderFinancials = { payments: OrderPaymentRow[]; settlement: string };

export async function getOrderFinancials(orderId: string, signal?: AbortSignal): Promise<OrderFinancials> {
  const d = asDict(await http(`/marketplace/me/orders/${encodeURIComponent(orderId)}/financials`, { signal }));
  const payments = asArr(d.payments).map((x) => {
    const p = asDict(x);
    return { id: asStr(p.id), stage: asStr(p.stage).toLowerCase(), status: asStr(p.status).toLowerCase(), amount: uzs(p, "amount"), paid: uzs(p, "paid_amount") };
  });
  const s = d.settlement;
  return { payments, settlement: typeof s === "string" ? s.toLowerCase() : asStr(asDict(s).status).toLowerCase() };
}

export type CallKind = "audio" | "video";
export const CALL_KINDS: readonly CallKind[] = ["audio", "video"];

export type OrderOption = { id: string; label: string; amount: number };
export type ResultFile = { fileId: string; fileName: string; downloadUrl: string };
// The complaint is its own action beside the rating, in the same window
// (enterprise contract §9.2): offered only while `available`.
export type OrderComplaint = { available: boolean; status: string; reason: string; deadlineAt: string; url: string };

export function complaintOf(d: Dict, details: Dict = asDict(d.details)): OrderComplaint {
  const raw = d.complaint ?? details.complaint;
  const c = asDict(raw);
  return {
    available: c.available === true || c.can_complain === true,
    status: asStr(c.status).toLowerCase() || (typeof raw === "string" ? raw.toLowerCase() : ""),
    reason: asStr(c.reason),
    deadlineAt: asStr(c.deadline_at ?? d.complaint_deadline_at),
    url: asStr(c.url ?? d.complaint_url),
  };
}

export async function fileOrderComplaint(order: Pick<MarketOrder, "id" | "complaint">, reason: string): Promise<void> {
  const path = order.complaint.url.replace(/^https?:\/\/[^/]+/i, "") || `/marketplace/me/orders/${encodeURIComponent(order.id)}/complaint`;
  await http(path, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
}

// The order's LexGo guarantee (enterprise contract §10): the client asks for
// a replacement seller or a full refund; the call center decides. Offered
// while the backend gives `warranty_url`.
export type WarrantyResolution = "replacement" | "full_refund";
export type OrderWarranty = { url: string; status: string; resolution: string; reason: string; decision: string };

export function warrantyOf(d: Dict, details: Dict = asDict(d.details)): OrderWarranty {
  const w = asDict(d.warranty ?? d.warranty_claim ?? details.warranty_claim);
  return {
    url: asStr(d.warranty_url),
    status: asStr(w.status).toLowerCase(),
    resolution: asStr(w.resolution ?? w.requested_resolution).toLowerCase(),
    reason: asStr(w.reason),
    decision: asStr(w.decision ?? w.resolution_note ?? w.call_center_note),
  };
}

// What the guarantee offers right now (GET /marketplace/runtime-capabilities).
let capsCache: Promise<WarrantyResolution[]> | null = null;
export function warrantyResolutions(): Promise<WarrantyResolution[]> {
  capsCache ??= http("/marketplace/runtime-capabilities").then(
    (v) => {
      const w = asDict(asDict(v).warranty);
      const out: WarrantyResolution[] = [];
      if (w.replacement === true) out.push("replacement");
      if (w.full_refund === true) out.push("full_refund");
      return out;
    },
    () => {
      capsCache = null;
      return [];
    },
  );
  return capsCache;
}

export async function requestOrderWarranty(order: Pick<MarketOrder, "id" | "warranty">, input: { reasonCode: string; reason: string }): Promise<OrderWarranty> {
  const path = order.warranty.url.replace(/^https?:\/\/[^/]+/i, "") || `/marketplace/me/orders/${encodeURIComponent(order.id)}/warranty`;
  // The client says why (`kind`) and in what words; the call center then
  // picks a replacement or a full refund (backend answers 24 Oct 2026 §3).
  const d = asDict(await http(path, { method: "POST", body: JSON.stringify({ kind: input.reasonCode, reason: input.reason.trim() }) }));
  const w = asDict(d.warranty ?? d.claim ?? d);
  return { url: order.warranty.url, status: asStr(w.status).toLowerCase() || "pending", resolution: asStr(w.resolution).toLowerCase(), reason: asStr(w.reason) || input.reason, decision: "" };
}

export type OrderRating = { canRate: boolean; available: boolean; closed: boolean; reason: string; deadlineAt: string; remainingSeconds: number; expiresAt: number; value: number; comment: string };
export type SupplementalStatus = "pending" | "approved" | "rejected" | "escalated" | "expired" | "cancelled";
export type SupplementalPayment = {
  id: string;
  status: SupplementalStatus;
  amount: number;
  newTotal: number;
  note: string;
  options: OrderOption[];
  expiresAt: string;
  createdAt: string;
};

const ROOM_RE = /\/secure-chats\/([^/?#]+)/;

function normOrderOption(v: unknown): OrderOption {
  const d = asDict(v);
  return { id: asStr(d.id ?? d.option_id), label: asStr(d.label ?? d.title ?? d.name), amount: uzs(d, "amount", "price", "value") };
}

function normResultFile(v: unknown): ResultFile {
  const d = asDict(v);
  return { fileId: asStr(d.file_id ?? d.id), fileName: asStr(d.file_name ?? d.name), downloadUrl: asStr(d.download_url ?? d.url) };
}

const SUPPLEMENTAL_STATUS: Record<string, SupplementalStatus> = {
  pending: "pending",
  pending_payment: "pending",
  waiting_payment: "pending",
  requested: "pending",
  approved: "approved",
  paid: "approved",
  rejected: "rejected",
  declined: "rejected",
  escalated: "escalated",
  expired: "expired",
  cancelled: "cancelled",
  canceled: "cancelled",
  replaced: "cancelled",
};

function normSupplemental(v: unknown): SupplementalPayment | null {
  const d = asDict(v);
  if (!Object.keys(d).length) return null;
  const quote = asDict(d.quote);
  const options = asArr(d.selected_options ?? d.options ?? quote.breakdown).map(normOrderOption).filter((o) => o.id || o.label);
  const ids = asArr(d.selected_option_ids).map((x) => asStr(x)).filter(Boolean);
  return {
    id: asStr(d.id ?? d.request_id),
    status: SUPPLEMENTAL_STATUS[asStr(d.status).toLowerCase()] ?? "pending",
    amount: uzs(d, "amount", "additional_amount") || uzs(quote, "additional_amount"),
    newTotal: uzs(d, "new_total", "total_price") || uzs(quote, "total_price"),
    note: asStr(d.note).trim(),
    options: options.length ? options : ids.map((id) => ({ id, label: "", amount: 0 })),
    expiresAt: asStr(d.expires_at ?? d.deadline_at),
    createdAt: asStr(d.created_at),
  };
}

export function ratingOf(d: Dict, details: Dict = asDict(d.details), now = Date.now()): OrderRating {
  const r = filledDict(d.rating) ?? asDict(d.rating_window ?? details.rating_window);
  const available = typeof r.available === "boolean" ? r.available : r.can_rate === true;
  const closed = r.closed === true;
  const remaining = asNum(r.remaining_seconds, -1);
  const deadlineAt = asStr(r.deadline_at ?? d.rating_deadline_at ?? details.rating_deadline_at);
  const at = parseServerTime(deadlineAt);
  const own = typeof d.rating === "number" ? d.rating : asNum(r.value ?? r.rating ?? r.score);
  return {
    canRate: available && !closed,
    available,
    closed,
    reason: asStr(r.reason),
    deadlineAt,
    remainingSeconds: Math.max(0, remaining),
    expiresAt: remaining > 0 ? now + remaining * 1000 : Number.isFinite(at) ? at : 0,
    value: own || (typeof details.rating === "number" ? details.rating : asNum(asDict(details.rating).value)),
    comment: asStr(r.comment ?? d.rating_comment ?? details.rating_comment),
  };
}

function supplementalOf(d: Dict, details: Dict): SupplementalPayment | null {
  const direct = d.additional_payment ?? d.additional_payment_request ?? details.additional_payment_request ?? details.additional_payment;
  if (direct && typeof direct === "object" && !Array.isArray(direct)) return normSupplemental(direct);
  const list = asArr(d.additional_payment_requests ?? details.additional_payment_requests).map(normSupplemental).filter((x): x is SupplementalPayment => !!x);
  return list.find((x) => x.status === "pending") ?? list[list.length - 1] ?? null;
}

function filledDict(v: unknown): Dict | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return Object.keys(v).length ? (v as Dict) : null;
}

function firstFinite(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (v === null || v === undefined || v === "" || typeof v === "boolean") continue;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function firstBool(...vals: unknown[]): boolean | null {
  for (const v of vals) if (typeof v === "boolean") return v;
  return null;
}

function callKindsOf(...vals: unknown[]): CallKind[] | null {
  for (const v of vals) {
    if (!Array.isArray(v)) continue;
    const kinds = v.map((x) => asStr(x).trim().toLowerCase());
    return CALL_KINDS.filter((k) => kinds.includes(k));
  }
  return null;
}

function durationOfRow(v: unknown): RuntimeDuration | null {
  if (!filledDict(v)) return null;
  const d = normDuration(v);
  return d.value > 0 ? d : null;
}

function negotiationOfRow(d: Dict, details: Dict): Negotiation | null {
  const list = asArr(d.negotiations ?? details.negotiations);
  const raw = filledDict(d.negotiation) ?? filledDict(d.current_negotiation) ?? filledDict(d.active_negotiation) ?? filledDict(details.negotiation) ?? filledDict(list[list.length - 1]);
  if (!raw) return null;
  const n = normNegotiation(raw);
  return n.id || n.amount > 0 ? n : null;
}

function progressOfRow(v: unknown): ChecklistProgress | null {
  if (typeof v === "number" && Number.isFinite(v)) return { done: 0, total: 0, requiredDone: 0, requiredTotal: 0, percent: v };
  const d = filledDict(v);
  if (!d) return null;
  const n = (...vals: unknown[]) => firstFinite(...vals) ?? 0;
  return {
    done: n(d.done, d.completed, d.done_count),
    total: n(d.total, d.total_count),
    requiredDone: n(d.required_done, d.required_completed),
    requiredTotal: n(d.required_total, d.required_count),
    percent: n(d.percent, d.progress_percent, d.percentage),
  };
}

export function normMarketOrder(v: unknown): MarketOrder {
  const d = asDict(v);
  const details = asDict(d.details);
  const client = asDict(d.client);
  const lawyer = asDict(d.lawyer);
  const payment = asDict(d.payment);
  const chatUrl = asStr(d.chat_url);
  const roomId = asStr(d.secure_chat_room_id ?? details.secure_chat_room_id) || (ROOM_RE.exec(chatUrl)?.[1] ?? "");
  const status = asStr(d.status).toLowerCase();
  const pkg = asDict(d.package ?? d.package_snapshot ?? details.package_snapshot ?? details.package);
  const quote = asDict(d.quote ?? d.quote_snapshot ?? details.quote_snapshot ?? details.quote);
  const result = asDict(d.result);
  const supplemental = supplementalOf(d, details);
  const optionRows = asArr(d.selected_options ?? details.selected_options ?? quote.breakdown).map(normOrderOption).filter((o) => o.id || o.label);
  const paymentStatus = asStr(d.payment_status ?? payment.status).toLowerCase();
  const done = MARKET_DONE.has(status);
  const stopped = MARKET_STOPPED.has(status);
  const startedAt = asStr(d.started_at ?? details.started_at ?? details.work_started_at);
  const chatState = asDict(d.chat ?? d.chat_state ?? details.chat_state);
  const readOnlyFlag = firstBool(d.chat_read_only, details.chat_read_only, chatState.read_only);
  const callsDisabled = firstBool(chatState.calls_disabled, d.calls_disabled);
  const callKinds = callKindsOf(d.allowed_call_types, d.calls_allowed, details.allowed_call_types, details.calls_allowed, chatState.allowed_call_types, chatState.calls_allowed);
  const callsEnabled = firstBool(d.calls_enabled, details.calls_enabled, chatState.calls_enabled);
  const callsFlag = firstBool(d.calls_allowed, details.calls_allowed, chatState.calls_allowed, callsEnabled, callKinds ? callKinds.length > 0 : null, callsDisabled === null ? null : !callsDisabled);
  const createCallFlag = typeof d.can_create_call === "boolean" ? d.can_create_call : callsEnabled === true || !!callKinds?.length;
  const phoneGate = phoneGateOf([client, details.client], [d, details]);
  const reviewRaw = filledDict(d.cancellation_review) ?? filledDict(d.cancellation_review_request) ?? filledDict(details.cancellation_review);
  const actions = filledDict(d.actions) ?? {};
  const actionUrl = (k: string): string => {
    const a = actions[k.replace(/_url$/, "")] ?? actions[k];
    const s = (typeof a === "string" ? a : asStr(asDict(a).url ?? asDict(a).href)).trim();
    return /^(https?:\/\/|\/)/i.test(s) ? s : "";
  };
  const url = (k: string) => (k in d ? asStr(d[k]).trim() : actionUrl(k));
  const negotiationsUrl = "negotiations_url" in d || "negotiation_url" in d ? asStr(d.negotiations_url ?? d.negotiation_url).trim() : actionUrl("negotiations") || actionUrl("negotiation");
  const flag = (k: string): boolean | null => (typeof d[k] === "boolean" ? (d[k] as boolean) : null);
  const urlGate = (k: string) => !(k in d) || !!url(k);
  const startFlag = flag("can_start");
  const completeFlag = flag("can_complete");
  const cancelFlag = flag("can_cancel");
  const reviewFlag = flag("can_request_cancellation");
  const negotiateFlag = flag("can_negotiate");
  return {
    id: asStr(d.id ?? d.order_id),
    workId: asStr(d.work_id),
    status,
    paymentStatus,
    serviceTitle: cleanDocTitle(asStr(d.service_title ?? details.service_title)),
    price: uzs(d, "price") || uzs(payment, "amount"),
    currency: asStr(d.currency, "UZS") || "UZS",
    note: asStr(details.client_note ?? d.note).trim(),
    preferredChannel: asStr(details.preferred_channel ?? d.preferred_channel).toLowerCase(),
    preferredTime: asStr(details.preferred_time ?? d.preferred_time).trim(),
    contactSpeed: asStr(d.contact_speed || details.contact_speed).trim().toLowerCase(),
    contactSpeedLabel: asStr(d.contact_speed_label ?? details.contact_speed_label).trim(),
    clientName: asStr(client.name ?? d.client_name).trim(),
    clientPhone: gatedPhone(phoneGate, client.phone, d.client_phone, details.client_phone),
    clientPhoneVisible: phoneGate.visible,
    clientPhoneHiddenReason: phoneGate.reason,
    clientUserId: asStr(d.client_user_id ?? client.id),
    lawyerName: asStr(d.lawyer_name ?? lawyer.name).trim(),
    lawyerPhone: asStr(lawyer.phone ?? d.lawyer_phone).trim(),
    lawyerUserId: asStr(d.lawyer_user_id ?? lawyer.id),
    roomId,
    // contact_unlocked=false: the advance payment is not confirmed by the
    // provider yet, so protected chat and calls stay shut whatever else says.
    canStartChat: d.can_start_chat === true && d.contact_unlocked !== false && !!roomId && urlGate("chat_url"),
    canCreateCall: createCallFlag && d.contact_unlocked !== false && !!roomId && urlGate("call_create_url"),
    callTypes: callKinds?.length ? callKinds : [...CALL_KINDS],
    canCancel: !!url("cancel_url") && cancelFlag !== false,
    canComplete: !!url("complete_url") && completeFlag !== false,
    createdAt: asStr(d.created_at),
    serviceId: asStr(d.service_id ?? details.service_id),
    packageId: asStr(d.package_id ?? details.package_id ?? pkg.id),
    packageTitle: asStr(pkg.title ?? d.package_title ?? details.package_title),
    packageTier: asStr(pkg.tariff ?? pkg.tier ?? d.package_tier ?? details.package_tier).toUpperCase(),
    selectedOptions: optionRows,
    resultText: asStr(d.result_text ?? details.result_text ?? result.text).trim(),
    resultFiles: asArr(d.result_files ?? details.result_files ?? result.files).map(normResultFile).filter((f) => f.fileName || f.downloadUrl),
    completedAt: asStr(d.completed_at ?? details.completed_at),
    rating: ratingOf(d, details),
    ratingUrl: asStr(d.rating_url),
    complaint: complaintOf(d, details),
    warranty: warrantyOf(d, details),
    resolution: resolutionOf(d.resolution ?? details.resolution),
    supplemental,
    workPaused: supplemental?.status === "pending" || (status === "waiting_payment" && (paymentStatus === "paid" || !!supplemental)),
    startedAt,
    expectedCompletedAt: asStr(d.expected_completed_at ?? details.expected_completed_at ?? d.deadline_at),
    duration: durationOfRow(d.duration ?? details.duration),
    deadlinePaused: d.deadline_paused === true || details.deadline_paused === true || status === "cancellation_review",
    deadlineRemainingSeconds: firstFinite(d.deadline_remaining_seconds, details.deadline_remaining_seconds, d.remaining_seconds_at_pause),
    chatReadOnly: readOnlyFlag ?? done,
    callsAllowed: callsFlag ?? (!done && !stopped),
    lockExplicit: readOnlyFlag !== null || callsFlag !== null,
    negotiation: negotiationOfRow(d, details),
    negotiationAvailable: firstBool(d.negotiation_available ?? d.negotiation_allowed ?? details.negotiation_available),
    cancellationReview: reviewRaw ? normCancellationReview(reviewRaw) : null,
    checklistProgress: progressOfRow(d.checklist_progress ?? asDict(d.checklist).progress ?? details.checklist_progress),
    canStart:
      startFlag !== null
        ? startFlag && !!url("start_url")
        : paymentStatus === "paid" && !startedAt && !done && !stopped && (status === "paid" || (!!url("start_url") && status !== "in_progress" && status !== "cancellation_review")),
    canRequestCancellation: reviewFlag !== null ? reviewFlag && !!url("cancellation_review_url") : null,
    canNegotiate: negotiateFlag !== null ? negotiateFlag && !!negotiationsUrl : null,
    explicit: { start: startFlag !== null, complete: completeFlag !== null, cancel: cancelFlag !== null },
    urls: {
      start: url("start_url"),
      checklist: url("checklist_url"),
      negotiations: negotiationsUrl,
      cancellationReview: url("cancellation_review_url"),
      secondOpinion: url("second_opinion_url"),
      complete: url("complete_url"),
      cancel: url("cancel_url"),
      chat: url("chat_url"),
      callCreate: url("call_create_url"),
      ...("second_opinion_promotion_url" in d || "second_opinion_promotion" in actions ? { secondOpinionPromotion: url("second_opinion_promotion_url") } : {}),
    },
    pricing: orderPricingOf(d, details),
  };
}

function orderIn(v: unknown, orderId: string): Dict | null {
  const d = asDict(v);
  const direct = filledDict(d.order) ?? d;
  if (asStr(direct.id ?? direct.order_id) === orderId) return direct;
  const hit = asArr(d.items).find((x) => asStr(asDict(x).id ?? asDict(x).order_id) === orderId);
  return hit ? asDict(hit) : null;
}

export async function getMarketplaceOrder(orderId: string, opts: { signal?: AbortSignal; owner?: string } = {}): Promise<MarketOrder | null> {
  if (!orderId) return null;
  const raw = orderIn(await http(`/marketplace/me/orders/${encodeURIComponent(orderId)}`, { signal: opts.signal }), orderId);
  if (!raw) return null;
  const order = normMarketOrder(raw);
  rememberMarketOrders([order], opts.owner ?? "");
  return order;
}

function detailRouteMissing(e: unknown): boolean {
  if (!(e instanceof ApiError) || e.code) return false;
  if (e.status === 405) return true;
  return e.status === 404 && (!e.detail || /^not found$/i.test(e.detail.trim()));
}

export async function loadMarketplaceOrder(orderId: string, roleView: "client" | "seller", opts: { signal?: AbortSignal; owner?: string } = {}): Promise<MarketOrder | null> {
  try {
    const hit = await getMarketplaceOrder(orderId, opts);
    if (hit) return hit;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404 && !detailRouteMissing(e)) return null;
    if (!detailRouteMissing(e)) throw e;
  }
  return findMarketplaceOrder(orderId, roleView, opts);
}

export async function listMarketplaceOrders(roleView: "client" | "seller", opts: { signal?: AbortSignal } = {}): Promise<MarketOrder[]> {
  const d = await http(`/marketplace/me/orders?role_view=${roleView}`, { signal: opts.signal });
  const items = Array.isArray(d) ? d : asArr(asDict(d).items);
  return items.map(normMarketOrder).filter((o) => o.id);
}

export type MarketOrderPage = { items: MarketOrder[]; count: number; raw: Dict };

export async function listMarketplaceOrdersPage(roleView: "client" | "seller", opts: { limit?: number; offset?: number; signal?: AbortSignal } = {}): Promise<MarketOrderPage> {
  const limit = Math.max(1, Math.round(opts.limit ?? 50));
  const offset = Math.max(0, Math.round(opts.offset ?? 0));
  const qs = new URLSearchParams({ role_view: roleView, limit: String(limit), offset: String(offset) });
  const res = await http(`/marketplace/me/orders?${qs}`, { signal: opts.signal });
  const d: Dict = Array.isArray(res) ? { items: res } : asDict(res);
  const items = asArr(d.items).map(normMarketOrder).filter((o) => o.id);
  return { items, count: asNum(d.count, items.length), raw: d };
}

const orderMemo = new Map<string, { owner: string; order: MarketOrder; at: number }>();

export function rememberMarketOrders(list: readonly MarketOrder[], owner = ""): void {
  const at = Date.now();
  for (const o of list) if (o.id) orderMemo.set(o.id, { owner, order: o, at });
}

export function peekMarketOrder(orderId: string, owner = "", maxAgeMs = Number.POSITIVE_INFINITY): MarketOrder | null {
  const hit = orderMemo.get(orderId);
  return hit && hit.owner === owner && Date.now() - hit.at <= maxAgeMs ? hit.order : null;
}

export async function findMarketplaceOrder(orderId: string, roleView: "client" | "seller", opts: { signal?: AbortSignal; pageSize?: number; maxPages?: number; owner?: string } = {}): Promise<MarketOrder | null> {
  if (!orderId) return null;
  const pageSize = Math.max(1, Math.round(opts.pageSize ?? 50));
  const maxPages = Math.max(1, Math.round(opts.maxPages ?? 10));
  const seen = new Set<string>();
  let offset = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const r = await listMarketplaceOrdersPage(roleView, { limit: pageSize, offset, signal: opts.signal });
    const hit = r.items.find((o) => o.id === orderId);
    if (hit) {
      rememberMarketOrders([hit], opts.owner ?? "");
      return hit;
    }
    const repeated = r.items.some((o) => seen.has(o.id));
    for (const o of r.items) seen.add(o.id);
    offset += pageSize;
    if (repeated || r.items.length < pageSize || (r.count > r.items.length && offset >= r.count)) break;
  }
  return null;
}

export function orderDetailHref(listHref: string, orderId: string, section?: string): string {
  const base = listHref.replace(/\/+$/, "");
  return `${base}/${encodeURIComponent(orderId)}${section ? `#${section}` : ""}`;
}

export function sellerListHref(role: string): string {
  if (role === "client") return "/portal/client/marketplace-orders";
  if (role === "lawyer") return "/portal/lawyer/marketplace-orders";
  return "/portal/advocate/marketplace-orders";
}

function orderOf(v: unknown): Dict {
  return asDict(asDict(v).order);
}

export async function cancelMarketplaceOrder(orderId: string, reason: string, url = ""): Promise<{ status: string; paymentStatus: string }> {
  const o = orderOf(
    await http(marketActionPath(url, `/marketplace/me/orders/${encodeURIComponent(orderId)}/cancel`, MARKET_ACTION_TAIL.cancel), {
      method: "POST",
      body: JSON.stringify({ reason: reason.trim() }),
    }),
  );
  return { status: asStr(o.status, "cancelled").toLowerCase(), paymentStatus: asStr(o.payment_status, "cancelled").toLowerCase() };
}

export type MarketCompletion = { status: string; via: "v2" | "legacy"; chatReadOnly: boolean | null; callsAllowed: boolean | null; ratingDeadlineAt: string };

export function isCompleteV2Missing(e: unknown): boolean {
  if (!(e instanceof ApiError) || e.code) return false;
  if (e.status === 405) return true;
  return e.status === 404 && (!e.detail || /^not found$/i.test(e.detail.trim()));
}

export async function completeMarketplaceOrder(orderId: string, input: { resultText: string; resultFiles: ResultFile[] }, url = ""): Promise<MarketCompletion> {
  const built = completeV2Path(orderId);
  const served = marketActionPath(url, built, MARKET_ACTION_TAIL.complete);
  const paths = served === built ? [built] : [served, built];
  const v2Input = { resultText: input.resultText, resultFiles: input.resultFiles.map((f) => ({ id: f.fileId, name: f.fileName })) };
  for (const path of paths) {
    try {
      const r = await completeOrderV2(orderId, v2Input, path);
      return { status: r.status || "completed", via: "v2", chatReadOnly: r.chatReadOnly, callsAllowed: r.callsAllowed, ratingDeadlineAt: r.ratingDeadlineAt };
    } catch (e) {
      if (!isCompleteV2Missing(e)) throw e;
    }
  }
  const o = orderOf(
    await http(`/marketplace/me/orders/${encodeURIComponent(orderId)}/complete`, {
      method: "POST",
      body: JSON.stringify({
        result_text: input.resultText.trim(),
        result_files: input.resultFiles.map((f) => ({ file_id: f.fileId, file_name: f.fileName, download_url: f.downloadUrl })),
      }),
    }),
  );
  return { status: asStr(o.status, "completed").toLowerCase(), via: "legacy", chatReadOnly: null, callsAllowed: null, ratingDeadlineAt: "" };
}

export async function rateMarketplaceOrder(order: Pick<MarketOrder, "id" | "ratingUrl">, input: { rating: number; comment: string }): Promise<void> {
  const path = order.ratingUrl.replace(/^https?:\/\/[^/]+/i, "") || `/marketplace/me/orders/${encodeURIComponent(order.id)}/rating`;
  await http(path, { method: "POST", body: JSON.stringify({ rating: input.rating, comment: input.comment.trim() }) });
}

export async function requestAdditionalPayment(orderId: string, input: { selectedOptionIds: string[]; note: string }): Promise<SupplementalPayment | null> {
  const d = asDict(
    await http(`/marketplace/me/orders/${encodeURIComponent(orderId)}/additional-payment-request`, {
      method: "POST",
      body: JSON.stringify({ selected_option_ids: input.selectedOptionIds, note: input.note.trim() }),
    }),
  );
  return normSupplemental(d.additional_payment_request ?? d.request ?? d.additional_payment ?? d);
}

export const MARKET_EVENT = "lexgo:marketplace";

export type MarketSignalKind = "paid" | "rejected" | "requested" | "supplemental" | "refund" | "completed" | "started" | "negotiation" | "checklist" | "review" | "rules" | "other";

export type MarketSignal = {
  kind: MarketSignalKind;
  sub?: string;
  orderId: string;
  workId: string;
  roomId: string;
  serviceTitle: string;
  event?: string;
  negotiationId?: string;
  reviewId?: string;
  ruleId?: string;
  deadlineAt?: string;
  outcome?: string;
  groupRoomId?: string;
  amount?: number;
};

const SUB_RE = /(requested|approved|rejected|escalated|expired|warning)$/;
function specialKind(name: string): Pick<MarketSignal, "kind" | "sub"> | null {
  if (/additional_payment/.test(name)) return { kind: "supplemental", sub: SUB_RE.exec(name)?.[1] ?? "" };
  if (/refund/.test(name)) return { kind: "refund", sub: SUB_RE.exec(name)?.[1] ?? "" };
  if (/order_completed|order_complete$|_completed$/.test(name)) return { kind: "completed", sub: "" };
  return null;
}

const RUNTIME_SIGNALS = new Map<string, Pick<MarketSignal, "kind" | "sub">>([
  ["rule_accepted", { kind: "rules", sub: "accepted" }],
  ["negotiation_created", { kind: "negotiation", sub: "created" }],
  ["negotiation_updated", { kind: "negotiation", sub: "updated" }],
  ["order_started", { kind: "started", sub: "" }],
  ["checklist_updated", { kind: "checklist", sub: "" }],
  ["cancellation_review_created", { kind: "review", sub: "created" }],
  ["cancellation_review_resolved", { kind: "review", sub: "resolved" }],
  ["order_completed", { kind: "completed", sub: "" }],
]);

export const MARKET_RUNTIME_EVENTS: readonly string[] = [...RUNTIME_SIGNALS.keys()].map((k) => `marketplace.${k}`);

const RUNTIME_FAMILIES: [string, MarketSignalKind][] = [
  ["cancellation_review", "review"],
  ["negotiation", "negotiation"],
];

function runtimeKind(tail: string): Pick<MarketSignal, "kind" | "sub"> | null {
  const hit = RUNTIME_SIGNALS.get(tail);
  if (hit) return hit;
  for (const [key, kind] of RUNTIME_FAMILIES) {
    const at = tail.indexOf(key);
    if (at >= 0) return { kind, sub: tail.slice(at + key.length).replace(/^_+/, "") };
  }
  return null;
}

const plainDict = (v: unknown): Dict => (v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {});

function signalSources(root: Dict): Dict[] {
  const data = plainDict(root.data);
  const out: Dict[] = [root];
  const add = (s: Dict) => {
    if (Object.keys(s).length && !out.includes(s)) out.push(s);
  };
  for (const s of [data, plainDict(root.payload), plainDict(data.payload), plainDict(data.data)]) add(s);
  for (const s of [...out]) for (const k of ["review", "cancellation_review", "negotiation"]) add(plainDict(s[k]));
  for (const s of [...out]) add(plainDict(s.resolution));
  return out;
}

function pickStr(srcs: Dict[], keys: string[]): string {
  for (const s of srcs) {
    for (const k of keys) {
      const v = s[k];
      if ((typeof v === "string" && v.trim()) || (typeof v === "number" && Number.isFinite(v))) return String(v).trim();
    }
  }
  return "";
}

function pickIn(srcs: Dict[], objKeys: string[], keys: string[]): string {
  for (const s of srcs) {
    for (const o of objKeys) {
      const v = pickStr([plainDict(s[o])], keys);
      if (v) return v;
    }
  }
  return "";
}

const orderShaped = (d: Dict) => !("order_id" in d) && "status" in d && ("work_id" in d || "service_id" in d || "lawyer_user_id" in d || "client_user_id" in d);

function runtimeSignal(spec: Pick<MarketSignal, "kind" | "sub">, root: Dict, event: string): MarketSignal {
  const srcs = signalSources(root);
  const inner = srcs.slice(1);
  const own = (test: (d: Dict) => boolean) => pickStr(inner.filter(test), ["id"]);
  const chatUrl = pickStr(srcs, ["chat_url"]) || pickIn(srcs, ["order"], ["chat_url"]);
  const amount = asNum(pickStr(srcs, ["amount", "counter_amount", "new_price"]), NaN);
  const negotiationState = spec.kind === "negotiation" ? pickStr(srcs, ["negotiation_status"]) || pickStr(inner, ["status"]) || pickStr([root], ["status"]) : "";
  const outcome = pickStr(srcs, ["action", "resolution", "outcome", "decision"]) || pickIn(srcs, ["resolution", "review", "negotiation"], ["action", "status"]) || negotiationState;
  const orderIsPayload = spec.kind === "started" || spec.kind === "completed";
  return {
    kind: spec.kind,
    sub: spec.sub,
    event,
    orderId: pickStr(srcs, ["order_id", "marketplace_order_id"]) || pickIn(srcs, ["order"], ["id"]) || (orderIsPayload ? own(orderShaped) : ""),
    workId: pickStr(srcs, ["work_id"]) || pickIn(srcs, ["purchase_request", "order"], ["work_id"]),
    roomId: pickStr(srcs, ["room_id", "secure_chat_room_id", "chat_room_id"]) || pickIn(srcs, ["chat", "order"], ["room_id", "secure_chat_room_id"]) || (ROOM_RE.exec(chatUrl)?.[1] ?? ""),
    serviceTitle: pickStr(srcs, ["service_title"]) || pickIn(srcs, ["order"], ["service_title"]),
    negotiationId: spec.kind === "negotiation" ? pickStr(srcs, ["negotiation_id"]) || pickIn(srcs, ["negotiation"], ["id"]) || own((d) => "order_id" in d && ("amount" in d || "expires_at" in d)) : "",
    reviewId: spec.kind === "review" ? pickStr(srcs, ["review_id", "cancellation_review_id"]) || pickIn(srcs, ["review", "cancellation_review"], ["id"]) || own((d) => "order_id" in d && ("reason" in d || "action" in d || "resolution" in d || "group_chat_room_id" in d)) : "",
    ruleId: spec.kind === "rules" ? pickStr(srcs, ["rule_id"]) || pickIn(srcs, ["rule"], ["id"]) || own((d) => "rule_key" in d || "version" in d) : "",
    deadlineAt: pickStr(srcs, ["expected_completed_at", "deadline_at"]) || pickIn(srcs, ["order"], ["expected_completed_at"]),
    outcome: outcome.toLowerCase(),
    groupRoomId: pickStr(srcs, ["group_chat_room_id", "group_room_id"]) || pickIn(srcs, ["group_chat"], ["room_id", "id"]) || pickIn(srcs, ["resolution", "review"], ["group_chat_room_id"]),
    amount: Number.isFinite(amount) ? amount : undefined,
  };
}

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
    const runtime = runtimeKind(name.slice("marketplace.".length));
    if (runtime) return runtimeSignal(runtime, ev, name);
    const special = specialKind(name);
    const kind = special ? special.kind : /paid|approved/.test(name) ? "paid" : /reject|cancel/.test(name) ? "rejected" : "other";
    const srcs = signalSources(ev);
    const chat = pickStr(srcs, ["chat_url"]) || pickIn(srcs, ["order"], ["chat_url"]);
    return {
      kind,
      sub: special?.sub,
      orderId: pickStr(srcs, ["order_id", "marketplace_order_id"]) || pickIn(srcs, ["order"], ["id"]),
      workId: pickStr(srcs, ["work_id"]) || pickIn(srcs, ["purchase_request", "order"], ["work_id"]),
      roomId: pickStr(srcs, ["room_id", "secure_chat_room_id", "chat_room_id"]) || pickIn(srcs, ["chat", "order"], ["room_id", "secure_chat_room_id"]) || (ROOM_RE.exec(chat)?.[1] ?? ""),
      serviceTitle: pickStr(srcs, ["service_title"]) || pickIn(srcs, ["order"], ["service_title"]),
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
  const runtime = runtimeKind(inner.slice("marketplace_".length));
  if (runtime) {
    const sig = runtimeSignal(runtime, data, inner);
    return sig.serviceTitle ? sig : { ...sig, serviceTitle: asStr(n.body) };
  }
  const special = specialKind(inner);
  if (special) return { ...special, orderId: asStr(data.order_id), workId: asStr(data.work_id), roomId: asStr(data.room_id), serviceTitle: asStr(data.service_title) || asStr(n.body) };
  const kind = inner === "marketplace_purchase_approved" || inner === "marketplace_order_paid" ? "paid" : inner === "marketplace_purchase_rejected" ? "rejected" : inner === "marketplace_purchase_requested" ? "requested" : "other";
  return { kind, orderId: asStr(data.order_id), workId: asStr(data.work_id), roomId: asStr(data.room_id), serviceTitle: asStr(data.service_title) || asStr(n.body) };
}

const PAYMENT_NOTICES = new Set(["order_payment_updated", "payment_paid"]);

export function marketPaymentSignalOf(ev: { event: string } & Record<string, unknown>): MarketSignal | null {
  const sig = marketSignalOf(ev);
  if (!sig || (!sig.orderId && !sig.workId && !sig.roomId)) return null;
  if (sig.kind === "paid") return sig;
  if (sig.kind !== "other" || ev.event !== "notification.created") return null;
  return PAYMENT_NOTICES.has(asStr(asDict(asDict(ev.notification).data).event)) ? sig : null;
}

export function isOrderPending(o: Pick<MarketOrder, "status" | "paymentStatus">): boolean {
  return o.status === "pending_payment" || o.status === "waiting_payment" || (o.status === "pending" && o.paymentStatus !== "paid");
}

export const MARKET_DONE = new Set(["completed", "rated", "done", "closed"]);
export const MARKET_STOPPED = new Set(["cancelled", "canceled", "declined", "rejected", "lost", "refunded", "refund_pending"]);

export type MarketPhase = "pending" | "paid" | "in_progress" | "review" | "completed" | "rated" | "cancelled";
export const MARKET_PHASES: readonly MarketPhase[] = ["pending", "paid", "in_progress", "review", "completed", "rated", "cancelled"];

export function marketPhaseOf(o: Pick<MarketOrder, "status" | "paymentStatus" | "startedAt" | "rating">): MarketPhase {
  if (MARKET_STOPPED.has(o.status)) return "cancelled";
  if (o.status === "rated" || (MARKET_DONE.has(o.status) && o.rating.value > 0)) return "rated";
  if (MARKET_DONE.has(o.status)) return "completed";
  if (o.status === "cancellation_review") return "review";
  if (o.status === "in_progress" || o.startedAt) return "in_progress";
  if (isOrderPending(o)) return "pending";
  return "paid";
}

export type MarketStage = "pending" | "active" | "completed" | "cancelled";

export function marketStageOf(o: Pick<MarketOrder, "status" | "paymentStatus"> & { workPaused?: boolean }): MarketStage {
  if (MARKET_STOPPED.has(o.status)) return "cancelled";
  if (MARKET_DONE.has(o.status)) return "completed";
  if (o.workPaused) return "active";
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
