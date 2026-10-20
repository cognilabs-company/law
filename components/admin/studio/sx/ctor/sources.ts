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

const ROLE_KEY = /^(role|roles)$|_roles?$/;
const own = Object.prototype.hasOwnProperty;
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

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
  return base;
}

type Producer = { code: string; to: "new" | "list" };

export const SOURCE_PRODUCER: Readonly<Record<string, Producer>> = {
  "price-factors": { code: "K34", to: "new" },
  "client-guarantees": { code: "K32", to: "new" },
  "package-eligibility-rules": { code: "K26", to: "new" },
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

export function inlineCodeOf(source: string, pattern: string): string {
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

export function producerOf(source: string): SxSourceProducer | null {
  const raw = String(source ?? "").trim();
  if (!raw) return null;
  const { key } = studioReferenceKey(raw);
  if (NO_PRODUCER.has(key)) return { kind: "notReady" };
  if (!own.call(SOURCE_PRODUCER, key)) return null;
  const p = SOURCE_PRODUCER[key];
  const code = encodeURIComponent(p.code);
  return { kind: "create", code: p.code, href: p.to === "new" ? `/admin/studio/o/new?new=${code}` : `/admin/studio/c/${code}` };
}
