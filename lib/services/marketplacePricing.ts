import { ApiError, asDict, asNum, asStr, errDetail, http, isOffline, parseServerTime, type Dict } from "@/lib/http";
import { getPlatformPolicies, getPolicyHistory, putAdminPolicy, PRICING_POLICY_SECTION } from "@/lib/services/backend";
import { humanize, regionLabel } from "@/lib/labels";

export const PRICING_SECTION = PRICING_POLICY_SECTION;

const MISSING_TTL = 10 * 60 * 1000;

export type ExperienceTier = { minYears: number; maxYears: number; percent: number };
export type RegionCoef = { key: string; coef: number };
export type SellerPremium = { successRateMin: number; totalCasesMin: number; winsMin: number; ratingMin: number; reviewsMin: number; percent: number };
export type ClientRatingPremium = { ratingMin: number; reviewsMin: number; percent: number };
export type SectorPremium = { verifiedOnly: boolean; minYears: number; percent: number };

export type PricingPolicy = {
  minPercent: number;
  maxPercent: number;
  experience: ExperienceTier[];
  regions: RegionCoef[];
  seller: SellerPremium;
  client: ClientRatingPremium;
  sector: SectorPremium;
};

export const SELLER_FIELDS = ["successRateMin", "totalCasesMin", "winsMin", "ratingMin", "reviewsMin", "percent"] as const;
export const CLIENT_FIELDS = ["ratingMin", "reviewsMin", "percent"] as const;

const DEFAULT_POLICY: PricingPolicy = {
  minPercent: 70,
  maxPercent: 100,
  experience: [
    { minYears: 0, maxYears: 2, percent: 0 },
    { minYears: 3, maxYears: 5, percent: 10 },
    { minYears: 6, maxYears: 10, percent: 15 },
    { minYears: 11, maxYears: 99, percent: 20 },
  ],
  regions: [
    { key: "default", coef: 1 },
    { key: "toshkent", coef: 1.15 },
    { key: "tashkent", coef: 1.15 },
    { key: "samarqand", coef: 1.05 },
    { key: "samarkand", coef: 1.05 },
    { key: "remote", coef: 0.9 },
  ],
  seller: { successRateMin: 85, totalCasesMin: 20, winsMin: 50, ratingMin: 5, reviewsMin: 20, percent: 20 },
  client: { ratingMin: 4.8, reviewsMin: 10, percent: 10 },
  sector: { verifiedOnly: true, minYears: 5, percent: 30 },
};

export function clonePricingPolicy(p: PricingPolicy): PricingPolicy {
  return {
    minPercent: p.minPercent,
    maxPercent: p.maxPercent,
    experience: p.experience.map((t) => ({ ...t })),
    regions: p.regions.map((r) => ({ ...r })),
    seller: { ...p.seller },
    client: { ...p.client },
    sector: { ...p.sector },
  };
}

export const defaultPricingPolicy = (): PricingPolicy => clonePricingPolicy(DEFAULT_POLICY);

const isPlain = (v: unknown): v is Dict => !!v && typeof v === "object" && !Array.isArray(v);

function pick(d: Dict, keys: readonly string[]): unknown {
  for (const k of keys) {
    const v = d[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function numOr(v: unknown, fallback: number): number {
  if (v === undefined || typeof v === "boolean") return fallback;
  return asNum(v, fallback);
}

const numOf = (d: Dict, keys: readonly string[], fallback: number) => numOr(pick(d, keys), fallback);

function numOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === "" || typeof v === "boolean") return null;
  const n = asNum(v, NaN);
  return Number.isFinite(n) ? n : null;
}

function boolOf(d: Dict, keys: readonly string[], fallback: boolean): boolean {
  const v = pick(d, keys);
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "ha"].includes(s)) return true;
    if (["false", "0", "no"].includes(s)) return false;
  }
  return fallback;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const normRegionKey = (k: string) => k.trim().toLowerCase().replace(/\s+/g, " ");

function tierOf(v: unknown): ExperienceTier | null {
  if (!isPlain(v)) return null;
  const minYears = numOf(v, ["min_years", "from_years", "years_from", "from", "min"], NaN);
  const maxYears = numOf(v, ["max_years", "to_years", "years_to", "to", "max"], NaN);
  const mult = numOf(v, ["multiplier", "coefficient", "factor"], NaN);
  const percent = numOf(v, ["percent", "premium_percent", "pct", "value"], Number.isFinite(mult) ? round2((mult - 1) * 100) : NaN);
  if (!Number.isFinite(minYears) || !Number.isFinite(percent)) return null;
  return { minYears, maxYears: Number.isFinite(maxYears) ? maxYears : 99, percent };
}

function regionsOf(v: unknown): RegionCoef[] | null {
  const rows: RegionCoef[] = [];
  if (isPlain(v)) {
    for (const [k, c] of Object.entries(v)) {
      const coef = isPlain(c) ? numOf(c, ["multiplier", "coefficient", "coef", "value"], NaN) : numOr(c, NaN);
      rows.push({ key: normRegionKey(k), coef });
    }
  } else if (Array.isArray(v)) {
    for (const x of v) {
      const d = asDict(x);
      rows.push({ key: normRegionKey(asStr(pick(d, ["key", "region", "code", "name"]))), coef: numOf(d, ["multiplier", "coefficient", "coef", "value"], NaN) });
    }
  } else return null;
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (!r.key || !Number.isFinite(r.coef) || seen.has(r.key)) return false;
    seen.add(r.key);
    return true;
  });
}

export function readPricingPolicy(v: unknown): PricingPolicy | null {
  if (!isPlain(v) || !Object.keys(v).length) return null;
  const D = DEFAULT_POLICY;
  const expRaw = v.experience_multipliers ?? v.experience_tiers ?? v.experience;
  const experience = Array.isArray(expRaw) ? expRaw.map(tierOf).filter((t): t is ExperienceTier => t !== null) : null;
  const regions = regionsOf(v.region_multipliers ?? v.regions);
  const s = asDict(v.seller_premium);
  const c = asDict(v.client_rating_premium);
  const x = asDict(v.sector_experience_premium);
  return {
    minPercent: numOf(v, ["default_min_percent", "min_percent"], D.minPercent),
    maxPercent: numOf(v, ["default_max_percent", "max_percent"], D.maxPercent),
    experience: experience ?? D.experience.map((t) => ({ ...t })),
    regions: regions ?? D.regions.map((r) => ({ ...r })),
    seller: {
      successRateMin: numOf(s, ["success_rate_min"], D.seller.successRateMin),
      totalCasesMin: numOf(s, ["total_cases_min"], D.seller.totalCasesMin),
      winsMin: numOf(s, ["wins_min"], D.seller.winsMin),
      ratingMin: numOf(s, ["rating_min"], D.seller.ratingMin),
      reviewsMin: numOf(s, ["reviews_min"], D.seller.reviewsMin),
      percent: numOf(s, ["percent"], D.seller.percent),
    },
    client: {
      ratingMin: numOf(c, ["rating_min"], D.client.ratingMin),
      reviewsMin: numOf(c, ["reviews_min"], D.client.reviewsMin),
      percent: numOf(c, ["percent"], D.client.percent),
    },
    sector: {
      verifiedOnly: boolOf(x, ["verified_only"], D.sector.verifiedOnly),
      minYears: numOf(x, ["min_years"], D.sector.minYears),
      percent: numOf(x, ["percent"], D.sector.percent),
    },
  };
}

export function pricingPolicyBody(p: PricingPolicy, base: Dict = {}): Dict {
  const keep = (v: unknown): Dict => (isPlain(v) ? v : {});
  return {
    ...base,
    default_min_percent: p.minPercent,
    default_max_percent: p.maxPercent,
    experience_multipliers: p.experience.map((t) => ({ min_years: t.minYears, max_years: t.maxYears, percent: t.percent })),
    region_multipliers: Object.fromEntries(p.regions.map((r) => [normRegionKey(r.key), r.coef])),
    seller_premium: {
      ...keep(base.seller_premium),
      success_rate_min: p.seller.successRateMin,
      total_cases_min: p.seller.totalCasesMin,
      wins_min: p.seller.winsMin,
      rating_min: p.seller.ratingMin,
      reviews_min: p.seller.reviewsMin,
      percent: p.seller.percent,
    },
    client_rating_premium: {
      ...keep(base.client_rating_premium),
      rating_min: p.client.ratingMin,
      reviews_min: p.client.reviewsMin,
      percent: p.client.percent,
    },
    sector_experience_premium: {
      ...keep(base.sector_experience_premium),
      verified_only: p.sector.verifiedOnly,
      min_years: p.sector.minYears,
      percent: p.sector.percent,
    },
  };
}

export const samePricingPolicy = (a: PricingPolicy, b: PricingPolicy) => JSON.stringify(pricingPolicyBody(a)) === JSON.stringify(pricingPolicyBody(b));

type Bound = { min: number; max: number; int?: boolean };

export const PRICING_BOUNDS = {
  minPercent: { min: 1, max: 100 },
  maxPercent: { min: 1, max: 500 },
  years: { min: 0, max: 100, int: true },
  percent: { min: 0, max: 300 },
  coef: { min: 0.1, max: 5 },
  share: { min: 0, max: 100 },
  count: { min: 0, max: 100000, int: true },
  rating: { min: 0, max: 5 },
} satisfies Record<string, Bound>;

const SELLER_BOUND: Record<(typeof SELLER_FIELDS)[number], Bound> = {
  successRateMin: PRICING_BOUNDS.share,
  totalCasesMin: PRICING_BOUNDS.count,
  winsMin: PRICING_BOUNDS.count,
  ratingMin: PRICING_BOUNDS.rating,
  reviewsMin: PRICING_BOUNDS.count,
  percent: PRICING_BOUNDS.percent,
};

const CLIENT_BOUND: Record<(typeof CLIENT_FIELDS)[number], Bound> = {
  ratingMin: PRICING_BOUNDS.rating,
  reviewsMin: PRICING_BOUNDS.count,
  percent: PRICING_BOUNDS.percent,
};

export type PricingIssueCode = "required" | "range" | "int" | "minMax" | "rowMinMax" | "order" | "overlap" | "gap" | "duplicate" | "defaultMissing" | "emptyKey";

export type PricingIssue = { path: string; code: PricingIssueCode; warn: boolean; params: Record<string, string | number> };

export function pricingIssues(p: PricingPolicy): PricingIssue[] {
  const out: PricingIssue[] = [];
  const add = (path: string, code: PricingIssueCode, params: Record<string, string | number> = {}, warn = false) => out.push({ path, code, warn, params });
  const check = (path: string, v: number, b: Bound): boolean => {
    if (!Number.isFinite(v)) add(path, "required");
    else if (v < b.min || v > b.max) add(path, "range", { min: b.min, max: b.max });
    else if (b.int && !Number.isInteger(v)) add(path, "int");
    else return true;
    return false;
  };

  const okMin = check("minPercent", p.minPercent, PRICING_BOUNDS.minPercent);
  const okMax = check("maxPercent", p.maxPercent, PRICING_BOUNDS.maxPercent);
  if (okMin && okMax && p.minPercent > p.maxPercent) add("maxPercent", "minMax");

  const tiers = p.experience.map((t, i) => {
    const a = check(`exp.${i}.minYears`, t.minYears, PRICING_BOUNDS.years);
    const b = check(`exp.${i}.maxYears`, t.maxYears, PRICING_BOUNDS.years);
    check(`exp.${i}.percent`, t.percent, PRICING_BOUNDS.percent);
    const ok = a && b && t.minYears <= t.maxYears;
    if (a && b && !ok) add(`exp.${i}.maxYears`, "rowMinMax", { row: i + 1 });
    return { ...t, i, ok };
  });
  const valid = tiers.filter((t) => t.ok);
  if (valid.some((t, k) => k > 0 && valid[k - 1].minYears > t.minYears)) add("exp", "order");
  const sorted = [...valid].sort((a, b) => a.minYears - b.minYears || a.maxYears - b.maxYears);
  if (sorted.length && sorted[0].minYears > 0) add("exp", "gap", { from: 0, to: sorted[0].minYears - 1 }, true);
  for (let k = 1; k < sorted.length; k++) {
    const a = sorted[k - 1];
    const b = sorted[k];
    if (b.minYears <= a.maxYears) add(`exp.${b.i}.minYears`, "overlap", { a: Math.min(a.i, b.i) + 1, b: Math.max(a.i, b.i) + 1 });
    else if (b.minYears > a.maxYears + 1) add("exp", "gap", { from: a.maxYears + 1, to: b.minYears - 1 }, true);
  }

  const seen = new Set<string>();
  p.regions.forEach((r, i) => {
    const key = normRegionKey(r.key);
    if (!key) add(`regions.${i}.key`, "emptyKey", { row: i + 1 });
    else if (seen.has(key)) add(`regions.${i}.key`, "duplicate", { key });
    else seen.add(key);
    check(`regions.${i}.coef`, r.coef, PRICING_BOUNDS.coef);
  });
  if (!seen.has("default")) add("regions", "defaultMissing");

  for (const f of SELLER_FIELDS) check(`seller.${f}`, p.seller[f], SELLER_BOUND[f]);
  for (const f of CLIENT_FIELDS) check(`client.${f}`, p.client[f], CLIENT_BOUND[f]);
  check("sector.minYears", p.sector.minYears, PRICING_BOUNDS.years);
  check("sector.percent", p.sector.percent, PRICING_BOUNDS.percent);
  return out;
}

export type PricingChange = {
  field: string;
  key: string;
  years: [number, number] | null;
  from: number | boolean | null;
  to: number | boolean | null;
};

export function pricingChanges(prev: PricingPolicy, cur: PricingPolicy): PricingChange[] {
  const out: PricingChange[] = [];
  const scalar = (field: string, a: number | boolean, b: number | boolean) => {
    if (a !== b) out.push({ field, key: "", years: null, from: a, to: b });
  };
  scalar("minPercent", prev.minPercent, cur.minPercent);
  scalar("maxPercent", prev.maxPercent, cur.maxPercent);

  const tierKey = (t: ExperienceTier) => `${t.minYears}|${t.maxYears}`;
  const before = new Map(prev.experience.map((t) => [tierKey(t), t]));
  const after = new Map(cur.experience.map((t) => [tierKey(t), t]));
  for (const [k, t] of after) {
    const o = before.get(k);
    if (!o) out.push({ field: "exp", key: k, years: [t.minYears, t.maxYears], from: null, to: t.percent });
    else if (o.percent !== t.percent) out.push({ field: "exp", key: k, years: [t.minYears, t.maxYears], from: o.percent, to: t.percent });
  }
  for (const [k, t] of before) if (!after.has(k)) out.push({ field: "exp", key: k, years: [t.minYears, t.maxYears], from: t.percent, to: null });

  const rBefore = new Map(prev.regions.map((r) => [r.key, r.coef]));
  const rAfter = new Map(cur.regions.map((r) => [r.key, r.coef]));
  for (const [k, c] of rAfter) {
    const o = rBefore.get(k);
    if (o === undefined) out.push({ field: "region", key: k, years: null, from: null, to: c });
    else if (o !== c) out.push({ field: "region", key: k, years: null, from: o, to: c });
  }
  for (const [k, c] of rBefore) if (!rAfter.has(k)) out.push({ field: "region", key: k, years: null, from: c, to: null });

  for (const f of SELLER_FIELDS) scalar(`seller.${f}`, prev.seller[f], cur.seller[f]);
  for (const f of CLIENT_FIELDS) scalar(`client.${f}`, prev.client[f], cur.client[f]);
  scalar("sector.verifiedOnly", prev.sector.verifiedOnly, cur.sector.verifiedOnly);
  scalar("sector.minYears", prev.sector.minYears, cur.sector.minYears);
  scalar("sector.percent", prev.sector.percent, cur.sector.percent);
  return out;
}

let saveMissing = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const gateListeners = new Set<() => void>();

function setSaveMissing(v: boolean): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (v) saveTimer = setTimeout(() => setSaveMissing(false), MISSING_TTL);
  if (saveMissing === v) return;
  saveMissing = v;
  gateListeners.forEach((fn) => fn());
}

export const pricingSaveMissing = (): boolean => saveMissing;

export function subscribePricingGate(fn: () => void): () => void {
  gateListeners.add(fn);
  return () => {
    gateListeners.delete(fn);
  };
}

export const isMissingStatus = (e: unknown): boolean => e instanceof ApiError && (e.status === 404 || e.status === 405 || e.status === 501);

export type AdminPricing = { policy: PricingPolicy; present: boolean; raw: Dict };

export async function getAdminPricing(signal?: AbortSignal): Promise<AdminPricing> {
  const d = asDict(await http("/admin/platform/policies", { signal }));
  const items = asDict(d.items ?? d.sections ?? d);
  const raw = items[PRICING_SECTION];
  const policy = readPricingPolicy(raw);
  if (policy && isPlain(raw)) {
    setSaveMissing(false);
    return { policy, present: true, raw };
  }
  return { policy: defaultPricingPolicy(), present: false, raw: {} };
}

export async function saveAdminPricing(p: PricingPolicy, base: Dict): Promise<void> {
  try {
    await putAdminPolicy(PRICING_SECTION, pricingPolicyBody(p, base));
  } catch (e) {
    if (isMissingStatus(e)) setSaveMissing(true);
    throw e;
  }
  setSaveMissing(false);
}

export type PricingSaveFailure = { kind: "missing" | "invalid" | "forbidden" | "offline" | "unknown"; detail: string };

export function pricingSaveFailure(e: unknown): PricingSaveFailure {
  if (isMissingStatus(e)) return { kind: "missing", detail: "" };
  if (e instanceof ApiError && e.status === 403) return { kind: "forbidden", detail: "" };
  if (e instanceof ApiError && (e.status === 400 || e.status === 422)) {
    const fields = Object.entries(e.fieldErrors)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");
    return { kind: "invalid", detail: errDetail(e) || fields };
  }
  if (isOffline(e)) return { kind: "offline", detail: "" };
  return { kind: "unknown", detail: errDetail(e) };
}

export type PricingVersion = { id: string; version: string; at: number; policy: PricingPolicy | null; previous: PricingPolicy | null };

const looksLikePolicy = (d: Dict) => ["default_min_percent", "default_max_percent", "experience_multipliers", "region_multipliers"].some((k) => k in d);

export async function getPricingHistory(): Promise<PricingVersion[]> {
  const rows = await getPolicyHistory(PRICING_SECTION);
  return rows
    .map((h, i) => {
      const d = h.data;
      const cur = d.current ?? d.policy ?? d.after ?? (looksLikePolicy(d) ? d : null);
      const version = asStr(d.version).trim() || (/^\d+$/.test(h.version) ? h.version : "");
      return {
        id: `${h.version || "v"}-${i}`,
        version,
        at: parseServerTime(h.at),
        policy: readPricingPolicy(cur),
        previous: readPricingPolicy(d.previous ?? d.before),
      };
    })
    .sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0) || (b.at || 0) - (a.at || 0));
}

let publicInflight: Promise<PricingPolicy | null> | null = null;

export function getPublicPricingPolicy(): Promise<PricingPolicy | null> {
  if (publicInflight) return publicInflight;
  const p = getPlatformPolicies().then((x) => readPricingPolicy(x.raw[PRICING_SECTION]));
  publicInflight = p;
  const done = () => {
    if (publicInflight === p) publicInflight = null;
  };
  p.then(done, done);
  return p;
}

export type PriceModifier = {
  code: string;
  key: string;
  label: string;
  percent: number | null;
  multiplier: number | null;
  amount: number | null;
  minYears: number | null;
  maxYears: number | null;
  years: number | null;
};

const MOD_CODES = new Set(["region", "experience", "seller_premium", "client_rating_premium", "sector_experience_premium", "referral", "discount"]);

const MOD_ALIASES: Record<string, string> = {
  region_multiplier: "region",
  region_coefficient: "region",
  hudud: "region",
  experience_multiplier: "experience",
  experience_premium: "experience",
  tajriba: "experience",
  seller: "seller_premium",
  super_seller: "seller_premium",
  premium: "seller_premium",
  client_rating: "client_rating_premium",
  rating_premium: "client_rating_premium",
  rating: "client_rating_premium",
  sector: "sector_experience_premium",
  sector_experience: "sector_experience_premium",
  domain_premium: "sector_experience_premium",
  referral_discount: "referral",
};

const codeOf = (s: string) => {
  const c = s.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return MOD_ALIASES[c] ?? c;
};

function labelOf(v: unknown, locale: string): string {
  if (typeof v === "string") return v.trim();
  if (isPlain(v)) return asStr(v[locale] ?? v.uz ?? v.ru ?? v.en).trim();
  return "";
}

const emptyModifier = (code: string, key = ""): PriceModifier => ({
  code,
  key,
  label: "",
  percent: null,
  multiplier: null,
  amount: null,
  minYears: null,
  maxYears: null,
  years: null,
});

function modifierOf(v: unknown, locale: string, hint: string): PriceModifier | null {
  if (typeof v === "string") return v.trim() ? emptyModifier(codeOf(v)) : null;
  if (typeof v === "number" && hint) {
    const m = emptyModifier(codeOf(hint));
    if (m.code === "region" || (v > 0 && v < 3 && !Number.isInteger(v))) m.multiplier = v;
    else m.percent = v;
    return m;
  }
  if (!isPlain(v)) return null;
  const typeRaw = asStr(pick(v, ["type", "code", "kind", "modifier"])).trim();
  const keyRaw = asStr(pick(v, ["key", "region", "region_key", "tier"])).trim();
  let code = codeOf(typeRaw || hint || keyRaw || asStr(v.name));
  let key = typeRaw || hint ? keyRaw : "";
  const multiplier0 = numOrNull(pick(v, ["multiplier", "coefficient", "coef", "factor"]));
  if (!typeRaw && !hint && keyRaw && !MOD_CODES.has(code) && multiplier0 !== null) {
    code = "region";
    key = keyRaw;
  }
  if (!code) return null;
  const m = emptyModifier(code, key);
  m.label = labelOf(pick(v, [`label_${locale}`, "label", "title", "display_name"]), locale);
  m.percent = numOrNull(pick(v, ["percent", "percentage", "pct", "premium_percent"]));
  m.multiplier = multiplier0;
  m.amount = numOrNull(pick(v, ["amount", "delta", "amount_delta"]));
  m.minYears = numOrNull(v.min_years);
  m.maxYears = numOrNull(v.max_years);
  m.years = numOrNull(pick(v, ["years", "experience_years"]));
  const value = numOrNull(v.value);
  if (m.percent === null && m.multiplier === null && value !== null) {
    const unit = asStr(pick(v, ["unit", "value_type", "mode"])).trim().toLowerCase();
    if (unit === "percent" || unit === "%" || unit === "pct") m.percent = value;
    else if (["multiplier", "x", "coefficient", "coef", "factor"].includes(unit) || code === "region") m.multiplier = value;
    else if (value > 0 && value < 3 && !Number.isInteger(value)) m.multiplier = value;
    else m.percent = value;
  }
  return m;
}

export function readPriceModifiers(v: unknown, locale = "uz"): PriceModifier[] {
  if (Array.isArray(v)) return v.map((x) => modifierOf(x, locale, "")).filter((m): m is PriceModifier => m !== null);
  if (isPlain(v)) return Object.entries(v).map(([k, x]) => modifierOf(x, locale, k)).filter((m): m is PriceModifier => m !== null);
  return [];
}

export type ModifierTone = "up" | "down" | "flat";

const trimNum = (n: number) => String(Math.round(n * 10) / 10);

export function modifierEffect(m: PriceModifier): { text: string; tone: ModifierTone } | null {
  const usePercent = m.percent !== null && (m.code !== "region" || m.multiplier === null);
  if (usePercent && m.percent !== null) {
    const p = m.percent;
    return { text: p > 0 ? `+${trimNum(p)}%` : p < 0 ? `−${trimNum(-p)}%` : "0%", tone: p > 0 ? "up" : p < 0 ? "down" : "flat" };
  }
  if (m.multiplier !== null) {
    const x = m.multiplier;
    return { text: `×${x.toFixed(2)}`, tone: x > 1 ? "up" : x < 1 ? "down" : "flat" };
  }
  return null;
}

export const isNeutralModifier = (m: PriceModifier) => {
  const e = modifierEffect(m);
  return !e || e.tone === "flat";
};

export type Translate = ((key: string, values?: Record<string, string | number | Date>) => string) & { has: (key: string) => boolean };

export function regionName(key: string, t: Translate, te: Translate): string {
  const k = normRegionKey(key);
  if (!k) return "";
  if (t.has(`region.${k}`)) return t(`region.${k}`);
  const known = regionLabel(te, k);
  return known && known !== k ? known : "";
}

export function modifierLabel(m: PriceModifier, t: Translate, te: Translate): string {
  if (m.label) return m.label;
  if (m.code === "region") {
    const k = normRegionKey(m.key);
    return (k && k !== "default" ? regionName(k, t, te) || humanize(k) : "") || t("mod.region");
  }
  if (m.code === "experience") {
    if (m.minYears !== null && m.maxYears !== null) {
      return m.maxYears >= 99 ? t("mod.experienceFrom", { min: m.minYears }) : t("mod.experienceRange", { min: m.minYears, max: m.maxYears });
    }
    if (m.years !== null) return t("mod.experienceYears", { n: m.years });
    return t("mod.experience");
  }
  if (t.has(`mod.${m.code}`)) return t(`mod.${m.code}`);
  return humanize(m.code) || t("mod.other");
}

export function tierLabel(tier: ExperienceTier, t: Translate): string {
  return tier.maxYears >= 99 ? t("tierFrom", { min: tier.minYears }) : t("tierRange", { min: tier.minYears, max: tier.maxYears });
}
