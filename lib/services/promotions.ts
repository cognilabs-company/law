import { asArr, asDict, asNum, asStr, http, type Dict } from "@/lib/http";
import { uzs } from "@/lib/money";
import type { AdPackage, PromotionRequest, ServiceScope } from "@/lib/services/sellerServices";

export const PROMOTION_PLACEMENTS = ["banner", "profile_boost", "service_boost"] as const;
export type PromotionPlacement = (typeof PROMOTION_PLACEMENTS)[number];

export type PromotionPlacementOption = {
  value: PromotionPlacement;
  label: string;
  requiresService: boolean;
  requiresBanner: boolean;
};

export type PromotionPackage = AdPackage & {
  placement: PromotionPlacement;
  boostScore: number;
  requiresService: boolean;
  requiresBanner: boolean;
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

function normPlacement(value: unknown): PromotionPlacementOption {
  const d = asDict(value);
  const placement = placementOf(d.value ?? d.key ?? d.placement ?? d.code);
  return {
    value: placement,
    label: asStr(d.label ?? d.title ?? d.name, placement),
    requiresService: d.requires_service === true || placement === "service_boost",
    requiresBanner: d.requires_banner === true || placement === "banner",
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
    requiresService: d.requires_service === true || payload.requires_service === true || placement === "service_boost",
    requiresBanner: d.requires_banner === true || payload.requires_banner === true || placement === "banner",
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
      items: legacy.map((item) => ({ ...item, placement: placement ?? "service_boost", boostScore: 0, requiresService: placement !== "profile_boost", requiresBanner: placement === "banner", preview: {} })),
      placements: PROMOTION_PLACEMENTS.map((value) => ({ value, label: value, requiresService: value === "service_boost", requiresBanner: value === "banner" })),
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
  if (input.title?.trim()) body.title = input.title.trim();
  if (input.subtitle?.trim()) body.subtitle = input.subtitle.trim();
  if (input.ctaLabel?.trim()) body.cta_label = input.ctaLabel.trim();
  if (input.ctaUrl?.trim()) body.cta_url = input.ctaUrl.trim();
  if (input.previewContext) body.preview_context = input.previewContext;
  const raw = asDict(await http("/promotions/checkout", { method: "POST", body: JSON.stringify(body) }));
  const gate = asDict(raw.payment_gate ?? raw.payment);
  return {
    requestId: asStr(raw.checkout_request_id ?? raw.request_id ?? gate.id),
    amount: uzs(gate, "amount") || uzs(raw, "amount"),
    currency: asStr(gate.currency ?? raw.currency, "UZS") || "UZS",
    telegramSent: gate.telegram_sent === true || raw.telegram_sent === true,
  };
}
