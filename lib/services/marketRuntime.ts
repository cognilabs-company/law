import { ApiError, asArr, asNum, asStr, http, type Dict } from "@/lib/http";
import { uzs } from "@/lib/money";

const dictOf = (v: unknown): Dict => (v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {});
const enc = encodeURIComponent;
const trimmed = (v: unknown): string => asStr(v).trim();
const boolOrNull = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};
const firstArr = (...vals: unknown[]): unknown[] => {
  for (const v of vals) if (Array.isArray(v)) return v;
  return [];
};

function untilAborted<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(new ApiError(0, "aborted"));
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(new ApiError(0, "aborted"));
    signal.addEventListener("abort", stop, { once: true });
    p.then(
      (value) => {
        signal.removeEventListener("abort", stop);
        resolve(value);
      },
      (e: unknown) => {
        signal.removeEventListener("abort", stop);
        reject(e);
      },
    );
  });
}

export const RUNTIME_PLACEMENTS = ["marketplace", "service_detail", "checkout", "negotiation", "post_payment_order", "in_progress", "second_opinion", "support"] as const;
export type RuntimePlacement = (typeof RUNTIME_PLACEMENTS)[number];

export function isRuntimePlacement(v: unknown): v is RuntimePlacement {
  return typeof v === "string" && (RUNTIME_PLACEMENTS as readonly string[]).includes(v);
}

export type CalendarKind = "calendar" | "business";

export function calendarKindOf(v: unknown): CalendarKind {
  const s = trimmed(v).toLowerCase();
  return /^(business|work|working)([_\s-]?days?)?$/.test(s) ? "business" : "calendar";
}

export type RuntimeDuration = { value: number; unit: string; calendar: CalendarKind; calendarRaw: string; startsOn: string };

function unitOf(v: unknown): string {
  const s = trimmed(v).toLowerCase();
  if (!s) return "";
  if (/^min/.test(s)) return "minute";
  if (/^(h|hour|soat)/.test(s)) return "hour";
  if (/^(d|day|kun)/.test(s)) return "day";
  if (/^w/.test(s)) return "week";
  if (/^mon/.test(s)) return "month";
  return s;
}

export function normDuration(v: unknown): RuntimeDuration {
  const d = dictOf(v);
  const calendarRaw = trimmed(d.calendar ?? d.calendar_type ?? d.duration_calendar);
  return {
    value: asNum(d.value ?? d.amount ?? d.duration_value),
    unit: unitOf(d.unit ?? d.duration_unit),
    calendar: calendarKindOf(calendarRaw),
    calendarRaw,
    startsOn: trimmed(d.starts_on ?? d.start_on),
  };
}

export const TEMPLATE_MODES = ["required", "optional", "not_required"] as const;
export type RuntimeTemplate = { mode: string; source: string; documentTemplateId: string };

function normTemplate(v: unknown): RuntimeTemplate {
  const d = dictOf(v);
  return { mode: trimmed(d.mode ?? d.template_mode).toLowerCase(), source: trimmed(d.source ?? d.template_source).toLowerCase(), documentTemplateId: trimmed(d.document_template_id ?? d.template_id) };
}

export type RuntimeFactor = { id: string; title: string; description: string; adjustmentType: "fixed" | "percent"; value: number; raw: Dict };

function normFactor(v: unknown): RuntimeFactor {
  const d = dictOf(v);
  const type = trimmed(d.adjustment_type ?? d.type).toLowerCase();
  return {
    id: trimmed(d.id ?? d.factor_id ?? d.key),
    title: trimmed(d.title ?? d.label ?? d.name),
    description: trimmed(d.description),
    adjustmentType: /percent|%/.test(type) ? "percent" : "fixed",
    value: asNum(d.value ?? d.amount),
    raw: d,
  };
}

export type RuntimePricing = { recommendedPrice: number; maximumPrice: number; currency: string; sellerCanPriceBelowRecommended: boolean; factors: RuntimeFactor[]; formula: string };

function normPricing(v: unknown): RuntimePricing {
  const d = dictOf(v);
  const below = d.seller_can_price_below_recommended;
  return {
    recommendedPrice: uzs(d, "recommended_price", "base_price"),
    maximumPrice: uzs(d, "maximum_price", "max_price"),
    currency: trimmed(d.currency) || "UZS",
    sellerCanPriceBelowRecommended: typeof below === "boolean" ? below : true,
    factors: asArr(d.factors).map(normFactor).filter((f) => f.id || f.title),
    formula: trimmed(d.formula),
  };
}

export function priceCapOf(p: Pick<RuntimePricing, "maximumPrice">): number | null {
  return p.maximumPrice > 0 ? p.maximumPrice : null;
}

export type ServiceRule = { id: string; ruleKey: string; title: string; version: string; body: string; scopeType: string; scopeId: string; effectiveAt: string; accepted: boolean; acceptedAt: string; raw: Dict };

export function normServiceRule(v: unknown): ServiceRule {
  const d = dictOf(v);
  const acceptedAt = trimmed(d.accepted_at);
  return {
    id: trimmed(d.id ?? d.rule_id),
    ruleKey: trimmed(d.rule_key ?? d.key),
    title: trimmed(d.title ?? d.name),
    version: trimmed(d.version ?? d.rule_version),
    body: asStr(d.body ?? d.content ?? d.text ?? d.description),
    scopeType: trimmed(d.scope_type ?? d.scope).toLowerCase(),
    scopeId: trimmed(d.scope_id),
    effectiveAt: trimmed(d.effective_at ?? d.effective_from),
    accepted: typeof d.accepted === "boolean" ? d.accepted : !!acceptedAt,
    acceptedAt,
    raw: d,
  };
}

export type RuntimeGuarantee = { id: string; title: string; description: string; icon: string; refundPolicyId: string; conditions: Dict; raw: Dict };

function normGuarantee(v: unknown): RuntimeGuarantee {
  const d = dictOf(v);
  return {
    id: trimmed(d.id ?? d.guarantee_id ?? d.key),
    title: trimmed(d.title ?? d.label ?? d.name),
    description: trimmed(d.description ?? d.text),
    icon: trimmed(d.icon),
    refundPolicyId: trimmed(d.refund_policy_id),
    conditions: dictOf(d.conditions),
    raw: d,
  };
}

export type MinimumRequirements = { verified: boolean | null; minimumExperienceYears: number; minimumRating: number; empty: boolean; raw: Dict };

function normRequirements(v: unknown): MinimumRequirements {
  const d = dictOf(v);
  return {
    verified: boolOrNull(d.verified ?? d.verified_required ?? d.requires_verification),
    minimumExperienceYears: asNum(d.minimum_experience_years ?? d.min_experience_years ?? d.experience_years),
    minimumRating: asNum(d.minimum_rating ?? d.min_rating),
    empty: Object.keys(d).length === 0,
    raw: d,
  };
}

export type MarketFileRef = { id: string; name: string; url: string };

function normFileRef(v: unknown): MarketFileRef {
  if (typeof v === "string") return { id: v.trim(), name: "", url: "" };
  const d = dictOf(v);
  return { id: trimmed(d.id ?? d.file_id), name: trimmed(d.name ?? d.file_name ?? d.filename), url: trimmed(d.download_url ?? d.url) };
}

export const CHECKLIST_STATUSES = ["pending", "done", "skipped_with_reason"] as const;
export type ChecklistStatus = (typeof CHECKLIST_STATUSES)[number];

export function checklistStatusOf(v: unknown): ChecklistStatus {
  const s = trimmed(v).toLowerCase();
  if (/^(done|completed?|finished)$/.test(s)) return "done";
  if (/^skip/.test(s)) return "skipped_with_reason";
  return "pending";
}

export type ChecklistItem = {
  id: string;
  title: string;
  description: string;
  status: ChecklistStatus;
  statusRaw: string;
  required: boolean;
  commentRequired: boolean;
  fileRequired: boolean;
  comment: string;
  files: MarketFileRef[];
  sortOrder: number;
  updatedAt: string;
  raw: Dict;
};

export function normChecklistItem(v: unknown): ChecklistItem {
  const d = dictOf(v);
  const statusRaw = trimmed(d.status);
  return {
    id: trimmed(d.id ?? d.item_id ?? d.checklist_item_id),
    title: trimmed(d.title ?? d.name ?? d.label ?? d.text),
    description: trimmed(d.description ?? d.hint),
    status: checklistStatusOf(statusRaw),
    statusRaw,
    required: d.required === true || d.is_required === true,
    commentRequired: d.comment_required === true,
    fileRequired: d.file_required === true,
    comment: asStr(d.comment ?? d.reason ?? d.note),
    files: asArr(d.files ?? d.attachments).map(normFileRef).filter((f) => f.id || f.url),
    sortOrder: asNum(d.sort_order ?? d.position),
    updatedAt: trimmed(d.updated_at ?? d.completed_at),
    raw: d,
  };
}

export type RuntimeConfig = {
  serviceId: string;
  placement: RuntimePlacement;
  duration: RuntimeDuration;
  template: RuntimeTemplate;
  pricing: RuntimePricing;
  negotiationAvailable: boolean;
  minimumRequirements: MinimumRequirements;
  rules: ServiceRule[];
  guarantees: RuntimeGuarantee[];
  checklistPreview: ChecklistItem[];
  raw: Dict;
};

export function normRuntimeConfig(v: unknown, placement: RuntimePlacement = "service_detail"): RuntimeConfig {
  const d = dictOf(v);
  return {
    serviceId: trimmed(d.service_id ?? d.id),
    placement: isRuntimePlacement(d.placement) ? d.placement : placement,
    duration: normDuration(d.duration),
    template: normTemplate(d.template),
    pricing: normPricing(d.pricing),
    negotiationAvailable: d.negotiation_available === true,
    minimumRequirements: normRequirements(d.minimum_requirements),
    rules: asArr(d.rules).map(normServiceRule).filter((r) => r.id || r.title),
    guarantees: asArr(d.guarantees).map(normGuarantee).filter((g) => g.id || g.title),
    checklistPreview: asArr(d.checklist_preview).map(normChecklistItem).filter((i) => i.id || i.title),
    raw: d,
  };
}

const RUNTIME_TTL_MS = 5 * 60 * 1000;
const runtimeCache = new Map<string, { at: number; value: Promise<RuntimeConfig> }>();

export function invalidateRuntimeConfig(serviceId?: string): void {
  if (!serviceId) {
    runtimeCache.clear();
    return;
  }
  for (const key of [...runtimeCache.keys()]) if (key.startsWith(`${serviceId}|`)) runtimeCache.delete(key);
}

export function getRuntimeConfig(serviceId: string, placement: RuntimePlacement = "service_detail", signal?: AbortSignal): Promise<RuntimeConfig> {
  const id = serviceId.trim();
  if (!id) return Promise.reject(new ApiError(400, "service_id_required"));
  const place: RuntimePlacement = isRuntimePlacement(placement) ? placement : "service_detail";
  const key = `${id}|${place}`;
  const hit = runtimeCache.get(key);
  if (hit && Date.now() - hit.at < RUNTIME_TTL_MS) return untilAborted(hit.value, signal);
  const value = http(`/marketplace/services/${enc(id)}/runtime-configuration?placement=${place}`).then((d) => normRuntimeConfig(d, place));
  runtimeCache.set(key, { at: Date.now(), value });
  value.catch(() => {
    if (runtimeCache.get(key)?.value === value) runtimeCache.delete(key);
  });
  return untilAborted(value, signal);
}

export type ServiceRules = { items: ServiceRule[]; allAccepted: boolean; count: number; raw: Dict };

export function normServiceRules(v: unknown): ServiceRules {
  const d = dictOf(v);
  const items = firstArr(v, d.items, d.rules).map(normServiceRule).filter((r) => r.id || r.title);
  return {
    items,
    allAccepted: typeof d.all_accepted === "boolean" ? d.all_accepted : items.every((r) => r.accepted),
    count: asNum(d.count, items.length),
    raw: d,
  };
}

export async function listServiceRules(serviceId?: string, signal?: AbortSignal): Promise<ServiceRules> {
  const id = (serviceId ?? "").trim();
  return normServiceRules(await http(`/marketplace/service-rules${id ? `?service_id=${enc(id)}` : ""}`, { signal }));
}

const BROWSERS: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\/(\d+)/, "Edge"],
  [/OPR\/(\d+)/, "Opera"],
  [/YaBrowser\/(\d+)/, "Yandex"],
  [/SamsungBrowser\/(\d+)/, "Samsung Internet"],
  [/(?:Firefox|FxiOS)\/(\d+)/, "Firefox"],
  [/CriOS\/(\d+)/, "Chrome"],
  [/Chrome\/(\d+)/, "Chrome"],
  [/Version\/(\d+)[\d.]*.*Safari\//, "Safari"],
];
const SYSTEMS: [RegExp, string][] = [
  [/Windows/, "Windows"],
  [/Android/, "Android"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

export function deviceLabel(ua?: string): string {
  const s = ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  if (!s) return "";
  let browser = "";
  for (const [re, name] of BROWSERS) {
    const m = re.exec(s);
    if (m) {
      browser = `${name} ${m[1]}`;
      break;
    }
  }
  const os = SYSTEMS.find(([re]) => re.test(s))?.[1] ?? "";
  return [browser, os].filter(Boolean).join(" / ") || s.slice(0, 120);
}

export type RuleAcceptance = { ruleId: string; accepted: boolean; acceptedAt: string; allAccepted: boolean | null; rule: ServiceRule | null; raw: Dict };

export async function acceptServiceRule(ruleId: string, device: string = deviceLabel()): Promise<RuleAcceptance> {
  const d = dictOf(await http(`/marketplace/service-rules/${enc(ruleId)}/accept`, { method: "POST", body: JSON.stringify({ device: device.trim() || "web" }) }));
  const ruleRaw = dictOf(d.rule);
  const rule = Object.keys(ruleRaw).length ? normServiceRule(ruleRaw) : null;
  const acceptance = dictOf(d.acceptance);
  const acceptedAt = trimmed(d.accepted_at ?? acceptance.accepted_at ?? rule?.acceptedAt);
  return {
    ruleId: trimmed(d.rule_id ?? acceptance.rule_id) || rule?.id || ruleId,
    accepted: typeof d.accepted === "boolean" ? d.accepted : rule ? rule.accepted : true,
    acceptedAt,
    allAccepted: boolOrNull(d.all_accepted),
    rule,
    raw: d,
  };
}

export type SellerServiceConfigInput = { enabled?: boolean; selectedPrice?: number; negotiationAllowed?: boolean };
export type SellerServiceConfig = { serviceId: string; enabled: boolean | null; selectedPrice: number; negotiationAllowed: boolean | null; priceExplanation: string; priceExplanationLines: string[]; raw: Dict };

export function sellerConfigBody(input: SellerServiceConfigInput): Dict {
  const body: Dict = {};
  if (typeof input.enabled === "boolean") body.enabled = input.enabled;
  if (typeof input.selectedPrice === "number" && Number.isFinite(input.selectedPrice)) body.selected_price = Math.round(input.selectedPrice);
  if (typeof input.negotiationAllowed === "boolean") body.negotiation_allowed = input.negotiationAllowed;
  return body;
}

function lineOf(v: unknown): string {
  if (typeof v === "string" || typeof v === "number") return String(v).trim();
  const d = dictOf(v);
  return trimmed(d.text ?? d.label ?? d.message ?? d.title);
}

export function explanationOf(v: unknown): { text: string; lines: string[] } {
  if (typeof v === "string") return { text: v.trim(), lines: [] };
  if (Array.isArray(v)) {
    const lines = v.map(lineOf).filter(Boolean);
    return { text: lines.join(" "), lines };
  }
  const d = dictOf(v);
  const lines = firstArr(d.lines, d.items, d.steps, d.breakdown).map(lineOf).filter(Boolean);
  return { text: trimmed(d.text ?? d.message ?? d.summary ?? d.explanation) || lines.join(" "), lines };
}

export function normSellerConfig(v: unknown, serviceId = ""): SellerServiceConfig {
  const d = dictOf(v);
  const c = dictOf(d.configuration ?? d.config ?? d.seller_service);
  const src = Object.keys(c).length ? c : d;
  const ex = explanationOf(d.price_explanation ?? src.price_explanation);
  return {
    serviceId: trimmed(src.service_id ?? d.service_id) || serviceId,
    enabled: boolOrNull(src.enabled ?? src.is_enabled ?? src.is_active),
    selectedPrice: uzs(src, "selected_price", "configured_price", "price"),
    negotiationAllowed: boolOrNull(src.negotiation_allowed),
    priceExplanation: ex.text,
    priceExplanationLines: ex.lines,
    raw: d,
  };
}

export async function updateSellerServiceConfig(serviceId: string, input: SellerServiceConfigInput): Promise<SellerServiceConfig> {
  const d = await http(`/marketplace/me/services/${enc(serviceId)}/configuration`, { method: "PATCH", body: JSON.stringify(sellerConfigBody(input)) });
  return normSellerConfig(d, serviceId);
}

export const LOCATION_DURATIONS = [1, 4, 8, 12] as const;
export type LocationDuration = (typeof LOCATION_DURATIONS)[number] | null;
export type LocationShareInput =
  | { enabled: true; durationHours: LocationDuration; latitude: number; longitude: number; accuracyMeters?: number; source?: "foreground" | "background" }
  | { enabled: false };
export type LocationPolicy = { foregroundIntervalSec: number; backgroundIntervalSec: number; staleAfterSec: number; retentionDays: number };
export type LocationShareState = { enabled: boolean; durationHours: number | null; expiresAt: string; updatedAt: string; policy: LocationPolicy; raw: Dict };

export const DEFAULT_LOCATION_POLICY: LocationPolicy = { foregroundIntervalSec: 300, backgroundIntervalSec: 600, staleAfterSec: 1200, retentionDays: 30 };

export function locationBody(input: LocationShareInput): Dict {
  if (!input.enabled) return { enabled: false };
  if (input.durationHours !== null && !(LOCATION_DURATIONS as readonly number[]).includes(input.durationHours)) throw new RangeError("duration_hours");
  if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) throw new RangeError("coordinates");
  const body: Dict = { enabled: true, duration_hours: input.durationHours, latitude: input.latitude, longitude: input.longitude, source: input.source ?? "foreground" };
  if (typeof input.accuracyMeters === "number" && Number.isFinite(input.accuracyMeters)) body.accuracy_meters = Math.max(0, Math.round(input.accuracyMeters));
  return body;
}

function secondsOf(d: Dict, keys: string[], fallback: number): number {
  for (const k of keys) {
    const n = numOrNull(d[k]);
    if (n !== null && n > 0) return n;
  }
  return fallback;
}

export function normLocationState(v: unknown): LocationShareState {
  const d = dictOf(v);
  const s = dictOf(d.location_sharing ?? d.sharing ?? d.state);
  const src = Object.keys(s).length ? s : d;
  const p = dictOf(d.policy ?? src.policy ?? d.location_policy);
  const pol = Object.keys(p).length ? p : d;
  const enabled = src.enabled ?? src.is_enabled ?? src.active;
  return {
    enabled: typeof enabled === "boolean" ? enabled : trimmed(src.status).toLowerCase() === "active",
    durationHours: numOrNull(src.duration_hours),
    expiresAt: trimmed(src.expires_at ?? src.active_until ?? src.sharing_until),
    updatedAt: trimmed(src.updated_at ?? src.last_seen_at),
    policy: {
      foregroundIntervalSec: secondsOf(pol, ["foreground_update_interval_seconds", "foreground_interval_seconds", "foreground_update_interval", "foreground_interval"], DEFAULT_LOCATION_POLICY.foregroundIntervalSec),
      backgroundIntervalSec: secondsOf(pol, ["background_update_interval_seconds", "background_interval_seconds", "background_update_interval", "background_interval"], DEFAULT_LOCATION_POLICY.backgroundIntervalSec),
      staleAfterSec: secondsOf(pol, ["stale_after_seconds", "stale_after", "stale_seconds"], DEFAULT_LOCATION_POLICY.staleAfterSec),
      retentionDays: secondsOf(pol, ["retention_days", "retention_period_days", "retention"], DEFAULT_LOCATION_POLICY.retentionDays),
    },
    raw: d,
  };
}

export async function setLocationSharing(input: LocationShareInput): Promise<LocationShareState> {
  return normLocationState(await http("/marketplace/me/location-sharing", { method: "POST", body: JSON.stringify(locationBody(input)) }));
}

export const NEARBY_RADII = [5, 10, 25, 50] as const;
export type NearbyRadius = (typeof NEARBY_RADII)[number];

export function nearestRadius(km: number): NearbyRadius {
  if (!Number.isFinite(km)) return 10;
  let best: NearbyRadius = NEARBY_RADII[0];
  for (const r of NEARBY_RADII) if (Math.abs(r - km) < Math.abs(best - km)) best = r;
  return best;
}

export type NearbySeller = {
  sellerUserId: string;
  name: string;
  sellerType: string;
  serviceId: string;
  distanceKm: number | null;
  latitude: number | null;
  longitude: number | null;
  precision: string;
  exact: boolean;
  rating: number;
  reviewsCount: number;
  verified: boolean;
  region: string;
  raw: Dict;
};
export type NearbyResult = { items: NearbySeller[]; count: number; radiusKm: number; fallbackNearest: boolean; raw: Dict };

function normNearbySeller(v: unknown): NearbySeller {
  const d = dictOf(v);
  const seller = dictOf(d.seller ?? d.lawyer);
  const loc = dictOf(d.location);
  const precision = trimmed(d.location_precision ?? d.precision ?? loc.precision).toLowerCase();
  const km = numOrNull(d.distance_km ?? d.distance);
  const meters = numOrNull(d.distance_m ?? d.distance_meters);
  return {
    sellerUserId: trimmed(d.seller_user_id ?? d.lawyer_user_id ?? d.user_id ?? seller.user_id ?? seller.id),
    name: trimmed(d.name ?? d.lawyer_name ?? d.seller_name ?? seller.name),
    sellerType: trimmed(d.seller_type ?? seller.seller_type).toLowerCase(),
    serviceId: trimmed(d.service_id),
    distanceKm: km ?? (meters === null ? null : meters / 1000),
    latitude: numOrNull(d.latitude ?? d.lat ?? loc.latitude),
    longitude: numOrNull(d.longitude ?? d.lng ?? d.lon ?? loc.longitude),
    precision,
    exact: /exact/.test(precision) && !/approx/.test(precision),
    rating: asNum(d.rating ?? seller.rating),
    reviewsCount: asNum(d.reviews_count ?? seller.reviews_count),
    verified: (d.is_verified ?? seller.is_verified ?? d.verified) === true,
    region: trimmed(d.region ?? seller.region),
    raw: d,
  };
}

export function normNearby(v: unknown): NearbyResult {
  const d = dictOf(v);
  const items = firstArr(v, d.items, d.sellers).map(normNearbySeller).filter((s) => s.sellerUserId || s.name);
  return { items, count: asNum(d.count, items.length), radiusKm: asNum(d.radius_km), fallbackNearest: d.fallback_nearest === true, raw: d };
}

export async function getNearbySellers(q: { latitude: number; longitude: number; radiusKm: NearbyRadius; serviceId?: string; paidOrderId?: string }, signal?: AbortSignal): Promise<NearbyResult> {
  const radius = (NEARBY_RADII as readonly number[]).includes(q.radiusKm) ? q.radiusKm : nearestRadius(q.radiusKm);
  const qs = new URLSearchParams({ latitude: String(q.latitude), longitude: String(q.longitude), radius_km: String(radius) });
  if (q.serviceId) qs.set("service_id", q.serviceId);
  if (q.paidOrderId) qs.set("paid_order_id", q.paidOrderId);
  return normNearby(await http(`/marketplace/nearby-sellers?${qs}`, { signal }));
}

export type NegotiationAction = "accept" | "counter" | "reject";
export type Negotiation = {
  id: string;
  orderId: string;
  status: string;
  amount: number;
  counterAmount: number;
  note: string;
  responseNote: string;
  proposedBy: string;
  expiresAt: string;
  reminderAt: string;
  createdAt: string;
  updatedAt: string;
  raw: Dict;
};

export function normNegotiation(v: unknown): Negotiation {
  const d = dictOf(v);
  const n = dictOf(d.negotiation);
  const src = Object.keys(n).length ? n : d;
  return {
    id: trimmed(src.id ?? src.negotiation_id),
    orderId: trimmed(src.order_id ?? dictOf(d.order).id),
    status: trimmed(src.status ?? src.state).toLowerCase(),
    amount: uzs(src, "amount", "proposed_amount"),
    counterAmount: uzs(src, "counter_amount"),
    note: asStr(src.note ?? src.client_note),
    responseNote: asStr(src.response_note ?? src.seller_note),
    proposedBy: trimmed(src.proposed_by ?? src.created_by ?? src.client_user_id),
    expiresAt: trimmed(src.expires_at),
    reminderAt: trimmed(src.reminder_at),
    createdAt: trimmed(src.created_at),
    updatedAt: trimmed(src.updated_at),
    raw: d,
  };
}

export async function proposeNegotiation(orderId: string, input: { amount: number; note?: string }): Promise<Negotiation> {
  const body: Dict = { amount: Math.round(input.amount) };
  if (input.note?.trim()) body.note = input.note.trim();
  return normNegotiation(await http(`/marketplace/orders/${enc(orderId)}/negotiations`, { method: "POST", body: JSON.stringify(body) }));
}

export type NegotiationResponse = { action: "accept" | "reject"; note?: string } | { action: "counter"; amount: number; note?: string };

export async function respondNegotiation(negotiationId: string, input: NegotiationResponse): Promise<Negotiation> {
  const body: Dict = { action: input.action };
  if (input.action === "counter") body.amount = Math.round(input.amount);
  if (input.note?.trim()) body.note = input.note.trim();
  return normNegotiation(await http(`/marketplace/negotiations/${enc(negotiationId)}`, { method: "PATCH", body: JSON.stringify(body) }));
}

export type OrderChat = { roomId: string; title: string; readOnly: boolean };
export type OrderStart = { orderId: string; status: string; startedAt: string; expectedCompletedAt: string; duration: RuntimeDuration; chat: OrderChat | null; checklist: ChecklistItem[]; raw: Dict };

export function normOrderStart(v: unknown, orderId = ""): OrderStart {
  const d = dictOf(v);
  const o = dictOf(d.order);
  const chatRaw = dictOf(d.chat ?? o.chat);
  const roomId = trimmed(chatRaw.room_id ?? chatRaw.id ?? d.secure_chat_room_id ?? o.secure_chat_room_id);
  return {
    orderId: trimmed(o.id ?? d.order_id) || orderId,
    status: trimmed(d.status ?? o.status).toLowerCase(),
    startedAt: trimmed(d.started_at ?? o.started_at),
    expectedCompletedAt: trimmed(d.expected_completed_at ?? o.expected_completed_at),
    duration: normDuration(d.duration ?? o.duration),
    chat: roomId ? { roomId, title: trimmed(chatRaw.title), readOnly: chatRaw.read_only === true } : null,
    checklist: firstArr(d.checklist, o.checklist, dictOf(d.checklist).items).map(normChecklistItem).filter((i) => i.id || i.title),
    raw: d,
  };
}

export async function startMarketOrder(orderId: string): Promise<OrderStart> {
  return normOrderStart(await http(`/marketplace/orders/${enc(orderId)}/start`, { method: "POST" }), orderId);
}

export type ChecklistProgress = { done: number; total: number; requiredDone: number; requiredTotal: number; percent: number };
export type OrderChecklist = { orderId: string; items: ChecklistItem[]; progress: ChecklistProgress; realtimeChannel: string; raw: Dict };

function progressOf(v: unknown, items: ChecklistItem[]): ChecklistProgress {
  const settled = items.filter((i) => i.status !== "pending");
  const required = items.filter((i) => i.required);
  const derived = {
    done: settled.length,
    total: items.length,
    requiredDone: required.filter((i) => i.status !== "pending").length,
    requiredTotal: required.length,
    percent: items.length ? Math.round((settled.length / items.length) * 100) : 0,
  };
  if (typeof v === "number" && Number.isFinite(v)) return { ...derived, percent: v };
  const d = dictOf(v);
  if (!Object.keys(d).length) return derived;
  const pick = (val: unknown, fallback: number) => numOrNull(val) ?? fallback;
  return {
    done: pick(d.done ?? d.completed ?? d.done_count, derived.done),
    total: pick(d.total ?? d.total_count, derived.total),
    requiredDone: pick(d.required_done ?? d.required_completed, derived.requiredDone),
    requiredTotal: pick(d.required_total ?? d.required_count, derived.requiredTotal),
    percent: pick(d.percent ?? d.progress_percent ?? d.percentage, derived.percent),
  };
}

export function normOrderChecklist(v: unknown, orderId = ""): OrderChecklist {
  const d = dictOf(v);
  const nested = dictOf(d.checklist);
  const src = Object.keys(nested).length ? nested : d;
  const items = firstArr(v, src.items, d.checklist, src.checklist_items).map(normChecklistItem).filter((i) => i.id || i.title);
  return {
    orderId: trimmed(src.order_id ?? d.order_id) || orderId,
    items,
    progress: progressOf(src.progress ?? d.progress, items),
    realtimeChannel: trimmed(src.realtime_channel ?? d.realtime_channel ?? d.channel),
    raw: d,
  };
}

export async function getOrderChecklist(orderId: string, signal?: AbortSignal): Promise<OrderChecklist> {
  return normOrderChecklist(await http(`/marketplace/orders/${enc(orderId)}/checklist`, { signal }), orderId);
}

export type ChecklistUpdate = { status: ChecklistStatus; comment?: string; files?: { id: string; name: string }[] };

export function checklistUpdateBody(input: ChecklistUpdate): Dict {
  const body: Dict = { status: input.status };
  if (input.comment !== undefined) body.comment = input.comment.trim();
  if (input.files) body.files = input.files.filter((f) => f.id).map((f) => ({ id: f.id, name: f.name }));
  return body;
}

export async function updateChecklistItem(orderId: string, itemId: string, input: ChecklistUpdate): Promise<{ item: ChecklistItem | null; checklist: OrderChecklist | null; raw: Dict }> {
  const d = dictOf(await http(`/marketplace/orders/${enc(orderId)}/checklist/${enc(itemId)}`, { method: "PATCH", body: JSON.stringify(checklistUpdateBody(input)) }));
  const itemRaw = dictOf(d.item);
  const hasList = Array.isArray(d.items) || Object.keys(dictOf(d.checklist)).length > 0 || Array.isArray(d.checklist);
  const item = Object.keys(itemRaw).length ? normChecklistItem(itemRaw) : !hasList && (d.id || d.status) ? normChecklistItem(d) : null;
  return { item, checklist: hasList ? normOrderChecklist(d, orderId) : null, raw: d };
}

export type CompletionResult = { orderId: string; status: string; chatReadOnly: boolean | null; callsAllowed: boolean | null; ratingDeadlineAt: string; ratingRemainingSeconds: number | null; raw: Dict };

export function normCompletion(v: unknown, orderId = ""): CompletionResult {
  const d = dictOf(v);
  const o = dictOf(d.order);
  const chat = dictOf(d.chat ?? o.chat);
  const rating = dictOf(d.rating ?? o.rating);
  const details = dictOf(o.details);
  const readOnly = d.chat_read_only ?? o.chat_read_only ?? chat.read_only;
  const calls = d.calls_allowed ?? o.calls_allowed;
  return {
    orderId: trimmed(o.id ?? d.order_id) || orderId,
    status: trimmed(d.status ?? o.status).toLowerCase(),
    chatReadOnly: boolOrNull(readOnly),
    callsAllowed: boolOrNull(calls),
    ratingDeadlineAt: trimmed(d.rating_deadline_at ?? rating.deadline_at ?? o.rating_deadline_at ?? details.rating_deadline_at),
    ratingRemainingSeconds: numOrNull(rating.remaining_seconds ?? d.rating_remaining_seconds),
    raw: d,
  };
}

export const RUNTIME_ERROR_CODES = [
  "service_rules_acceptance_required",
  "seller_price_above_maximum",
  "seller_price_negative",
  "required_checklist_incomplete",
  "radius_invalid",
  "callcenter_role_required",
] as const;
export type RuntimeErrorCode = (typeof RUNTIME_ERROR_CODES)[number];

export function isRuntimeErrorCode(code: string): code is RuntimeErrorCode {
  return (RUNTIME_ERROR_CODES as readonly string[]).includes(code);
}

export type BlockingItem = { id: string; title: string; status: string; required: boolean; raw: Dict };
export type MarketErrorInfo = { status: number; code: string; message: string; missingRuleIds: string[]; blockingItems: BlockingItem[]; allowed: number[]; fieldErrors: Record<string, string>; detail: Dict };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BLOCKING_KEYS = ["blocking_items", "items", "blocking", "missing_items", "pending_items", "required_items", "incomplete_items", "checklist_items"];
const BLOCKING_ID_KEYS = ["blocking_item_ids", "missing_item_ids", "pending_item_ids", "incomplete_item_ids", "item_ids"];

function normBlocking(v: unknown, idsOnly = false): BlockingItem {
  if (typeof v === "string" || typeof v === "number") {
    const s = String(v).trim();
    return idsOnly || UUID_RE.test(s) ? { id: s, title: "", status: "", required: true, raw: {} } : { id: "", title: s, status: "", required: true, raw: {} };
  }
  const d = dictOf(v);
  const inner = dictOf(d.item ?? d.checklist_item);
  return {
    id: trimmed(d.id ?? d.item_id ?? d.checklist_item_id ?? inner.id),
    title: trimmed(d.title ?? d.name ?? d.label ?? d.text ?? inner.title ?? inner.name ?? inner.label),
    status: trimmed(d.status ?? inner.status).toLowerCase(),
    required: (d.required ?? inner.required) !== false,
    raw: d,
  };
}

export function marketErrorInfo(e: unknown): MarketErrorInfo | null {
  if (!(e instanceof ApiError)) return null;
  const top = e.data;
  const detail = dictOf(top.detail);
  const found = (...keys: string[]): { key: string; list: unknown[] } | null => {
    for (const k of keys) {
      const v = detail[k] ?? top[k];
      if (Array.isArray(v)) return { key: k, list: v };
    }
    return null;
  };
  const pick = (...keys: string[]): unknown[] => found(...keys)?.list ?? [];
  const blocking = found(...BLOCKING_KEYS, ...BLOCKING_ID_KEYS);
  const idsOnly = !!blocking && BLOCKING_ID_KEYS.includes(blocking.key);
  return {
    status: e.status,
    code: e.code || trimmed(detail.code) || trimmed(top.code),
    message: trimmed(detail.message) || (typeof top.detail === "string" ? top.detail.trim() : ""),
    missingRuleIds: pick("missing_rule_ids", "rule_ids", "missing_rules")
      .map((x) => (typeof x === "string" || typeof x === "number" ? String(x).trim() : trimmed(dictOf(x).id ?? dictOf(x).rule_id)))
      .filter(Boolean),
    blockingItems: (blocking?.list ?? [])
      .map((x) => normBlocking(x, idsOnly))
      .filter((x) => x.id || x.title),
    allowed: pick("allowed", "allowed_values", "allowed_radii")
      .map((x) => numOrNull(x))
      .filter((x): x is number => x !== null),
    fieldErrors: Object.fromEntries(Object.entries(e.fieldErrors).filter(([k]) => k !== "code" && k !== "message")),
    detail,
  };
}

export class ChecklistIncompleteError extends ApiError {
  items: BlockingItem[];
  constructor(source: ApiError, items: BlockingItem[]) {
    super(source.status, source.detail, source.retryAfter, { data: source.data, code: source.code || "required_checklist_incomplete", fieldErrors: source.fieldErrors });
    this.name = "ChecklistIncompleteError";
    this.items = items;
  }
}

export function checklistBlockOf(e: unknown): BlockingItem[] | null {
  if (e instanceof ChecklistIncompleteError) return e.items;
  const info = marketErrorInfo(e);
  return info && info.code === "required_checklist_incomplete" ? info.blockingItems : null;
}

export function marketErrorParams(e: unknown): { n: number; list: string } {
  const info = marketErrorInfo(e);
  const n = !info ? 0 : info.code === "service_rules_acceptance_required" ? info.missingRuleIds.length : info.code === "required_checklist_incomplete" ? info.blockingItems.length : 0;
  return { n, list: (info?.allowed.length ? info.allowed : [...NEARBY_RADII]).join(", ") };
}

export async function completeOrderV2(orderId: string, input: { resultText: string; resultFiles: { id: string; name: string }[] }): Promise<CompletionResult> {
  const body = {
    result_text: input.resultText.trim(),
    result_files: input.resultFiles.filter((f) => f.id).map((f) => ({ id: f.id, name: f.name })),
  };
  try {
    return normCompletion(await http(`/marketplace/orders/${enc(orderId)}/complete-v2`, { method: "POST", body: JSON.stringify(body) }), orderId);
  } catch (e) {
    const items = e instanceof ApiError && !(e instanceof ChecklistIncompleteError) ? checklistBlockOf(e) : null;
    if (items && e instanceof ApiError) throw new ChecklistIncompleteError(e, items);
    throw e;
  }
}

export type CancellationReview = {
  id: string;
  orderId: string;
  status: string;
  reason: string;
  action: string;
  note: string;
  amount: number;
  lawyerUserId: string;
  groupChatRoomId: string;
  serviceChatRoomId: string;
  workId: string;
  serviceTitle: string;
  clientName: string;
  sellerName: string;
  createdAt: string;
  resolvedAt: string;
  order: Dict;
  checklist: ChecklistItem[];
  additionalPayment: Dict | null;
  resultFiles: MarketFileRef[];
  raw: Dict;
};

export function normCancellationReview(v: unknown): CancellationReview {
  const d = dictOf(v);
  const r = dictOf(d.review ?? d.cancellation_review);
  const src = Object.keys(r).length ? r : d;
  const order = dictOf(src.order ?? d.order);
  const client = dictOf(order.client ?? src.client);
  const seller = dictOf(order.lawyer ?? src.seller ?? src.lawyer);
  const resolution = dictOf(src.resolution);
  const addPay = src.additional_payment ?? src.additional_payment_context ?? order.additional_payment;
  return {
    id: trimmed(src.id ?? src.review_id),
    orderId: trimmed(src.order_id ?? order.id),
    status: trimmed(src.status).toLowerCase(),
    reason: asStr(src.reason),
    action: trimmed(src.action ?? resolution.action ?? src.resolution_action).toLowerCase(),
    note: asStr(src.note ?? resolution.note ?? src.resolution_note),
    amount: uzs(src, "amount", "new_price") || uzs(resolution, "amount"),
    lawyerUserId: trimmed(src.lawyer_user_id ?? resolution.lawyer_user_id),
    groupChatRoomId: trimmed(src.group_chat_room_id ?? d.group_chat_room_id ?? resolution.group_chat_room_id),
    serviceChatRoomId: trimmed(src.service_chat_room_id ?? src.secure_chat_room_id ?? order.secure_chat_room_id ?? src.chat_room_id),
    workId: trimmed(src.work_id ?? order.work_id),
    serviceTitle: trimmed(src.service_title ?? order.service_title),
    clientName: trimmed(src.client_name ?? client.name),
    sellerName: trimmed(src.seller_name ?? src.lawyer_name ?? order.lawyer_name ?? seller.name),
    createdAt: trimmed(src.created_at),
    resolvedAt: trimmed(src.resolved_at),
    order,
    checklist: firstArr(src.checklist, dictOf(src.checklist).items, order.checklist).map(normChecklistItem).filter((i) => i.id || i.title),
    additionalPayment: addPay && typeof addPay === "object" && !Array.isArray(addPay) ? (addPay as Dict) : null,
    resultFiles: firstArr(src.result_files, order.result_files).map(normFileRef).filter((f) => f.id || f.url || f.name),
    raw: d,
  };
}

export async function requestCancellationReview(orderId: string, reason: string): Promise<CancellationReview> {
  return normCancellationReview(await http(`/marketplace/orders/${enc(orderId)}/cancellation-review`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) }));
}

export type ReviewList = { items: CancellationReview[]; count: number; total: number; raw: Dict };

export async function listCancellationReviews(q: { status?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal): Promise<ReviewList> {
  const qs = new URLSearchParams();
  const status = q.status === undefined ? "open" : q.status.trim();
  if (status) qs.set("status", status);
  qs.set("limit", String(Math.max(1, Math.min(q.limit ?? 50, 200))));
  qs.set("offset", String(Math.max(0, q.offset ?? 0)));
  const raw = await http(`/call-center/marketplace/cancellation-reviews?${qs}`, { signal });
  const d = dictOf(raw);
  const items = firstArr(raw, d.items, d.reviews).map(normCancellationReview).filter((x) => x.id);
  return { items, count: asNum(d.count, items.length), total: asNum(d.total, asNum(d.count, items.length)), raw: d };
}

export const REVIEW_ACTIONS = ["continue", "new_price", "cancel", "reassign", "refund"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];
export type ReviewResolveInput =
  | { action: "continue" | "cancel" | "refund"; note?: string }
  | { action: "new_price"; amount: number; note?: string }
  | { action: "reassign"; lawyerUserId: string; note?: string };
export type ReviewResolution = { reviewId: string; status: string; action: string; groupChatRoomId: string; review: CancellationReview | null; raw: Dict };

export function resolveBody(input: ReviewResolveInput): Dict {
  const body: Dict = { action: input.action };
  if (input.action === "new_price") body.amount = Math.round(input.amount);
  if (input.action === "reassign") body.lawyer_user_id = input.lawyerUserId;
  if (input.note?.trim()) body.note = input.note.trim();
  return body;
}

export async function resolveCancellationReview(reviewId: string, input: ReviewResolveInput): Promise<ReviewResolution> {
  const d = dictOf(await http(`/call-center/marketplace/cancellation-reviews/${enc(reviewId)}/resolve`, { method: "POST", body: JSON.stringify(resolveBody(input)) }));
  const hasReview = Object.keys(dictOf(d.review ?? d.cancellation_review)).length > 0 || !!d.id;
  const review = hasReview ? normCancellationReview(d) : null;
  return {
    reviewId: review?.id || reviewId,
    status: trimmed(d.status) || review?.status || "",
    action: trimmed(d.action) || review?.action || input.action,
    groupChatRoomId: trimmed(d.group_chat_room_id ?? dictOf(d.group_chat).room_id ?? dictOf(d.group_chat).id) || review?.groupChatRoomId || "",
    review,
    raw: d,
  };
}

export type SecondOpinionSeller = { sellerUserId: string; name: string; sellerType: string; rating: number; reviewsCount: number; verified: boolean; serviceId: string; price: number; region: string; raw: Dict };
export type SecondOpinion = { items: SecondOpinionSeller[]; showDuringWork: boolean | null; showAfterCompletion: boolean | null; visible: boolean | null; flags: Dict; raw: Dict };

function normOpinionSeller(v: unknown): SecondOpinionSeller {
  const d = dictOf(v);
  const seller = dictOf(d.seller ?? d.lawyer);
  const service = dictOf(d.service);
  return {
    sellerUserId: trimmed(d.seller_user_id ?? d.lawyer_user_id ?? d.user_id ?? seller.user_id ?? seller.id),
    name: trimmed(d.name ?? d.lawyer_name ?? d.seller_name ?? seller.name),
    sellerType: trimmed(d.seller_type ?? seller.seller_type).toLowerCase(),
    rating: asNum(d.rating ?? seller.rating),
    reviewsCount: asNum(d.reviews_count ?? seller.reviews_count),
    verified: (d.is_verified ?? seller.is_verified ?? d.verified) === true,
    serviceId: trimmed(d.service_id ?? service.id),
    price: uzs(d, "price", "selected_price", "effective_price") || uzs(service, "price", "selected_price"),
    region: trimmed(d.region ?? seller.region),
    raw: d,
  };
}

export function normSecondOpinion(v: unknown): SecondOpinion {
  const d = dictOf(v);
  const flags = dictOf(d.flags ?? d.display);
  const items = firstArr(v, d.items, d.sellers, d.alternatives, d.recommendations).map(normOpinionSeller).filter((s) => s.sellerUserId || s.name);
  return {
    items,
    showDuringWork: boolOrNull(d.show_during_work ?? flags.show_during_work ?? flags.during_work ?? flags.in_progress),
    showAfterCompletion: boolOrNull(d.show_after_completion ?? flags.show_after_completion ?? flags.after_completion ?? flags.completed),
    visible: boolOrNull(d.visible ?? d.show ?? flags.visible ?? flags.show),
    flags,
    raw: d,
  };
}

export async function getSecondOpinion(orderId: string, signal?: AbortSignal): Promise<SecondOpinion> {
  return normSecondOpinion(await http(`/marketplace/orders/${enc(orderId)}/second-opinion`, { signal }));
}
