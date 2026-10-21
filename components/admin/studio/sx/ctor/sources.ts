import { studioReferenceKey } from "@/lib/services/studio";
import type { SxSourceProducer, SxValues } from "../contract";

const REF = "/studio/reference/";
const SRC = {
  services: `${REF}services`,
  categories: `${REF}service-categories`,
  plans: `${REF}subscription-plans`,
  roles: `${REF}roles`,
  users: `${REF}users`,
  units: `${REF}organization-units`,
  permissions: `${REF}permissions`,
} as const;

const PLAN_PATHS: ReadonlySet<string> = new Set(["K26:plan_requirements.plan_ids", "MP07:eligibility.plan_ids", "MP09:eligibility.plan_ids"]);

const POLY: Readonly<Record<string, string>> = {
  "K20:steps.*.assignee_id": "assignee_type",
  "K10:escalation_rules.*.target_id": "target_type",
  "K23:escalation_rules.*.target_id": "target_type",
  "K23:routing_rules.*.target_id": "target_type",
};

const POLY_SOURCE: Readonly<Record<string, string>> = {
  user: SRC.users,
  role: SRC.roles,
  organization_unit: SRC.units,
  permission: SRC.permissions,
};

const REMOTE_FALLBACK: Readonly<Record<string, string>> = {
  "MP09:package_ids": `${REF}promotion-packages`,
  "K10:holiday_id": `${REF}business-holidays`,
};

const LOCAL_FALLBACK: Readonly<Record<string, string>> = {
  "K03-M:package_id": "local:service-packages",
  "K07:document_id": "local:consent-documents",
  "M2:object_id": "local:studio-objects",
};

const PENDING_PATHS: ReadonlySet<string> = new Set(["K02:document_template_id"]);
export const PENDING_PARAM = "include_pending";

const ROLE_KEY = /^(role|roles)$|_roles?$/;
const own = Object.prototype.hasOwnProperty;
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export function withPending(source: string): string {
  const raw = String(source ?? "").trim();
  if (!raw || raw.startsWith("local:")) return raw;
  const [path, query = ""] = raw.split("?");
  const params = new URLSearchParams(query);
  if (params.get(PENDING_PARAM) === "true") return raw;
  params.set(PENDING_PARAM, "true");
  return `${path}?${params}`;
}

function normPattern(pattern: string): string {
  return String(pattern ?? "")
    .replace(/\[(\d+|\*)\]/g, ".$1")
    .split(".")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (/^\d+$/.test(s) ? "*" : s))
    .join(".");
}

export function fieldSource(code: string, pattern: string, scope: SxValues, schemaSource: string): string {
  const c = String(code ?? "").trim().toUpperCase();
  const p = normPattern(pattern);
  const id = `${c}:${p}`;
  const sc: SxValues = scope ?? {};
  const base = String(schemaSource ?? "").trim();
  const key = p.split(".").pop() ?? "";

  if (PLAN_PATHS.has(id)) return SRC.plans;
  if (own.call(POLY, id)) {
    const t = str(sc[POLY[id]]).toLowerCase();
    return t && own.call(POLY_SOURCE, t) ? POLY_SOURCE[t] : "";
  }
  if (!base) {
    if (ROLE_KEY.test(key)) return SRC.roles;
    if (own.call(REMOTE_FALLBACK, id)) return REMOTE_FALLBACK[id];
    if (own.call(LOCAL_FALLBACK, id)) return LOCAL_FALLBACK[id];
  }
  return PENDING_PATHS.has(id) ? withPending(base) : base;
}

type Producer = { code: string; to: "new" | "list" };

export const SOURCE_PRODUCER: Readonly<Record<string, Producer>> = {
  "price-factors": { code: "K34", to: "new" },
  "client-guarantees": { code: "K32", to: "new" },
  "service-categories": { code: "K01", to: "new" },
  services: { code: "K02", to: "list" },
  "service-packages": { code: "K03-M", to: "list" },
  "document-templates": { code: "K06", to: "new" },
  "consent-documents": { code: "K07", to: "new" },
  "promotion-packages": { code: "K12-PROMO", to: "list" },
  "subscription-plans": { code: "K17", to: "new" },
  "service-rules": { code: "K31", to: "new" },
};

const INLINE_CODES: ReadonlySet<string> = new Set(["K34", "K31", "K32"]);
const INLINE_FIELDS: Readonly<Record<string, string>> = {
  price_factor_ids: "K34",
  rule_ids: "K31",
  guarantee_ids: "K32",
};
const INLINE_BY_FIELD: Readonly<Record<string, string>> = { document_template_id: "K06" };

export function inlineCodeOf(source: string, pattern: string): string {
  const field = normPattern(pattern);
  if (own.call(INLINE_BY_FIELD, field)) return INLINE_BY_FIELD[field];
  const raw = String(source ?? "").trim();
  if (raw && !raw.startsWith("local:")) {
    const { key } = studioReferenceKey(raw);
    if (own.call(SOURCE_PRODUCER, key)) {
      const code = SOURCE_PRODUCER[key].code;
      return INLINE_CODES.has(code) ? code : "";
    }
  }
  const p = normPattern(pattern);
  return !p.includes(".") && own.call(INLINE_FIELDS, p) ? INLINE_FIELDS[p] : "";
}

const NO_PRODUCER: ReadonlySet<string> = new Set(["refund-policies"]);
export const ELIGIBILITY_SOURCE_KEY = "package-eligibility-rules";
const ELIGIBILITY_TARGET = /(package|tier|tarif).*(eligib|condition|criteria)|(eligib|condition|criteria).*(package|tier|tarif)/;
const ELIGIBILITY_CODE = "K35";

export type ProducerCtor = { code: string; runtimeTarget: string; title?: string };

export function eligibilityProducerOf(items: readonly ProducerCtor[]): string {
  const target = (c: ProducerCtor) => String(c.runtimeTarget ?? "").trim().toLowerCase();
  const byTarget = items.find((c) => ELIGIBILITY_TARGET.test(target(c)));
  if (byTarget) return byTarget.code;
  const byCode = items.find((c) => c.code.trim().toUpperCase() === ELIGIBILITY_CODE && (!target(c) || /eligib|tier|tarif/.test(`${target(c)} ${String(c.title ?? "").toLowerCase()}`)));
  return byCode?.code ?? "";
}

export function isEligibilitySource(source: string): boolean {
  const raw = String(source ?? "").trim();
  return !!raw && !raw.startsWith("local:") && studioReferenceKey(raw).key === ELIGIBILITY_SOURCE_KEY;
}

export function producerOf(source: string, items: readonly ProducerCtor[] = []): SxSourceProducer | null {
  const raw = String(source ?? "").trim();
  if (!raw) return null;
  const { key } = studioReferenceKey(raw);
  if (NO_PRODUCER.has(key)) return { kind: "notReady" };
  if (key === ELIGIBILITY_SOURCE_KEY) {
    const found = eligibilityProducerOf(items);
    return found ? { kind: "create", code: found, href: `/admin/studio/o/new?new=${encodeURIComponent(found)}` } : { kind: "notReady" };
  }
  if (!own.call(SOURCE_PRODUCER, key)) return null;
  const p = SOURCE_PRODUCER[key];
  const code = encodeURIComponent(p.code);
  return { kind: "create", code: p.code, href: p.to === "new" ? `/admin/studio/o/new?new=${code}` : `/admin/studio/c/${code}` };
}
