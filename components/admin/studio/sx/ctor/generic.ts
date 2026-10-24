import type { SxCtorLayout, SxLayoutField, SxPayload, SxValues } from "../contract";
import type { SxErrors } from "../types";

export const DOC_CATEGORIES: readonly string[] = ["contract", "legal-doc-civil", "legal-doc-criminal", "legal-doc-economic", "legal-doc-administrative"];

const off = (path: string): SxLayoutField => ({ path, help: false });
const helpOf = (path: string, key: string): SxLayoutField => ({ path, help: key });
const labelOf = (path: string, key: string): SxLayoutField => ({ path, label: key });
const clears = (path: string, sibling: string): SxLayoutField => ({ path, clears: [sibling] });
const when = (path: string): SxLayoutField => ({ path, control: "datetime", help: false });
const noPlaceholder = (path: string): SxLayoutField => ({ path, placeholder: false });
const noSlug: SxLayoutField = { path: "slug", hidden: true };

function titled(code: string, fields: readonly SxLayoutField[] = [], ownLabel = false): SxCtorLayout {
  const title: SxLayoutField = ownLabel ? { path: "title", label: `sx.field.${code}__title`, placeholder: `sx.ph.${code}__title` } : { path: "title", placeholder: `sx.ph.${code}__title` };
  return { code, fields: [title, ...fields] };
}

// A tariff's entitlements (contract §4): a feature once per tariff, and a
// limited one needs a positive limit. The backend checks the registry.
function k17Validate(payload: SxValues): SxErrors {
  const out: Record<string, string> = {};
  const rows = Array.isArray(payload.entitlements) ? payload.entitlements : [];
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const key = typeof r.feature_key === "string" ? r.feature_key.trim() : "";
    if (key && seen.has(key)) out[`entitlements.${i}.feature_key`] = "@code:entitlement_duplicate";
    if (key) seen.add(key);
    if (r.mode === "limited") {
      const n = Number(r.limit);
      if (!(r.limit !== null && r.limit !== undefined && r.limit !== "" && Number.isFinite(n) && n > 0)) out[`entitlements.${i}.limit`] = "@code:entitlement_limit_required";
    }
  });
  return out;
}

function record(code: string, fields: readonly SxLayoutField[] = []): SxCtorLayout {
  return { code, recordTitlePlaceholderKey: `sx.ph.${code}__recordTitle`, fields };
}

function withoutDocumentType(next: SxPayload): SxPayload {
  if (!Object.prototype.hasOwnProperty.call(next, "document_type")) return next;
  const out: SxPayload = { ...next };
  delete out.document_type;
  return out;
}

const LIST: readonly SxCtorLayout[] = [
  { ...record("K26", [{ path: "document_type", hidden: true }]), transform: withoutDocumentType },
  record("K11", [{ path: "terms", control: "richtext", help: false }, off("client_notice")]),
  record("K13"),
  record("K12-M"),
  record("MP05"),
  record("K27"),
  record("K14", [labelOf("messages.uz_latn.title", "sx.field.K14__messages__uz_latn__title"), labelOf("messages.uz_cyrl.title", "sx.field.K14__messages__uz_cyrl__title"), labelOf("messages.ru.title", "sx.field.K14__messages__ru__title")]),
  record("CALL01"),
  record("K22", [labelOf("base_price", "sx.field.K22__base_price")]),
  record("MP08"),
  { ...titled("K17", [noSlug, off("description")], true), validate: k17Validate },
  record("K04", [labelOf("seller_requirements", "sx.field.K04__seller_requirements")]),
  record("K18"),
  record("K25"),
  record("MP02"),
  record("MP03", [off("service_id")]),
  record("MP07", [off("eligibility.roles"), off("eligibility.regions")]),
  record("SEC01"),
  record("SEC02", [off("roles"), noPlaceholder("masking.phone"), noPlaceholder("masking.email")]),
  record("SEC03", [helpOf("duplicates.fields", "sx.help.SEC03__duplicates__fields")]),
  record("SEC04", [labelOf("quorum.all_required", "sx.field.SEC04__quorum__all_required")]),
  record("SEC05", [labelOf("extensions", "sx.field.SEC05__extensions"), off("preview.description")]),
  titled("K20", [off("steps"), clears("steps.*.assignee_type", "assignee_id")], true),
  record("K21", [off("roles"), off("regions")]),
  record("MP06"),
  record("OPS01", [off("roles"), off("regions"), when("starts_at"), when("ends_at")]),
  record("OPS02", [labelOf("retry", "sx.field.retry")]),
  record("OPS04"),
  record("OPS05", [labelOf("columns", "sx.field.OPS05__columns"), off("roles")]),
  record("OPS06", [off("roles")]),
  record("ORG01"),
  record("K23", [clears("routing_rules.*.target_type", "target_id"), clears("escalation_rules.*.target_type", "target_id")]),
  titled("K24", [
    labelOf("columns", "sx.field.K24__columns"),
    helpOf("transitions", "sx.help.transitions"),
    off("transitions.*.roles"),
    helpOf("duplicate_rules.fields", "sx.help.K24__duplicate_rules__fields"),
  ]),
  record("MP01"),
  record("MP10", [off("regions"), off("blackout_dates.*.starts_at"), off("blackout_dates.*.ends_at")]),
  record("K28", [labelOf("weights.category", "sx.field.K28__weights__category")]),
  record("K19", [
    off("service_id"),
    labelOf("hero.title", "sx.field.K19__hero__title"),
    off("faq.*.answer"),
    labelOf("seo.title", "sx.field.K19__seo__title"),
    off("seo.description"),
    labelOf("blocks.*.title", "sx.field.K19__blocks__title"),
    off("blocks.*.content"),
  ]),
  record("INT01", [labelOf("retry", "sx.field.retry")]),
  record("INT02", [labelOf("retry", "sx.field.retry")]),
  record("INT03"),
  titled("CORE"),
  record("K16", [off("language")]),
  record("OPS07"),
  record("OPS08", [helpOf("transitions", "sx.help.transitions"), off("transitions.*.roles")]),
  record("SEARCH01", [off("fields")]),
  titled("M1", [], true),
  record("M2"),
  titled("M3", [labelOf("exports.*.format", "sx.field.M3__exports__format")], true),
];

export const GENERIC_LAYOUTS: Readonly<Record<string, SxCtorLayout>> = Object.freeze(Object.fromEntries(LIST.map((l) => [l.code, l])));
