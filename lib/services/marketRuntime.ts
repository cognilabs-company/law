import { ApiError, asArr, asNum, asStr, http, parseServerTime, type Dict } from "@/lib/http";
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
const idList = (v: unknown[]): string[] =>
  v.map((x) => (typeof x === "string" || typeof x === "number" ? String(x).trim() : trimmed(dictOf(x).id ?? dictOf(x).rule_id))).filter(Boolean);

export const MARKET_ACTION_TAIL = {
  start: /\/start$/,
  complete: /^\/marketplace\/orders\/[^/]+\/complete-v2$/,
  cancel: /\/cancel$/,
  cancellationReview: /\/cancellation-reviews?$/,
  negotiations: /\/negotiations$/,
  checklist: /\/checklist$/,
  secondOpinion: /\/second-opinion$/,
} as const;

export function marketActionPath(url: unknown, fallback: string, allow?: RegExp): string {
  const raw = trimmed(url)
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/api\/backend(?=\/)/, "");
  if (!raw) return fallback;
  const path = raw.split(/[?#]/)[0];
  if (!/^\/(marketplace|call-center)\/[^/]/.test(path)) return fallback;
  if (path.includes("..") || path.includes("//") || /[\\\s]|%2e|%2f|%5c/i.test(path)) return fallback;
  if (allow && !allow.test(path)) return fallback;
  return path;
}

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

export type RuntimeDuration = { value: number; unit: string; calendar: CalendarKind; calendarRaw: string; startsOn: string; businessWeekdays?: number[]; businessDaysLabel?: string };

export const DEFAULT_BUSINESS_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5];

function weekdaysOf(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<number>();
  for (const x of v) {
    const n = typeof x === "number" ? x : parseInt(String(x), 10);
    if (Number.isInteger(n) && n >= 1 && n <= 7) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

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
  const weekdays = weekdaysOf(d.business_weekdays ?? d.weekdays);
  const label = trimmed(d.business_days_label);
  const out: RuntimeDuration = {
    value: asNum(d.value ?? d.amount ?? d.duration_value),
    unit: unitOf(d.unit ?? d.duration_unit),
    calendar: calendarKindOf(calendarRaw),
    calendarRaw,
    startsOn: trimmed(d.starts_on ?? d.start_on),
  };
  if (weekdays.length) out.businessWeekdays = weekdays;
  if (label) out.businessDaysLabel = label;
  return out;
}

export const TEMPLATE_MODES = ["required", "optional", "not_required"] as const;
export type RuntimeTemplate = { mode: string; source: string; documentTemplateId: string };

function normTemplate(v: unknown): RuntimeTemplate {
  const d = dictOf(v);
  return { mode: trimmed(d.mode ?? d.template_mode).toLowerCase(), source: trimmed(d.source ?? d.template_source).toLowerCase(), documentTemplateId: trimmed(d.document_template_id ?? d.template_id) };
}

export type RuntimeFactor = { id: string; title: string; description: string; adjustmentType: "fixed" | "percent"; value: number; overridden?: boolean; raw: Dict };

const SERVICE_SCOPE_RE = /^(inline|service[_-](only|inline|override|specific)|override|per[_-]?service)$/;

function serviceScoped(d: Dict, ...flags: string[]): boolean {
  for (const f of flags) if (d[f] === true) return true;
  for (const k of ["source", "origin", "kind", "scope", "scope_type", "override_source"]) {
    const s = trimmed(d[k]).toLowerCase();
    if (s && SERVICE_SCOPE_RE.test(s)) return true;
  }
  return false;
}

function normFactor(v: unknown): RuntimeFactor {
  const d = dictOf(v);
  const type = trimmed(d.adjustment_type ?? d.type).toLowerCase();
  return {
    id: trimmed(d.id ?? d.factor_id ?? d.key),
    title: trimmed(d.title ?? d.label ?? d.name),
    description: trimmed(d.description),
    adjustmentType: /percent|%/.test(type) ? "percent" : "fixed",
    value: asNum(d.value ?? d.amount),
    overridden: serviceScoped(d, "overridden", "is_override", "service_override", "has_override"),
    raw: d,
  };
}

export type RuntimePricing = {
  recommendedPrice: number;
  maximumPrice: number;
  currency: string;
  sellerCanPriceBelowRecommended: boolean;
  factors: RuntimeFactor[];
  formula: string;
  minimumListingPrice?: number;
  maxListingDiscountPercent?: number | null;
  negotiationMinimumPrice?: number;
  raw?: Dict;
};

function normPricing(v: unknown): RuntimePricing {
  const d = dictOf(v);
  const below = d.seller_can_price_below_recommended;
  const discount = numOrNull(d.maximum_listing_discount_percent);
  return {
    recommendedPrice: uzs(d, "recommended_price", "base_price"),
    maximumPrice: uzs(d, "maximum_price", "max_price"),
    currency: trimmed(d.currency) || "UZS",
    sellerCanPriceBelowRecommended: typeof below === "boolean" ? below : true,
    factors: asArr(d.factors).map(normFactor).filter((f) => f.id || f.title),
    formula: trimmed(d.formula),
    minimumListingPrice: Math.max(0, uzs(d, "minimum_listing_price")),
    maxListingDiscountPercent: discount !== null && discount >= 0 && discount <= 100 ? discount : null,
    negotiationMinimumPrice: Math.max(0, uzs(d, "negotiation_minimum_price")),
    raw: d,
  };
}

export function priceCapOf(p: Pick<RuntimePricing, "maximumPrice">): number | null {
  return p.maximumPrice > 0 ? p.maximumPrice : null;
}

// Who a service rule is written for (Studio saves it with every rule):
// "executor" — the lawyer or advocate, who accepts it when turning the
// service on and works under it; "client" — the buyer, who reads it before
// paying and while the order runs. "" when the backend did not say, which is
// an executor rule — its own default.
export type RuleAudience = "client" | "executor" | "";
export function ruleAudienceOf(v: unknown): RuleAudience {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "client" || s === "customer" || s === "buyer") return "client";
  if (s === "executor" || s === "performer" || s === "seller" || s === "lawyer") return "executor";
  return "";
}

export type ServiceRule = {
  id: string;
  ruleKey: string;
  audience: RuleAudience;
  title: string;
  version: string;
  body: string;
  scopeType: string;
  scopeId: string;
  serviceId: string;
  categoryId: string;
  effectiveAt: string;
  accepted: boolean;
  acceptedAt: string;
  inline?: boolean;
  source?: string;
  sellerOwn?: boolean;
  raw: Dict;
};

const SELLER_RULE_SOURCE_RE = /^seller([_-](selected|chosen|rule|own))?$/;

export function normServiceRule(v: unknown): ServiceRule {
  const d = dictOf(v);
  const acceptedAt = trimmed(d.accepted_at);
  const serviceId = trimmed(d.service_id);
  const categoryId = trimmed(d.category_id);
  const scope = trimmed(d.scope_type ?? d.scope).toLowerCase();
  const source = trimmed(d.source ?? d.rule_source).toLowerCase();
  return {
    id: trimmed(d.id ?? d.rule_id),
    ruleKey: trimmed(d.rule_key ?? d.key),
    audience: ruleAudienceOf(d.audience ?? d.rule_audience),
    title: trimmed(d.title ?? d.name),
    version: trimmed(d.version ?? d.rule_version),
    body: asStr(d.body ?? d.content ?? d.text ?? d.description),
    scopeType: scope || (serviceId ? "service" : categoryId ? "category" : ""),
    scopeId: trimmed(d.scope_id) || serviceId || categoryId,
    serviceId,
    categoryId,
    effectiveAt: trimmed(d.effective_at ?? d.effective_from),
    accepted: typeof d.accepted === "boolean" ? d.accepted : !!acceptedAt,
    acceptedAt,
    inline: serviceScoped(d, "inline", "is_inline", "service_only"),
    source,
    sellerOwn: SELLER_RULE_SOURCE_RE.test(source),
    raw: d,
  };
}

export type RuntimeGuarantee = { id: string; title: string; description: string; icon: string; refundPolicyId: string; conditions: Dict; inline?: boolean; raw: Dict };

function normGuarantee(v: unknown): RuntimeGuarantee {
  const d = dictOf(v);
  return {
    id: trimmed(d.id ?? d.guarantee_id ?? d.key),
    title: trimmed(d.title ?? d.label ?? d.name),
    description: trimmed(d.description ?? d.text ?? d.body),
    icon: trimmed(d.icon),
    refundPolicyId: trimmed(d.refund_policy_id),
    conditions: dictOf(d.conditions),
    inline: serviceScoped(d, "inline", "is_inline", "service_only"),
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
  key: string;
  title: string;
  description: string;
  status: ChecklistStatus;
  statusRaw: string;
  required: boolean;
  commentRequired: boolean;
  fileRequired: boolean;
  imageRequired?: boolean;
  verificationMethods?: VerificationMethod[];
  skipAllowed: boolean;
  comment: string;
  files: MarketFileRef[];
  images?: MarketFileRef[];
  sortOrder: number;
  updatedAt: string;
  // The item as worded for each side. A seller's full item carries both; a
  // client's item arrives already reduced to its own wording.
  executorTitle: string;
  clientTitle: string;
  clientDescription: string;
  // Which evidence the client may see; null when the item does not say
  // (a client's item, already filtered by the backend).
  showToClient: { comment: boolean; images: boolean; files: boolean } | null;
  raw: Dict;
};

export const VERIFICATION_METHODS = ["checkbox", "comment", "image", "file"] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

function methodsOf(v: unknown): VerificationMethod[] {
  if (!Array.isArray(v)) return [];
  const got = new Set(v.map((x) => trimmed(x).toLowerCase()));
  return VERIFICATION_METHODS.filter((m) => got.has(m));
}

export function normChecklistItem(v: unknown): ChecklistItem {
  const d = dictOf(v);
  const statusRaw = trimmed(d.status);
  const key = trimmed(d.key ?? d.item_key);
  const required = d.required === true || d.is_required === true;
  const skip = d.skip_allowed ?? d.can_skip ?? d.allow_skip ?? d.skippable;
  const methods = methodsOf(d.verification_methods);
  const methodShape = Array.isArray(d.verification_methods);
  const executorTitle = trimmed(d.executor_title);
  const clientTitle = trimmed(d.client_title);
  const flags = ["show_comment_to_client", "show_images_to_client", "show_files_to_client"].some((k) => typeof d[k] === "boolean");
  return {
    id: trimmed(d.id ?? d.item_id ?? d.checklist_item_id) || key,
    key,
    title: trimmed(d.title ?? d.name ?? d.label ?? d.text) || executorTitle || clientTitle,
    description: trimmed(d.description ?? d.hint),
    status: checklistStatusOf(statusRaw),
    statusRaw,
    required,
    commentRequired: d.comment_required === true,
    fileRequired: d.file_required === true,
    imageRequired: d.image_required === true,
    verificationMethods: methods,
    skipAllowed: typeof skip === "boolean" ? skip : methodShape || !required,
    comment: asStr(d.comment ?? d.reason ?? d.note),
    files: asArr(d.files ?? d.attachments).map(normFileRef).filter((f) => f.id || f.url),
    images: asArr(d.images ?? d.image_files ?? d.photos).map(normFileRef).filter((f) => f.id || f.url),
    sortOrder: asNum(d.sort_order ?? d.position),
    updatedAt: trimmed(d.updated_at ?? d.completed_at),
    executorTitle,
    clientTitle,
    clientDescription: trimmed(d.client_description),
    showToClient: flags ? { comment: d.show_comment_to_client === true, images: d.show_images_to_client === true, files: d.show_files_to_client === true } : null,
    raw: d,
  };
}

// What the client is allowed to see of an item: its client wording (the
// performer's only when no client wording was written) and only the evidence
// the service lets the client see. An item already reduced by the backend
// passes through; a full one (a stray event, a cached seller copy) is cut
// down here so nothing internal reaches the client screen.
export function clientChecklistItem(item: ChecklistItem): ChecklistItem {
  const full = !!item.executorTitle || !!item.clientTitle || item.showToClient !== null;
  if (!full) return item;
  const show = item.showToClient ?? { comment: false, images: false, files: false };
  const r = item.raw;
  return {
    ...item,
    title: item.clientTitle || item.executorTitle || item.title,
    description: item.clientDescription,
    comment: show.comment ? item.comment : "",
    images: show.images ? (item.images ?? []) : [],
    files: show.files ? item.files : [],
    executorTitle: "",
    clientDescription: "",
    raw: { id: r.id, item_id: r.item_id, checklist_item_id: r.checklist_item_id, key: r.key, status: r.status },
  };
}

export function checklistItemRef(item: Pick<ChecklistItem, "id" | "key"> & { raw?: Dict }): string {
  const own = item.raw ? trimmed(item.raw.id ?? item.raw.item_id ?? item.raw.checklist_item_id) : "";
  return own || item.id || item.key;
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
  // The backend's own list of the client-facing rules (`client_rules`).
  clientRules: ServiceRule[];
  guarantees: RuntimeGuarantee[];
  checklistPreview: ChecklistItem[];
  usageSteps: UsageStep[];
  raw: Dict;
};

export type UsageStep = { title: string; text: string };

function normUsageStep(v: unknown): UsageStep {
  if (typeof v === "string") return { title: "", text: v.trim() };
  const d = dictOf(v);
  return { title: trimmed(d.title ?? d.label ?? d.name), text: trimmed(d.description ?? d.text ?? d.body ?? d.instruction) };
}

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
    clientRules: asArr(d.client_rules)
      .map(normServiceRule)
      .filter((r) => r.id || r.title)
      .map((r) => (r.audience ? r : { ...r, audience: "client" as const })),
    guarantees: asArr(d.guarantees).map(normGuarantee).filter((g) => g.id || g.title),
    checklistPreview: asArr(d.checklist_preview).map(normChecklistItem).filter((i) => i.id || i.title),
    usageSteps: asArr(d.usage_steps).map(normUsageStep).filter((x) => x.title || x.text),
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
  // What a seller accepts is the executor's side only: a client rule that
  // ever came back here is not theirs to accept.
  const items = firstArr(v, d.items, d.rules)
    .map(normServiceRule)
    .filter((r) => (r.id || r.title) && r.audience !== "client");
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

export type SellerServiceConfigInput = { enabled?: boolean; selectedPrice?: number; negotiationAllowed?: boolean; selectedRuleIds?: string[] };
export type SelectableRule = { id: string; title: string; bodyPreview: string; version: string; body?: string; sellerSelectable?: boolean | null; source?: string; selected?: boolean | null; accepted?: boolean | null };
export type SellerServiceConfig = {
  serviceId: string;
  enabled: boolean | null;
  selectedPrice: number;
  recommendedPrice: number;
  maximumPrice: number;
  minimumListingPrice: number;
  belowRecommendedAllowed: boolean | null;
  maxListingDiscountPercent: number | null;
  negotiationMinimumPrice: number;
  negotiationAllowed: boolean | null;
  negotiationAvailable: boolean | null;
  status: string;
  rulesStatus: string;
  rulesAccepted: boolean | null;
  rulesPending: boolean;
  missingRuleIds: string[];
  priceExplanation: string;
  priceExplanationLines: string[];
  selectableRules: SelectableRule[] | null;
  selectedRuleIds: string[] | null;
  requiredRules?: ServiceRule[] | null;
  // The service's own ceiling, above the seller's current maximum; 0 when
  // the response does not say.
  serviceMaximumPrice: number;
  // How far (percent) the seller may raise the price once every requirement
  // below is met; null when the response does not say.
  maxIncreasePercent: number | null;
  // What stands between the seller and that higher ceiling, each with the
  // backend's own current/required values.
  requirements: PriceRequirement[];
  raw: Dict;
};

// One criterion for a higher price, exactly as the backend measured it.
export type PriceRequirement = {
  key: string;
  label: string;
  current: number | boolean | null;
  required: number | boolean | null;
  unit: string;
  met: boolean | null;
  progress: number | null;
  note: string;
};

function requirementOf(v: unknown): PriceRequirement | null {
  const d = dictOf(v);
  const key = trimmed(d.key ?? d.code ?? d.criterion ?? d.type);
  const label = trimmed(d.label ?? d.title ?? d.name);
  if (!key && !label) return null;
  const val = (x: unknown): number | boolean | null => (typeof x === "boolean" ? x : numOrNull(x));
  const progress = numOrNull(d.progress_percent ?? d.progress ?? d.percent);
  return {
    key,
    label,
    current: val(d.current ?? d.current_value ?? d.actual ?? d.value),
    required: val(d.required ?? d.required_value ?? d.target ?? d.minimum),
    unit: trimmed(d.unit),
    met: boolOrNull(d.met ?? d.satisfied ?? d.passed ?? d.is_met),
    progress: progress === null ? null : Math.max(0, Math.min(100, progress)),
    note: trimmed(d.text ?? d.message ?? d.hint ?? d.description),
  };
}

function requirementsOf(...sources: unknown[]): PriceRequirement[] {
  for (const s of sources) {
    const list = Array.isArray(s) ? s : Array.isArray(dictOf(s).items) ? (dictOf(s).items as unknown[]) : null;
    if (!list?.length) continue;
    const out = list.map(requirementOf).filter((r): r is PriceRequirement => r !== null);
    if (out.length) return out;
  }
  return [];
}

const CONFIG_RULES_PENDING_RE = /^(rules?_pending|pending_rules?|rules?_acceptance_required)$/;

export function sellerConfigBody(input: SellerServiceConfigInput): Dict {
  const body: Dict = {};
  if (typeof input.enabled === "boolean") body.enabled = input.enabled;
  if (typeof input.selectedPrice === "number" && Number.isFinite(input.selectedPrice)) body.selected_price = Math.round(input.selectedPrice);
  if (typeof input.negotiationAllowed === "boolean") body.negotiation_allowed = input.negotiationAllowed;
  if (Array.isArray(input.selectedRuleIds)) body.selected_rule_ids = [...new Set(input.selectedRuleIds.map((x) => x.trim()).filter(Boolean))];
  return body;
}

function normSelectableRule(v: unknown): SelectableRule {
  const d = dictOf(v);
  return {
    id: trimmed(d.id ?? d.rule_id),
    title: trimmed(d.title ?? d.name),
    bodyPreview: trimmed(d.body_preview ?? d.preview ?? d.summary),
    version: trimmed(d.version ?? d.rule_version),
    body: asStr(d.body ?? d.content ?? d.text),
    sellerSelectable: boolOrNull(d.seller_selectable),
    source: trimmed(d.source).toLowerCase(),
    selected: boolOrNull(d.selected),
    accepted: boolOrNull(d.accepted),
  };
}

export function selectableRuleTitles(cfg: Pick<SellerServiceConfig, "selectableRules" | "requiredRules"> | null, ids: readonly string[]): string[] {
  const known = new Map<string, string>();
  for (const r of cfg?.requiredRules ?? []) if (r.id && r.title) known.set(r.id, r.title);
  for (const r of cfg?.selectableRules ?? []) if (r.id && r.title) known.set(r.id, r.title);
  return ids.map((id) => known.get(id) ?? id);
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

function rulesStateOf(...vals: unknown[]): { accepted: boolean | null; missing: string[] } {
  for (const v of vals) {
    if (typeof v === "boolean") return { accepted: v, missing: [] };
    if (Array.isArray(v)) {
      const rules = v.map(normServiceRule).filter((r) => r.id || r.title);
      if (!rules.length) continue;
      const missing = rules.filter((r) => !r.accepted).map((r) => r.id).filter(Boolean);
      return { accepted: rules.every((r) => r.accepted), missing };
    }
    const d = dictOf(v);
    if (!Object.keys(d).length) continue;
    const flag = boolOrNull(d.all_accepted ?? d.accepted ?? d.rules_accepted);
    const missing = idList(firstArr(d.missing_rule_ids, d.pending_rule_ids, d.missing));
    if (flag !== null || missing.length) return { accepted: flag ?? !missing.length, missing };
  }
  return { accepted: null, missing: [] };
}

export function normSellerConfig(v: unknown, serviceId = ""): SellerServiceConfig {
  const d = dictOf(v);
  const c = dictOf(d.configuration ?? d.config ?? d.seller_service);
  const src = Object.keys(c).length ? c : d;
  const ex = explanationOf(d.price_explanation ?? src.price_explanation);
  const lim = dictOf(src.limits ?? src.price_limits ?? src.pricing ?? d.limits ?? d.price_limits ?? d.pricing);
  const requiredRaw = src.required_rules ?? d.required_rules;
  // A seller accepts and picks executor rules only; client rules are the buyer's.
  const requiredRules = Array.isArray(requiredRaw) ? requiredRaw.map(normServiceRule).filter((r) => (r.id || r.title) && r.audience !== "client") : null;
  const rules = rulesStateOf(src.rules_accepted, d.rules_accepted, src.rules_acceptance, d.rules_acceptance, requiredRules?.length ? requiredRaw : null, src.rules, d.rules);
  const flatMissing = idList(firstArr(src.missing_rule_ids, d.missing_rule_ids));
  const rulesAccepted = rules.accepted ?? (flatMissing.length ? false : null);
  const requiredMissing = rulesAccepted === false && requiredRules ? requiredRules.filter((r) => !r.accepted && r.id).map((r) => r.id) : [];
  const missingRuleIds = rules.missing.length ? rules.missing : flatMissing.length ? flatMissing : requiredMissing;
  const status = trimmed(src.status ?? d.status).toLowerCase();
  const rulesStatus = trimmed(src.rules_status ?? d.rules_status).toLowerCase();
  const discount = numOrNull(src.maximum_listing_discount_percent ?? d.maximum_listing_discount_percent ?? lim.maximum_listing_discount_percent);
  const increase = numOrNull(src.maximum_increase_percent ?? src.max_increase_percent ?? src.max_price_increase_percent ?? src.price_increase_percent ?? lim.maximum_increase_percent ?? lim.max_increase_percent);
  const selectable = src.selectable_rules ?? d.selectable_rules;
  const chosen = src.selected_rule_ids ?? d.selected_rule_ids;
  const selectableRules = Array.isArray(selectable)
    ? selectable.filter((x) => ruleAudienceOf(dictOf(x).audience) !== "client").map(normSelectableRule).filter((r) => r.id && r.sellerSelectable !== false)
    : null;
  const selectedRuleIds = Array.isArray(chosen) ? idList(chosen) : selectableRules && selectableRules.some((r) => r.selected === true) ? selectableRules.filter((r) => r.selected === true).map((r) => r.id) : null;
  return {
    serviceId: trimmed(src.service_id ?? d.service_id) || serviceId,
    enabled: boolOrNull(src.enabled ?? src.is_enabled ?? src.is_active),
    selectedPrice: uzs(src, "selected_price", "configured_price", "price"),
    recommendedPrice: uzs(src, "recommended_price", "recommended_minimum_price") || uzs(lim, "recommended_price", "recommended_minimum_price", "recommended"),
    maximumPrice: uzs(src, "maximum_price", "max_price", "seller_maximum_price") || uzs(lim, "maximum_price", "max_price", "maximum"),
    minimumListingPrice: Math.max(0, uzs(src, "minimum_listing_price") || uzs(lim, "minimum_listing_price")),
    belowRecommendedAllowed: boolOrNull(src.below_recommended_allowed ?? d.below_recommended_allowed),
    maxListingDiscountPercent: discount !== null && discount >= 0 ? discount : null,
    negotiationMinimumPrice: Math.max(0, uzs(src, "negotiation_minimum_price") || uzs(d, "negotiation_minimum_price")),
    negotiationAllowed: boolOrNull(src.negotiation_allowed ?? src.negotiation_enabled),
    negotiationAvailable: boolOrNull(src.negotiation_available ?? d.negotiation_available),
    status,
    rulesStatus,
    rulesAccepted,
    rulesPending: rulesStatus === "pending" || CONFIG_RULES_PENDING_RE.test(rulesStatus) || CONFIG_RULES_PENDING_RE.test(status) || rulesAccepted === false,
    missingRuleIds,
    priceExplanation: ex.text,
    priceExplanationLines: ex.lines,
    selectableRules,
    selectedRuleIds,
    requiredRules,
    serviceMaximumPrice: uzs(src, "service_maximum_price", "overall_maximum_price", "absolute_maximum_price", "price_ceiling", "max_price_cap") || uzs(lim, "service_maximum_price", "overall_maximum_price", "price_ceiling", "max_price_cap"),
    maxIncreasePercent: increase !== null && increase >= 0 ? increase : null,
    requirements: requirementsOf(src.requirements, src.price_requirements, src.unmet_requirements, dictOf(src.eligibility).requirements, d.requirements, d.price_requirements, lim.requirements),
    raw: d,
  };
}

export async function getSellerServiceConfig(serviceId: string, signal?: AbortSignal): Promise<SellerServiceConfig> {
  return normSellerConfig(await http(`/marketplace/me/services/${enc(serviceId)}/configuration`, { signal }), serviceId);
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
export type LocationShareState = { enabled: boolean; durationHours: number | null; expiresAt: string; updatedAt: string; freshUntil: string; accuracyMeters: number | null; policy: LocationPolicy; raw: Dict };

const STALE_KEYS = ["stale_after_sec", "stale_after_seconds", "stale_after", "stale_seconds"];

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
  const enabled = src.enabled ?? src.is_enabled ?? src.active ?? src.sharing_enabled;
  const last = dictOf(src.last_location ?? src.location ?? d.last_location);
  const updatedAt = trimmed(src.last_update_at ?? src.last_updated_at ?? src.last_location_at ?? src.location_updated_at ?? last.updated_at ?? last.recorded_at ?? src.updated_at ?? src.last_seen_at);
  const staleAfterSec = secondsOf(pol, STALE_KEYS, DEFAULT_LOCATION_POLICY.staleAfterSec);
  const staleKnown = STALE_KEYS.some((k) => (numOrNull(pol[k]) ?? 0) > 0);
  const updatedMs = updatedAt ? parseServerTime(updatedAt) : NaN;
  const derivedFresh = staleKnown && Number.isFinite(updatedMs) ? new Date(updatedMs + staleAfterSec * 1000).toISOString() : "";
  return {
    enabled: typeof enabled === "boolean" ? enabled : trimmed(src.status).toLowerCase() === "active",
    durationHours: numOrNull(src.duration_hours),
    expiresAt: trimmed(src.expires_at ?? src.share_until ?? src.active_until ?? src.sharing_until ?? src.expiration_at),
    updatedAt,
    freshUntil: trimmed(src.fresh_until ?? d.fresh_until) || derivedFresh,
    accuracyMeters: numOrNull(src.accuracy_meters ?? last.accuracy_meters),
    policy: {
      foregroundIntervalSec: secondsOf(pol, ["foreground_interval_sec", "foreground_update_interval_seconds", "foreground_interval_seconds", "foreground_update_interval", "foreground_interval", "update_interval_seconds"], DEFAULT_LOCATION_POLICY.foregroundIntervalSec),
      backgroundIntervalSec: secondsOf(pol, ["background_interval_sec", "background_update_interval_seconds", "background_interval_seconds", "background_update_interval", "background_interval"], DEFAULT_LOCATION_POLICY.backgroundIntervalSec),
      staleAfterSec,
      retentionDays: secondsOf(pol, ["retention_days", "retention_period_days", "retention"], DEFAULT_LOCATION_POLICY.retentionDays),
    },
    raw: d,
  };
}

export async function getLocationSharing(signal?: AbortSignal): Promise<LocationShareState> {
  return normLocationState(await http("/marketplace/me/location-sharing", { signal }));
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
export type NegotiationStep = { by: string; amount: number; status: string; note: string; at: string };
export type Negotiation = {
  id: string;
  orderId: string;
  status: string;
  amount: number;
  proposedAmount: number;
  counterAmount: number;
  finalAmount: number;
  maxAmount: number;
  note: string;
  responseNote: string;
  proposedBy: string;
  currentProposer: string;
  clientUserId: string;
  sellerUserId: string;
  history: NegotiationStep[];
  allowedStatuses: string[];
  expiresAt: string;
  reminderAt: string;
  createdAt: string;
  updatedAt: string;
  raw: Dict;
};

const SELLER_SIDE_RE = /^(seller|lawyer|yurist|advokat|advocate|advokat_tashkiloti|organization|provider|executor)$/;
const CLIENT_SIDE_RE = /^(client|customer|buyer)$/;

function partyOf(v: unknown): string {
  if (typeof v === "string" || typeof v === "number") return String(v).trim();
  const d = dictOf(v);
  return trimmed(d.role ?? d.side ?? d.party ?? d.user_id ?? d.id);
}

export function negotiationSideOf(who: string, ids: { clientUserId: string; sellerUserId: string }): "client" | "seller" | null {
  const w = who.trim();
  if (!w) return null;
  const low = w.toLowerCase();
  if (CLIENT_SIDE_RE.test(low)) return "client";
  if (SELLER_SIDE_RE.test(low)) return "seller";
  if (ids.clientUserId && w === ids.clientUserId) return "client";
  if (ids.sellerUserId && w === ids.sellerUserId) return "seller";
  return null;
}

function normStep(v: unknown): NegotiationStep {
  const d = dictOf(v);
  return {
    by: partyOf(d.by ?? d.proposed_by ?? d.actor ?? d.role ?? d.actor_role ?? d.user_id),
    amount: uzs(d, "amount", "proposed_amount", "counter_amount", "final_amount"),
    status: trimmed(d.status ?? d.action ?? d.event).toLowerCase(),
    note: asStr(d.note ?? d.comment),
    at: trimmed(d.at ?? d.created_at ?? d.timestamp),
  };
}

export function normNegotiation(v: unknown): Negotiation {
  const d = dictOf(v);
  const n = dictOf(d.negotiation);
  const src = Object.keys(n).length ? n : d;
  const amount = uzs(src, "amount", "proposed_amount");
  const proposedAmount = uzs(src, "proposed_amount");
  const ids = { clientUserId: trimmed(src.client_user_id), sellerUserId: trimmed(src.seller_user_id ?? src.lawyer_user_id) };
  const currentProposer = partyOf(src.current_proposer);
  const history = firstArr(src.history).map(normStep).filter((s) => s.amount > 0 || s.status || s.by);
  const sellerSteps = history.filter((s) => s.amount > 0 && negotiationSideOf(s.by, ids) === "seller");
  const lastSeller = sellerSteps[sellerSteps.length - 1];
  const sellerTurn = negotiationSideOf(currentProposer, ids) === "seller";
  const counterAmount = uzs(src, "counter_amount") || lastSeller?.amount || (sellerTurn && proposedAmount > 0 && proposedAmount !== uzs(src, "amount") ? proposedAmount : 0);
  return {
    id: trimmed(src.id ?? src.negotiation_id),
    orderId: trimmed(src.order_id ?? dictOf(d.order).id),
    status: trimmed(src.status ?? src.state).toLowerCase(),
    amount,
    proposedAmount,
    counterAmount,
    finalAmount: uzs(src, "final_amount"),
    maxAmount: uzs(src, "maximum_price", "max_price", "seller_maximum_price") || uzs(d, "maximum_price", "max_price"),
    note: asStr(src.note ?? src.client_note),
    responseNote: asStr(src.response_note ?? src.seller_note) || (lastSeller?.note ?? ""),
    proposedBy: partyOf(src.proposed_by ?? src.created_by),
    currentProposer,
    clientUserId: ids.clientUserId,
    sellerUserId: ids.sellerUserId,
    history,
    allowedStatuses: firstArr(src.allowed_statuses).map((x) => trimmed(x).toLowerCase()).filter(Boolean),
    expiresAt: trimmed(src.expires_at),
    reminderAt: trimmed(src.reminder_at),
    createdAt: trimmed(src.created_at),
    updatedAt: trimmed(src.updated_at),
    raw: d,
  };
}

export async function proposeNegotiation(orderId: string, input: { amount: number; note?: string }, url = ""): Promise<Negotiation> {
  const body: Dict = { amount: Math.round(input.amount) };
  if (input.note?.trim()) body.note = input.note.trim();
  const path = marketActionPath(url, `/marketplace/orders/${enc(orderId)}/negotiations`, MARKET_ACTION_TAIL.negotiations);
  return normNegotiation(await http(path, { method: "POST", body: JSON.stringify(body) }));
}

export type NegotiationList = { items: Negotiation[]; count: number; raw: Dict };

const negotiationTime = (n: Negotiation): number => {
  const at = Date.parse(n.updatedAt || n.createdAt);
  return Number.isFinite(at) ? at : 0;
};

export function latestNegotiation(list: readonly Negotiation[]): Negotiation | null {
  let best: Negotiation | null = null;
  for (const n of list) if (!best || negotiationTime(n) >= negotiationTime(best)) best = n;
  return best;
}

export async function listOrderNegotiations(orderId: string, signal?: AbortSignal, url = ""): Promise<NegotiationList> {
  const path = marketActionPath(url, `/marketplace/orders/${enc(orderId)}/negotiations`, MARKET_ACTION_TAIL.negotiations);
  const raw = await http(`${path}?limit=20&offset=0`, { signal });
  const d = dictOf(raw);
  const items = firstArr(raw, d.items, d.negotiations)
    .map(normNegotiation)
    .filter((n) => n.id || n.amount > 0)
    .map((n) => (n.orderId ? n : { ...n, orderId }));
  return { items, count: asNum(d.count ?? d.total, items.length), raw: d };
}

export async function getNegotiation(negotiationId: string, signal?: AbortSignal): Promise<Negotiation> {
  return normNegotiation(await http(`/marketplace/negotiations/${enc(negotiationId)}`, { signal }));
}

export type NegotiationResponse ={ action: "accept" | "reject"; note?: string } | { action: "counter"; amount: number; note?: string };

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

export async function startMarketOrder(orderId: string, url = ""): Promise<OrderStart> {
  const path = marketActionPath(url, `/marketplace/orders/${enc(orderId)}/start`, MARKET_ACTION_TAIL.start);
  return normOrderStart(await http(path, { method: "POST" }), orderId);
}

export type ChecklistProgress = { done: number; total: number; requiredDone: number; requiredTotal: number; percent: number };
export type OrderChecklist = { orderId: string; items: ChecklistItem[]; progress: ChecklistProgress; realtimeChannel: string; fileUpload?: ChecklistFileUpload | null; snapshotLocked?: boolean | null; raw: Dict };

function progressOf(v: unknown, items: ChecklistItem[], top: Dict = {}): ChecklistProgress {
  const settled = items.filter((i) => i.status !== "pending");
  const required = items.filter((i) => i.required);
  const derived = {
    done: settled.length,
    total: items.length,
    requiredDone: required.filter((i) => i.status !== "pending").length,
    requiredTotal: required.length,
    percent: items.length ? Math.round((settled.length / items.length) * 100) : 0,
  };
  const pick = (val: unknown, fallback: number) => numOrNull(val) ?? fallback;
  const flat = {
    done: pick(top.completed_count, derived.done),
    total: pick(top.total_count, derived.total),
    requiredDone: derived.requiredDone,
    requiredTotal: derived.requiredTotal,
    percent: pick(top.progress_percent, derived.percent),
  };
  if (typeof v === "number" && Number.isFinite(v)) return { ...flat, percent: v };
  const d = dictOf(v);
  if (!Object.keys(d).length) return flat;
  return {
    done: pick(d.done ?? d.completed ?? d.done_count ?? d.completed_count, flat.done),
    total: pick(d.total ?? d.total_count, flat.total),
    requiredDone: pick(d.required_done ?? d.required_completed ?? d.required_completed_count, derived.requiredDone),
    requiredTotal: pick(d.required_total ?? d.required_count ?? d.required_total_count, derived.requiredTotal),
    percent: pick(d.percent ?? d.progress_percent ?? d.percentage, flat.percent),
  };
}

export type ChecklistFileUpload = { url: string; method: string; field: string; fields: Record<string, string>; maxBytes: number; accept: string[]; raw: Dict };

const UPLOAD_PATH_RE = /^\/[a-z][a-z0-9_-]*(\/[A-Za-z0-9._~:@-]+)*\/?$/;

export function uploadPathOf(url: unknown): string {
  const raw = trimmed(url)
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/api\/backend(?=\/)/, "");
  const path = raw.split(/[?#]/)[0];
  if (!path || path.includes("..") || path.includes("//") || /[\\\s]|%2e|%2f|%5c/i.test(path)) return "";
  return UPLOAD_PATH_RE.test(path) ? path : "";
}

function stringDict(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(dictOf(v))) if (typeof x === "string" || typeof x === "number" || typeof x === "boolean") out[k] = String(x);
  return out;
}

export function normFileUpload(v: unknown): ChecklistFileUpload | null {
  if (typeof v === "string") {
    const url = uploadPathOf(v);
    return url ? { url, method: "POST", field: "file", fields: {}, maxBytes: 0, accept: [], raw: {} } : null;
  }
  const d = dictOf(v);
  const url = uploadPathOf(d.url ?? d.upload_url ?? d.endpoint ?? d.href);
  if (!url) return null;
  const mb = numOrNull(d.max_size_mb ?? d.max_file_size_mb ?? d.max_mb);
  const bytes = numOrNull(d.max_size_bytes ?? d.max_file_size_bytes ?? d.max_bytes ?? d.max_size);
  const accept = firstArr(d.accept, d.allowed_mime_types, d.mime_types, d.allowed_extensions, d.allowed_types).map((x) => trimmed(x)).filter(Boolean);
  const method = trimmed(d.method).toUpperCase();
  return {
    url,
    method: method === "PUT" ? "PUT" : "POST",
    field: trimmed(d.field ?? d.field_name ?? d.form_field ?? d.file_field) || "file",
    fields: stringDict(d.fields ?? d.form_fields ?? d.extra_fields),
    maxBytes: bytes && bytes > 0 ? bytes : mb && mb > 0 ? Math.round(mb * 1024 * 1024) : 0,
    accept,
    raw: d,
  };
}

export function normOrderChecklist(v: unknown, orderId = ""): OrderChecklist {
  const d = dictOf(v);
  const nested = dictOf(d.checklist);
  const src = Object.keys(nested).length ? nested : d;
  const items = firstArr(v, src.items, d.checklist, src.checklist_items).map(normChecklistItem).filter((i) => i.id || i.title);
  const locked = src.snapshot_locked ?? d.snapshot_locked;
  return {
    orderId: trimmed(src.order_id ?? d.order_id) || orderId,
    items,
    progress: progressOf(src.progress ?? d.progress, items, src),
    realtimeChannel: trimmed(src.realtime_channel ?? d.realtime_channel ?? d.channel),
    fileUpload: normFileUpload(src.file_upload ?? d.file_upload),
    snapshotLocked: typeof locked === "boolean" ? locked : null,
    raw: d,
  };
}

export async function getOrderChecklist(orderId: string, signal?: AbortSignal, url = ""): Promise<OrderChecklist> {
  const path = marketActionPath(url, `/marketplace/orders/${enc(orderId)}/checklist`, MARKET_ACTION_TAIL.checklist);
  return normOrderChecklist(await http(path, { signal }), orderId);
}

function firstStr(...vals: unknown[]): string {
  for (const v of vals) {
    const s = trimmed(v);
    if (s) return s;
  }
  return "";
}

function uploadedRefOf(v: unknown, fallbackName: string): MarketFileRef {
  const d = dictOf(v);
  const inner = dictOf(d.file ?? d.upload ?? d.attachment ?? d.data);
  const meta = dictOf(d.meta);
  const msg = dictOf(d.message);
  const msgFile = dictOf(msg.file);
  const msgMeta = dictOf(msg.meta);
  const id = firstStr(d.file_id, inner.id, inner.file_id, d.id, msg.id);
  const name = firstStr(d.name, d.file_name, d.filename, d.original_name, inner.name, inner.file_name, inner.filename, meta.file_name, msgFile.file_name, msgMeta.file_name) || fallbackName;
  const url = firstStr(d.download_url, d.url, d.file_url, inner.download_url, inner.url, meta.download_url, msgFile.download_url, msgMeta.download_url);
  return { id, name, url };
}

const SECURE_UPLOAD_RE = /^\/secure-chats\/[^/]+\/messages\/upload$/;

export async function uploadChecklistEvidence(upload: ChecklistFileUpload, file: File, caption = ""): Promise<MarketFileRef> {
  const form = new FormData();
  form.append(upload.field || "file", file, file.name);
  const fields: Record<string, string> = { ...upload.fields };
  if (SECURE_UPLOAD_RE.test(upload.url)) {
    if (!fields.message_type) fields.message_type = "file";
    if (caption && !fields.content) fields.content = caption;
  }
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const ref = uploadedRefOf(await http(upload.url, { method: upload.method || "POST", body: form }), file.name);
  if (!ref.id) throw new ApiError(502, "upload_without_id");
  return ref;
}

export type ChecklistUpdate = { status: ChecklistStatus; comment?: string; files?: { id: string; name: string }[]; images?: { id: string; name: string }[] };

export function checklistUpdateBody(input: ChecklistUpdate): Dict {
  const body: Dict = { status: input.status };
  if (input.comment !== undefined) body.comment = input.comment.trim();
  if (input.images) body.images = input.images.filter((f) => f.id).map((f) => ({ id: f.id, name: f.name }));
  if (input.files) body.files = input.files.filter((f) => f.id).map((f) => ({ id: f.id, name: f.name }));
  return body;
}

export function checklistOfEvent(ev: unknown, orderId = ""): OrderChecklist | null {
  const root = dictOf(ev);
  const data = dictOf(root.data);
  const payload = dictOf(root.payload);
  for (const src of [root, data, payload, dictOf(data.payload), dictOf(root.checklist), dictOf(data.checklist)]) {
    if (!Array.isArray(src.items)) continue;
    const own = trimmed(src.order_id ?? root.order_id ?? data.order_id);
    if (orderId && own && own !== orderId) return null;
    return normOrderChecklist({ ...src, order_id: own || orderId }, own || orderId);
  }
  return null;
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

export function completeV2Path(orderId: string): string {
  return `/marketplace/orders/${enc(orderId)}/complete-v2`;
}

export async function completeOrderV2(orderId: string, input: { resultText: string; resultFiles: { id: string; name: string }[] }, url = ""): Promise<CompletionResult> {
  const body = {
    result_text: input.resultText.trim(),
    result_files: input.resultFiles.filter((f) => f.id).map((f) => ({ id: f.id, name: f.name })),
  };
  try {
    return normCompletion(await http(marketActionPath(url, completeV2Path(orderId), MARKET_ACTION_TAIL.complete), { method: "POST", body: JSON.stringify(body) }), orderId);
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
  resolutionOptions: string[];
  chatMessagesUrl: string;
  raw: Dict;
};

function optionOf(v: unknown): string {
  if (typeof v === "string") return v.trim().toLowerCase();
  const d = dictOf(v);
  return trimmed(d.action ?? d.value ?? d.key ?? d.id ?? d.code).toLowerCase();
}

export function normCancellationReview(v: unknown): CancellationReview {
  const d = dictOf(v);
  const r = dictOf(d.review ?? d.cancellation_review);
  const src = Object.keys(r).length ? r : d;
  const ctx = dictOf(src.context ?? d.context);
  const chat = dictOf(src.chat ?? d.chat);
  const order = dictOf(src.order ?? ctx.order ?? d.order);
  const client = dictOf(order.client ?? src.client);
  const seller = dictOf(order.lawyer ?? src.seller ?? src.lawyer);
  const resolution = dictOf(src.resolution);
  const resolutionWord = typeof src.resolution === "string" ? src.resolution.trim() : "";
  const addPay = src.additional_payment ?? src.additional_payment_context ?? ctx.additional_payment ?? order.additional_payment;
  return {
    id: trimmed(src.id ?? src.review_id),
    orderId: trimmed(src.order_id ?? order.id),
    status: trimmed(src.status).toLowerCase(),
    reason: asStr(src.reason),
    action: (trimmed(src.action ?? resolution.action ?? src.resolution_action) || resolutionWord).toLowerCase(),
    note: asStr(src.note ?? resolution.note ?? src.resolution_note),
    amount: uzs(src, "amount", "new_price") || uzs(resolution, "amount"),
    lawyerUserId: trimmed(src.lawyer_user_id ?? resolution.lawyer_user_id),
    groupChatRoomId: trimmed(src.group_chat_room_id ?? d.group_chat_room_id ?? resolution.group_chat_room_id),
    serviceChatRoomId: trimmed(src.service_chat_room_id ?? src.secure_chat_room_id ?? ctx.secure_chat_room_id ?? order.secure_chat_room_id ?? src.chat_room_id ?? chat.room_id),
    workId: trimmed(src.work_id ?? order.work_id),
    serviceTitle: trimmed(src.service_title ?? order.service_title),
    clientName: trimmed(src.client_name ?? client.name),
    sellerName: trimmed(src.seller_name ?? src.lawyer_name ?? order.lawyer_name ?? seller.name),
    createdAt: trimmed(src.created_at),
    resolvedAt: trimmed(src.resolved_at),
    order,
    checklist: firstArr(src.checklist, dictOf(src.checklist).items, ctx.checklist, dictOf(ctx.checklist).items, order.checklist).map(normChecklistItem).filter((i) => i.id || i.title),
    additionalPayment: addPay && typeof addPay === "object" && !Array.isArray(addPay) ? (addPay as Dict) : null,
    resultFiles: firstArr(src.result_files, ctx.result_files, order.result_files).map(normFileRef).filter((f) => f.id || f.url || f.name),
    resolutionOptions: [...new Set(firstArr(src.resolution_options, d.resolution_options).map(optionOf).filter(Boolean))],
    chatMessagesUrl: trimmed(chat.messages_url),
    raw: d,
  };
}

export function reviewActionsOf(r: Pick<CancellationReview, "resolutionOptions">): ReviewAction[] {
  const offered = REVIEW_ACTIONS.filter((a) => r.resolutionOptions.includes(a));
  return offered.length ? offered : [...REVIEW_ACTIONS];
}

export async function requestCancellationReview(orderId: string, reason: string, url = ""): Promise<CancellationReview> {
  const path = marketActionPath(url, `/marketplace/orders/${enc(orderId)}/cancellation-review`, MARKET_ACTION_TAIL.cancellationReview);
  return normCancellationReview(await http(path, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) }));
}

export async function getCancellationReview(reviewId: string, signal?: AbortSignal): Promise<CancellationReview> {
  return normCancellationReview(await http(`/call-center/marketplace/cancellation-reviews/${enc(reviewId)}`, { signal }));
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

export type ReviewOrderContext = {
  orderId: string;
  workId: string;
  orderWorkId: string;
  serviceId: string;
  serviceTitle: string;
  status: string;
  paymentStatus: string;
  price: number;
  currency: string;
  clientUserId: string;
  clientName: string;
  clientPhone: string;
  sellerUserId: string;
  sellerName: string;
  sellerPhone: string;
  sellerType: string;
  startedAt: string;
  expectedCompletedAt: string;
  deadlinePaused: boolean;
  pausedAt: string;
  remainingSeconds: number | null;
  serviceChatRoomId: string;
};

const REVIEW_ROOM_RE = /\/secure-chats\/([^/?#]+)/;
const lowered = (v: unknown): string => trimmed(v).toLowerCase();

function reviewSrcOf(r: CancellationReview): Dict {
  const inner = dictOf(r.raw.review ?? r.raw.cancellation_review);
  return Object.keys(inner).length ? inner : r.raw;
}

export function reviewOrderOf(r: CancellationReview): ReviewOrderContext {
  const src = reviewSrcOf(r);
  const o = r.order;
  const det = dictOf(o.details);
  const client = dictOf(o.client ?? src.client);
  const seller = dictOf(o.lawyer ?? o.seller ?? src.seller);
  const status = lowered(o.status ?? src.order_status);
  const serviceChat = dictOf(src.service_chat);
  const parties = dictOf(src.parties);
  const fullName = [trimmed(client.first_name), trimmed(client.last_name)].filter(Boolean).join(" ");
  return {
    orderId: r.orderId,
    workId: r.workId || trimmed(det.work_id),
    orderWorkId: trimmed(o.order_work_id),
    serviceId: trimmed(o.service_id ?? src.service_id ?? det.service_id),
    serviceTitle: r.serviceTitle || trimmed(det.service_title),
    status,
    paymentStatus: lowered(o.payment_status),
    price: uzs(o, "price", "final_price") || uzs(src, "order_price", "price"),
    currency: trimmed(o.currency) || "UZS",
    clientUserId: trimmed(o.client_user_id ?? client.id ?? src.client_user_id ?? parties.client_user_id),
    clientName: r.clientName || trimmed(det.client_name) || fullName,
    clientPhone: trimmed(client.phone ?? src.client_phone),
    sellerUserId: trimmed(o.lawyer_user_id ?? seller.id ?? src.seller_user_id ?? parties.lawyer_user_id ?? parties.seller_user_id),
    sellerName: r.sellerName || trimmed(det.lawyer_name),
    sellerPhone: trimmed(seller.phone),
    sellerType: lowered(det.seller_type ?? seller.role),
    startedAt: trimmed(o.started_at ?? det.started_at),
    expectedCompletedAt: trimmed(o.expected_completed_at ?? det.expected_completed_at ?? src.expected_completed_at),
    deadlinePaused: o.deadline_paused === true || det.deadline_paused === true || src.deadline_paused === true || status === "cancellation_review",
    pausedAt: trimmed(o.deadline_paused_at ?? det.deadline_paused_at ?? src.deadline_paused_at),
    remainingSeconds: numOrNull(o.deadline_remaining_seconds ?? det.deadline_remaining_seconds ?? src.remaining_seconds ?? src.deadline_remaining_seconds),
    serviceChatRoomId:
      r.serviceChatRoomId ||
      trimmed(src.service_chat_id) ||
      trimmed(serviceChat.room_id) ||
      trimmed(serviceChat.id) ||
      (REVIEW_ROOM_RE.exec(asStr(o.chat_url))?.[1] ?? ""),
  };
}

export type ReviewPayment = { status: string; amount: number; paidAmount: number; currency: string; reason: string; workId: string; createdAt: string; paidAt: string; requests: number; raw: Dict };

export function reviewPaymentOf(r: CancellationReview): ReviewPayment | null {
  const src = reviewSrcOf(r);
  const base = r.additionalPayment;
  const b = dictOf(base);
  const list = firstArr(src.additional_payments, b.items, b.requests);
  if (!base && !list.length) return null;
  const last = dictOf(b.latest ?? b.request ?? list[list.length - 1]);
  const status = lowered(b.status ?? last.status);
  const amount = uzs(b, "amount", "requested_amount", "total_amount") || uzs(last, "amount");
  const reason = trimmed(b.reason ?? b.description ?? last.reason ?? last.description);
  if (!status && !amount && !reason) return null;
  return {
    status,
    amount,
    paidAmount: uzs(b, "paid_amount", "paid_total") || (status === "paid" ? amount : 0),
    currency: trimmed(b.currency ?? last.currency) || "UZS",
    reason,
    workId: trimmed(b.work_id ?? last.work_id),
    createdAt: trimmed(b.created_at ?? last.created_at),
    paidAt: trimmed(b.paid_at ?? last.paid_at),
    requests: list.length || 1,
    raw: Object.keys(b).length ? b : last,
  };
}

export type ReviewResolutionInfo = { action: string; note: string; amount: number; lawyerUserId: string; lawyerName: string; groupChatRoomId: string; resolvedAt: string; resolvedByName: string };

export function reviewResolutionOf(r: CancellationReview): ReviewResolutionInfo | null {
  if (!r.action && !r.resolvedAt && !r.groupChatRoomId) return null;
  const src = reviewSrcOf(r);
  const res = dictOf(src.resolution);
  return {
    action: r.action,
    note: r.note,
    amount: r.amount,
    lawyerUserId: r.lawyerUserId,
    lawyerName: trimmed(res.lawyer_name ?? src.new_lawyer_name ?? dictOf(res.lawyer).name),
    groupChatRoomId: r.groupChatRoomId,
    resolvedAt: r.resolvedAt,
    resolvedByName: trimmed(src.resolved_by_name ?? dictOf(src.resolved_by).name ?? res.resolved_by_name),
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

export async function getSecondOpinion(orderId: string, signal?: AbortSignal, url = ""): Promise<SecondOpinion> {
  const path = marketActionPath(url, `/marketplace/orders/${enc(orderId)}/second-opinion`, MARKET_ACTION_TAIL.secondOpinion);
  return normSecondOpinion(await http(path, { signal }));
}
