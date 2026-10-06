import { http, asDict, asStr, asNum, asArr, ApiError, isOffline } from "@/lib/http";
import { uzs } from "@/lib/money";
import { normService, type BackendService } from "@/lib/services/backend";
import { listNotificationsRich } from "@/lib/services/notify";
import type { UserEvent } from "@/lib/userSocket";

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
  effectivePrice: number;
  experienceNote: string;
  visible: boolean;
  ownPromotion: ServicePromotion | null;
  profileBoost: ServicePromotion | null;
  limits: PriceBand | null;
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

export type PriceBand = { recommended: number; min: number; max: number };

export type AdPackage = { id: string; title: string; price: number; currency: string; days: number; reach: number };

export type PromotionRequest = { requestId: string; amount: number; currency: string; telegramSent: boolean };

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

function statusOf(v: unknown): ServiceStatus {
  const s = asStr(v).trim().toLowerCase();
  return s === "active" || s === "paused" ? s : "inactive";
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

function normLimits(v: unknown): PriceBand | null {
  const d = asDict(v);
  const max = uzs(d, "max_allowed", "recommended_price");
  const min = uzs(d, "min_allowed");
  if (!max || min > max) return null;
  return { recommended: uzs(d, "recommended_price", "max_allowed"), min, max };
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
    selectedPrice: uzs(d, "selected_price"),
    effectivePrice: uzs(d, "effective_price"),
    experienceNote: asStr(d.experience_note),
    visible: d.is_marketplace_visible === true,
    ownPromotion: promo && promo.serviceId === service.id ? promo : null,
    profileBoost: promo && !promo.serviceId ? promo : null,
    limits: normLimits(d.pricing_limits),
  };
}

function normSeller(v: unknown): ServiceSeller {
  const d = asDict(v);
  const name = asStr(d.name).trim() || [asStr(d.first_name), asStr(d.last_name)].filter(Boolean).join(" ");
  return { id: asStr(d.id), name, lexgoId: asStr(d.lexgo_id), role: asStr(d.role), accountStatus: asStr(d.account_status) };
}

function normProfile(v: unknown): ServiceSellerProfile {
  const d = asDict(v);
  return {
    userId: asStr(d.user_id),
    sellerType: asStr(d.seller_type),
    region: asStr(d.region),
    isVerified: d.is_verified === true,
    verificationStatus: asStr(d.verification_status),
    name: asStr(d.lawyer_name),
  };
}

const bodyOf = (i: ServiceInput) => ({
  selected_price: Math.max(0, Math.round(i.selectedPrice || 0)),
  experience_note: i.experienceNote.trim().slice(0, NOTE_MAX),
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

const PACKAGE_KEYS: [RegExp, "top" | "featured" | "regional"][] = [
  [/^top of search\b/i, "top"],
  [/^featured profile\b/i, "featured"],
  [/^regional boost\b/i, "regional"],
];

export function adPackageKey(title: string): "top" | "featured" | "regional" | "" {
  const t = title.trim();
  return PACKAGE_KEYS.find(([re]) => re.test(t))?.[1] ?? "";
}

const BAND_TTL = 10 * 60 * 1000;
const bandCache = new Map<string, { at: number; p: Promise<PriceBand | null> }>();

async function fetchPriceBand(serviceId: string, sellerId: string, region: string): Promise<PriceBand | null> {
  const qs = new URLSearchParams({ service_id: serviceId, apply_referral: "false", region });
  if (sellerId) qs.set("seller_user_id", sellerId);
  const total = uzs(asDict(await http(`/pricing/quote?${qs}`)), "total_amount");
  if (!total) return null;
  return { recommended: total, min: Math.floor((total * 70) / 100), max: total };
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

export function isLawyerSeller(sellerType: string, fallbackRole?: string): boolean {
  const t = sellerType.trim().toLowerCase();
  if (t) return t === "yurist" || t === "lawyer";
  return fallbackRole === "lawyer";
}

export function profileVerified(p: ServiceSellerProfile): boolean {
  return p.isVerified && VERIFIED.has(p.verificationStatus.toLowerCase());
}

export type HiddenReason = "catalogOff" | "paused" | "inactive" | "noPrice" | "unverified" | "other";

export function hiddenReasons(item: ManagedService, profile: ServiceSellerProfile): HiddenReason[] {
  if (item.visible) return [];
  const out: HiddenReason[] = [];
  if (!item.service.isActive) out.push("catalogOff");
  if (item.status === "paused") out.push("paused");
  if (item.status === "inactive") out.push("inactive");
  if (!item.effectivePrice) out.push("noPrice");
  if (!profileVerified(profile)) out.push("unverified");
  return out.length ? out : ["other"];
}

export type ServiceErrorKind =
  | "range"
  | "advocateOnly"
  | "pendingAccount"
  | "forbidden"
  | "notFound"
  | "inactivePromo"
  | "invalid"
  | "offline"
  | "unknown";

export type ServiceError = { kind: ServiceErrorKind; min: number; max: number; detail: string };

export function serviceErrorOf(e: unknown): ServiceError {
  const out = (kind: ServiceErrorKind, extra?: Partial<ServiceError>): ServiceError => ({ kind, min: 0, max: 0, detail: "", ...extra });
  if (!(e instanceof ApiError)) return out(isOffline(e) ? "offline" : "unknown");
  const detail = asDict(e.data.detail);
  const text = e.detail ?? "";
  if (e.status === 422) {
    if (detail.min_allowed != null && detail.max_allowed != null) {
      return out("range", { min: asNum(detail.min_allowed), max: asNum(detail.max_allowed) });
    }
    return out("invalid", { detail: text });
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

export type PromoOutcome = { key: string; kind: "approved" | "rejected" };

const INBOX_SCAN = 40;

function outcomeOf(event: string): PromoOutcome["kind"] | null {
  if (event === "promotion.checkout_approved") return "approved";
  if (event === "promotion.checkout_rejected") return "rejected";
  return null;
}

export async function settlePendingFromInbox(uid: string, inScope: (key: string) => boolean): Promise<PromoOutcome[]> {
  if (!uid) return [];
  const waiting = Object.entries(parsePendingPromos(pendingPromosRaw(uid))).some(([k, p]) => inScope(k) && p.requestId);
  if (!waiting) return [];
  const done = new Map<string, PromoOutcome["kind"]>();
  for (const n of await listNotificationsRich({ limit: INBOX_SCAN })) {
    const kind = outcomeOf(n.event);
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
  if (ev.event !== "notification.created") return null;
  const data = asDict(asDict(ev.notification).data);
  const name = asStr(data.event);
  if (!name.startsWith("promotion.checkout_")) return null;
  const kind = name.endsWith("approved") ? "approved" : name.endsWith("rejected") ? "rejected" : "pending";
  return { kind, requestId: asStr(data.request_id), serviceId: asStr(data.service_id) };
}
