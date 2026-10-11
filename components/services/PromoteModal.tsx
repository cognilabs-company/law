"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import SearchSelect from "@/components/SearchSelect";
import {
  pendingPromoKey,
  savePendingPromo,
  serviceErrorOf,
  type ManagedService,
  type PromotionRequest,
  type ServiceError,
  type ServiceScope,
  type ServiceSellerProfile,
} from "@/lib/services/sellerServices";
import { checkoutMarketplacePromotion, listPromotionPackages, uploadPromotionBanner, type PromotionPackage, type PromotionPlacement, type PromotionPlacementOption } from "@/lib/services/promotions";
import type { MarketPromotionSurface } from "@/lib/services/marketplace";
import { IconAlert, IconArrowRight, IconCheck, IconCircleCheck, IconClock, IconCrown, IconGem, IconInfo, IconMegaphone, IconRefresh, IconRocket, IconStar, IconTrendingUp, IconUpload, IconUser } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { regionLabel } from "@/lib/labels";
import { Monogram, sellerTypeLabel } from "@/components/marketplace/bits";
import { PromoBanner } from "@/components/marketplace/PromotionSurfaces";
import { InBody, som, usePackageName } from "./bits";

type Packs = { status: "loading" | "ready" | "error"; items: PromotionPackage[]; placements: PromotionPlacementOption[] };
const TIER_ICON = [IconRocket, IconGem, IconCrown];
const MAX_BANNER_MB = 10;
const HTTP_URL = /^https?:\/\/\S+\.\S+/i;
const CTA_URL = /^(https?:\/\/\S+\.\S+|\/\S*)$/i;
const FALLBACK_PLACEMENTS: PromotionPlacementOption[] = [
  { value: "service_boost", label: "", requiresService: true, requiresBanner: false, acceptsBanner: false, previewSurface: "category_search_sponsored_service" },
  { value: "profile_boost", label: "", requiresService: false, requiresBanner: false, acceptsBanner: false, previewSurface: "marketplace_list_card" },
  { value: "banner", label: "", requiresService: false, requiresBanner: false, acceptsBanner: true, previewSurface: "marketplace_top_banner" },
];

// The promote dialog (10-09 §1–4, §11): placement first, then that
// placement's packages, then whatever the package needs — a service for a
// service boost, a picture (optional unless required) for a banner — and a
// preview of exactly what a client will see, before anything is sent.
//
// `item` opens it for one service (the service card); without it the seller
// picks the placement and, for a service boost, one of `services`.
export default function PromoteModal({
  item,
  services,
  profile,
  startPlacement,
  scope,
  uid,
  owner,
  onClose,
  onSent,
  onStale,
  aiId,
}: {
  item?: ManagedService;
  services?: ManagedService[];
  profile?: ServiceSellerProfile | null;
  startPlacement?: PromotionPlacement;
  scope: ServiceScope;
  uid: string;
  owner: boolean;
  onClose: () => void;
  onSent: (req: PromotionRequest) => void;
  onStale?: () => void;
  aiId?: string;
}) {
  const t = useTranslations("sellerServices.promote");
  const tc = useTranslations("sellerServices");
  const tm = useTranslations("marketplace");
  const te = useTranslations("enums");
  const packName = usePackageName();
  const placementName = (value: PromotionPlacement) => t(value === "banner" ? "placementBanner" : value === "profile_boost" ? "placementProfile" : "placementService");
  const [packs, setPacks] = useState<Packs>({ status: "loading", items: [], placements: [] });
  const [tick, setTick] = useState(0);
  const [placement, setPlacement] = useState<PromotionPlacement>(startPlacement ?? (item ? "service_boost" : "profile_boost"));
  const [picked, setPicked] = useState("");
  const [svcId, setSvcId] = useState(item?.id ?? "");
  const [bannerImageUrl, setBannerImageUrl] = useState("");
  const [bannerFileUrl, setBannerFileUrl] = useState("");
  const [bannerTitle, setBannerTitle] = useState("");
  const [bannerSubtitle, setBannerSubtitle] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [bannerFileName, setBannerFileName] = useState("");
  // The uploaded picture, shown from the browser's own copy: the preview must
  // not depend on the stored file being readable yet.
  const [bannerLocal, setBannerLocal] = useState("");
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<PromotionRequest | null>(null);

  useEffect(() => {
    const c = new AbortController();
    listPromotionPackages(placement, c.signal)
      .then((catalog) => {
        if (!c.signal.aborted) {
          setPacks({ status: "ready", items: catalog.items, placements: catalog.placements });
          setPicked("");
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setPacks((cur) => ({ status: "error", items: [], placements: cur.placements }));
      });
    return () => c.abort();
  }, [tick, placement]);

  // Switching placement drops the old list at once: until the new one
  // arrives nothing of the previous placement may be picked or sent.
  const pickPlacement = (value: PromotionPlacement) => {
    if (value === placement) return;
    setPlacement(value);
    setPacks((cur) => ({ ...cur, status: "loading", items: [] }));
    setPicked("");
    setErr("");
  };

  const items = packs.status === "ready" ? packs.items : [];
  const feat = items.length >= 3 ? items[1].id : items.length ? items[items.length - 1].id : "";
  const chosen = items.find((p) => p.id === picked) ?? items.find((p) => p.id === feat) ?? null;

  const errLine = (e: ServiceError) => {
    if (e.kind === "notFound") return t("notFound");
    if (e.kind === "forbidden") return tc(owner ? "errors.forbiddenOwner" : "errors.forbidden");
    if (e.kind === "pendingAccount") return tc(owner ? "errors.pendingAccountOwner" : "errors.pendingAccount");
    if (e.kind === "range" || e.kind === "advocateOnly") return tc("errors.unknown");
    return tc(`errors.${e.kind}`);
  };

  const selectedPlacement = packs.placements.find((p) => p.value === placement);
  // Whether a picture may be given, and whether one must be, are the
  // backend's flags (package first, then placement) — not a rule of ours.
  const acceptsBanner = Boolean(chosen?.acceptsBanner ?? selectedPlacement?.acceptsBanner ?? placement === "banner");
  const needsBanner = Boolean(chosen?.requiresBanner || selectedPlacement?.requiresBanner);
  const needsService = Boolean(chosen?.requiresService || selectedPlacement?.requiresService || placement === "service_boost");
  const svcOptions = services?.length ? services : item ? [item] : [];
  const svc = svcOptions.find((s) => s.id === svcId) ?? null;
  const missingBanner = needsBanner && !bannerImageUrl && !bannerFileUrl;
  const missingService = needsService && !svc;
  const badImage = Boolean(bannerImageUrl.trim()) && !HTTP_URL.test(bannerImageUrl.trim());
  const badCta = Boolean(ctaUrl.trim()) && !CTA_URL.test(ctaUrl.trim());
  const blocked = !chosen || chosen.placement !== placement || missingBanner || missingService || (acceptsBanner && (badImage || badCta));

  useEffect(() => () => { if (bannerLocal) URL.revokeObjectURL(bannerLocal); }, [bannerLocal]);

  const send = async () => {
    if (!chosen || busy || blocked) return;
    setBusy(true);
    setErr("");
    try {
      const req = await checkoutMarketplacePromotion(
        {
          packageId: chosen.id,
          days: chosen.days,
          placement,
          serviceId: needsService && svc ? svc.id : undefined,
          bannerImageUrl: acceptsBanner ? bannerImageUrl.trim() : "",
          bannerFileUrl: acceptsBanner ? bannerFileUrl : "",
          title: acceptsBanner ? bannerTitle : "",
          subtitle: acceptsBanner ? bannerSubtitle : "",
          ctaLabel: acceptsBanner ? ctaLabel : "",
          ctaUrl: acceptsBanner ? ctaUrl.trim() : "",
          previewContext: {
            surface: selectedPlacement?.previewSurface || FALLBACK_PLACEMENTS.find((p) => p.value === placement)?.previewSurface,
            ...(needsService && svc ? { service_title: svc.service.name } : {}),
            placement,
          },
        },
        scope,
        uid,
      );
      if (req.telegramSent) {
        savePendingPromo(uid, needsService && svc ? pendingPromoKey(scope, svc.id) : pendingPromoKey("profile"), {
          requestId: req.requestId,
          packageTitle: packName(chosen.title, chosen.placement),
          amount: req.amount,
          currency: req.currency,
          telegramSent: req.telegramSent,
        });
      }
      setDone(req);
      onSent(req);
    } catch (e) {
      const se = serviceErrorOf(e);
      setErr(errLine(se));
      if (se.kind === "notFound" || se.kind === "inactivePromo") onStale?.();
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (!busy) onClose();
  };

  const activated = Boolean(done?.activated);
  const sent = Boolean(done?.telegramSent) || activated;
  const sellerName = profile?.name || session?.name || t("previewSeller");
  const sellerLine = [profile?.sellerType ? sellerTypeLabel(tm, profile.sellerType) : "", profile?.region ? regionLabel(te, profile.region) : ""].filter(Boolean).join(" · ");
  const previewImage = bannerLocal || (HTTP_URL.test(bannerImageUrl.trim()) ? bannerImageUrl.trim() : "");
  const heic = /\.heic$/i.test(bannerFileName);
  const previewBanner: MarketPromotionSurface = {
    id: "preview",
    placement: "banner",
    sellerUserId: profile?.userId ?? "",
    sellerName,
    serviceId: svc?.id ?? "",
    serviceTitle: svc?.service.name ?? "",
    title: bannerTitle.trim() || sellerName,
    subtitle: bannerSubtitle.trim() || sellerLine,
    ctaLabel: ctaLabel.trim() || t("previewCta"),
    ctaUrl: "",
    imageUrl: previewImage,
    boostScore: 0,
    isSponsored: true,
    bannerMode: previewImage ? "image" : "profile_card",
    daysLeft: -1,
    seller: { rating: 0, reviews: 0, verified: Boolean(profile?.isVerified), type: profile?.sellerType ?? "", specialization: "", region: profile?.region ?? "", experience: 0, headline: "" },
  };

  async function onBannerFile(file: File | undefined) {
    if (!file || uploading) return;
    if (!/\.(jpe?g|png|webp|heic)$/i.test(file.name)) {
      setErr(t("bannerType"));
      return;
    }
    if (file.size > MAX_BANNER_MB * 1024 * 1024) {
      setErr(t("bannerTooBig", { mb: MAX_BANNER_MB }));
      return;
    }
    setUploading(true);
    setErr("");
    try {
      setBannerFileUrl(await uploadPromotionBanner(file));
      setBannerFileName(file.name);
      setBannerImageUrl("");
      // A HEIC picture is stored fine but most browsers cannot draw it.
      setBannerLocal(/\.heic$/i.test(file.name) ? "" : URL.createObjectURL(file));
    } catch {
      setErr(t("bannerUploadError"));
    } finally {
      setUploading(false);
    }
  }

  const title = item ? t("title") : t("titleAny");

  return (
    <InBody>
      <Modal open onClose={close} title={title}>
        {done ? (
          <div className="svpdone" role="status" data-ai-id={aiId} data-ai-type={aiId ? "modal" : undefined} data-ai-label={aiId ? title : undefined}>
            <span className={`svpdone__ic${sent ? (activated ? " is-ok" : "") : " is-bad"}`} aria-hidden="true">
              {activated ? <IconCircleCheck /> : sent ? <IconClock /> : <IconAlert />}
            </span>
            <b className="svpdone__t">{activated ? t("activeTitle") : sent ? t("doneTitle") : t("failTitle")}</b>
            <p className="svpdone__p">{activated ? t("activeText") : sent ? t("doneText") : t("failText")}</p>
            <div className="svpdone__rows">
              <span>{t("placementTitle")}</span>
              <b>{placementName(placement)}</b>
              {needsService && svc ? (
                <>
                  <span>{t("service")}</span>
                  <b>{svc.service.name}</b>
                </>
              ) : null}
              {chosen ? (
                <>
                  <span>{t("package")}</span>
                  <b>{packName(chosen.title, chosen.placement)}</b>
                </>
              ) : null}
              <span>{t("amount")}</span>
              <b>
                {som(done.amount || chosen?.price || 0)} {done.currency === "UZS" ? tc("card.som") : done.currency}
              </b>
              {done.requestId ? (
                <>
                  <span>{t("request")}</span>
                  <b className="svpdone__id">{done.requestId.slice(0, 8).toUpperCase()}</b>
                </>
              ) : null}
            </div>
            {sent ? (
              <>
                {activated ? null : (
                  <p className="svpdone__tg is-ok">
                    <IconCheck aria-hidden="true" />
                    {t("telegramOk")}
                  </p>
                )}
                <button type="button" className="btn btn--pri btn--full" onClick={onClose}>
                  {t("close")}
                </button>
              </>
            ) : (
              <div className="svpdone__acts">
                <button type="button" className="btn btn--line" onClick={onClose}>
                  {t("close")}
                </button>
                <button type="button" className="btn btn--grad" onClick={() => setDone(null)} data-ai-id={aiId ? `${aiId}.retry` : undefined}>
                  <IconRefresh aria-hidden="true" />
                  {t("retry")}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="svprom" data-ai-id={aiId} data-ai-type={aiId ? "modal" : undefined} data-ai-label={aiId ? title : undefined}>
            <p className="svprom__lead">{item ? t("lead") : t("leadAny")}</p>

            <span className="svprom__step">{t("step1")}</span>
            <div className="svprom__placements" role="radiogroup" aria-label={t("placementTitle")}>
              {(packs.placements.length ? packs.placements : FALLBACK_PLACEMENTS).map((option) => (
                <button key={option.value} type="button" role="radio" aria-checked={placement === option.value} className={`svplace${placement === option.value ? " is-on" : ""}`} onClick={() => pickPlacement(option.value)}>
                  <b>{placementName(option.value)}</b>
                  <small>{option.value === "banner" ? t("placementBannerHint") : option.value === "service_boost" ? t("placementServiceHint") : t("placementProfileHint")}</small>
                </button>
              ))}
            </div>

            {needsService ? (
              item && svcOptions.length < 2 ? (
                <div className="svprom__svc">
                  <span className="svprom__svcic" aria-hidden="true">
                    <IconMegaphone />
                  </span>
                  <span>
                    <small>{t("service")}</small>
                    <b>{item.service.name}</b>
                  </span>
                </div>
              ) : (
                <div className="svprom__pick">
                  <span>{t("pickService")}</span>
                  {svcOptions.length ? (
                    <SearchSelect
                      single
                      value={svcId ? [svcId] : []}
                      onChange={(v) => setSvcId(v[0] ?? "")}
                      options={svcOptions.map((s) => ({ value: s.id, label: s.service.name, sub: s.effectivePrice ? `${som(s.effectivePrice)} ${tc("card.som")}` : undefined }))}
                      placeholder={t("pickServicePh")}
                      searchPlaceholder={t("pickServiceSearch")}
                      emptyText={t("pickServiceNone")}
                      ariaLabel={t("pickService")}
                    />
                  ) : (
                    <small className="svprom__warn">{t("pickServiceNone")}</small>
                  )}
                </div>
              )
            ) : (
              <div className="svprom__svc">
                <span className="svprom__svcic" aria-hidden="true">
                  <IconUser />
                </span>
                <span>
                  <small>{t("seller")}</small>
                  <b>{sellerName}</b>
                </span>
              </div>
            )}

            <span className="svprom__step">{t("step2")}</span>
            {packs.status === "loading" ? (
              <div className="svprom__grid" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="svpk is-skel" />
                ))}
              </div>
            ) : packs.status === "error" ? (
              <div className="svprom__empty">
                <IconAlert aria-hidden="true" />
                <b>{t("loadError")}</b>
                <button type="button" className="btn btn--line btn--sm" onClick={() => setTick((n) => n + 1)}>
                  {tc("retry")}
                </button>
              </div>
            ) : !items.length ? (
              <div className="svprom__empty">
                <IconRocket aria-hidden="true" />
                <b>{t("empty")}</b>
                <p>{t("emptyText")}</p>
              </div>
            ) : (
              <div className="svprom__grid" role="radiogroup" aria-label={t("packages")} data-ai-id={aiId ? `${aiId}.packages` : undefined} data-ai-type={aiId ? "select" : undefined}>
                {items.map((p, i) => {
                  const Icon = TIER_ICON[Math.min(i, TIER_ICON.length - 1)];
                  const on = chosen?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={`svpk${on ? " is-on" : ""}${p.id === feat ? " svpk--feat" : ""}`}
                      onClick={() => setPicked(p.id)}
                    >
                      {p.id === feat ? <span className="svpk__rib">{t("popular")}</span> : null}
                      <span className="svpk__ic" aria-hidden="true">
                        <Icon />
                      </span>
                      <b className="svpk__name">{packName(p.title, p.placement)}</b>
                      <span className="svpk__days">{t("days", { d: p.days })}</span>
                      {p.reach ? (
                        <span className="svpk__reach">
                          <IconTrendingUp aria-hidden="true" />
                          {t("reach", { x: p.reach })}
                        </span>
                      ) : null}
                      <span className="svpk__price">
                        {som(p.price)} <small>{p.currency === "UZS" ? tc("card.som") : p.currency}</small>
                      </span>
                      <span className="svpk__check" aria-hidden="true">
                        <IconCheck />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {acceptsBanner ? (
              <div className="svprom__bannerform">
                <b className="svprom__formt">{needsBanner ? t("bannerRequired") : t("bannerOptional")}</b>
                <label className="svfile">
                  <span>{t("bannerFile")}</span>
                  <input className="svfile__in" type="file" accept=".jpg,.jpeg,.png,.webp,.heic" onChange={(e) => void onBannerFile(e.target.files?.[0])} disabled={uploading} />
                  <span className={`svfile__box${bannerFileUrl ? " is-on" : ""}`}>
                    <span className="btn btn--line btn--sm svfile__btn">
                      <IconUpload aria-hidden="true" />
                      {uploading ? t("bannerUploading") : t("bannerPick")}
                    </span>
                    <small>{bannerFileUrl ? bannerFileName || t("bannerUploaded") : t("bannerNoFile", { mb: MAX_BANNER_MB })}</small>
                  </span>
                </label>
                <span className="svprom__or">{t("or")}</span>
                <label className={badImage ? "is-bad" : undefined}>
                  <span>{t("bannerImageUrl")}</span>
                  <input
                    value={bannerImageUrl}
                    onChange={(e) => {
                      setBannerImageUrl(e.target.value);
                      setBannerFileUrl("");
                      setBannerLocal("");
                      setBannerFileName("");
                    }}
                    placeholder="https://"
                    inputMode="url"
                    aria-invalid={badImage || undefined}
                  />
                  {badImage ? <small className="svprom__ferr">{t("badUrl")}</small> : null}
                </label>
                <div className="svprom__fields">
                  <label>
                    <span>{t("bannerTitle")}</span>
                    <input value={bannerTitle} onChange={(e) => setBannerTitle(e.target.value)} placeholder={sellerName} maxLength={80} />
                  </label>
                  <label>
                    <span>{t("bannerSubtitle")}</span>
                    <input value={bannerSubtitle} onChange={(e) => setBannerSubtitle(e.target.value)} placeholder={sellerLine || undefined} maxLength={140} />
                  </label>
                  <label>
                    <span>{t("ctaLabel")}</span>
                    <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder={t("previewCta")} maxLength={32} />
                  </label>
                  <label className={badCta ? "is-bad" : undefined}>
                    <span>{t("ctaUrl")}</span>
                    <input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder={t("ctaUrlPh")} aria-invalid={badCta || undefined} />
                    {badCta ? <small className="svprom__ferr">{t("badCta")}</small> : null}
                  </label>
                </div>
              </div>
            ) : null}

            {chosen ? (
              <div className="svprom__preview" aria-label={t("previewTitle")}>
                <div className="svprom__previewhead">
                  <span>{t("previewTitle")}</span>
                  <small>{placementName(placement)}</small>
                </div>
                {/* What a client will actually see, per placement (10-09 §11):
                    the page-top carousel, the seller card at the head of the
                    list, or the sponsored service block above the results —
                    drawn with the marketplace's own markup. */}
                {placement === "banner" ? (
                  <div className="svprom__pv">
                    <div className="svprom__pvbanner">
                      <PromoBanner banner={previewBanner} base="" preview eyebrow={tm("promotions.sponsored")} />
                    </div>
                    <p className="svprom__pvnote">{heic ? t("previewHeic") : previewImage ? t("previewBannerNote") : t("previewBannerNoImage")}</p>
                  </div>
                ) : placement === "profile_boost" ? (
                  <div className="svprom__pv">
                    <div className="svprom__pvcard is-top">
                      <Monogram name={sellerName} rating={0} showRing={false} />
                      <span className="svprom__pvt">
                        <b>{sellerName}</b>
                        <small>{sellerLine || (svc ? svc.service.name : "")}</small>
                      </span>
                      <span className="svprom__pvbadge">
                        <IconStar />
                        {tm("card.promoted")}
                      </span>
                    </div>
                    <div className="svprom__pvcard is-ghost" aria-hidden="true">
                      <span className="svprom__pvav" />
                      <span className="svprom__pvt">
                        <i />
                        <i />
                      </span>
                    </div>
                    <div className="svprom__pvcard is-ghost" aria-hidden="true">
                      <span className="svprom__pvav" />
                      <span className="svprom__pvt">
                        <i />
                        <i />
                      </span>
                    </div>
                    <p className="svprom__pvnote">{t("previewProfileNote")}</p>
                  </div>
                ) : (
                  <div className="svprom__pv">
                    <div className="mk-promo-sponsored__head svprom__pvhead">
                      <div>
                        <span>{tm("promotions.sponsored")}</span>
                        <h2>{tm("promotions.featuredTitle")}</h2>
                      </div>
                    </div>
                    <div className="svprom__pvtiles">
                      <div className="mk-promo-tile svprom__pvtile">
                        <span className="mk-promo-tile__tag">
                          <IconMegaphone /> {tm("promotions.sponsored")}
                        </span>
                        <b>{svc?.service.name || t("pickServicePh")}</b>
                        <small>{[sellerName, sellerLine].filter(Boolean).join(" · ")}</small>
                        <span className="mk-promo-tile__go">
                          <IconArrowRight />
                        </span>
                      </div>
                      <div className="svprom__pvcard is-ghost" aria-hidden="true">
                        <span className="svprom__pvav" />
                        <span className="svprom__pvt">
                          <i />
                          <i />
                        </span>
                      </div>
                    </div>
                    <p className="svprom__pvnote">{t("previewServiceNote")}</p>
                  </div>
                )}
              </div>
            ) : null}

            {chosen ? (
              <div className="svprom__sum">
                <span>{t("placementTitle")}</span>
                <b>{placementName(placement)}</b>
                <span>{t("package")}</span>
                <b>{packName(chosen.title, chosen.placement)}</b>
                <span>{t("duration")}</span>
                <b>{t("days", { d: chosen.days })}</b>
                <span>{t("amount")}</span>
                <b className="svprom__total">
                  {som(chosen.price)} {chosen.currency === "UZS" ? tc("card.som") : chosen.currency}
                </b>
              </div>
            ) : null}

            <p className="svprom__note">
              <IconInfo aria-hidden="true" />
              <span>
                {t("note")}
                {owner ? ` ${t("noteOwner")}` : ""}
              </span>
            </p>
            {err ? (
              <p className="svm__err" role="alert">
                {err}
              </p>
            ) : missingService && chosen ? (
              <p className="svprom__hint">{t("pickServiceFirst")}</p>
            ) : missingBanner && chosen ? (
              <p className="svprom__hint">{t("bannerNeeded")}</p>
            ) : null}
            <div className="svform__acts">
              <button type="button" className="btn btn--line" onClick={close} disabled={busy}>
                {tc("form.cancel")}
              </button>
              <button type="button" className="btn btn--grad" onClick={() => void send()} disabled={busy || uploading || blocked} data-ai-id={aiId ? `${aiId}.submit` : undefined}>
                <IconMegaphone aria-hidden="true" />
                {busy ? t("sending") : t("submit")}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </InBody>
  );
}
