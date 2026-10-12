"use client";

import { useLocale, useTranslations } from "next-intl";
import type { BackendService } from "@/lib/services/backend";
import type { MarketService } from "@/lib/services/marketplace";
import type { PromotionPlacement } from "@/lib/services/promotions";
import type { ManagedService, ServiceSellerProfile, ServiceStatus } from "@/lib/services/sellerServices";
import { profileVerified } from "@/lib/services/sellerServices";
import type { ProfessionalProfile } from "@/lib/types";
import { IconEyeOff, IconInfo } from "@/components/icons";
import SellerCard from "@/components/marketplace/SellerCard";
import PromotionSurfaces, { PromoBanner } from "@/components/marketplace/PromotionSurfaces";
import { SellerAbout, SellerHero, SellerServiceRow } from "@/components/marketplace/SellerParts";
import { sellerTypeLabel } from "@/components/marketplace/bits";
import { regionLabel } from "@/lib/labels";
import LivePreview, { type PreviewScene } from "./LivePreview";
import { placeService, sellerOf, surfaceOf, usePublicSeller, withServices } from "./previewSeller";

const CLIENT_BASE = "/portal/client/lawyers";
const ROWS = 4;
const noop = () => {};

function Note({ tone, children }: { tone: "warn" | "info"; children: string }) {
  const Icon = tone === "warn" ? IconEyeOff : IconInfo;
  return (
    <p className={`lpv__note lpv__note--${tone}`}>
      <Icon aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function seedOf(sellerId: string, profile: ServiceSellerProfile | null, fallbackName: string) {
  return {
    userId: sellerId,
    name: profile?.name || fallbackName,
    sellerType: profile?.sellerType ?? "",
    region: profile?.region ?? "",
    verified: profile ? profileVerified(profile) : false,
  };
}

export function ServiceLivePreview({
  sellerId,
  profile,
  service,
  price,
  note,
  status,
  promoted,
}: {
  sellerId: string;
  profile: ServiceSellerProfile;
  service: BackendService | null;
  price: number;
  note: string;
  status: ServiceStatus;
  promoted: boolean;
}) {
  const t = useTranslations("sellerServices.preview");
  const tr = useTranslations("sellerServices.reasons");
  const tm = useTranslations("marketplace");
  const locale = useLocale();
  const pub = usePublicSeller(sellerId);
  const seed = seedOf(sellerId, profile, "");
  const seller = sellerOf(pub.seller, seed);
  if (!service) return <LivePreview scenes={[]} notice={<Note tone="info">{t("pickFirst")}</Note>} />;

  const prev = pub.services.find((s) => s.id === service.id);
  const draft: MarketService = {
    id: service.id,
    title: service.name,
    categoryId: service.categoryId ?? prev?.categoryId ?? "",
    categoryTitle: service.categoryTitle || prev?.categoryTitle || "",
    basePrice: service.price ?? 0,
    selectedPrice: price,
    price: price || service.price || 0,
    currency: "UZS",
    deliveryMinutes: prev?.deliveryMinutes ?? 0,
    experienceNote: note.trim(),
    advokatRequired: service.advokatRequired,
    isSponsored: Boolean(prev?.isSponsored || promoted),
  };
  const list = placeService(pub.services, draft, service.id);
  const rows = list.length > ROWS ? [draft, ...list.filter((s) => s.id !== service.id).slice(0, ROWS - 1)] : list;
  const reasons = [!service.isActive ? "catalogOff" : "", status !== "active" ? status : "", !draft.price ? "noPrice" : "", !seed.verified ? "unverified" : ""].filter(Boolean);
  const scenes: PreviewScene[] = [
    {
      key: "profile",
      label: t("onProfile"),
      width: 760,
      render: () => (
        <section className="mk-panel">
          <div className="mkpx-row">
            <h2 className="mk-panel__t">{tm("detail.services")}</h2>
          </div>
          <p className="mk-panel__l">{tm("detail.servicesLead")}</p>
          <div className="mk-svcs" role="radiogroup" aria-label={tm("detail.services")}>
            {rows.map((s) => (
              <SellerServiceRow key={s.id} svc={s} sellerUserId={seller.userId} on={s.id === service.id} top={s.isSponsored} buyDisabled={!seller.verified || s.price <= 0} onPick={noop} onBuy={noop} />
            ))}
          </div>
        </section>
      ),
    },
    {
      key: "list",
      label: t("inList"),
      width: 380,
      render: () => <SellerCard s={withServices(seller, list)} href={`${CLIENT_BASE}/${encodeURIComponent(seller.userId)}`} index={0} locale={locale} />,
    },
  ];
  return <LivePreview scenes={scenes} notice={reasons.length ? <Note tone="warn">{t("hidden", { reasons: reasons.map((r) => tr(r)).join(", ") })}</Note> : null} />;
}

export function PromoLivePreview({
  placement,
  sellerId,
  profile,
  fallbackName,
  service,
  banner,
  bannerNote,
}: {
  placement: PromotionPlacement;
  sellerId: string;
  profile: ServiceSellerProfile | null;
  fallbackName: string;
  service: ManagedService | null;
  banner: { title: string; subtitle: string; ctaLabel: string; imageUrl: string };
  bannerNote?: string;
}) {
  const t = useTranslations("sellerServices.preview");
  const tp = useTranslations("sellerServices.promote");
  const tm = useTranslations("marketplace");
  const te = useTranslations("enums");
  const locale = useLocale();
  const pub = usePublicSeller(sellerId);
  const seller = sellerOf(pub.seller, seedOf(sellerId, profile, fallbackName));
  const href = `${CLIENT_BASE}/${encodeURIComponent(seller.userId)}`;
  const sellerLine = [seller.sellerType ? sellerTypeLabel(tm, seller.sellerType) : "", seller.region ? regionLabel(te, seller.region) : ""].filter(Boolean).join(" · ");

  if (placement === "banner") {
    const slide = surfaceOf(seller, {
      placement: "banner",
      serviceId: service?.id ?? "",
      serviceTitle: service?.service.name ?? "",
      title: banner.title.trim() || seller.name,
      subtitle: banner.subtitle.trim() || sellerLine,
      ctaLabel: banner.ctaLabel.trim() || tp("previewCta"),
      imageUrl: banner.imageUrl,
      bannerMode: banner.imageUrl ? "image" : "profile_card",
    });
    const scenes: PreviewScene[] = [
      {
        key: "banner",
        label: t("onTop"),
        width: 1100,
        render: () => (
          <div className="mk-promo-surfaces">
            <div className="mk-promo-carousel">
              <div className="mk-promo-carousel__slide">
                <PromoBanner banner={slide} base={CLIENT_BASE} preview eyebrow={tm("promotions.sponsored")} />
              </div>
            </div>
          </div>
        ),
      },
    ];
    return <LivePreview scenes={scenes} notice={bannerNote ? <Note tone="info">{bannerNote}</Note> : banner.imageUrl ? null : <Note tone="info">{tp("previewBannerNoImage")}</Note>} foot={t("footPromo")} />;
  }

  if (placement === "profile_boost") {
    const boosted = { ...seller, isSponsored: true, promotion: { id: "", active: true, packageTitle: "", daysLeft: 0, boostScore: 0, serviceId: "", serviceTitle: "" } };
    const scenes: PreviewScene[] = [
      {
        key: "list",
        label: t("inListTop"),
        width: 760,
        render: () => (
          <div className="mk-grid">
            <SellerCard s={boosted} href={href} index={0} locale={locale} />
            <div className="mk-card mk-card--ghost" aria-hidden="true" />
          </div>
        ),
      },
    ];
    return <LivePreview scenes={scenes} foot={t("footPromo")} />;
  }

  if (!service) return <LivePreview scenes={[]} notice={<Note tone="info">{tp("pickServiceFirst")}</Note>} foot={t("footPromo")} />;
  const title = service.service.name;
  const list = pub.services.map((s) => (s.id === service.id ? { ...s, isSponsored: true } : s));
  const withTop = withServices({ ...seller, promotion: { id: "", active: true, packageTitle: "", daysLeft: 0, boostScore: 0, serviceId: service.id, serviceTitle: title } }, list.some((s) => s.id === service.id) ? list : [...list, { ...emptyService(service), isSponsored: true }]);
  const scenes: PreviewScene[] = [
    {
      key: "search",
      label: t("inSearch"),
      width: 900,
      render: () => <PromotionSurfaces part="sponsored" sponsored={[surfaceOf(seller, { serviceId: service.id, serviceTitle: title })]} base={CLIENT_BASE} />,
    },
    {
      key: "list",
      label: t("inList"),
      width: 380,
      render: () => <SellerCard s={withTop} href={href} index={0} locale={locale} />,
    },
  ];
  return <LivePreview scenes={scenes} foot={t("footPromo")} />;
}

function emptyService(item: ManagedService): MarketService {
  return {
    id: item.id,
    title: item.service.name,
    categoryId: item.service.categoryId ?? "",
    categoryTitle: item.service.categoryTitle ?? "",
    basePrice: item.service.price ?? 0,
    selectedPrice: item.selectedPrice,
    price: item.effectivePrice,
    currency: "UZS",
    deliveryMinutes: 0,
    experienceNote: item.experienceNote,
    advokatRequired: item.service.advokatRequired,
    isSponsored: false,
  };
}

export function ProfileLivePreview({ draft, userId, role }: { draft: ProfessionalProfile; userId: string; role: "advocate" | "lawyer" }) {
  const t = useTranslations("sellerServices.preview");
  const locale = useLocale();
  const pub = usePublicSeller(userId);
  const base = sellerOf(pub.seller, { userId, name: draft.name, sellerType: role === "advocate" ? "advokat" : "yurist", region: draft.region ?? "", verified: false });
  const stats = draft.stats;
  const seller = {
    ...base,
    name: draft.name.trim() || base.name,
    region: draft.region ?? base.region,
    district: draft.district ?? base.district,
    specializations: draft.practiceAreas,
    languages: draft.languages,
    bio: (draft.bio ?? "").trim(),
    education: (draft.education ?? "").trim(),
    experienceYears: draft.advocateYears || draft.experienceYears || draft.lawyerYears || 0,
    totalCases: stats?.totalCases ?? base.totalCases,
    winsCount: stats?.fullyWonCases ?? base.winsCount,
    partialWins: stats?.partiallyWonCases ?? base.partialWins,
    successRate: stats?.successRate ?? base.successRate,
    licenseNumber: (draft.licenseNumber ?? "").trim(),
    barAssociation: (draft.barAssociation ?? "").trim(),
    organizationName: (draft.orgName ?? "").trim(),
  };
  const scenes: PreviewScene[] = [
    { key: "list", label: t("inList"), width: 380, render: () => <SellerCard s={seller} href={`${CLIENT_BASE}/${encodeURIComponent(userId)}`} index={0} locale={locale} /> },
    { key: "hero", label: t("onProfileHead"), width: 900, render: () => <SellerHero seller={seller} top={false} /> },
    { key: "about", label: t("onProfileAbout"), width: 600, render: () => <SellerAbout seller={seller} /> },
  ];
  return <LivePreview scenes={scenes} notice={pub.ready && !pub.seller ? <Note tone="warn">{t("notListed")}</Note> : null} />;
}
