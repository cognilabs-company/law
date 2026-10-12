import { useEffect, useState } from "react";
import {
  getMarketplaceSeller,
  getMarketplaceSellerServices,
  normMarketSeller,
  type MarketPromotionSurface,
  type MarketSeller,
  type MarketService,
} from "@/lib/services/marketplace";

type Snapshot = { seller: MarketSeller | null; services: MarketService[] };

const TTL = 60_000;
const memo = new Map<string, { at: number; p: Promise<Snapshot> }>();

function loadPublic(userId: string): Promise<Snapshot> {
  const hit = memo.get(userId);
  if (hit && Date.now() - hit.at < TTL) return hit.p;
  const p = Promise.all([getMarketplaceSeller(userId).catch(() => null), getMarketplaceSellerServices(userId).catch(() => [] as MarketService[])]).then(([seller, services]) => ({
    seller,
    services: services.length ? services : (seller?.services ?? []),
  }));
  memo.set(userId, { at: Date.now(), p });
  return p;
}

export function usePublicSeller(userId: string): Snapshot & { ready: boolean } {
  const [state, setState] = useState<(Snapshot & { id: string }) | null>(null);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void loadPublic(userId).then((r) => {
      if (alive) setState({ id: userId, ...r });
    });
    return () => {
      alive = false;
    };
  }, [userId]);
  const cur = state && state.id === userId ? state : null;
  return { ready: Boolean(cur), seller: cur?.seller ?? null, services: cur?.services ?? [] };
}

export type SellerSeed = { userId: string; name: string; sellerType: string; region: string; verified: boolean };

export function sellerOf(pub: MarketSeller | null, seed: SellerSeed): MarketSeller {
  if (pub) return pub;
  return normMarketSeller({ user_id: seed.userId, lawyer_name: seed.name, seller_type: seed.sellerType, region: seed.region, is_verified: seed.verified });
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

export function placeService(list: MarketService[], draft: MarketService | null, id: string): MarketService[] {
  const at = list.findIndex((s) => s.id === id);
  const rest = list.filter((s) => s.id !== id);
  if (!draft) return rest;
  if (at < 0) return [...rest, draft];
  return [...rest.slice(0, at), draft, ...rest.slice(at)];
}

export function surfaceOf(seller: MarketSeller, patch: Partial<MarketPromotionSurface>): MarketPromotionSurface {
  return {
    id: "",
    placement: "service_boost",
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
    ...patch,
  };
}
