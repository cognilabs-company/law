import { http, asDict, asStr, asNum, asArr, ApiError, contactBlockedOf, errDetail, isOffline } from "@/lib/http";
import { uzs, uzsOpt } from "@/lib/money";
import { firstFieldError } from "@/lib/formErrors";
import { normService, type BackendService } from "@/lib/services/backend";
import { getPublicPricingPolicy, readPriceModifiers, type PriceModifier } from "@/lib/services/marketplacePricing";
import { listNotificationsRich } from "@/lib/services/notify";
import type { UserEvent } from "@/lib/userSocket";
import { promotionCheckoutLapse } from "@/lib/services/promotions";
import { stripContacts } from "@/lib/contactGuard";

export const SERVICE_STATUSES = ["active", "paused", "inactive"] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export type ServiceScope = { kind: "me" } | { kind: "org"; orgId: string; memberId: string };

export type ServicePromotion = {
  id: string;
  serviceId: string;
  serviceTitle: string;
  packageId: string;
  packageTitle: string;
  daysLeft: number;
  endsAt: string;
};

export type ManagedService = {
  id: string;
  service: BackendService;
  capabilityId: string;
  status: ServiceStatus;
  selectedPrice: number;
  legacyPrice: number;
  negotiationAllowed: boolean | null;
  effectivePrice: number;
  priceCapped: boolean;
  experienceNote: string;
  visible: boolean;
  ownPromotion: ServicePromotion | null;
  profileBoost: ServicePromotion | null;
  limits: PriceBand | null;
  rulesPending?: boolean;
};

export type ServiceSeller = { id: string; name: string; lexgoId: string; role: string; accountStatus: string };

export type ServiceSellerProfile = {
  userId: string;
  sellerType: string;
  region: string;
  isVerified: boolean;
  verificationStatus: string;
  name: string;
};

export type ManagedServices = {
  seller: ServiceSeller;
  profile: ServiceSellerProfile;
  items: ManagedService[];
  organizationId: string;
};

export type ServiceInput = { serviceId: string; selectedPrice: number; experienceNote: string; status: ServiceStatus };

export type PriceBand = {
  recommended: number;
  min: number;
  max: number;
  base: number | null;
  currency: string;
  modifiers: PriceModifier[] | null;
};

export type AdPackage = { id: string; title: string; price: number; currency: string; days: number; reach: number };

// activated: the backend switched the promotion on at once (no payment step),
// so there is nothing to wait for.
export type PromotionRequest = { requestId: string; amount: number; currency: string; telegramSent: boolean; activated?: boolean };

export const NOTE_MAX = 2000;

const enc = encodeURIComponent;
const VERIFIED = new Set(["approved", "verified"]);
const ADVOCATE_ONLY_PREFIXES = ["criminal-", "administrative-"];

function scopeBase(scope: ServiceScope): string {
  return scope.kind === "org"
    ? `/organizations/${enc(scope.orgId)}/members/${enc(scope.memberId)}/services`
    : "/lawyers/me/services";
}

export function scopeKey(scope: ServiceScope): string {
  return scope.kind === "org" ? `org:${scope.orgId}:${scope.memberId}` : "me";
}

const RULES_PENDING_RE = /^(rules?_pending|pending_rules?|rules?_acceptance_required)$/;
const BELOW_MIN_CODE_RE = /^(seller_)?price_(below_min(imum)?|too_low|under_min(imum)?)$/;
const ABOVE_MAX_CODE_RE = /^(seller_)?price_(above_max(imum)?|too_high|over_max(imum)?|exceeds_max(imum)?)$/;

function statusOf(v: unknown): ServiceStatus {
  const s = asStr(v).trim().toLowerCase();
  if (RULES_PENDING_RE.test(s)) return "paused";
  return s === "active" || s === "paused" ? s : "inactive";
}

function rulesPendingOf(d: Record<string, unknown>): boolean {
  const rules = asStr(d.rules_status ?? d.rules_state).trim().toLowerCase();
  return d.rules_pending === true || d.rules_accepted === false || RULES_PENDING_RE.test(asStr(d.status).trim().toLowerCase()) || rules === "pending" || RULES_PENDING_RE.test(rules);
}

function normPromotion(v: unknown): ServicePromotion | null {
  const d = asDict(v);
  if (d.active !== true) return null;
  return {
    id: asStr(d.id),
    serviceId: asStr(d.service_id),
    serviceTitle: asStr(d.service_title),
    packageId: asStr(d.package_id),
    packageTitle: asStr(d.package_title),
    daysLeft: asNum(d.days_left),
    endsAt: asStr(d.ends_at),
  };
}

export function zeroBand(currency = "UZS"): PriceBand {
  return { recommended: 0, min: 0, max: 0, base: 0, currency, modifiers: null };
}

export function isZeroBand(band: PriceBand | null): boolean {
  return Boolean(band && band.max <= 0);
}

function normLimits(v: unknown, locale = "uz"): PriceBand | null {
  const d = asDict(v);
  const max = uzs(d, "max_allowed", "max_price", "recommended_price");
  const min = uzs(d, "min_allowed", "min_price");
  if (!max && ["max_allowed", "max_price", "recommended_price"].some((k) => k in d)) return zeroBand(asStr(d.currency) || "UZS");
  if (!max || min > max) return null;
  return {
    recommended: uzs(d, "recommended_price", "recommended", "max_allowed"),
    min,
    max,
    base: uzsOpt(d, "base_price", "base_amount") ?? null,
    currency: asStr(d.currency) || "UZS",
    modifiers: d.modifiers != null ? readPriceModifiers(d.modifiers, locale) : null,
  };
}

function normManaged(v: unknown, locale: string): ManagedService {
  const d = asDict(v);
  const service = normService(d, locale);
  const promo = normPromotion(d.promotion);
  return {
    id: service.id,
    service,
    capabilityId: asStr(d.capability_id),
    status: statusOf(d.status),
    selectedPrice: uzs(d, "configured_price") || uzs(d, "selected_price"),
    legacyPrice: uzs(d, "selected_price"),
    negotiationAllowed: typeof d.negotiation_allowed === "boolean" ? d.negotiation_allowed : null,
    effectivePrice: uzs(d, "effective_price"),
    priceCapped: d.price_capped === true,
    experienceNote: asStr(d.experience_note),
    visible: d.is_marketplace_visible === true || d.marketplace_visible === true || d.visible === true,
    ownPromotion: promo && promo.serviceId === service.id ? promo : null,
    profileBoost: promo && !promo.serviceId ? promo : null,
    limits: normLimits(d.pricing_limits, locale),
    rulesPending: rulesPendingOf(d),
  };
}

function normSeller(v: unknown): ServiceSeller {
  const d = asDict(v);
  const name = asStr(d.name).trim() || [asStr(d.first_name), asStr(d.last_name)].filter(Boolean).join(" ");
  return { id: asStr(d.id), name, lexgoId: asStr(d.lexgo_id), role: asStr(d.role), accountStatus: asStr(d.account_status) };
}

function normProfile(v: unknown): ServiceSellerProfile {
  const d = asDict(v);
  const badge = asDict(d.verification_badge);
  const verification = asDict(d.verification);
  const verificationStatus = asStr(d.verification_status ?? verification.status ?? badge.status ?? d.status).trim().toLowerCase();
  const statusVerified = verificationStatus === "approved" || verificationStatus === "verified";
  return {
    userId: asStr(d.user_id),
    sellerType: asStr(d.seller_type),
    region: asStr(d.region),
    // The public seller contract has used all three names across versions;
    // treat them consistently for the seller's own marketplace visibility.
    isVerified: d.is_verified === true || d.lexgo_verified === true || d.verified === true || badge.visible === true || statusVerified,
    verificationStatus,
    name: asStr(d.lawyer_name),
  };
}

const bodyOf = (i: ServiceInput) => ({
  selected_price: Math.max(0, Math.round(i.selectedPrice || 0)),
  // Contact details never leave the browser (lib/contactGuard).
  experience_note: stripContacts(i.experienceNote, true).text.slice(0, NOTE_MAX),
  status: i.status,
});

export async function listManagedServices(scope: ServiceScope, locale: string, signal?: AbortSignal): Promise<ManagedServices> {
  const d = asDict(await http(`${scopeBase(scope)}/manage?include_inactive=true`, { signal }));
  return {
    seller: normSeller(d.seller),
    profile: normProfile(d.profile),
    items: asArr(d.items).map((x) => normManaged(x, locale)).filter((x) => x.id),
    organizationId: asStr(d.organization_id),
  };
}

export async function addManagedService(scope: ServiceScope, input: ServiceInput, locale: string): Promise<ManagedService> {
  const d = await http(`${scopeBase(scope)}/manage`, {
    method: "POST",
    body: JSON.stringify({ service_id: input.serviceId, ...bodyOf(input) }),
  });
  return normManaged(d, locale);
}

export async function updateManagedService(scope: ServiceScope, input: ServiceInput, locale: string): Promise<ManagedService> {
  const d = await http(`${scopeBase(scope)}/${enc(input.serviceId)}`, { method: "PATCH", body: JSON.stringify(bodyOf(input)) });
  return normManaged(d, locale);
}

export async function setManagedServiceStatus(scope: ServiceScope, serviceId: string, status: ServiceStatus, locale: string): Promise<ManagedService> {
  const d = await http(`${scopeBase(scope)}/${enc(serviceId)}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
  return normManaged(d, locale);
}

export async function removeManagedService(scope: ServiceScope, serviceId: string): Promise<void> {
  await http(`${scopeBase(scope)}/${enc(serviceId)}`, { method: "DELETE" });
}

export async function promoteManagedService(scope: ServiceScope, serviceId: string, pkg: AdPackage): Promise<PromotionRequest> {
  const d = asDict(
    await http(`${scopeBase(scope)}/${enc(serviceId)}/promotion-checkout`, {
      method: "POST",
      body: JSON.stringify({ package_id: pkg.id, days: pkg.days, provider: "telegram_manual" }),
    }),
  );
  const gate = asDict(d.payment_gate);
  return {
    requestId: asStr(d.checkout_request_id) || asStr(gate.id),
    amount: uzs(gate, "amount") || pkg.price,
    currency: asStr(gate.currency) || pkg.currency || "UZS",
    telegramSent: gate.telegram_sent === true,
  };
}

export async function listAdPackages(signal?: AbortSignal): Promise<AdPackage[]> {
  const raw = await http("/ads/products?status=active", { signal });
  const rows = Array.isArray(raw) ? raw : asArr(asDict(raw).items);
  return rows
    .map((v) => asDict(v))
    .filter((d) => asStr(d.id) && (!asStr(d.status) || asStr(d.status) === "active"))
    .map((d) => {
      const p = asDict(d.payload);
      return {
        id: asStr(d.id),
        title: asStr(d.title),
        price: uzs(d, "price"),
        currency: asStr(d.currency) || "UZS",
        days: Math.max(1, Math.round(asNum(p.days, 7))),
        reach: asNum(p.reach),
      };
    })
    .sort((a, b) => a.price - b.price || a.days - b.days);
}

export type AdPackageKey = "top" | "featured" | "regional" | "profile" | "service" | "banner";
const PACKAGE_KEYS: [RegExp, AdPackageKey][] = [
  [/^top of search\b/i, "top"],
  [/^featured profile\b/i, "featured"],
  [/^regional boost\b/i, "regional"],
  [/^profile (boost|top)\b/i, "profile"],
  [/^service (top|boost)\b/i, "service"],
  [/^(marketplace )?banner\b/i, "banner"],
];
const PLACEMENT_PACKAGE_KEY: Record<string, AdPackageKey> = { profile_boost: "profile", service_boost: "service", banner: "banner" };

export function adPackageKey(title: string, placement = ""): AdPackageKey | "" {
  const t = title.trim();
  return PACKAGE_KEYS.find(([re]) => re.test(t))?.[1] ?? PLACEMENT_PACKAGE_KEY[placement] ?? "";
}

const BAND_TTL = 10 * 60 * 1000;
const bandCache = new Map<string, { at: number; p: Promise<PriceBand | null> }>();

async function fetchPriceBand(serviceId: string, sellerId: string, region: string): Promise<PriceBand | null> {
  const qs = new URLSearchParams({ service_id: serviceId, apply_referral: "false", region });
  if (sellerId) qs.set("seller_user_id", sellerId);
  const [raw, policy] = await Promise.all([http(`/pricing/quote?${qs}`), getPublicPricingPolicy().catch(() => null)]);
  const q = asDict(raw);
  const total = uzs(q, "total_amount");
  if (!total) return zeroBand(asStr(q.currency) || "UZS");
  // Backend limits are authoritative; the public policy is only a compatibility fallback.
  const limits = asDict(q.pricing_limits);
  const recommended = uzsOpt(limits, "recommended_price", "recommended", "max_allowed")
    ?? uzsOpt(q, "recommended_price", "recommended")
    ?? total;
  const backendMin = uzsOpt(limits, "min_allowed", "min_price") ?? uzsOpt(q, "min_allowed", "min_price");
  const backendMax = uzsOpt(limits, "max_allowed", "max_price");
  const custom = policy && policy.minPercent > 0 && policy.minPercent <= policy.maxPercent;
  const lo = custom ? policy.minPercent : 70;
  const hi = custom ? policy.maxPercent : 100;
  return {
    recommended,
    min: backendMin ?? Math.floor((total * lo) / 100),
    max: backendMax ?? Math.floor((total * hi) / 100),
    base: uzsOpt(limits, "base_price", "base_amount") ?? uzsOpt(q, "base_amount", "base_price") ?? null,
    currency: asStr(limits.currency) || asStr(q.currency) || "UZS",
    modifiers: Array.isArray(limits.modifiers)
      ? readPriceModifiers(limits.modifiers)
      : Array.isArray(q.modifiers)
        ? readPriceModifiers(q.modifiers)
        : null,
  };
}

export function priceBandFor(serviceId: string, sellerId: string, region: string): Promise<PriceBand | null> {
  const key = `${serviceId}|${sellerId}|${region}`;
  const hit = bandCache.get(key);
  if (hit && Date.now() - hit.at < BAND_TTL) return hit.p;
  const p = fetchPriceBand(serviceId, sellerId, region).catch((e: unknown) => {
    bandCache.delete(key);
    throw e;
  });
  bandCache.set(key, { at: Date.now(), p });
  return p;
}

export function isAdvocateOnly(s: Pick<BackendService, "advokatRequired" | "slug" | "catalogCode">): boolean {
  if (s.advokatRequired) return true;
  return [s.slug, s.catalogCode ?? ""].some((k) => ADVOCATE_ONLY_PREFIXES.some((p) => k.toLowerCase().startsWith(p)));
}

export type CatalogCrumb = { id: string; title: string };
export type CatalogCategory = {
  id: string;
  title: string;
  parentId: string;
  crumbs: CatalogCrumb[];
  directCount: number;
  count: number;
  directSelected: number;
  selected: number;
  children: CatalogCategory[];
};
export type CatalogTree = { items: CatalogCategory[]; count: number };
export type PriceExplanationFactor = { key: string; label: string; effect: string };
export type PriceExplanation = { text: string; lines: string[]; factors: PriceExplanationFactor[] };
export type CatalogPricing = { recommended: number; minimum: number; maximum: number; discountPercent: number | null; explanation: PriceExplanation | null };
export type CatalogItem = {
  service: BackendService;
  selected: boolean;
  status: string;
  selectedPrice: number;
  selectable: boolean;
  lockReason: string;
  pricing: CatalogPricing | null;
};
export type CatalogPage = { items: CatalogItem[]; total: number | null; hasMore: boolean; offset: number };
export type CatalogQuery = { categoryId?: string; q?: string; offset?: number; limit?: number };

const CATALOG_PATH = "/lawyers/me/services/catalog";
export const CATALOG_PAGE = 30;

const textOf = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");

function catalogQs(scope: ServiceScope, qs = new URLSearchParams()): URLSearchParams {
  if (scope.kind === "org") {
    qs.set("target_user_id", scope.memberId);
    qs.set("organization_id", scope.orgId);
  }
  return qs;
}

function normCrumb(v: unknown): CatalogCrumb {
  if (typeof v === "string") return { id: "", title: v.trim() };
  const d = asDict(v);
  return { id: textOf(d.id ?? d.value), title: textOf(d.title ?? d.label ?? d.name) };
}

export function normCatalogCategory(v: unknown): CatalogCategory {
  const d = asDict(v);
  const direct = asNum(d.direct_services_count);
  const directSelected = asNum(d.direct_selected_count);
  return {
    id: textOf(d.id ?? d.value),
    title: textOf(d.title ?? d.label ?? d.name) || textOf(d.slug),
    parentId: textOf(d.parent_id),
    crumbs: asArr(d.breadcrumbs).map(normCrumb).filter((c) => c.title),
    directCount: direct,
    count: asNum(d.services_count, direct),
    directSelected,
    selected: asNum(d.selected_count, directSelected),
    children: asArr(d.children).map(normCatalogCategory).filter((c) => c.id),
  };
}

export async function getSellerCatalogTree(scope: ServiceScope, signal?: AbortSignal): Promise<CatalogTree> {
  const qs = catalogQs(scope).toString();
  const raw = await http(`${CATALOG_PATH}/categories${qs ? `?${qs}` : ""}`, { signal });
  const d = asDict(raw);
  const items = (Array.isArray(raw) ? raw : asArr(d.items ?? d.categories)).map(normCatalogCategory).filter((c) => c.id);
  return { items, count: asNum(d.count, items.length) };
}

function factorOf(v: unknown): PriceExplanationFactor {
  const d = asDict(v);
  return { key: textOf(d.key ?? d.code), label: textOf(d.label ?? d.title ?? d.name), effect: textOf(d.effect ?? d.value ?? d.delta) };
}

export function priceExplanationOf(v: unknown): PriceExplanation | null {
  let text = "";
  let lines: string[] = [];
  let factors: PriceExplanationFactor[] = [];
  let neutralOnly = false;
  if (typeof v === "string") text = v.trim();
  else if (Array.isArray(v)) {
    for (const x of v) {
      if (typeof x === "string" || typeof x === "number") {
        lines.push(String(x).trim());
        continue;
      }
      const f = factorOf(x);
      // A factor that changes nothing (a ×1 region, no amount) explains nothing.
      const neutral = Number(asDict(x).amount ?? 0) === 0 && (f.effect === "1" || f.effect === "1.0" || f.effect === "0");
      if (neutral) {
        neutralOnly = true;
        continue;
      }
      if (f.label && f.effect) factors.push(f);
      else lines.push(textOf(asDict(x).text ?? asDict(x).message) || f.label);
    }
  } else {
    const d = asDict(v);
    text = textOf(d.text ?? d.message ?? d.summary ?? d.explanation);
    lines = asArr(d.lines ?? d.items ?? d.breakdown).map((x) => textOf(x) || textOf(asDict(x).text ?? asDict(x).label));
    factors = asArr(d.factors).map(factorOf).filter((f) => f.label);
  }
  lines = lines.filter(Boolean);
  // Only neutral factors: an explanation that says nothing, so no other
  // reading of the same field puts the raw label back.
  if (!text && !lines.length && !factors.length) return neutralOnly ? { text: "", lines: [], factors: [] } : null;
  return { text, lines, factors };
}

export function catalogPricingOf(v: unknown): CatalogPricing | null {
  const d = asDict(v);
  if (!Object.keys(d).length || Array.isArray(v)) return null;
  const pct = d.maximum_listing_discount_percent;
  const discount = typeof pct === "number" || (typeof pct === "string" && pct.trim()) ? Number(pct) : NaN;
  return {
    recommended: Math.max(0, uzs(d, "recommended_price")),
    minimum: Math.max(0, uzs(d, "minimum_listing_price")),
    maximum: Math.max(0, uzs(d, "maximum_price")),
    discountPercent: Number.isFinite(discount) && discount >= 0 && discount <= 100 ? discount : null,
    explanation: priceExplanationOf(d.price_explanation),
  };
}

export function normCatalogItem(v: unknown, locale = "uz"): CatalogItem {
  const d = asDict(v);
  const inner = asDict(d.service);
  const nested = Object.keys(inner).length > 0 && !Array.isArray(d.service);
  const service = normService(nested ? { ...d, ...inner } : d, locale);
  const id = (nested ? textOf(inner.id) : "") || textOf(d.service_id) || service.id;
  const lock = d.lock_reason;
  const lockText = typeof lock === "string" ? lock.trim() : textOf(asDict(lock).message ?? asDict(lock).text ?? asDict(lock).title);
  return {
    service: { ...service, id },
    selected: d.selected === true,
    status: textOf(d.selection_status).toLowerCase(),
    selectedPrice: uzs(d, "selected_price"),
    selectable: d.selectable !== false,
    lockReason: lockText,
    pricing: catalogPricingOf(d.pricing_limits),
  };
}

export async function getSellerCatalogPage(scope: ServiceScope, query: CatalogQuery, locale: string, signal?: AbortSignal): Promise<CatalogPage> {
  const limit = Math.min(100, Math.max(1, query.limit ?? CATALOG_PAGE));
  const offset = Math.max(0, query.offset ?? 0);
  const qs = new URLSearchParams();
  if (query.categoryId) {
    qs.set("category_id", query.categoryId);
    qs.set("include_descendants", "true");
  }
  const q = (query.q ?? "").trim().slice(0, 120);
  if (q) qs.set("q", q);
  qs.set("limit", String(limit));
  qs.set("offset", String(offset));
  catalogQs(scope, qs);
  const raw = await http(`${CATALOG_PATH}?${qs}`, { signal });
  const d = asDict(raw);
  const rows = Array.isArray(raw) ? raw : asArr(d.items ?? d.services ?? d.data);
  const items = rows.map((x) => normCatalogItem(x, locale)).filter((x) => x.service.id);
  const totalRaw = d.total ?? d.total_count;
  const total = typeof totalRaw === "number" || (typeof totalRaw === "string" && totalRaw.trim()) ? asNum(totalRaw) : null;
  const count = asNum(d.count, -1);
  const hasMore =
    typeof d.has_more === "boolean"
      ? d.has_more
      : total !== null
        ? offset + rows.length < total
        : count > offset + rows.length || rows.length >= limit;
  return { items, total: total ?? (count > rows.length ? count : null), hasMore, offset };
}

export function isLawyerSeller(sellerType: string, fallbackRole?: string): boolean {
  const t = sellerType.trim().toLowerCase();
  if (t) return t === "yurist" || t === "lawyer";
  return fallbackRole === "lawyer";
}

export function profileVerified(p: ServiceSellerProfile): boolean {
  return p.isVerified && VERIFIED.has(p.verificationStatus.toLowerCase());
}

export type HiddenReason = "catalogOff" | "rulesPending" | "paused" | "inactive" | "noPrice" | "unverified" | "other";

export function hiddenReasons(item: ManagedService, profile: ServiceSellerProfile): HiddenReason[] {
  if (item.visible) return [];
  const out: HiddenReason[] = [];
  if (!item.service.isActive) out.push("catalogOff");
  if (item.rulesPending) out.push("rulesPending");
  else if (item.status === "paused") out.push("paused");
  if (item.status === "inactive") out.push("inactive");
  if (!item.effectivePrice) out.push("noPrice");
  if (!profileVerified(profile)) out.push("unverified");
  return out.length ? out : ["other"];
}

export type ServiceErrorKind =
  | "range"
  | "belowMin"
  | "aboveMax"
  | "noPrice"
  | "advocateOnly"
  | "pendingAccount"
  | "forbidden"
  | "notFound"
  | "inactivePromo"
  | "invalid"
  | "contact"
  | "offline"
  | "unknown";

export type ServiceError = { kind: ServiceErrorKind; min: number; max: number; detail: string; limits: PriceBand | null };

export function serviceErrorOf(e: unknown, locale = "uz"): ServiceError {
  const out = (kind: ServiceErrorKind, extra?: Partial<ServiceError>): ServiceError => ({ kind, min: 0, max: 0, detail: "", limits: null, ...extra });
  if (!(e instanceof ApiError)) return out(isOffline(e) ? "offline" : "unknown");
  const detail = asDict(e.data.detail);
  const text = errDetail(e);
  const code = (e.code || asStr(detail.code) || asStr(e.data.code)).trim().toLowerCase();
  if (BELOW_MIN_CODE_RE.test(code)) {
    const ctx = { ...asDict(e.data.context), ...asDict(detail.context) };
    const min = uzs(detail, "minimum_listing_price", "minimum_price", "min_price") || uzs(ctx, "minimum_listing_price", "minimum_price");
    return out("belowMin", { min, detail: text });
  }
  if (ABOVE_MAX_CODE_RE.test(code)) {
    const ctx = { ...asDict(e.data.context), ...asDict(detail.context) };
    const max = uzs(detail, "maximum_price", "max_price", "max_allowed") || uzs(ctx, "maximum_price", "max_price");
    return out("aboveMax", { max, detail: text });
  }
  // Contact details in the experience note (platform_contact_blocked, or
  // any refusal code about contacts): shown under the note, not as a toast.
  const blocked = contactBlockedOf(e);
  if (blocked || /contact/.test(code)) return out("contact", { detail: blocked?.message || text });
  if (e.status === 422) {
    const limits = normLimits(detail.pricing_limits ?? detail.limits ?? asDict(e.data).pricing_limits ?? detail, locale);
    if (limits) return out(isZeroBand(limits) ? "noPrice" : "range", { min: limits.min, max: limits.max, limits });
    return out("invalid", { detail: text || firstFieldError(e) });
  }
  if (e.status === 400 && Array.isArray(detail.advokat_only_services)) return out("advocateOnly");
  if (e.status === 403) return out(detail.account_status ? "pendingAccount" : "forbidden", { detail: text });
  if (e.status === 404) return out("notFound", { detail: text });
  if (e.status === 409) return out("inactivePromo", { detail: text });
  if (isOffline(e)) return out("offline");
  return out("unknown", { detail: text });
}

export type PendingPromo = { requestId: string; packageTitle: string; amount: number; currency: string; telegramSent: boolean; at: number };

const PENDING_TTL = 72 * 3600 * 1000;
const PENDING_EVENT = "lexgo:promo-pending";
const pendingStoreKey = (uid: string) => `lexgo_promo_pending_${uid}`;

export const pendingPromoKey = (scope: ServiceScope | "profile", serviceId = "") =>
  scope === "profile" ? "profile" : `${scopeKey(scope)}|${serviceId}`;

export function pendingPromosRaw(uid: string): string {
  if (!uid) return "";
  try {
    return localStorage.getItem(pendingStoreKey(uid)) || "";
  } catch {
    return "";
  }
}

export function parsePendingPromos(raw: string): Record<string, PendingPromo> {
  if (!raw) return {};
  try {
    const out: Record<string, PendingPromo> = {};
    for (const [k, v] of Object.entries(asDict(JSON.parse(raw)))) {
      const d = asDict(v);
      const at = asNum(d.at);
      if (!at) continue;
      out[k] = {
        requestId: asStr(d.requestId),
        packageTitle: asStr(d.packageTitle),
        amount: asNum(d.amount),
        currency: asStr(d.currency) || "UZS",
        telegramSent: d.telegramSent === true,
        at,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function freshPendingPromos(uid: string): Record<string, PendingPromo> {
  const now = Date.now();
  return Object.fromEntries(Object.entries(parsePendingPromos(pendingPromosRaw(uid))).filter(([, p]) => now - p.at <= PENDING_TTL));
}

function writePendingPromos(uid: string, next: Record<string, PendingPromo>): void {
  try {
    if (Object.keys(next).length) localStorage.setItem(pendingStoreKey(uid), JSON.stringify(next));
    else localStorage.removeItem(pendingStoreKey(uid));
  } catch {
    return;
  }
  try {
    window.dispatchEvent(new CustomEvent(PENDING_EVENT));
  } catch {
    return;
  }
}

export function savePendingPromo(uid: string, key: string, p: Omit<PendingPromo, "at">): void {
  if (!uid) return;
  writePendingPromos(uid, { ...freshPendingPromos(uid), [key]: { ...p, at: Date.now() } });
}

export function dropPendingPromos(uid: string, match: (key: string, p: PendingPromo) => boolean): [string, PendingPromo][] {
  if (!uid) return [];
  const all = Object.entries(parsePendingPromos(pendingPromosRaw(uid)));
  const now = Date.now();
  const keep: Record<string, PendingPromo> = {};
  const dropped: [string, PendingPromo][] = [];
  for (const [k, p] of all) {
    if (now - p.at > PENDING_TTL) continue;
    if (match(k, p)) dropped.push([k, p]);
    else keep[k] = p;
  }
  if (Object.keys(keep).length !== all.length) writePendingPromos(uid, keep);
  return dropped;
}

export function prunePendingPromos(uid: string): void {
  dropPendingPromos(uid, () => false);
}

export type PromoOutcome = { key: string; kind: "approved" | "rejected" | "lapsed" };

const INBOX_SCAN = 40;

function outcomeOf(event: string): PromoOutcome["kind"] | null {
  if (event === "promotion.checkout_approved") return "approved";
  if (event === "promotion.checkout_rejected") return "rejected";
  if (event === "promotion.checkout_cancelled") return "rejected";
  return null;
}

export async function settlePendingFromInbox(uid: string, inScope: (key: string) => boolean): Promise<PromoOutcome[]> {
  if (!uid) return [];
  const waiting = Object.entries(parsePendingPromos(pendingPromosRaw(uid))).some(([k, p]) => inScope(k) && p.requestId);
  if (!waiting) return [];
  const done = new Map<string, PromoOutcome["kind"]>();
  for (const n of await listNotificationsRich({ limit: INBOX_SCAN })) {
    const kind = promotionCheckoutLapse({ event: n.event, data: n.data } as UserEvent) ? "lapsed" : outcomeOf(n.event);
    const id = asStr(n.data.request_id);
    if (kind && id && !done.has(id)) done.set(id, kind);
  }
  if (!done.size) return [];
  return dropPendingPromos(uid, (k, p) => inScope(k) && done.has(p.requestId)).map(([key, p]) => ({ key, kind: done.get(p.requestId) ?? "approved" }));
}

export function subscribePendingPromos(fn: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key.startsWith("lexgo_promo_pending_")) fn();
  };
  window.addEventListener(PENDING_EVENT, fn);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PENDING_EVENT, fn);
    window.removeEventListener("storage", onStorage);
  };
}

export type PromoSignal = { kind: "approved" | "rejected" | "pending"; requestId: string; serviceId: string };

export function promoSignalOf(ev: UserEvent): PromoSignal | null {
  if (ev.event.startsWith("promotion.checkout_")) {
    const d = asDict(ev.data ?? ev.payload ?? ev);
    const kind = ev.event.endsWith("approved") ? "approved" : ev.event.endsWith("rejected") ? "rejected" : "pending";
    return { kind, requestId: asStr(d.request_id ?? d.checkout_request_id ?? ev.request_id), serviceId: asStr(d.service_id ?? ev.service_id) };
  }
  if (ev.event !== "notification.created") return null;
  const data = asDict(asDict(ev.notification).data);
  const name = asStr(data.event);
  if (!name.startsWith("promotion.checkout_")) return null;
  const kind = name.endsWith("approved") ? "approved" : name.endsWith("rejected") ? "rejected" : "pending";
  return { kind, requestId: asStr(data.request_id), serviceId: asStr(data.service_id) };
}
