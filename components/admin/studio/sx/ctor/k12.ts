import { studioDetailSnapshot, type StudioConstructor, type StudioSchemaField } from "@/lib/services/studio";
import type { SxChoiceMeta, SxCtorLayout, SxLayoutCtx, SxLayoutField, SxLayoutSection, SxPayload, SxValues } from "../contract";
import { BanknoteIcon, PLACEMENT_ICON, PercentIcon } from "../icons";
import type { SxErrors, SxIcon } from "../types";

export const SURFACE_BY_PLACEMENT = { banner: "marketplace_top_banner", profile_boost: "marketplace_list", service_boost: "category_search" } as const;

export type K12Placement = keyof typeof SURFACE_BY_PLACEMENT;

const PROMO_CODE = "K12-PROMO";
const CAMPAIGN_CODE = "MP09";
const PLACEMENTS: readonly K12Placement[] = ["banner", "profile_boost", "service_boost"];
const STATUSES: readonly string[] = ["active", "inactive", "archived"];
const DISCOUNT_TYPES: readonly string[] = ["percent", "fixed"];
const MISMATCH = "@code:promotion_package_placement_mismatch";
const PROMO_REMOVED: readonly string[] = ["code", "status", "placement", "requires_service", "requires_banner", "accepts_banner_asset", "badge"];
const CAMPAIGN_REMOVED: readonly string[] = ["code", "audience", "discount", "budget", "usage_limits", "eligibility"];
const CUSTOM_DAYS: readonly string[] = ["min_days", "max_days"];

const own = Object.prototype.hasOwnProperty;
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const dict = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const numOf = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const placementOf = (v: unknown): K12Placement | "" => {
  const p = str(v);
  return own.call(SURFACE_BY_PLACEMENT, p) ? (p as K12Placement) : "";
};
const placementIn = (ctx: SxLayoutCtx): string => str(ctx.root.placement);

function snapshotOf(code: string): StudioConstructor | null {
  const c = studioDetailSnapshot(code) ?? studioDetailSnapshot(code.toLowerCase());
  return c && (c.typed.length || c.schema.fields.length) ? c : null;
}

function fieldIn(c: StudioConstructor | null, key: string): StudioSchemaField | null {
  return c?.typed.find((f) => f.key === key) ?? null;
}

function schemaKnows(c: StudioConstructor, key: string): boolean {
  return !!fieldIn(c, key) || c.schema.fields.includes(key);
}

function shapeIsNew(code: string, marker: string, payload?: SxValues | null): boolean {
  const c = snapshotOf(code);
  if (c) return schemaKnows(c, marker);
  return !!payload && own.call(payload, marker);
}

export const promoShapeIsNew = (payload?: SxValues | null): boolean => shapeIsNew(PROMO_CODE, "promotion_type", payload);
export const campaignShapeIsNew = (payload?: SxValues | null): boolean => shapeIsNew(CAMPAIGN_CODE, "package_ids", payload);

function dropKeys(src: SxPayload, keys: readonly string[]): SxPayload {
  let out = src;
  for (const k of keys) {
    if (!own.call(out, k)) continue;
    if (out === src) out = { ...src };
    delete out[k];
  }
  return out;
}

function removedFor(code: string, keys: readonly string[]): readonly string[] {
  const c = snapshotOf(code);
  return c ? keys.filter((k) => !schemaKnows(c, k)) : keys;
}

function optionsOf(code: string, key: string, fallback: readonly string[]): readonly string[] {
  const f = fieldIn(snapshotOf(code), key);
  return f?.options.length ? f.options : fallback;
}

function legacyTransform(src: SxPayload, prev: SxValues): SxPayload {
  const raw = str(src.placement);
  const p = placementOf(raw);
  const requiresService = p === "service_boost";
  const acceptsBanner = p === "banner";
  const requiresBanner = p === "banner" ? src.requires_banner === true : false;
  const before = dict(src.preview);
  const surface = str(before?.surface);
  const prevPlacement = str(prev?.placement);
  const nextSurface = p && (raw !== prevPlacement || !surface) ? SURFACE_BY_PLACEMENT[p] : surface;
  const surfaceChanged = nextSurface !== surface;
  const same = src.requires_service === requiresService && src.accepts_banner_asset === acceptsBanner && src.requires_banner === requiresBanner && !surfaceChanged;
  if (same) return src;
  const out: SxPayload = { ...src, requires_service: requiresService, accepts_banner_asset: acceptsBanner, requires_banner: requiresBanner };
  if (surfaceChanged) out.preview = { ...(before ?? {}), surface: nextSurface };
  return out;
}

function promoTransform(src: SxPayload, prev: SxValues): SxPayload {
  let out = dropKeys(src, removedFor(PROMO_CODE, PROMO_REMOVED));
  const c = snapshotOf(PROMO_CODE);
  if (c && !schemaKnows(c, "allow_custom_days")) return out;
  if (out.allow_custom_days !== true) return dropKeys(out, CUSTOM_DAYS);
  if (prev?.allow_custom_days === true || !c) return out;
  for (const k of CUSTOM_DAYS) {
    const d = fieldIn(c, k)?.default;
    if (out[k] !== undefined || d === undefined || d === null) continue;
    if (out === src) out = { ...src };
    out[k] = d;
  }
  return out;
}

export function k12Transform(next: SxPayload, prev: SxValues): SxPayload {
  const src: SxPayload = next ?? {};
  return promoShapeIsNew(src) ? promoTransform(src, prev) : legacyTransform(src, prev);
}

function legacyValidate(v: SxValues): SxErrors {
  const raw = str(v.placement);
  if (!raw) return {};
  const p = placementOf(raw);
  if (!p) return { placement: "@option" };
  const mismatch = (v.requires_service === true) !== (p === "service_boost") || (v.accepts_banner_asset === true) !== (p === "banner") || (p !== "banner" && v.requires_banner === true);
  return mismatch ? { placement: MISMATCH } : {};
}

function promoValidate(v: SxValues): SxErrors {
  if (v.allow_custom_days !== true) return {};
  const out: Record<string, string> = {};
  const min = numOf(v.min_days);
  const max = numOf(v.max_days);
  const days = numOf(v.days);
  if (min === null) out.min_days = "@required";
  else if (min < 1) out.min_days = "@code:minimum:1";
  if (max === null) out.max_days = "@required";
  else if (min !== null && max < min) out.max_days = "@code:promo_max_days_below_min";
  if (days !== null && min !== null && max !== null && max >= min && (days < min || days > max)) out.days = "@code:promo_days_out_of_range";
  return out;
}

export function k12Validate(payload: SxValues): SxErrors {
  const v: SxValues = payload ?? {};
  return promoShapeIsNew(v) ? promoValidate(v) : legacyValidate(v);
}

const placementIcon = (v: string): SxIcon | undefined => (own.call(PLACEMENT_ICON, v) ? PLACEMENT_ICON[v] : undefined);

const PLACEMENT_CHOICES: Readonly<Record<string, SxChoiceMeta>> = {
  banner: { icon: PLACEMENT_ICON.banner, descriptionKey: "sx.placement.banner.what", metaKey: "sx.placementRule.bannerAsset" },
  profile_boost: { icon: PLACEMENT_ICON.profile_boost, descriptionKey: "sx.placement.profile_boost.what", metaKey: "sx.placementRule.none" },
  service_boost: { icon: PLACEMENT_ICON.service_boost, descriptionKey: "sx.placement.service_boost.what", metaKey: "sx.placementRule.service" },
};

const LEGACY_PROMO_SECTIONS: readonly SxLayoutSection[] = [
  { id: "K12-PROMO__placement", titleKey: "sx.section.K12-PROMO__placement", fields: ["placement"] },
  { id: "K12-PROMO__name", titleKey: "sx.section.K12-PROMO__name", fields: ["title", "code"] },
  { id: "K12-PROMO__sale", titleKey: "sx.section.K12-PROMO__sale", fields: ["days", "price", "currency", "status", "boost_score", "reach"] },
  { id: "K12-PROMO__service", titleKey: "sx.section.K12-PROMO__service", fields: ["requires_service"], visible: (ctx) => placementIn(ctx) === "service_boost" },
  { id: "K12-PROMO__banner", titleKey: "sx.section.K12-PROMO__banner", fields: ["accepts_banner_asset", "requires_banner"], visible: (ctx) => placementIn(ctx) === "banner" },
  { id: "K12-PROMO__badge", titleKey: "sx.section.K12-PROMO__badge", fields: ["preview.label", "preview.surface"] },
];

const LEGACY_PROMO_FIELDS: readonly SxLayoutField[] = [
  { path: "package_id", hidden: true },
  { path: "preview", hidden: true },
  {
    path: "placement",
    control: "choices",
    columns: 3,
    options: PLACEMENTS,
    optionLabel: (v, l) => l.placement(v),
    optionIcon: placementIcon,
    choices: PLACEMENT_CHOICES,
  },
  { path: "title", span: 2 },
  { path: "code", control: "mono" },
  {
    path: "currency",
    virtual: {
      type: "text",
      labelKey: "sx.field.K12-PROMO__currency",
      readOnly: true,
      display: (ctx, labels) => labels.currency(str(ctx.root.currency) || "UZS"),
    },
  },
  {
    path: "status",
    control: "choices",
    columns: 3,
    options: STATUSES,
    optionKey: (v) => `sx.opt.K12-PROMO__status.${v}`,
    choices: {
      active: { descriptionKey: "sx.optd.K12-PROMO__status.active" },
      inactive: { descriptionKey: "sx.optd.K12-PROMO__status.inactive" },
      archived: { descriptionKey: "sx.optd.K12-PROMO__status.archived" },
    },
  },
  { path: "reach", virtual: { type: "number", labelKey: "sx.field.reach", helpKey: "sx.help.K12-PROMO__reach" } },
  { path: "requires_service", locked: (ctx) => (placementIn(ctx) === "service_boost" ? "sx.k12.serviceLocked" : false) },
  {
    path: "accepts_banner_asset",
    locked: () => "sx.k12.bannerLocked",
    virtual: { type: "boolean", labelKey: "sx.field.accepts_banner_asset", readOnly: true },
  },
  { path: "requires_banner", control: "switch", help: "sx.help.K12-PROMO__requires_banner" },
  {
    path: "preview.label",
    virtual: { type: "text", labelKey: "sx.field.K12-PROMO__preview__label", helpKey: "sx.help.K12-PROMO__preview__label", placeholderKey: "sx.ph.K12-PROMO__preview__label" },
  },
  {
    path: "preview.surface",
    virtual: {
      type: "text",
      labelKey: "sx.field.surface",
      readOnly: true,
      display: (ctx, labels) => {
        const s = str(dict(ctx.root.preview)?.surface);
        return s ? labels.surface(s) : "";
      },
    },
  },
];

const customDays = (ctx: SxLayoutCtx): boolean => ctx.root.allow_custom_days === true;

function filled(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  const d = dict(v);
  return d ? Object.values(d).some(filled) : true;
}

function promoFields(): readonly SxLayoutField[] {
  return [
    { path: "package_id", hidden: true },
    ...PROMO_REMOVED.map((path): SxLayoutField => ({ path, hidden: true })),
    {
      path: "promotion_type",
      control: "choices",
      columns: 3,
      options: optionsOf(PROMO_CODE, "promotion_type", PLACEMENTS),
      optionLabel: (v, l) => l.placement(v),
      optionIcon: placementIcon,
      choices: PLACEMENT_CHOICES,
      help: "sx.k12.typeHelp",
    },
    { path: "title", span: 2 },
    {
      path: "days",
      label: (ctx) => (customDays(ctx) ? "sx.k12.daysDefault" : "sx.field.K12-PROMO__days"),
      help: (ctx) => (customDays(ctx) ? "sx.k12.daysDefaultHelp" : "sx.k12.daysHelp"),
      suffixKey: "sx.k12.daysSuffix",
    },
    { path: "allow_custom_days", control: "switch", help: "sx.k12.customDaysHelp" },
    { path: "min_days", visible: customDays, suffixKey: "sx.k12.daysSuffix" },
    { path: "max_days", visible: customDays, suffixKey: "sx.k12.daysSuffix" },
    {
      path: "preview",
      control: "keyValue",
      span: 2,
      label: "sx.k12.previewMeta",
      locked: () => "sx.k12.previewLocked",
      visible: (ctx) => filled(ctx.root.preview),
    },
  ];
}

const isFixed = (ctx: SxLayoutCtx): boolean => str(ctx.root.discount_type) === "fixed";
const isPercent = (ctx: SxLayoutCtx): boolean => str(ctx.root.discount_type) === "percent";

function campaignTransform(src: SxPayload): SxPayload {
  return dropKeys(src, removedFor(CAMPAIGN_CODE, CAMPAIGN_REMOVED));
}

function campaignValidate(v: SxValues): SxErrors {
  const out: Record<string, string> = {};
  const value = numOf(v.discount_value);
  if (value !== null) {
    if (value < 0) out.discount_value = "@code:minimum:0";
    else if (str(v.discount_type) === "percent" && value > 100) out.discount_value = "@code:maximum:100";
  }
  const c = snapshotOf(CAMPAIGN_CODE);
  const ruled = !c || (schemaKnows(c, "ends_at") && schemaKnows(c, "purchase_limit"));
  const limit = numOf(v.purchase_limit);
  const ends = str(v.ends_at);
  if (limit !== null && limit < 1) out.purchase_limit = "@code:minimum:1";
  if (ruled && !ends && limit === null) {
    out.ends_at = "@code:campaign_end_or_limit";
    out.purchase_limit = "@code:campaign_end_or_limit";
  }
  const from = Date.parse(str(v.starts_at));
  const to = Date.parse(ends);
  if (Number.isFinite(from) && Number.isFinite(to) && to <= from) out.ends_at = "@code:campaign_ends_before_start";
  return out;
}

const LEGACY_CAMPAIGN_FIELDS: readonly SxLayoutField[] = [
  { path: "eligibility.roles", help: false },
  { path: "eligibility.regions", help: false },
  { path: "starts_at", control: "datetime", help: false },
  { path: "ends_at", control: "datetime", help: false },
];

function campaignFields(): readonly SxLayoutField[] {
  return [
    ...LEGACY_CAMPAIGN_FIELDS.slice(0, 2),
    { path: "title", span: 2 },
    { path: "package_ids", help: "sx.mp09.packagesHelp" },
    {
      path: "discount_type",
      control: "choices",
      columns: 2,
      options: optionsOf(CAMPAIGN_CODE, "discount_type", DISCOUNT_TYPES),
      choices: {
        percent: { icon: PercentIcon, descriptionKey: "sx.optd.MP09__discount_type.percent" },
        fixed: { icon: BanknoteIcon, descriptionKey: "sx.optd.MP09__discount_type.fixed" },
      },
      help: "sx.mp09.stackHelp",
    },
    {
      path: "discount_value",
      control: (ctx) => (isFixed(ctx) ? "money" : isPercent(ctx) ? "percent" : "number"),
      label: (ctx) => (isFixed(ctx) ? "sx.mp09.valueFixed" : isPercent(ctx) ? "sx.mp09.valuePercent" : "sx.field.MP09__discount_value"),
      help: (ctx) => (isFixed(ctx) ? "sx.mp09.valueFixedHelp" : isPercent(ctx) ? "sx.mp09.valuePercentHelp" : "sx.mp09.valueHelp"),
    },
    { path: "starts_at", control: "datetime", help: "sx.mp09.startsHelp" },
    { path: "ends_at", control: "datetime", help: "sx.mp09.endsHelp" },
    { path: "purchase_limit", help: "sx.mp09.limitHelp" },
  ];
}

const fieldsMemo = new WeakMap<StudioConstructor, readonly SxLayoutField[]>();

function shapedFields(code: string, marker: string, legacy: readonly SxLayoutField[], build: () => readonly SxLayoutField[]): readonly SxLayoutField[] {
  const c = snapshotOf(code);
  if (!c || !schemaKnows(c, marker)) return legacy;
  let hit = fieldsMemo.get(c);
  if (!hit) {
    hit = build();
    fieldsMemo.set(c, hit);
  }
  return hit;
}

export const K12_PROMO_LAYOUT: SxCtorLayout = {
  code: PROMO_CODE,
  get sections(): readonly SxLayoutSection[] | undefined {
    return promoShapeIsNew() ? undefined : LEGACY_PROMO_SECTIONS;
  },
  get fields(): readonly SxLayoutField[] {
    return shapedFields(PROMO_CODE, "promotion_type", LEGACY_PROMO_FIELDS, promoFields);
  },
  transform: k12Transform,
  validate: k12Validate,
};

export function mp09Transform(next: SxPayload): SxPayload {
  const src: SxPayload = next ?? {};
  return campaignShapeIsNew(src) ? campaignTransform(src) : src;
}

export function mp09Validate(payload: SxValues): SxErrors {
  const v: SxValues = payload ?? {};
  return campaignShapeIsNew(v) ? campaignValidate(v) : {};
}

export const MP09_LAYOUT: SxCtorLayout = {
  code: CAMPAIGN_CODE,
  recordTitlePlaceholderKey: "sx.ph.MP09__recordTitle",
  get fields(): readonly SxLayoutField[] {
    return shapedFields(CAMPAIGN_CODE, "package_ids", LEGACY_CAMPAIGN_FIELDS, campaignFields);
  },
  transform: mp09Transform,
  validate: mp09Validate,
};
