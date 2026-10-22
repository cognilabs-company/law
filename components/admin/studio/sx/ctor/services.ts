import type { SxCtorLayout, SxLayoutCtx, SxLayoutField, SxPayload, SxTransformCtx, SxValues } from "../contract";
import { FIELD_TYPE_ICON, BadgeCheckIcon, BriefcaseBusinessIcon, CalendarDaysIcon, ClockIcon, CoinsIcon, CrownIcon, FileQuestionMarkIcon, FileTextIcon, FileXIcon, FolderOpenIcon, GavelIcon, GlobeIcon, HeadsetIcon, LayersIcon, LockIcon, MedalIcon, PackageIcon, PercentIcon, RefreshCwIcon, ScaleIcon, ShieldCheckIcon } from "../icons";
import { INTAKE, INTAKE_CHOICE_KEYS, INTAKE_HIDDEN_KEYS, INTAKE_PLACEHOLDER, INTAKE_REQUIRED_KEYS, INTAKE_TEXT_KEYS, INTAKE_TYPE_KEYS, SERVICE_TERMS, intakeQuestionOf, intakeTidy, intakeTypeOf, showIntakeChoices } from "../schema/k02/intake";
import { k02FormValidate, k02Prune, k03mPrune, k03mValidate } from "../schema/k02/model";
import type { SxErrors, SxIcon } from "../types";
import type { StudioLabels } from "../useStudioLabels";
import { GUARANTEE_ICONS } from "./guaranteeIcons";

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const numOf = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const amountControl = (v: unknown): "percent" | "money" => (str(v) === "percent" ? "percent" : "money");
const adjustmentMeta = (item: SxValues, labels: StudioLabels): string => {
  const n = numOf(item.value);
  if (n === null) return "";
  return str(item.adjustment_type) === "percent" ? `+${labels.num(n)}%` : `+${labels.money(n)}`;
};

const ADJUSTMENT_CHOICES = {
  fixed: { icon: CoinsIcon, descriptionKey: "sx.optd.adjustment_type.fixed" },
  percent: { icon: PercentIcon, descriptionKey: "sx.optd.adjustment_type.percent" },
} as const;

const K32_ICONS: Readonly<Record<string, SxIcon>> = {
  "shield-check": ShieldCheckIcon,
  "badge-check": BadgeCheckIcon,
  headphones: HeadsetIcon,
  "rotate-ccw": RefreshCwIcon,
  clock: ClockIcon,
  "lock-keyhole": LockIcon,
};
const guaranteeIcon = (v: string): SxIcon | undefined => K32_ICONS[v] ?? GUARANTEE_ICONS.find((g) => g.key === v)?.icon;

export const K01_LAYOUT: SxCtorLayout = {
  code: "K01",
  sections: [
    { id: "asosiy", titleKey: "sx.section.asosiy", fields: ["title", "parent_id", "discovery_terms"] },
    { id: "faollik_va_muddat", titleKey: "sx.section.faollik_va_muddat", fields: ["is_active"] },
  ],
  fields: [
    { path: "title", placeholder: "sx.ph.K01__title" },
    { path: "parent_id", label: "sx.field.K01__parent_id" },
    { path: "slug", hidden: true },
    { path: "discovery_terms", aiSuggest: true },
  ],
};

// A new category is created as one of two kinds, chosen before the form
// opens. A top-level category has no parent: the field is gone and the key
// never reaches the request. A subcategory cannot be saved without its
// parent, which comes first in the form.
export type CategoryKind = "root" | "sub";

const withoutParent = (next: SxPayload): SxPayload => {
  if (!("parent_id" in next)) return next;
  const out = { ...next };
  delete out.parent_id;
  return out;
};

const K01_ROOT_LAYOUT: SxCtorLayout = {
  ...K01_LAYOUT,
  sections: [
    { id: "asosiy", titleKey: "sx.section.asosiy", fields: ["title", "discovery_terms"] },
    { id: "faollik_va_muddat", titleKey: "sx.section.faollik_va_muddat", fields: ["is_active"] },
  ],
  fields: [
    { path: "title", placeholder: "sx.ph.K01__title" },
    { path: "parent_id", hidden: true },
    { path: "slug", hidden: true },
    { path: "discovery_terms", aiSuggest: true },
  ],
  transform: withoutParent,
};

const K01_SUB_LAYOUT: SxCtorLayout = {
  ...K01_LAYOUT,
  sections: [
    { id: "asosiy", titleKey: "sx.section.asosiy", fields: ["parent_id", "title", "discovery_terms"] },
    { id: "faollik_va_muddat", titleKey: "sx.section.faollik_va_muddat", fields: ["is_active"] },
  ],
  fields: [
    { path: "parent_id", label: "sx.k01kind.parent", help: "sx.k01kind.parentHelp", required: true },
    { path: "title", placeholder: "sx.k01kind.subTitlePh" },
    { path: "slug", hidden: true },
    { path: "discovery_terms", aiSuggest: true },
  ],
  validate: (payload): SxErrors => (str(payload.parent_id) ? {} : { parent_id: "@required" }),
};

export function k01LayoutOf(kind: CategoryKind): SxCtorLayout {
  return kind === "root" ? K01_ROOT_LAYOUT : K01_SUB_LAYOUT;
}

export const K34_LAYOUT: SxCtorLayout = {
  code: "K34",
  sections: [{ id: "K34__factor", titleKey: "sx.section.K34__factor", fields: ["title", "adjustment_type", "value", "description", "discovery_terms", "is_active"] }],
  fields: [
    { path: "title", placeholder: "sx.ph.K34__title" },
    { path: "adjustment_type", control: "choices", columns: 2, choices: ADJUSTMENT_CHOICES },
    { path: "value", control: ({ root }) => amountControl(root.adjustment_type), help: "sx.help.K34__value" },
    { path: "description", help: false },
  ],
};

export const K31_LAYOUT: SxCtorLayout = {
  code: "K31",
  sections: [
    { id: "asosiy", titleKey: "sx.section.asosiy", fields: ["title", "rule_key", "version", "scope_type", "service_id", "category_id", "effective_at", "seller_selectable"] },
    { id: "kontent", titleKey: "sx.section.kontent", fields: ["body"] },
    { id: "faollik_va_muddat", titleKey: "sx.section.faollik_va_muddat", fields: ["is_active"] },
  ],
  fields: [
    { path: "title", placeholder: "sx.ph.K31__title" },
    { path: "rule_key", control: "mono", placeholder: "sx.ph.K31__rule_key", help: "sx.help.K31__rule_key", locked: (ctx) => (ctx.recordId ? "sx.k31.ruleKeyLocked" : false) },
    { path: "version", placeholder: "sx.ph.K31__version", help: "sx.help.K31__version" },
    {
      path: "scope_type",
      control: "choices",
      columns: 3,
      clears: ["service_id", "category_id"],
      choices: {
        global: { icon: GlobeIcon, descriptionKey: "sx.optd.K31__scope_type.global" },
        service: { icon: BriefcaseBusinessIcon, descriptionKey: "sx.optd.K31__scope_type.service" },
        category: { icon: FolderOpenIcon, descriptionKey: "sx.optd.K31__scope_type.category" },
      },
    },
    { path: "effective_at", control: "datetime" },
    { path: "body", control: "richtext", help: false },
  ],
  newVersion: { focus: "version" },
};

export const K32_LAYOUT: SxCtorLayout = {
  code: "K32",
  fields: [
    { path: "title", placeholder: "sx.ph.K32__title" },
    { path: "description", help: false },
    {
      path: "icon",
      control: "picker",
      optionKey: (v) => (K32_ICONS[v] ? `sx.opt.K32__icon.${v}` : (GUARANTEE_ICONS.find((g) => g.key === v)?.labelKey ?? "")),
      optionIcon: guaranteeIcon,
      help: "sx.help.K32__icon",
    },
    { path: "refund_policy_id" },
    { path: "conditions", flatten: true },
  ],
};

export const K33_LAYOUT: SxCtorLayout = {
  code: "K33",
  fields: [
    { path: "title", placeholder: "sx.ph.K33__title" },
    { path: "guarantee_ids", control: "pickerMulti", help: "sx.help.K33__guarantee_ids" },
    { path: "placements", control: "pickerMulti" },
    { path: "conditions", flatten: true },
  ],
};

const NO_EXECUTOR: ReadonlySet<string> = new Set(["none", "null", "undefined"]);

const INTAKE_TYPE_ALIAS: Readonly<Record<string, string>> = {
  long_text: "textarea",
  single_choice: "select",
  choice: "select",
  radio: "select",
  dropdown: "select",
  multiple_choice: "multiselect",
  multi_select: "multiselect",
  checkbox: "multiselect",
  checkboxes: "multiselect",
  yes_no: "boolean",
  phone: "text",
};
const intakeTypeIcon = (v: string): SxIcon | undefined => FIELD_TYPE_ICON[INTAKE_TYPE_ALIAS[v] ?? v];

const intakeTypeLabel = (v: string, labels: StudioLabels): string => labels.option(v, { ctor: "K02", field: "intake_type" });
const intakeMeta = (item: SxValues, _i: number, labels: StudioLabels): string => {
  const type = intakeTypeOf(item);
  return type ? intakeTypeLabel(type, labels) : "";
};

const INTAKE_FIELDS: readonly SxLayoutField[] = [
  {
    path: INTAKE,
    control: "repeater",
    label: "sx.k02.field.intake_questions",
    help: "sx.k02.help.intake_questions",
    addKey: "sx.k02.iq.add",
    emptyKey: "sx.k02.iq.empty",
    summary: (item) => intakeQuestionOf(item),
    meta: intakeMeta,
  },
  ...INTAKE_HIDDEN_KEYS.map((k): SxLayoutField => ({ path: `${INTAKE}.*.${k}`, hidden: true })),
  ...INTAKE_TEXT_KEYS.map((k): SxLayoutField => ({ path: `${INTAKE}.*.${k}`, control: "text", label: "sx.k02.iq.question", placeholder: "sx.k02.iq.questionPh", help: false, span: 2 })),
  ...INTAKE_TYPE_KEYS.map((k): SxLayoutField => ({ path: `${INTAKE}.*.${k}`, control: "picker", label: "sx.k02.iq.type", optionLabel: intakeTypeLabel, optionIcon: intakeTypeIcon, help: false, span: 1 })),
  ...INTAKE_REQUIRED_KEYS.map((k): SxLayoutField => ({ path: `${INTAKE}.*.${k}`, label: "sx.k02.iq.required", help: "sx.k02.iq.requiredHelp", span: 1 })),
  { path: `${INTAKE}.*.${INTAKE_PLACEHOLDER}`, control: "text", label: "sx.k02.iq.placeholder", placeholder: "sx.k02.iq.placeholderPh", help: "sx.k02.iq.placeholderHelp", span: 2 },
  ...INTAKE_CHOICE_KEYS.map((k): SxLayoutField => ({ path: `${INTAKE}.*.${k}`, label: "sx.k02.iq.choices", help: "sx.k02.iq.choicesHelp", addKey: "sx.k02.iq.addChoice", visible: ({ scope, code }) => showIntakeChoices(scope, code) })),
];

export function k02Transform(next: SxPayload, prev: SxValues = {}, ctx?: SxTransformCtx): SxPayload {
  const pruned = intakeTidy(k02Prune(next, prev), prev, ctx?.code || "K02");
  const v = pruned.executor_type;
  if (typeof v !== "string" || !NO_EXECUTOR.has(v.trim().toLowerCase())) return pruned;
  const out: SxPayload = { ...pruned };
  delete out.executor_type;
  return out;
}

const hasFactors = (ctx: SxLayoutCtx): boolean => Array.isArray(ctx.scope.price_factor_ids) && ctx.scope.price_factor_ids.length > 0;

export const K02_LAYOUT: SxCtorLayout = {
  code: "K02",
  sections: [
    { id: "asosiy", titleKey: "sx.section.asosiy", fields: ["title", "category_id", "description", "client_value", "executor_type"] },
    { id: "K02__price", titleKey: "sx.section.K02__price", fields: ["base_price", "max_price", "price_factor_ids", "price_factor_overrides", "negotiation_allowed"] },
    { id: "K02__requirements", titleKey: "sx.section.K02__requirements", fields: ["seller_requirements"] },
    { id: "K02__intake", titleKey: "sx.section.K02__intake", fields: [INTAKE] },
    { id: "K02__delivery", titleKey: "sx.section.K02__delivery", fields: ["duration_value", "duration_unit", "duration_calendar"] },
    { id: "K02__template", titleKey: "sx.section.K02__template", fields: ["template_mode"] },
    { id: "K02__checklist", titleKey: "sx.section.K02__checklist", fields: ["completion_checklist", "checklist_template_id"] },
    { id: "K02__rules", titleKey: "sx.section.K02__rules", fields: ["rule_ids", "seller_rules_allowed", "inline_rules", SERVICE_TERMS] },
    { id: "K02__guarantees", titleKey: "sx.section.K02__guarantees", fields: ["guarantee_ids", "inline_guarantees"] },
    { id: "K02__search", titleKey: "sx.section.K02__search", fields: ["discovery_terms"] },
    { id: "status", titleKey: "sx.section.status", fields: ["is_active"] },
  ],
  fields: [
    { path: "service_id", hidden: true },
    { path: "title", placeholder: "sx.ph.K02__title" },
    { path: "slug", hidden: true },
    { path: "category_id", help: false },
    { path: "description", help: false },
    { path: "price_factor_ids", help: "sx.help.price_factor_ids", inlineAddKey: "sx.k02.fo.addShared" },
    { path: "price_factor_overrides", control: "factorOverrides", label: "sx.k02.field.price_factor_overrides", help: "sx.k02.help.price_factor_overrides", visible: hasFactors },
    { path: "negotiation_allowed", help: "sx.help.K02__negotiation_allowed" },
    { path: "seller_requirements", flatten: true },
    { path: "duration_value", span: 1 },
    { path: "duration_unit", span: 1, control: "picker" },
    {
      path: "duration_calendar",
      control: "choices",
      columns: 2,
      help: "sx.k02.help.duration_calendar",
      choices: {
        calendar: { icon: CalendarDaysIcon, descriptionKey: "sx.optd.duration_calendar.calendar" },
        business_days: { icon: BriefcaseBusinessIcon, descriptionKey: "sx.optd.duration_calendar.business_days" },
        business: { icon: BriefcaseBusinessIcon, descriptionKey: "sx.optd.duration_calendar.business" },
      },
    },
    { path: "completion_checklist", control: "checklist", label: "sx.k02.field.completion_checklist", help: "sx.k02.help.completion_checklist" },
    { path: "checklist_template_id", legacyOf: "completion_checklist", legacyLabel: "sx.k02.field.checklist_legacy", legacyHelp: "sx.k02.help.checklist_legacy", help: "sx.help.K02__checklist_template_id" },
    { path: "rule_ids", label: "sx.k02.field.rule_ids", help: "sx.k02.help.rule_ids", inlineAddKey: "sx.k02.rules.addShared" },
    {
      path: "inline_rules",
      control: "repeater",
      label: "sx.k02.field.inline_rules",
      help: "sx.k02.help.inline_rules",
      addKey: "sx.k02.rules.add",
      emptyKey: "sx.k02.rules.empty",
      summary: (item) => str(item.title),
    },
    { path: "inline_rules.*.title", label: "sx.k02.f.inlineTitle", placeholder: "sx.k02.ph.ruleTitle", help: false },
    { path: "inline_rules.*.body", control: "textarea", label: "sx.k02.f.inlineBody", placeholder: "sx.k02.ph.ruleBody", help: false },
    { path: SERVICE_TERMS, control: "richtext", label: "sx.k02.field.service_terms_text", help: "sx.k02.help.service_terms_text" },
    ...INTAKE_FIELDS,
    { path: "guarantee_ids", label: "sx.k02.field.guarantee_ids", help: "sx.k02.help.guarantee_ids", inlineAddKey: "sx.k02.guarantees.addShared" },
    {
      path: "inline_guarantees",
      control: "repeater",
      label: "sx.k02.field.inline_guarantees",
      help: "sx.k02.help.inline_guarantees",
      addKey: "sx.k02.guarantees.add",
      emptyKey: "sx.k02.guarantees.empty",
      summary: (item) => str(item.title),
    },
    { path: "inline_guarantees.*.title", label: "sx.k02.f.inlineTitle", placeholder: "sx.k02.ph.guaranteeTitle", help: false },
    { path: "inline_guarantees.*.description", control: "textarea", label: "sx.k02.f.inlineDescription", placeholder: "sx.k02.ph.guaranteeBody", help: false },
    { path: "discovery_terms", aiSuggest: "service" },
    {
      path: "template_mode",
      label: "sx.field.K02__template_requirement",
      help: false,
      control: "choices",
      required: true,
      owns: ["document_template_id"],
      choices: {
        required: { icon: FileTextIcon, descriptionKey: "sx.optd.template_mode.required" },
        optional: { icon: FileQuestionMarkIcon, descriptionKey: "sx.optd.template_mode.optional" },
        not_required: { icon: FileXIcon, descriptionKey: "sx.optd.template_mode.not_required" },
      },
    },
    { path: "template_source", hidden: true },
    { path: "document_template_id", hidden: true, label: "sx.k02.tpl.pick" },
  ],
  transform: k02Transform,
  validate: k02FormValidate,
};

export const K29_LAYOUT: SxCtorLayout = {
  code: "K29",
  fields: [
    {
      path: "target_type",
      control: "choices",
      columns: 2,
      choices: {
        service: { icon: BriefcaseBusinessIcon, descriptionKey: "sx.optd.target_type.service" },
        package: { icon: PackageIcon, descriptionKey: "sx.optd.target_type.package" },
      },
    },
    { path: "sections", control: "repeater", help: false, addKey: "sx.form.add.section", summary: (item) => str(item.title) },
    { path: "sections.*.description", help: false },
    { path: "sections.*.options", control: "repeater", addKey: "sx.form.add.option", summary: (item) => str(item.label), meta: (item, _i, labels) => adjustmentMeta(item, labels) },
    { path: "sections.*.options.*.adjustment_type", control: "picker" },
    { path: "sections.*.options.*.value", control: ({ scope }) => amountControl(scope.adjustment_type) },
    { path: "sections.*.options.*.description", help: false },
  ],
};

export const K29_CHECKLIST_LAYOUT: SxCtorLayout = { code: "K29", variant: "checklist" };

export const K03M_LAYOUT: SxCtorLayout = {
  code: "K03-M",
  sections: [
    { id: "asosiy", titleKey: "sx.section.asosiy", fields: ["title", "category_id", "components", "custom_items", "tiers", "duration"] },
    { id: "K03-M__pricing", titleKey: "sx.section.K03-M__pricing", fields: ["price_factor_ids", "price_factor_overrides", "eligibility_rule_ids"] },
    { id: "kontent", titleKey: "sx.section.kontent", fields: ["description"] },
    { id: "kirish_va_auditoriya", titleKey: "sx.section.kirish_va_auditoriya", fields: ["visibility"] },
    { id: "faollik_va_muddat", titleKey: "sx.section.faollik_va_muddat", fields: ["is_active"] },
  ],
  fields: [
    { path: "package_id", hidden: true },
    { path: "category_id", help: false },
    {
      path: "components",
      control: "repeater",
      addKey: "sx.form.add.service",
      meta: (item, _i, labels) => {
        const kind = str(item.kind);
        return kind ? labels.option(kind, { ctor: "K03-M", field: "kind" }) : "";
      },
    },
    { path: "components.*.service_id", help: false },
    { path: "custom_items", control: "repeater", addKey: "sx.form.add.item" },
    { path: "custom_items.*.title", placeholder: "sx.ph.K03-M__custom_items__title" },
    {
      path: "tiers",
      control: "repeater",
      addKey: "sx.form.add.tier",
      summary: (item, _i, labels) => {
        const tier = str(item.tier);
        return tier ? labels.tier(tier) : "";
      },
      meta: (item, _i, labels) => {
        const price = numOf(item.price);
        return price === null ? "" : labels.money(price);
      },
    },
    { path: "tiers.*.included", control: "repeaterInline", addKey: "sx.form.add.line" },
    { path: "tiers.*.price_factor_ids", help: "sx.k03m.help.tier_price_factor_ids", inlineAddKey: "sx.k02.fo.addShared" },
    { path: "tiers.*.price_factor_overrides", control: "factorOverrides", label: "sx.k03m.field.tier_price_factor_overrides", help: "sx.k03m.help.tier_price_factor_overrides", visible: hasFactors },
    { path: "tiers.*.eligibility_rule_ids", help: "sx.k03m.help.tier_eligibility_rule_ids" },
    { path: "price_factor_ids", help: "sx.help.price_factor_ids", inlineAddKey: "sx.k02.fo.addShared" },
    { path: "price_factor_overrides", control: "factorOverrides", label: "sx.k03m.field.price_factor_overrides", help: "sx.k03m.help.price_factor_overrides", visible: hasFactors },
    { path: "description", help: false },
  ],
  transform: (next, prev) => k03mPrune(k02Prune(next, prev), prev),
  validate: k03mValidate,
};

const K35_TIERS = {
  BASIC: { icon: LayersIcon, descriptionKey: "sx.optd.K35__tier.BASIC" },
  STANDARD: { icon: MedalIcon, descriptionKey: "sx.optd.K35__tier.STANDARD" },
  PREMIUM: { icon: CrownIcon, descriptionKey: "sx.optd.K35__tier.PREMIUM" },
} as const;
const SELLER_TYPE_ICON: Readonly<Record<string, SxIcon>> = { advokat: GavelIcon, yurist: ScaleIcon, yurist_advokat: BriefcaseBusinessIcon };

export const K35_LAYOUT: SxCtorLayout = {
  code: "K35",
  sections: [
    { id: "K35__tier", titleKey: "sx.section.K35__tier", fields: ["title", "tier"] },
    { id: "K35__seller", titleKey: "sx.section.K35__seller", fields: ["seller_types", "min_experience_years", "min_rating", "min_completed_orders"] },
    { id: "K35__checks", titleKey: "sx.section.K35__checks", fields: ["verification_required", "extended_verification_required", "license_required"] },
    { id: "K35__categories", titleKey: "sx.section.K35__categories", fields: ["category_ids"] },
    { id: "status", titleKey: "sx.section.status", fields: ["is_active"] },
  ],
  fields: [
    { path: "slug", hidden: true },
    { path: "title", placeholder: "sx.ph.K35__title" },
    { path: "tier", control: "choices", columns: 3, choices: K35_TIERS },
    { path: "seller_types", optionIcon: (v) => SELLER_TYPE_ICON[v] },
    { path: "min_experience_years", suffixKey: "sx.k35.years", span: 1 },
    { path: "min_rating", span: 1 },
    { path: "min_completed_orders", suffixKey: "sx.k35.orders", span: 1 },
  ],
};

export const K30_LAYOUT: SxCtorLayout = {
  code: "K30",
  fields: [
    { path: "title", placeholder: "sx.ph.K30__title" },
    { path: "category_id", help: false },
    { path: "subcategory", control: "text", help: "sx.help.K30__subcategory" },
    { path: "description", help: false },
    { path: "client_phrases", control: "repeaterInline", addKey: "sx.form.add.phrase" },
    { path: "discovery_terms", control: "tags" },
    { path: "recommended_service_ids", control: "pickerMulti" },
  ],
};

export const SERVICE_LAYOUTS: Readonly<Record<string, SxCtorLayout>> = {
  K01: K01_LAYOUT,
  K34: K34_LAYOUT,
  K31: K31_LAYOUT,
  K32: K32_LAYOUT,
  K33: K33_LAYOUT,
  K02: K02_LAYOUT,
  K29: K29_LAYOUT,
  "K03-M": K03M_LAYOUT,
  K35: K35_LAYOUT,
  K30: K30_LAYOUT,
};
