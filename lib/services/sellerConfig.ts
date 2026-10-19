import { ApiError } from "@/lib/http";
import {
  addManagedService,
  serviceErrorOf,
  setManagedServiceStatus,
  updateManagedService,
  type ManagedService,
  type ServiceError,
  type ServiceInput,
  type ServiceScope,
} from "@/lib/services/sellerServices";
import {
  marketErrorInfo,
  priceCapOf,
  updateSellerServiceConfig,
  type RuntimeConfig,
  type RuntimePricing,
  type SellerServiceConfig,
} from "@/lib/services/marketRuntime";

export type ConfigErrorCode = "seller_price_above_maximum" | "seller_price_below_minimum" | "seller_price_negative" | "service_rules_acceptance_required" | "other";
export type ConfigError = { code: ConfigErrorCode; field: "price" | "status" | "form"; missingRuleIds: string[]; maximum: number | null; minimum: number | null; message: string; status: number };
export type PriceVerdict = "ok" | "negative" | "aboveMax" | "belowMin";

const KNOWN_CODES: readonly ConfigErrorCode[] = ["seller_price_above_maximum", "seller_price_below_minimum", "seller_price_negative", "service_rules_acceptance_required"];
const CONFIG_PAUSED_RE = /^(rules?_pending|pending_rules?|rules?_acceptance_required)$/;
const BELOW_MIN_RE = /^seller_price_(below_min(imum)?|too_low|under_min(imum)?)$/;

let support: "unknown" | "yes" | "no" = "unknown";

export function configSupport(): "unknown" | "yes" | "no" {
  return support;
}

export function resetConfigSupport(): void {
  support = "unknown";
}

export function isConfigUnsupported(e: unknown): boolean {
  if (!(e instanceof ApiError)) return false;
  const missing = e.status === 405 || e.status === 501 || (e.status === 404 && !e.code && e.detail === "Not Found");
  if (missing) support = "no";
  return missing;
}

const positive = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function configErrorOf(e: unknown): ConfigError {
  const info = marketErrorInfo(e);
  const raw = info?.code ?? "";
  const code: ConfigErrorCode = BELOW_MIN_RE.test(raw) ? "seller_price_below_minimum" : (KNOWN_CODES as readonly string[]).includes(raw) ? (raw as ConfigErrorCode) : "other";
  const detail = info?.detail ?? {};
  return {
    code,
    field: code === "seller_price_above_maximum" || code === "seller_price_below_minimum" || code === "seller_price_negative" ? "price" : code === "service_rules_acceptance_required" ? "status" : "form",
    missingRuleIds: info?.missingRuleIds ?? [],
    maximum: positive(detail.maximum_price ?? detail.max_price),
    minimum: positive(detail.minimum_price ?? detail.min_price ?? detail.minimum_allowed_price),
    message: info?.message || (e instanceof ApiError ? (e.detail ?? "") : ""),
    status: info?.status ?? 0,
  };
}

export function priceVerdict(price: number, pricing: Pick<RuntimePricing, "maximumPrice"> | null, minimum = 0): PriceVerdict {
  if (price < 0) return "negative";
  const cap = pricing ? priceCapOf(pricing) : null;
  if (cap !== null && price > cap) return "aboveMax";
  if (minimum > 0 && price > 0 && price < minimum) return "belowMin";
  return "ok";
}

export function applySellerConfig(item: ManagedService, cfg: SellerServiceConfig): ManagedService {
  return {
    ...item,
    selectedPrice: cfg.selectedPrice || item.selectedPrice,
    effectivePrice: cfg.selectedPrice > 0 ? cfg.selectedPrice : item.effectivePrice,
    priceCapped: cfg.selectedPrice > 0 ? false : item.priceCapped,
    negotiationAllowed: cfg.negotiationAllowed ?? item.negotiationAllowed,
    status: CONFIG_PAUSED_RE.test(cfg.status) ? "paused" : item.status,
    visible: cfg.rulesPending ? false : item.visible,
    rulesPending: cfg.rulesPending ? true : cfg.rulesAccepted === true ? false : item.rulesPending,
  };
}

const remembered = new Map<string, SellerServiceConfig>();

export function rememberSellerConfig(uid: string, cfg: SellerServiceConfig): void {
  if (!cfg.serviceId) return;
  remembered.set(`${uid}|${cfg.serviceId}`, cfg);
}

export function lastSellerConfig(uid: string, serviceId: string): SellerServiceConfig | null {
  return remembered.get(`${uid}|${serviceId}`) ?? null;
}

export function withRememberedNegotiation(uid: string, item: ManagedService): ManagedService {
  if (item.negotiationAllowed !== null) return item;
  const cfg = lastSellerConfig(uid, item.id);
  return cfg && cfg.negotiationAllowed !== null ? { ...item, negotiationAllowed: cfg.negotiationAllowed } : item;
}

export type SaveSellerServiceArgs = {
  scope: ServiceScope;
  locale: string;
  uid: string;
  persisted: ManagedService | null;
  input: ServiceInput;
  negotiation: boolean | null;
  runtime: RuntimeConfig | null;
  fallbackPrice: number;
};

export type SaveSellerServiceResult =
  | { ok: true; saved: ManagedService; created: boolean; config: SellerServiceConfig | null }
  | { ok: false; stage: "manage"; error: ServiceError; persisted: ManagedService | null; created: boolean }
  | { ok: false; stage: "config"; error: ConfigError; persisted: ManagedService; created: boolean; rolledBack: boolean };

const manageCall = (a: SaveSellerServiceArgs, input: ServiceInput) =>
  a.persisted ? updateManagedService(a.scope, input, a.locale) : addManagedService(a.scope, input, a.locale);

export async function saveSellerService(a: SaveSellerServiceArgs): Promise<SaveSellerServiceResult> {
  const created = !a.persisted;
  const self = a.scope.kind === "me";
  let saved: ManagedService;
  let usedFallback = false;
  let rangeError: ServiceError | null = null;
  try {
    saved = await manageCall(a, a.input);
  } catch (e) {
    const first = serviceErrorOf(e, a.locale);
    const canFallback =
      first.kind === "range" &&
      self &&
      a.runtime !== null &&
      priceVerdict(a.input.selectedPrice, a.runtime.pricing) === "ok" &&
      configSupport() !== "no" &&
      a.fallbackPrice > 0 &&
      a.fallbackPrice !== a.input.selectedPrice;
    if (!canFallback) return { ok: false, stage: "manage", error: first, persisted: a.persisted, created: false };
    try {
      saved = await manageCall(a, { ...a.input, selectedPrice: a.fallbackPrice });
      usedFallback = true;
      rangeError = first;
    } catch (e2) {
      const second = serviceErrorOf(e2, a.locale);
      return { ok: false, stage: "manage", error: second.kind === "range" ? first : second, persisted: a.persisted, created: false };
    }
  }
  if (!self || configSupport() === "no") return { ok: true, saved, created, config: null };
  try {
    const cfg = await updateSellerServiceConfig(saved.id, {
      enabled: a.input.status === "active",
      selectedPrice: a.input.selectedPrice > 0 ? a.input.selectedPrice : undefined,
      negotiationAllowed: a.negotiation ?? undefined,
    });
    support = "yes";
    rememberSellerConfig(a.uid, cfg.serviceId ? cfg : { ...cfg, serviceId: saved.id });
    return { ok: true, saved: applySellerConfig(saved, cfg), created, config: cfg };
  } catch (e) {
    if (isConfigUnsupported(e)) {
      if (usedFallback && rangeError) return { ok: false, stage: "manage", error: rangeError, persisted: saved, created };
      return { ok: true, saved, created, config: null };
    }
    const error = configErrorOf(e);
    const enabling = a.input.status === "active" && (created || a.persisted?.status !== "active");
    if (error.code === "service_rules_acceptance_required" && enabling) {
      try {
        const paused = await setManagedServiceStatus(a.scope, saved.id, "paused", a.locale);
        return { ok: false, stage: "config", error, persisted: paused, created, rolledBack: true };
      } catch {
        return { ok: false, stage: "config", error, persisted: saved, created, rolledBack: false };
      }
    }
    return { ok: false, stage: "config", error, persisted: saved, created, rolledBack: false };
  }
}
