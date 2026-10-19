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
  placements: `${REF}promotion-placements`,
} as const;

const PLAN_PATHS: ReadonlySet<string> = new Set(["K26:plan_requirements.plan_ids", "MP07:eligibility.plan_ids", "MP09:eligibility.plan_ids"]);

const POLY: Readonly<Record<string, string>> = {
  "K08:steps.*.assignee_id": "assignee_type",
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
  if (c === "MP04" && p === "placement") return SRC.placements;
  if (!base) {
    if (ROLE_KEY.test(key)) return SRC.roles;
    if (own.call(LOCAL_FALLBACK, id)) return LOCAL_FALLBACK[id];
  }
  return base;
}

type Producer = { code: string; to: "new" | "list" };

export const SOURCE_PRODUCER: Readonly<Record<string, Producer>> = {
  "price-factors": { code: "K34", to: "new" },
  "client-guarantees": { code: "K32", to: "new" },
  checklists: { code: "K09", to: "new" },
  "package-eligibility-rules": { code: "K26", to: "new" },
  "service-categories": { code: "K01", to: "new" },
  services: { code: "K02", to: "list" },
  "service-packages": { code: "K03-M", to: "list" },
  "document-templates": { code: "K06", to: "new" },
  "consent-documents": { code: "K07", to: "new" },
  "promotion-packages": { code: "K12-PROMO", to: "list" },
  "subscription-plans": { code: "K17", to: "new" },
};

const NOT_READY: ReadonlySet<string> = new Set(["refund-policies"]);

export function producerOf(source: string): SxSourceProducer | null {
  const raw = String(source ?? "").trim();
  if (!raw) return null;
  const { key } = studioReferenceKey(raw);
  if (NOT_READY.has(key)) return { kind: "notReady" };
  if (!own.call(SOURCE_PRODUCER, key)) return null;
  const p = SOURCE_PRODUCER[key];
  const code = encodeURIComponent(p.code);
  return { kind: "create", code: p.code, href: p.to === "new" ? `/admin/studio/o/new?new=${code}` : `/admin/studio/c/${code}` };
}
