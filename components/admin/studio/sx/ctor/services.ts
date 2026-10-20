import type { SxCtorLayout, SxLayoutCtx, SxPayload, SxValues } from "../contract";
import { LibraryBigIcon, BriefcaseBusinessIcon, CoinsIcon, FileQuestionMarkIcon, FilesIcon, FileTextIcon, FileXIcon, FolderOpenIcon, GlobeIcon, PackageIcon, PercentIcon, UploadIcon } from "../icons";
import type { SxIcon } from "../types";
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

const TEMPLATE_SOURCES: ReadonlySet<string> = new Set(["catalog", "catalog_or_upload"]);
const templateNeeded = (ctx: SxLayoutCtx): boolean => {
  const mode = str(ctx.root.template_mode);
  return Boolean(mode) && mode !== "not_required";
};

const guaranteeIcon = (v: string): SxIcon | undefined => GUARANTEE_ICONS.find((g) => g.key === v)?.icon;

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

export const K34_LAYOUT: SxCtorLayout = {
  code: "K34",
  sections: [
    { id: "asosiy", titleKey: "sx.section.asosiy", fields: ["title", "adjustment_type", "value", "discovery_terms"] },
    { id: "kontent", titleKey: "sx.section.kontent", fields: ["description"] },
    { id: "faollik_va_muddat", titleKey: "sx.section.faollik_va_muddat", fields: ["is_active"] },
  ],
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
    { id: "asosiy", titleKey: "sx.section.asosiy", fields: ["title", "rule_key", "version", "scope_type", "service_id", "category_id", "effective_at"] },
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
      options: GUARANTEE_ICONS.map((g) => g.key),
      optionKey: (v) => GUARANTEE_ICONS.find((g) => g.key === v)?.labelKey ?? "",
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

export function k02Transform(next: SxPayload): SxPayload {
  const v = next.executor_type;
  if (typeof v !== "string" || !NO_EXECUTOR.has(v.trim().toLowerCase())) return next;
  const out: SxPayload = { ...next };
  delete out.executor_type;
  return out;
}

export const K02_LAYOUT: SxCtorLayout = {
  code: "K02",
  sections: [
    { id: "asosiy", titleKey: "sx.section.asosiy", fields: ["title", "category_id", "description", "client_value", "executor_type"] },
    { id: "K02__price", titleKey: "sx.section.K02__price", fields: ["base_price", "max_price", "price_factor_ids", "negotiation_allowed"] },
    { id: "K02__requirements", titleKey: "sx.section.K02__requirements", fields: ["seller_requirements"] },
    { id: "K02__delivery", titleKey: "sx.section.K02__delivery", fields: ["duration_value", "duration_unit", "duration_calendar"] },
    { id: "K02__template", titleKey: "sx.section.K02__template", fields: ["template_mode", "template_source", "document_template_id"] },
    { id: "K02__quality", titleKey: "sx.section.K02__quality", fields: ["checklist_template_id", "guarantee_ids"] },
    { id: "K02__search", titleKey: "sx.section.K02__search", fields: ["discovery_terms"] },
    { id: "status", titleKey: "sx.section.status", fields: ["is_active"] },
  ],
  fields: [
    { path: "service_id", hidden: true },
    { path: "title", placeholder: "sx.ph.K02__title" },
    { path: "slug", hidden: true },
    { path: "category_id", help: false },
    { path: "description", help: false },
    { path: "price_factor_ids", help: "sx.help.price_factor_ids" },
    { path: "negotiation_allowed", help: "sx.help.K02__negotiation_allowed" },
    { path: "seller_requirements", flatten: true },
    { path: "duration_value", span: 1 },
    { path: "duration_unit", span: 1, control: "picker" },
    {
      path: "duration_calendar",
      control: "choices",
      columns: 2,
      choices: {
        calendar: { descriptionKey: "sx.optd.duration_calendar.calendar" },
        business: { descriptionKey: "sx.optd.duration_calendar.business" },
      },
    },
    {
      path: "template_mode",
      label: "sx.field.K02__template_requirement",
      control: "choices",
      columns: 3,
      choices: {
        required: { icon: FileTextIcon, descriptionKey: "sx.optd.template_mode.required" },
        optional: { icon: FileQuestionMarkIcon, descriptionKey: "sx.optd.template_mode.optional" },
        not_required: { icon: FileXIcon, descriptionKey: "sx.optd.template_mode.not_required" },
      },
    },
    {
      path: "template_source",
      control: "choices",
      columns: 3,
      help: false,
      visible: templateNeeded,
      choices: {
        catalog: { icon: LibraryBigIcon, descriptionKey: "sx.optd.template_source.catalog" },
        upload: { icon: UploadIcon, descriptionKey: "sx.optd.template_source.upload_edit" },
        catalog_or_upload: { icon: FilesIcon, descriptionKey: "sx.optd.template_source.catalog_or_upload_edit" },
      },
    },
    { path: "document_template_id", visible: (ctx) => templateNeeded(ctx) && TEMPLATE_SOURCES.has(str(ctx.root.template_source)) },
    { path: "checklist_template_id", help: "sx.help.K02__checklist_template_id" },
    { path: "guarantee_ids", help: "sx.help.K02__guarantee_ids" },
  ],
  transform: k02Transform,
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
    { id: "K03-M__pricing", titleKey: "sx.section.K03-M__pricing", fields: ["price_factor_ids", "eligibility_rule_ids"] },
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
    { path: "price_factor_ids", help: "sx.help.price_factor_ids" },
    { path: "description", help: false },
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
  K30: K30_LAYOUT,
};
