"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import {
  pendingPromoKey,
  savePendingPromo,
  serviceErrorOf,
  type ManagedService,
  type PromotionRequest,
  type ServiceError,
  type ServiceScope,
} from "@/lib/services/sellerServices";
import { checkoutMarketplacePromotion, listPromotionPackages, uploadPromotionBanner, type PromotionPackage, type PromotionPlacement, type PromotionPlacementOption } from "@/lib/services/promotions";
import { IconAlert, IconArrowRight, IconCheck, IconClock, IconCrown, IconGem, IconInfo, IconMegaphone, IconRefresh, IconRocket, IconStar, IconTrendingUp, IconUpload } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/lawyers";
import { InBody, som, usePackageName } from "./bits";

type Packs = { status: "loading" | "ready" | "error"; items: PromotionPackage[]; placements: PromotionPlacementOption[] };
const TIER_ICON = [IconRocket, IconGem, IconCrown];

export default function PromoteModal({
  item,
  scope,
  uid,
  owner,
  onClose,
  onSent,
  onStale,
  aiId,
}: {
  item: ManagedService;
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
  const packName = usePackageName();
  const placementName = (value: PromotionPlacement) => t(value === "banner" ? "placementBanner" : value === "profile_boost" ? "placementProfile" : "placementService");
  const [packs, setPacks] = useState<Packs>({ status: "loading", items: [], placements: [] });
  const [tick, setTick] = useState(0);
  const [placement, setPlacement] = useState<PromotionPlacement>("service_boost");
  const [picked, setPicked] = useState("");
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
        if (!c.signal.aborted) setPacks({ status: "error", items: [], placements: [] });
      });
    return () => c.abort();
  }, [tick, placement]);

  const items = packs.items;
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
  const needsService = Boolean(chosen?.requiresService || placement === "service_boost");
  const missingBanner = needsBanner && !bannerImageUrl && !bannerFileUrl;

  useEffect(() => () => { if (bannerLocal) URL.revokeObjectURL(bannerLocal); }, [bannerLocal]);

  const send = async () => {
    if (!chosen || busy || missingBanner) return;
    setBusy(true);
    setErr("");
    try {
      const req = await checkoutMarketplacePromotion(
        {
          packageId: chosen.id,
          days: chosen.days,
          placement,
          serviceId: needsService ? item.id : undefined,
          bannerImageUrl: acceptsBanner ? bannerImageUrl : "",
          bannerFileUrl: acceptsBanner ? bannerFileUrl : "",
          title: acceptsBanner ? bannerTitle : "",
          subtitle: acceptsBanner ? bannerSubtitle : "",
          ctaLabel: acceptsBanner ? ctaLabel : "",
          ctaUrl: acceptsBanner ? ctaUrl : "",
          previewContext: {
            surface: selectedPlacement?.previewSurface || (placement === "banner" ? "marketplace_top_banner" : placement === "profile_boost" ? "marketplace_list_card" : "category_search_sponsored_service"),
            service_title: item.service.name,
            placement,
          },
        },
        scope,
        uid,
      );
      if (req.telegramSent) {
        savePendingPromo(uid, pendingPromoKey(scope, item.id), {
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

  const sent = Boolean(done?.telegramSent);
  const sellerName = session?.name || t("previewSeller");
  const previewImage = bannerLocal || bannerImageUrl;

  async function onBannerFile(file: File | undefined) {
    if (!file || uploading) return;
    const allowed = /\.(jpe?g|png|webp|heic)$/i.test(file.name);
    if (!allowed) {
      setErr(t("bannerType"));
      return;
    }
    setUploading(true);
    setErr("");
    try {
      setBannerFileUrl(await uploadPromotionBanner(file));
      setBannerFileName(file.name);
      setBannerImageUrl("");
      setBannerLocal(URL.createObjectURL(file));
    } catch (e) {
      setErr(serviceErrorOf(e).detail || t("bannerUploadError"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <InBody>
      <Modal open onClose={close} title={t("title")}>
        {done ? (
          <div className="svpdone" role="status" data-ai-id={aiId} data-ai-type={aiId ? "modal" : undefined} data-ai-label={aiId ? t("title") : undefined}>
            <span className={`svpdone__ic${sent ? "" : " is-bad"}`} aria-hidden="true">
              {sent ? <IconClock /> : <IconAlert />}
            </span>
            <b className="svpdone__t">{sent ? t("doneTitle") : t("failTitle")}</b>
            <p className="svpdone__p">{sent ? t("doneText") : t("failText")}</p>
            <div className="svpdone__rows">
              <span>{t("service")}</span>
              <b>{item.service.name}</b>
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
                <p className="svpdone__tg is-ok">
                  <IconCheck aria-hidden="true" />
                  {t("telegramOk")}
                </p>
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
          <div className="svprom" data-ai-id={aiId} data-ai-type={aiId ? "modal" : undefined} data-ai-label={aiId ? t("title") : undefined}>
            <div className="svprom__svc">
              <span className="svprom__svcic" aria-hidden="true">
                <IconMegaphone />
              </span>
              <span>
                <small>{t("service")}</small>
                <b>{item.service.name}</b>
              </span>
            </div>
            <p className="svprom__lead">{t("lead")}</p>

            <div className="svprom__placements" role="radiogroup" aria-label={t("placementTitle")}>
              {(packs.placements.length ? packs.placements : [
                { value: "service_boost" as const, label: t("placementService"), requiresService: true, requiresBanner: false, acceptsBanner: false },
                { value: "profile_boost" as const, label: t("placementProfile"), requiresService: false, requiresBanner: false, acceptsBanner: false },
                { value: "banner" as const, label: t("placementBanner"), requiresService: false, requiresBanner: false, acceptsBanner: true },
              ]).map((option) => (
                <button key={option.value} type="button" role="radio" aria-checked={placement === option.value} className={`svplace${placement === option.value ? " is-on" : ""}`} onClick={() => setPlacement(option.value)}>
                  <b>{placementName(option.value)}</b>
                  <small>{option.acceptsBanner || option.requiresBanner ? t("placementBannerHint") : option.requiresService ? t("placementServiceHint") : t("placementProfileHint")}</small>
                </button>
              ))}
            </div>

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
                <label><span>{t("bannerImageUrl")}{needsBanner ? "" : ` · ${t("optional")}`}</span><input value={bannerImageUrl} onChange={(e) => { setBannerImageUrl(e.target.value); setBannerFileUrl(""); setBannerLocal(""); setBannerFileName(""); }} placeholder="https://..." inputMode="url" /></label>
                <label className="svfile">
                  <span>{t("bannerFile")}</span>
                  <input className="svfile__in" type="file" accept=".jpg,.jpeg,.png,.webp,.heic" onChange={(e) => void onBannerFile(e.target.files?.[0])} disabled={uploading} />
                  <span className={`svfile__box${bannerFileUrl ? " is-on" : ""}`}>
                    <span className="btn btn--line btn--sm svfile__btn">
                      <IconUpload aria-hidden="true" />
                      {uploading ? t("bannerUploading") : t("bannerPick")}
                    </span>
                    <small>{bannerFileUrl ? bannerFileName || t("bannerUploaded") : t("bannerNoFile")}</small>
                  </span>
                </label>
                <div className="svprom__fields">
                  <label><span>{t("bannerTitle")}</span><input value={bannerTitle} onChange={(e) => setBannerTitle(e.target.value)} /></label>
                  <label><span>{t("bannerSubtitle")}</span><input value={bannerSubtitle} onChange={(e) => setBannerSubtitle(e.target.value)} /></label>
                  <label><span>{t("ctaLabel")}</span><input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} /></label>
                  <label><span>{t("ctaUrl")}</span><input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://..." /></label>
                </div>
              </div>
            ) : null}

            {chosen ? (
              <div className="svprom__preview" aria-label={t("previewTitle")}>
                <div className="svprom__previewhead"><span>{t("previewTitle")}</span><small>{placementName(placement)}</small></div>
                {/* What a client will actually see, per placement (10-09 §11):
                    the page-top carousel, the seller card at the head of the
                    list, or the sponsored service block above the results —
                    drawn with the marketplace's own markup. */}
                {placement === "banner" ? (
                  <div className="svprom__pv">
                    <section className="mk-promo-banner svprom__pvbanner" style={previewImage ? { backgroundImage: `linear-gradient(90deg, rgba(7,29,67,.9), rgba(7,29,67,.28)), url(${JSON.stringify(previewImage)})` } : undefined}>
                      <div className="mk-promo-banner__copy">
                        <span className="mk-promo-banner__eyebrow"><IconMegaphone /> {t("previewTop")}</span>
                        <h2>{bannerTitle || sellerName}</h2>
                        <p>{bannerSubtitle || item.service.name}</p>
                        <span className="mk-promo-banner__cta">{ctaLabel || t("previewCta")}<IconArrowRight /></span>
                      </div>
                    </section>
                    <p className="svprom__pvnote">{previewImage ? t("previewBannerNote") : t("previewBannerNoImage")}</p>
                  </div>
                ) : placement === "profile_boost" ? (
                  <div className="svprom__pv">
                    <div className="svprom__pvcard is-top">
                      <span className="svprom__pvav">{initials(sellerName)}</span>
                      <span className="svprom__pvt"><b>{sellerName}</b><small>{item.service.name}</small></span>
                      <span className="svprom__pvbadge"><IconStar />{t("previewTop")}</span>
                    </div>
                    <div className="svprom__pvcard is-ghost" aria-hidden="true"><span className="svprom__pvav" /><span className="svprom__pvt"><i /><i /></span></div>
                    <div className="svprom__pvcard is-ghost" aria-hidden="true"><span className="svprom__pvav" /><span className="svprom__pvt"><i /><i /></span></div>
                    <p className="svprom__pvnote">{t("previewProfileNote")}</p>
                  </div>
                ) : (
                  <div className="svprom__pv">
                    <div className="mk-promo-tile svprom__pvtile">
                      <span className="mk-promo-tile__tag"><IconMegaphone /> {t("previewTop")}</span>
                      <b>{item.service.name}</b>
                      <small>{sellerName}</small>
                      <span className="mk-promo-tile__go"><IconArrowRight /></span>
                    </div>
                    <div className="svprom__pvcard is-ghost" aria-hidden="true"><span className="svprom__pvav" /><span className="svprom__pvt"><i /><i /></span></div>
                    <p className="svprom__pvnote">{t("previewServiceNote")}</p>
                  </div>
                )}
              </div>
            ) : null}

            {chosen ? (
              <div className="svprom__sum">
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
            ) : null}
            <div className="svform__acts">
              <button type="button" className="btn btn--line" onClick={close} disabled={busy}>
                {tc("form.cancel")}
              </button>
              <button type="button" className="btn btn--grad" onClick={() => void send()} disabled={busy || uploading || !chosen || missingBanner} data-ai-id={aiId ? `${aiId}.submit` : undefined}>
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
