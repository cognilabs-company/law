import type { SxCtorLayout, SxLayoutCtx, SxLayoutField, SxPayload, SxValues } from "../contract";
import type { SxErrors } from "../types";

export const DOC_CATEGORIES: readonly string[] = ["contract", "legal-doc-civil", "legal-doc-criminal", "legal-doc-economic", "legal-doc-administrative"];

const off = (path: string): SxLayoutField => ({ path, help: false });
const helpOf = (path: string, key: string): SxLayoutField => ({ path, help: key });
const labelOf = (path: string, key: string): SxLayoutField => ({ path, label: key });
const clears = (path: string, sibling: string): SxLayoutField => ({ path, clears: [sibling] });
const when = (path: string): SxLayoutField => ({ path, control: "datetime", help: false });

function titled(code: string, fields: readonly SxLayoutField[] = [], ownLabel = false): SxCtorLayout {
  const title: SxLayoutField = ownLabel ? { path: "title", label: `sx.field.${code}__title`, placeholder: `sx.ph.${code}__title` } : { path: "title", placeholder: `sx.ph.${code}__title` };
  return { code, fields: [title, ...fields] };
}

// K17 v3 (2026-10-27, TSK-342697): one tariff for one or more audiences;
// three prices (1 / 6 / 12 months) unless it is free; the numbered lines the
// client reads, in order; a note and deadline for the developers that never
// reach the client. The old types, per-feature toggles and trial are gone.
const K17_PRICES = ["monthly_price", "six_month_price", "yearly_price"] as const;
function k17Validate(payload: SxValues): SxErrors {
  const out: Record<string, string> = {};
  const free = payload.is_free === true;
  const priced = K17_PRICES.some((k) => {
    const n = Number(payload[k]);
    return payload[k] !== null && payload[k] !== undefined && payload[k] !== "" && Number.isFinite(n) && n > 0;
  });
  if (!free && !priced) out.monthly_price = "@code:k17_price_required";
  const lines = Array.isArray(payload.benefits) ? payload.benefits : [];
  const seen = new Set<string>();
  lines.forEach((row, i) => {
    const v = (typeof row === "string" ? row : row && typeof row === "object" ? String((row as Record<string, unknown>).value ?? "") : "").trim().toLowerCase();
    if (v && seen.has(v)) out[`benefits.${i}`] = "@code:benefit_duplicate";
    if (v) seen.add(v);
  });
  return out;
}

const isPaid = (ctx: SxLayoutCtx): boolean => ctx.root.is_free !== true;
const benefitText = (item: SxValues): string => {
  const v = (item as unknown as { value?: unknown }).value ?? item;
  return typeof v === "string" ? v : "";
};

function k17Layout(): SxCtorLayout {
  return {
    ...titled("K17", [
      {
        path: "audiences",
        control: "choicesMulti",
        columns: 2,
        choices: Object.fromEntries(["client", "advokat", "yurist", "organization"].map((k) => [k, { descriptionKey: `sx.optd.K17__audiences.${k}` }])),
        help: "sx.help.K17__audiences",
      },
      { path: "is_active", help: "sx.help.K17__is_active" },
      { path: "is_free", clears: [...K17_PRICES], help: "sx.help.K17__is_free" },
      ...K17_PRICES.map((path) => ({ path, visible: isPaid, span: 1 as const })),
      {
        path: "benefits",
        control: "repeater",
        addKey: "sx.add.K17__benefit",
        summary: (item: SxValues, i: number) => `${i + 1}. ${benefitText(item)}`,
        help: "sx.help.K17__benefits",
      },
      { path: "developer_note", help: "sx.help.K17__developer_note" },
      { path: "developer_deadline_at", help: "sx.help.K17__developer_deadline" },
    ], true),
    validate: k17Validate,
  };
}

// K36 (TSK-331025): a price coefficient built from ready criteria only —
// pick what it measures, the condition, the threshold that condition needs,
// and how much it raises the price. The backend owns the formula, the
// validation and the preview; nothing is worked out here.
const K36_CRITERIA = ["region", "lawyer_experience", "category_experience", "sector_experience", "lexgo_verified", "client_rating", "reviews_count", "wins_count", "success_rate", "response_time", "completion_rate", "substantiated_complaints", "super_lawyer"] as const;
const opIs = (...ops: string[]) => (ctx: SxLayoutCtx): boolean => ops.includes(String(ctx.root.operator ?? ""));
const categoryScoped = (ctx: SxLayoutCtx): boolean => ctx.root.criterion_type === "category_experience" || ctx.root.criterion_type === "sector_experience";
function k36Validate(payload: SxValues): SxErrors {
  const out: Record<string, string> = {};
  const op = String(payload.operator ?? "");
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  if ((op === "gte" || op === "lte" || op === "eq") && num(payload.threshold) === null) out.threshold = "@code:required";
  if (op === "between") {
    const lo = num(payload.range_min);
    const hi = num(payload.range_max);
    if (lo === null) out.range_min = "@code:required";
    if (hi === null) out.range_max = "@code:required";
    if (lo !== null && hi !== null && lo >= hi) out.range_max = "@code:k36_range_order";
  }
  if (op === "in" && !(Array.isArray(payload.allowed_values) && payload.allowed_values.length)) out.allowed_values = "@code:required";
  const pct = num(payload.increase_percent);
  if (pct !== null && (pct <= 0 || pct > 100)) out.increase_percent = "@code:k36_percent_range";
  return out;
}
function k36Layout(): SxCtorLayout {
  return {
    ...titled("K36", [
      { path: "coefficient_id", hidden: true },
      {
        path: "criterion_type",
        control: "choices",
        columns: 2,
        choices: Object.fromEntries(K36_CRITERIA.map((k) => [k, { descriptionKey: `sx.optd.K36__criterion_type.${k}` }])),
        help: "sx.help.K36__criterion_type",
      },
      { path: "operator", control: "choices", columns: 3, clears: ["threshold", "range_min", "range_max", "allowed_values"] },
      { path: "threshold", visible: opIs("gte", "lte", "eq") },
      { path: "range_min", visible: opIs("between"), span: 1 },
      { path: "range_max", visible: opIs("between"), span: 1 },
      { path: "allowed_values", visible: opIs("in"), help: "sx.help.K36__allowed_values" },
      { path: "unit", help: "sx.help.K36__unit" },
      { path: "increase_percent", help: "sx.help.K36__increase_percent" },
      { path: "category_id", visible: categoryScoped, span: 1 },
      { path: "subcategory_id", visible: categoryScoped, span: 1 },
    ], true),
    validate: k36Validate,
  };
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
  k17Layout(),
  record("K04", [labelOf("seller_requirements", "sx.field.K04__seller_requirements")]),
  record("K18"),
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
  k36Layout(),
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
