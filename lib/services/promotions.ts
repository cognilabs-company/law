import { asArr, asDict, asNum, asStr, http, type Dict } from "@/lib/http";
import { uzs } from "@/lib/money";
import type { AdPackage, PromotionRequest, ServiceScope } from "@/lib/services/sellerServices";
import { normPromotionSurface, type MarketPromotionSurface } from "@/lib/services/marketplace";

export const PROMOTION_PLACEMENTS = ["banner", "profile_boost", "service_boost"] as const;
export type PromotionPlacement = (typeof PROMOTION_PLACEMENTS)[number];

export type PromotionPlacementOption = {
  value: PromotionPlacement;
  label: string;
  requiresService: boolean;
  requiresBanner: boolean;
  // The placement takes a banner picture without insisting on one: a banner
  // with no image is shown as the seller's profile card (banner_mode).
  acceptsBanner: boolean;
  // Where the backend says this placement appears — sent back in
  // preview_context so the two sides name the surface the same way.
  previewSurface: string;
};

export type PromotionPackage = AdPackage & {
  placement: PromotionPlacement;
  boostScore: number;
  requiresService: boolean;
  requiresBanner: boolean;
  acceptsBanner: boolean;
  preview: Dict;
};

export type PromotionCatalog = { items: PromotionPackage[]; placements: PromotionPlacementOption[] };

export type PromotionCheckoutInput = {
  packageId: string;
  days: number;
  placement: PromotionPlacement;
  serviceId?: string;
  targetUserId?: string;
  organizationId?: string;
  bannerImageUrl?: string;
  bannerFileUrl?: string;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  previewContext?: Dict;
};

function placementOf(value: unknown): PromotionPlacement {
  const v = asStr(value).trim().toLowerCase();
  return PROMOTION_PLACEMENTS.includes(v as PromotionPlacement) ? (v as PromotionPlacement) : "service_boost";
}

const DEFAULT_SURFACE: Record<PromotionPlacement, string> = {
  banner: "marketplace_top_banner",
  profile_boost: "marketplace_list_card",
  service_boost: "category_search_sponsored_service",
};

// requires_* are the backend's to state. Production says requires_banner:false
// for the banner placement and runs banners with no picture at all, so forcing
// one here blocked a checkout the backend accepts. Only an answer that carries
// no flag falls back to the placement's usual rule.
const flag = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

function normPlacement(value: unknown): PromotionPlacementOption {
  const d = asDict(value);
  const placement = placementOf(d.value ?? d.key ?? d.placement ?? d.code);
  const requiresBanner = flag(d.requires_banner, false);
  return {
    value: placement,
    label: asStr(d.label ?? d.title ?? d.name, placement),
    requiresService: flag(d.requires_service, placement === "service_boost"),
    requiresBanner,
    acceptsBanner: requiresBanner || flag(d.accepts_banner_asset, placement === "banner"),
    previewSurface: asStr(d.preview_surface) || DEFAULT_SURFACE[placement],
  };
}

function normPackage(value: unknown): PromotionPackage {
  const d = asDict(value);
  const payload = asDict(d.payload);
  const placement = placementOf(d.placement ?? payload.placement);
  return {
    id: asStr(d.id ?? d.package_id),
    title: asStr(d.title ?? d.name),
    price: uzs(d, "price") || uzs(payload, "price"),
    currency: asStr(d.currency ?? payload.currency, "UZS") || "UZS",
    days: Math.max(1, Math.round(asNum(d.days ?? payload.days, 7))),
    reach: asNum(d.reach ?? payload.reach),
    placement,
    boostScore: asNum(d.boost_score ?? payload.boost_score),
    requiresService: flag(d.requires_service ?? payload.requires_service, placement === "service_boost"),
    requiresBanner: flag(d.requires_banner ?? payload.requires_banner, false),
    acceptsBanner: flag(d.requires_banner ?? payload.requires_banner, false) || flag(d.accepts_banner_asset ?? payload.accepts_banner_asset, placement === "banner"),
    preview: asDict(d.preview ?? payload.preview),
  };
}

export async function listPromotionPackages(placement?: PromotionPlacement, signal?: AbortSignal): Promise<PromotionCatalog> {
  const qs = placement ? `?placement=${encodeURIComponent(placement)}` : "";
  try {
    const raw = asDict(await http(`/promotions/packages${qs}`, { signal }));
    const items = asArr(raw.items ?? raw.packages).map(normPackage).filter((item) => item.id && (!placement || item.placement === placement));
    const placements = asArr(raw.placements).map(normPlacement);
    return { items, placements: placements.length ? placements : PROMOTION_PLACEMENTS.map(normPlacement) };
  } catch (error) {
    if (signal?.aborted) throw error;
    // Older deployments expose the same active products through /ads/products.
    // Keep the UI usable while the promotion contract rolls out server-side.
    const { listAdPackages } = await import("@/lib/services/sellerServices");
    const legacy = await listAdPackages(signal);
    return {
      items: legacy.map((item) => ({ ...item, placement: placement ?? "service_boost", boostScore: 0, requiresService: placement !== "profile_boost", requiresBanner: false, acceptsBanner: placement === "banner", preview: {} })),
      placements: PROMOTION_PLACEMENTS.map((value) => normPlacement({ key: value, label: value })),
    };
  }
}

export async function uploadPromotionBanner(file: File, signal?: AbortSignal): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const raw = asDict(await http("/promotions/banner-assets", { method: "POST", body: form, signal }));
  return asStr(raw.file_url ?? asDict(raw.asset).file_url ?? asDict(raw.data).file_url);
}

export async function checkoutMarketplacePromotion(input: PromotionCheckoutInput, scope: ServiceScope, currentUserId: string): Promise<PromotionRequest> {
  const body: Dict = {
    package_id: input.packageId,
    days: input.days,
    provider: "telegram_manual",
    placement: input.placement,
    target_user_id: input.targetUserId || (scope.kind === "org" ? scope.memberId : currentUserId),
  };
  if (input.serviceId) body.service_id = input.serviceId;
  if (scope.kind === "org") body.organization_id = scope.orgId;
  if (input.bannerImageUrl) body.banner_image_url = input.bannerImageUrl;
  if (input.bannerFileUrl) body.banner_file_url = input.bannerFileUrl;
  if (input.title?.trim()) body.banner_title = body.title = input.title.trim();
  if (input.subtitle?.trim()) body.banner_subtitle = body.subtitle = input.subtitle.trim();
  if (input.ctaLabel?.trim()) body.banner_cta_label = body.cta_label = input.ctaLabel.trim();
  if (input.ctaUrl?.trim()) body.banner_cta_url = body.cta_url = input.ctaUrl.trim();
  if (input.previewContext) body.preview_context = input.previewContext;
  const raw = asDict(await http("/promotions/checkout", { method: "POST", body: JSON.stringify(body) }));
  const gate = asDict(raw.payment_gate ?? raw.payment);
  const pack = asDict(raw.package);
  const requestId = asStr(raw.checkout_request_id ?? raw.request_id ?? gate.id);
  const status = asStr(raw.promotion_status ?? raw.status).toLowerCase();
  return {
    requestId,
    // The documented answer carries the package, not an amount of its own.
    amount: uzs(gate, "amount") || uzs(raw, "amount") || uzs(pack, "price"),
    currency: asStr(gate.currency ?? raw.currency ?? pack.currency, "UZS") || "UZS",
    // The 10-09 answer has no telegram_sent: a request that is waiting for the
    // Telegram approval says so with promotion_status and a checkout_request_id.
    // Reading only the older flag showed every successful checkout as failed.
    telegramSent:
      gate.telegram_sent === true ||
      raw.telegram_sent === true ||
      status.startsWith("pending") ||
      (raw.payment_required === true && !!requestId && gate.telegram_sent !== false && raw.telegram_sent !== false),
  };
}

export async function listActivePromotions(
  filter: { placement?: PromotionPlacement; serviceId?: string; sellerUserId?: string; limit?: number },
  signal?: AbortSignal,
): Promise<MarketPromotionSurface[]> {
  const qs = new URLSearchParams();
  if (filter.placement) qs.set("placement", filter.placement);
  if (filter.serviceId) qs.set("service_id", filter.serviceId);
  if (filter.sellerUserId) qs.set("seller_user_id", filter.sellerUserId);
  qs.set("limit", String(filter.limit ?? 5));
  const raw = await http(`/promotions/active?${qs}`, { signal });
  const d = asDict(raw);
  return asArr(Array.isArray(raw) ? raw : d.items ?? d.data ?? d.promotions)
    .map(normPromotionSurface)
    .filter((p) => p.id || p.sellerUserId || p.serviceId);
}
