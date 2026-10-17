import type { SxCtorLayout, SxLayoutCtx, SxPayload, SxValues } from "../contract";
import { PLACEMENT_ICON } from "../icons";
import type { SxErrors, SxIcon } from "../types";

export const SURFACE_BY_PLACEMENT = { banner: "marketplace_top_banner", profile_boost: "marketplace_list", service_boost: "category_search" } as const;

export type K12Placement = keyof typeof SURFACE_BY_PLACEMENT;

const PLACEMENTS: readonly K12Placement[] = ["banner", "profile_boost", "service_boost"];
const STATUSES: readonly string[] = ["active", "inactive", "archived"];
const MISMATCH = "@code:promotion_package_placement_mismatch";

const own = Object.prototype.hasOwnProperty;
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const dict = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const placementOf = (v: unknown): K12Placement | "" => {
  const p = str(v);
  return own.call(SURFACE_BY_PLACEMENT, p) ? (p as K12Placement) : "";
};
const placementIn = (ctx: SxLayoutCtx): string => str(ctx.root.placement);

export function k12Transform(next: SxPayload, prev: SxValues): SxPayload {
  const src: SxPayload = next ?? {};
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

export function k12Validate(payload: SxValues): SxErrors {
  const v: SxValues = payload ?? {};
  const raw = str(v.placement);
  if (!raw) return {};
  const p = placementOf(raw);
  if (!p) return { placement: "@option" };
  const mismatch = (v.requires_service === true) !== (p === "service_boost") || (v.accepts_banner_asset === true) !== (p === "banner") || (p !== "banner" && v.requires_banner === true);
  return mismatch ? { placement: MISMATCH } : {};
}

const placementIcon = (v: string): SxIcon | undefined => (own.call(PLACEMENT_ICON, v) ? PLACEMENT_ICON[v] : undefined);

export const K12_PROMO_LAYOUT: SxCtorLayout = {
  code: "K12-PROMO",
  sections: [
    { id: "K12-PROMO__placement", titleKey: "sx.section.K12-PROMO__placement", fields: ["placement"] },
    { id: "K12-PROMO__name", titleKey: "sx.section.K12-PROMO__name", fields: ["title", "code"] },
    { id: "K12-PROMO__sale", titleKey: "sx.section.K12-PROMO__sale", fields: ["days", "price", "currency", "status", "boost_score", "reach"] },
    { id: "K12-PROMO__service", titleKey: "sx.section.K12-PROMO__service", fields: ["requires_service"], visible: (ctx) => placementIn(ctx) === "service_boost" },
    { id: "K12-PROMO__banner", titleKey: "sx.section.K12-PROMO__banner", fields: ["accepts_banner_asset", "requires_banner"], visible: (ctx) => placementIn(ctx) === "banner" },
    { id: "K12-PROMO__badge", titleKey: "sx.section.K12-PROMO__badge", fields: ["preview.label", "preview.surface"] },
  ],
  fields: [
    { path: "package_id", hidden: true },
    { path: "preview", hidden: true },
    {
      path: "placement",
      control: "choices",
      columns: 3,
      options: PLACEMENTS,
      optionLabel: (v, l) => l.placement(v),
      optionIcon: placementIcon,
      choices: {
        banner: { icon: PLACEMENT_ICON.banner, descriptionKey: "sx.placement.banner.what", metaKey: "sx.placementRule.bannerAsset" },
        profile_boost: { icon: PLACEMENT_ICON.profile_boost, descriptionKey: "sx.placement.profile_boost.what", metaKey: "sx.placementRule.none" },
        service_boost: { icon: PLACEMENT_ICON.service_boost, descriptionKey: "sx.placement.service_boost.what", metaKey: "sx.placementRule.service" },
      },
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
  ],
  transform: k12Transform,
  validate: k12Validate,
};
