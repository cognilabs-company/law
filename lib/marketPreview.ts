import { normMarketSeller, type MarketPromotionSurface, type MarketSeller, type MarketSellerDetail, type MarketService } from "@/lib/services/marketplace";
import type { PromotionPlacement } from "@/lib/services/promotions";
import type { ManagedService } from "@/lib/services/sellerServices";
import type { RuntimeConfig } from "@/lib/services/marketRuntime";

export const PREVIEW_PATH = "/marketplace-preview";
export const PREVIEW_READY = "lexgo-pv:ready";
export const PREVIEW_DRAFT = "lexgo-pv:draft";
export const PREVIEW_META = "lexgo-pv:meta";
export const PH_SERVICE_ID = "__draft__";

export type PreviewView = "market" | "profile";

export type PreviewSeed = { name: string; sellerType: string; region: string; verified: boolean };

export type PreviewService = {
  id: string;
  title: string;
  categoryId: string;
  categoryTitle: string;
  basePrice: number;
  price: number;
  note: string;
  advokatRequired: boolean;
};

export type PreviewAd = { placement: PromotionPlacement; title: string; subtitle: string; ctaLabel: string; imageUrl: string };

export type PreviewProfile = Pick<
  MarketSeller,
  "name" | "region" | "district" | "specializations" | "languages" | "bio" | "education" | "experienceYears" | "totalCases" | "winsCount" | "partialWins" | "successRate" | "licenseNumber" | "barAssociation" | "organizationName"
>;

export type PreviewDraft = {
  kind: "service" | "ad" | "profile";
  sellerId: string;
  seed: PreviewSeed;
  service: PreviewService | null;
  ad: PreviewAd | null;
  profile: PreviewProfile | null;
};

export type PreviewMessage = { type: typeof PREVIEW_DRAFT; draft: PreviewDraft; view: PreviewView };
export type PreviewMeta = { type: typeof PREVIEW_META; listed: boolean };

export function previewServiceOf(item: ManagedService): PreviewService {
  return {
    id: item.id,
    title: item.service.name,
    categoryId: item.service.categoryId ?? "",
    categoryTitle: item.service.categoryTitle ?? "",
    basePrice: item.service.price ?? 0,
    price: item.selectedPrice,
    note: item.experienceNote,
    advokatRequired: item.service.advokatRequired,
  };
}

export function seedSeller(sellerId: string, seed: PreviewSeed): MarketSeller {
  return normMarketSeller({ user_id: sellerId, lawyer_name: seed.name, seller_type: seed.sellerType, region: seed.region, is_verified: seed.verified });
}

export function placeService(list: MarketService[], next: MarketService, id: string): MarketService[] {
  const at = list.findIndex((s) => s.id === id);
  if (at < 0) return [...list, next];
  return list.map((s, i) => (i === at ? next : s));
}

export function withServices(seller: MarketSeller, list: MarketService[]): MarketSeller {
  const prices = list.map((s) => s.price).filter((p) => p > 0);
  return {
    ...seller,
    services: list,
    serviceTitles: [],
    servicesCount: list.length,
    priceFrom: prices.length ? Math.min(...prices) : 0,
    priceTo: prices.length ? Math.max(...prices) : 0,
  };
}

function marketServiceOf(svc: PreviewService, prev: MarketService | undefined, sponsored: boolean): MarketService {
  return {
    id: svc.id,
    title: svc.title,
    categoryId: svc.categoryId || prev?.categoryId || "",
    categoryTitle: svc.categoryTitle || prev?.categoryTitle || "",
    basePrice: svc.basePrice,
    selectedPrice: svc.price,
    price: svc.price || svc.basePrice,
    currency: "UZS",
    deliveryMinutes: prev?.deliveryMinutes ?? 0,
    experienceNote: svc.note.trim(),
    advokatRequired: svc.advokatRequired,
    isSponsored: sponsored || Boolean(prev?.isSponsored),
  };
}

export function emptyService(): MarketService {
  return { id: PH_SERVICE_ID, title: "", categoryId: "", categoryTitle: "", basePrice: 0, selectedPrice: 0, price: 0, currency: "UZS", deliveryMinutes: 0, experienceNote: "", advokatRequired: false, isSponsored: false };
}

export type DirectoryPreview = { seller: MarketSeller; first: boolean; banner: MarketPromotionSurface | null; tile: MarketPromotionSurface | null; phService: string };

// `facts`: the picked service's runtime config, when the preview already has
// it (a Studio draft) rather than fetching it from a saved service.
// `signedIn`: drawn as a signed-in client sees it, not as a visitor.
export type ProfilePreview = { seller: MarketSellerDetail; services: MarketService[]; picked: string; top: boolean; topServiceId: string; ph: { title: string; category: string; price: string } | null; facts?: RuntimeConfig; signedIn?: boolean };

export type MergedSeller ={ seller: MarketSeller; services: MarketService[]; serviceId: string };

export function mergeSeller(base: MarketSeller, services: MarketService[], d: PreviewDraft): MergedSeller {
  let seller: MarketSeller = d.profile ? { ...base, ...d.profile, name: d.profile.name || base.name } : base;
  let list = services;
  let serviceId = "";
  if (d.kind === "service") {
    serviceId = d.service ? d.service.id : PH_SERVICE_ID;
    list = d.service ? placeService(services, marketServiceOf(d.service, services.find((s) => s.id === d.service?.id), false), d.service.id) : [...services, emptyService()];
    seller = withServices(seller, d.service ? list : services);
  }
  if (d.kind === "ad" && d.ad?.placement === "profile_boost") {
    seller = { ...seller, isSponsored: true, promotion: { id: "", active: true, packageTitle: "", daysLeft: 0, boostScore: 0, serviceId: "", serviceTitle: "" } };
  }
  if (d.kind === "ad" && d.ad?.placement === "service_boost") {
    serviceId = d.service ? d.service.id : PH_SERVICE_ID;
    if (d.service) {
      const prev = services.find((s) => s.id === d.service?.id);
      list = placeService(services, { ...(prev ?? marketServiceOf(d.service, undefined, true)), isSponsored: true }, d.service.id);
      seller = withServices({ ...seller, promotion: { id: "", active: true, packageTitle: "", daysLeft: 0, boostScore: 0, serviceId: d.service.id, serviceTitle: d.service.title } }, list);
    } else {
      list = [{ ...emptyService(), isSponsored: true }, ...services];
      seller = { ...seller, promotion: { id: "", active: true, packageTitle: "", daysLeft: 0, boostScore: 0, serviceId: "", serviceTitle: "" } };
    }
  }
  return { seller, services: list, serviceId };
}

export function adSurface(seller: MarketSeller, d: PreviewDraft, phLabel: string): MarketPromotionSurface | null {
  const ad = d.ad;
  if (d.kind !== "ad" || !ad || ad.placement === "profile_boost") return null;
  const base: MarketPromotionSurface = {
    id: "",
    placement: ad.placement,
    sellerUserId: seller.userId,
    sellerName: seller.name,
    serviceId: "",
    serviceTitle: "",
    title: "",
    subtitle: "",
    ctaLabel: "",
    ctaUrl: "",
    imageUrl: "",
    boostScore: 0,
    isSponsored: true,
    bannerMode: "",
    daysLeft: -1,
    seller: {
      rating: seller.rating,
      reviews: seller.reviewsCount,
      verified: seller.verified,
      type: seller.sellerType,
      specialization: seller.specializations[0] ?? "",
      region: seller.region,
      experience: seller.experienceYears,
      headline: "",
    },
  };
  if (ad.placement === "banner") {
    const auto = [!ad.title.trim() ? "title" : "", !ad.subtitle.trim() ? "subtitle" : "", !ad.ctaLabel.trim() ? "cta" : ""].filter(Boolean) as ("title" | "subtitle" | "cta")[];
    return { ...base, title: ad.title.trim(), subtitle: ad.subtitle.trim(), ctaLabel: ad.ctaLabel.trim(), imageUrl: ad.imageUrl, bannerMode: ad.imageUrl ? "image" : "profile_card", draft: { auto } };
  }
  return d.service ? { ...base, serviceId: d.service.id, serviceTitle: d.service.title } : { ...base, draft: { ph: phLabel } };
}
