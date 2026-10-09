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
import { IconAlert, IconCheck, IconClock, IconCrown, IconGem, IconInfo, IconMegaphone, IconRefresh, IconRocket, IconTrendingUp } from "@/components/icons";
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

  const send = async () => {
    if (!chosen || busy || (chosen.requiresBanner && !bannerImageUrl && !bannerFileUrl)) return;
    setBusy(true);
    setErr("");
    try {
      const req = await checkoutMarketplacePromotion(
        {
          packageId: chosen.id,
          days: chosen.days,
          placement,
          serviceId: placement === "service_boost" ? item.id : undefined,
          bannerImageUrl,
          bannerFileUrl,
          title: bannerTitle,
          subtitle: bannerSubtitle,
          ctaLabel,
          ctaUrl,
          previewContext: { service_title: item.service.name, placement },
        },
        scope,
        uid,
      );
      if (req.telegramSent) {
        savePendingPromo(uid, pendingPromoKey(scope, item.id), {
          requestId: req.requestId,
          packageTitle: packName(chosen.title),
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
  const selectedPlacement = packs.placements.find((p) => p.value === placement);

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
      setBannerImageUrl("");
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
                  <b>{packName(chosen.title)}</b>
                </>
              ) : null}
              <span>{t("amount")}</span>
              <b>
                {som(done.amount)} {done.currency === "UZS" ? tc("card.som") : done.currency}
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
                { value: "service_boost" as const, label: t("placementService"), requiresService: true, requiresBanner: false },
                { value: "profile_boost" as const, label: t("placementProfile"), requiresService: false, requiresBanner: false },
                { value: "banner" as const, label: t("placementBanner"), requiresService: false, requiresBanner: true },
              ]).map((option) => (
                <button key={option.value} type="button" role="radio" aria-checked={placement === option.value} className={`svplace${placement === option.value ? " is-on" : ""}`} onClick={() => setPlacement(option.value)}>
                  <b>{option.label}</b>
                  <small>{option.requiresBanner ? t("placementBannerHint") : option.requiresService ? t("placementServiceHint") : t("placementProfileHint")}</small>
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
                      <b className="svpk__name">{packName(p.title)}</b>
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

            {selectedPlacement?.requiresBanner || placement === "banner" ? (
              <div className="svprom__bannerform">
                <label><span>{t("bannerImageUrl")}</span><input value={bannerImageUrl} onChange={(e) => { setBannerImageUrl(e.target.value); setBannerFileUrl(""); }} placeholder="https://..." /></label>
                <label><span>{t("bannerFile")}</span><input type="file" accept=".jpg,.jpeg,.png,.webp,.heic" onChange={(e) => void onBannerFile(e.target.files?.[0])} disabled={uploading} /></label>
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
                <div className="svprom__previewhead"><span>{t("previewTitle")}</span><small>{selectedPlacement?.label ?? t(`placement${placement === "banner" ? "Banner" : placement === "profile_boost" ? "Profile" : "Service"}`)}</small></div>
                <div className={`svprom__previewbody${bannerImageUrl || bannerFileUrl ? " has-image" : ""}`} style={bannerImageUrl ? { backgroundImage: `url(${bannerImageUrl})` } : undefined}>
                  <div><b>{bannerTitle || item.service.name}</b><span>{bannerSubtitle || item.service.name}</span>{ctaLabel ? <em>{ctaLabel}</em> : null}</div>
                </div>
              </div>
            ) : null}

            {chosen ? (
              <div className="svprom__sum">
                <span>{t("package")}</span>
                <b>{packName(chosen.title)}</b>
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
              <button type="button" className="btn btn--grad" onClick={() => void send()} disabled={busy || uploading || !chosen || Boolean(chosen.requiresBanner && !bannerImageUrl && !bannerFileUrl)} data-ai-id={aiId ? `${aiId}.submit` : undefined}>
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
