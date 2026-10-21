"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { errDetail } from "@/lib/http";
import Modal from "@/components/admin/Modal";
import SearchSelect from "@/components/SearchSelect";
import {
  pendingPromoKey,
  savePendingPromo,
  profileVerified,
  serviceErrorOf,
  type ManagedService,
  type PromotionRequest,
  type ServiceError,
  type ServiceScope,
  type ServiceSellerProfile,
} from "@/lib/services/sellerServices";
import {
  bannerRejectionOf,
  checkoutMarketplacePromotion,
  isBannerReasonCode,
  listPromotionPackages,
  promotionCampaignEnded,
  promotionCheckoutSignal,
  promotionErrorCode,
  promotionErrorRetryable,
  uploadPromotionBanner,
  BANNER_REFERENCES,
  bannerReferenceUrl,
  type BannerAsset,
  type BannerVerdict,
  type PromotionCampaignSnapshot,
  type PromotionCheckout,
  type PromotionPackage,
  type PromotionPlacement,
  type PromotionPlacementOption,
} from "@/lib/services/promotions";
import { IconAlert, IconArrowRight, IconCheck, IconCircleCheck, IconClock, IconCrown, IconEye, IconGem, IconInfo, IconMegaphone, IconRefresh, IconRocket, IconTrendingUp, IconUpload, IconUser } from "@/components/icons";
import { CameraIcon, ImageIcon, ScanFaceIcon, ShirtIcon, Trash2Icon, TrendingUpIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { subscribeUserEvents } from "@/lib/userSocket";
import { fmtDate, localDay } from "@/lib/date";
import { InBody, PlacementSketch, som, usePackageName } from "./bits";
import MarketPreviewModal from "./MarketPreviewModal";
import { previewServiceOf, type PreviewDraft } from "@/lib/marketPreview";
import { newIdempotencyKey } from "@/lib/services/promoEvents";
import "./promoCheckout.css";

type Packs = { status: "loading" | "ready" | "error"; items: PromotionPackage[]; placements: PromotionPlacementOption[] };
type Outcome = "approved" | "rejected" | "lapsed" | "cancelled";
const TIER_ICON = [IconRocket, IconGem, IconCrown];
// The backend takes up to 12 MB (2026-10-18), at least 720×720.
const MAX_BANNER_MB = 12;
const HTTP_URL = /^https?:\/\/\S+\.\S+/i;
const PHOTO_RULES = [
  { key: "close", Icon: CameraIcon },
  { key: "face", Icon: ScanFaceIcon },
  { key: "clothes", Icon: ShirtIcon },
  { key: "tech", Icon: ImageIcon },
] as const;
const FALLBACK_PLACEMENTS: PromotionPlacementOption[] = [
  { value: "service_boost", label: "", requiresService: true, requiresBanner: false, acceptsBanner: false, previewSurface: "category_search_sponsored_service" },
  { value: "profile_boost", label: "", requiresService: false, requiresBanner: false, acceptsBanner: false, previewSurface: "marketplace_list_card" },
  { value: "banner", label: "", requiresService: false, requiresBanner: false, acceptsBanner: true, previewSurface: "marketplace_top_banner" },
];

function BannerVerdictBox({ verdict, aiId }: { verdict: BannerVerdict; aiId?: string }) {
  const t = useTranslations("sellerServices.promote");
  const reasons = verdict.reasons.filter((r) => r.trim() && r.trim() !== verdict.message);
  const listed = verdict.reasonCodes.length + reasons.length;
  return (
    <div className={`svprom__check svprom__check--${verdict.status}`} role="status" data-ai-id={aiId}>
      <b>{t(`bannerStatus.${verdict.status}`)}</b>
      {verdict.message ? <p className="svprom__checkmsg">{verdict.message}</p> : null}
      {listed ? (
        <>
          {verdict.status === "active" ? null : <small>{t("bannerReasonsTitle")}</small>}
          <ul>
            {verdict.reasonCodes.map((code) => (
              <li key={code} data-reason={code}>
                {isBannerReasonCode(code) ? t(`bannerReason.${code}`) : code.replace(/_/g, " ")}
              </li>
            ))}
            {reasons.map((r, i) => (
              <li key={`r${i}`}>{r}</li>
            ))}
          </ul>
        </>
      ) : null}
      {verdict.faceCoverage !== null ? (
        <span className={`svprom__face${verdict.faceCoverage < 40 ? " is-low" : ""}`} data-face={verdict.faceCoverage}>
          <ScanFaceIcon size={15} strokeWidth={1.75} aria-hidden="true" />
          {t("bannerFace", { n: verdict.faceCoverage })}
        </span>
      ) : null}
      {verdict.suggestions.length ? (
        <>
          <small>{t("bannerSuggest")}</small>
          <ul>
            {verdict.suggestions.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function campaignTerms(c: PromotionCampaignSnapshot | null, locale: string, t: ReturnType<typeof useTranslations>): string {
  if (!c) return "";
  const day = c.endsAt ? localDay(c.endsAt) : "";
  const until = day ? t("campaignUntil", { date: fmtDate(day, locale) }) : "";
  const left = c.purchaseLimit !== null && c.purchaseLimit > 0 ? t("campaignLeft", { n: Math.max(0, c.purchaseLimit - (c.purchasesUsed ?? 0)) }) : "";
  return [until, left].filter(Boolean).join(" · ");
}

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
  const tv = useTranslations("sellerServices.preview");
  const locale = useLocale();
  const packName = usePackageName();
  const placementName = (value: PromotionPlacement) => t(value === "banner" ? "placementBanner" : value === "profile_boost" ? "placementProfile" : "placementService");
  const [packs, setPacks] = useState<Packs>({ status: "loading", items: [], placements: [] });
  const [tick, setTick] = useState(0);
  const [placement, setPlacement] = useState<PromotionPlacement>(startPlacement ?? (item ? "service_boost" : "profile_boost"));
  const [picked, setPicked] = useState("");
  const [svcId, setSvcId] = useState(item?.id ?? "");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerFileUrl, setBannerFileUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [bannerFileName, setBannerFileName] = useState("");
  // What the backend's image check said about the uploaded picture.
  const [bannerCheck, setBannerCheck] = useState<BannerAsset | null>(null);
  // The uploaded picture, shown from the browser's own copy: the preview must
  // not depend on the stored file being readable yet.
  const [bannerLocal, setBannerLocal] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [urlCheck, setUrlCheck] = useState<BannerVerdict | null>(null);
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<PromotionCheckout | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [live, setLive] = useState(false);
  const [warm, setWarm] = useState(false);
  const attemptKey = useRef("");
  useEffect(() => {
    attemptKey.current = "";
  }, [picked, placement, item?.id]);

  useEffect(() => {
    const c = new AbortController();
    listPromotionPackages(placement, c.signal)
      .then((catalog) => {
        if (!c.signal.aborted) {
          setPacks({ status: "ready", items: catalog.items, placements: catalog.placements });
          setPicked((cur) => (catalog.items.some((p) => p.id === cur) ? cur : ""));
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
  const urlText = bannerUrl.trim();
  const urlValid = HTTP_URL.test(urlText);
  const badImage = !!urlText && !urlValid;
  const usingUrl = acceptsBanner && !bannerFile && urlValid;
  const urlBlocked = usingUrl && !!urlCheck && urlCheck.status !== "active";
  const missingBanner = needsBanner && !bannerFile && !urlValid;
  const missingService = needsService && !svc;
  // An uploaded picture is used only once the check has passed it.
  const bannerNotReady = acceptsBanner && !!bannerFile && (uploading || !bannerCheck || bannerCheck.status !== "active");
  const blocked = !chosen || chosen.placement !== placement || missingBanner || missingService || bannerNotReady || (acceptsBanner && badImage) || urlBlocked;

  useEffect(() => () => { if (bannerLocal) URL.revokeObjectURL(bannerLocal); }, [bannerLocal]);

  const waitIds = done && !done.activated && done.telegramSent && !outcome ? [done.requestId, done.paymentId].filter(Boolean).join("|") : "";
  useEffect(() => {
    if (!waitIds) return;
    const ids = waitIds.split("|");
    return subscribeUserEvents((ev) => {
      const s = promotionCheckoutSignal(ev);
      if (!s || s.kind === "pending" || !s.ids.some((id) => ids.includes(id))) return;
      setOutcome(s.kind === "approved" ? "approved" : s.lapsed ? "lapsed" : s.kind === "rejected" ? "rejected" : "cancelled");
    });
  }, [waitIds]);

  const restart = () => {
    attemptKey.current = "";
    setDone(null);
    setOutcome(null);
    setErr("");
    setPacks((cur) => ({ ...cur, status: "loading", items: [] }));
    setTick((n) => n + 1);
  };

  const clearBanner = () => {
    if (uploading || busy) return;
    setBannerFile(null);
    setBannerFileUrl("");
    setBannerCheck(null);
    setBannerFileName("");
    setBannerLocal("");
    setErr("");
  };

  const send = async () => {
    if (!chosen || busy || blocked) return;
    setBusy(true);
    setErr("");
    if (!attemptKey.current) attemptKey.current = newIdempotencyKey();
    const fileUrl = acceptsBanner && bannerFile && bannerCheck?.status === "active" ? bannerFileUrl : "";
    const imageUrl = usingUrl ? urlText : "";
    try {
      const req = await checkoutMarketplacePromotion(
        {
          packageId: chosen.id,
          days: chosen.days,
          placement,
          serviceId: needsService && svc ? svc.id : undefined,
          bannerImageUrl: imageUrl,
          bannerFileUrl: fileUrl,
          idempotencyKey: attemptKey.current,
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
      attemptKey.current = "";
      setDone(req);
      onSent(req);
    } catch (e) {
      if (!promotionErrorRetryable(e)) attemptKey.current = "";
      if (promotionCampaignEnded(e)) {
        attemptKey.current = "";
        setErr(t("errors.campaignEnded"));
        return;
      }
      const verdict = imageUrl || fileUrl ? bannerRejectionOf(e) : null;
      if (verdict) {
        attemptKey.current = "";
        if (imageUrl) setUrlCheck(verdict);
        else setBannerCheck((cur) => ({ ...verdict, id: cur?.id ?? "", fileUrl: cur?.fileUrl ?? "" }));
        setErr(t("bannerCheckFailed"));
        return;
      }
      const code = promotionErrorCode(e);
      if (code) {
        setErr(t(`errors.${code}`));
        if (code === "promotion_already_exists") onStale?.();
        return;
      }
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

  const closedOut = outcome === "rejected" || outcome === "lapsed" || outcome === "cancelled";
  const activated = Boolean(done?.activated) || outcome === "approved";
  const sent = (Boolean(done?.telegramSent) || activated) && !closedOut;
  const priced = done?.breakdown ?? null;
  const discounted = !!priced && (priced.discountAmount > 0 || !!priced.campaign);
  const campaign = priced?.campaign ?? null;
  const pct = campaign && campaign.discountType === "percent" && campaign.discountValue ? ` ${t("discountPct", { v: campaign.discountValue })}` : "";
  const terms = campaignTerms(campaign, locale, t);
  const unit = (c: string) => (c === "UZS" ? tc("card.som") : c);
  const sellerName = profile?.name || session?.name || t("previewSeller");
  const previewImage = bannerLocal || (usingUrl ? urlText : "");
  const doneTitle = activated ? t("activeTitle") : outcome === "lapsed" ? t("lapsedTitle") : outcome === "rejected" ? t("rejectedTitle") : outcome === "cancelled" ? t("cancelledTitle") : sent ? t("doneTitle") : t("failTitle");
  const doneText = activated
    ? t(outcome === "approved" ? "approvedText" : "activeText")
    : outcome === "lapsed"
      ? t("lapsedText")
      : outcome === "rejected"
        ? t("rejectedText")
        : outcome === "cancelled"
          ? t("cancelledText")
          : sent
            ? t("doneText")
            : t("failText");
  const draft: PreviewDraft = {
    kind: "ad",
    sellerId: profile?.userId || (scope.kind === "org" ? scope.memberId : uid),
    seed: { name: sellerName, sellerType: profile?.sellerType ?? "", region: profile?.region ?? "", verified: profile ? profileVerified(profile) : false },
    service: needsService && svc ? previewServiceOf(svc) : null,
    ad: { placement, title: sellerName, subtitle: "", ctaLabel: t("previewCta"), imageUrl: acceptsBanner ? previewImage : "" },
    profile: null,
  };

  function onBannerFile(file: File | undefined) {
    if (!file || uploading || busy) return;
    if (!/\.(jpe?g|png|webp|heic)$/i.test(file.name)) {
      setErr(t("bannerType"));
      return;
    }
    if (file.size > MAX_BANNER_MB * 1024 * 1024) {
      setErr(t("bannerTooBig", { mb: MAX_BANNER_MB }));
      return;
    }
    setErr("");
    setBannerUrl("");
    setUrlCheck(null);
    setBannerFile(file);
    setBannerFileUrl("");
    setBannerCheck(null);
    setBannerFileName(file.name);
    // A HEIC picture is stored fine but most browsers cannot draw it.
    setBannerLocal(/\.heic$/i.test(file.name) ? "" : URL.createObjectURL(file));
    // Checked as soon as it is picked: the backend looks at the picture
    // itself (a clear close face, light, clothing, little text).
    setUploading(true);
    uploadPromotionBanner(file)
      .then((asset) => {
        setBannerCheck(asset);
        setBannerFileUrl(asset.fileUrl);
      })
      // The backend's own reason (too small, too large, not an image).
      .catch((e) => setErr(errDetail(e) || t("bannerUploadError")))
      .finally(() => setUploading(false));
  }

  const title = item ? t("title") : t("titleAny");

  return (
    <InBody>
      <Modal open onClose={close} title={title}>
        {done ? (
          <div className="svpdone" role="status" data-ai-id={aiId} data-ai-type={aiId ? "modal" : undefined} data-ai-label={aiId ? title : undefined} data-outcome={outcome ?? undefined}>
            <span className={`svpdone__ic${sent ? (activated ? " is-ok" : "") : " is-bad"}`} aria-hidden="true">
              {activated ? <IconCircleCheck /> : sent ? <IconClock /> : <IconAlert />}
            </span>
            <b className="svpdone__t">{doneTitle}</b>
            <p className="svpdone__p">{doneText}</p>
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
              {closedOut ? null : priced && discounted ? (
                <>
                  {priced.baseAmount !== null ? (
                    <>
                      <span>{t("basePrice")}</span>
                      <b className="svpdisc__base">
                        {som(priced.baseAmount)} {unit(done.currency)}
                      </b>
                    </>
                  ) : null}
                  <span className="svpdisc__label">
                    {campaign?.title ? t("discountNamed", { name: campaign.title }) : t("discount")}
                    {pct}
                  </span>
                  <b className="svpdisc__minus">
                    −{som(priced.discountAmount)} {unit(done.currency)}
                  </b>
                  {terms ? (
                    <>
                      <span>{t("campaignTerms")}</span>
                      <b className="svpdisc__terms" data-ai-id={aiId ? `${aiId}.campaign-terms` : undefined}>
                        {terms}
                      </b>
                    </>
                  ) : null}
                  <span>{t("toPay")}</span>
                  <b className="svpdisc__total">
                    {som(priced.amount)} {unit(done.currency)}
                  </b>
                </>
              ) : (
                <>
                  <span>{t("amount")}</span>
                  <b>
                    {som(priced ? priced.amount : done.amount || chosen?.price || 0)} {unit(done.currency)}
                  </b>
                </>
              )}
              {done.requestId ? (
                <>
                  <span>{t("request")}</span>
                  <b className="svpdone__id">{done.requestId.slice(0, 8).toUpperCase()}</b>
                </>
              ) : null}
            </div>
            {discounted && sent && !activated ? (
              <p className="svpdisc__note">
                <IconInfo aria-hidden="true" />
                <span>{t("discountNote")}</span>
              </p>
            ) : null}
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
            ) : closedOut ? (
              <div className="svpdone__acts">
                <button type="button" className="btn btn--line" onClick={onClose}>
                  {t("close")}
                </button>
                <button type="button" className="btn btn--grad" onClick={restart} data-ai-id={aiId ? `${aiId}.new-checkout` : undefined}>
                  <IconRefresh aria-hidden="true" />
                  {t("newCheckout")}
                </button>
              </div>
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
            <p className="svprom__boost" data-ai-id={aiId ? `${aiId}.multiplier` : undefined}>
              <TrendingUpIcon size={18} strokeWidth={1.75} aria-hidden="true" />
              <span>
                <b>{t("multiplier")}</b>
                {chosen && chosen.reach > 1 ? <span className="svprom__boostx">{t("multiplierUpTo", { x: chosen.reach })}</span> : null}
              </span>
            </p>

            <span className="svprom__step">{t("step1")}</span>
            <div className="svprom__placements" role="radiogroup" aria-label={t("placementTitle")}>
              {(packs.placements.length ? packs.placements : FALLBACK_PLACEMENTS).map((option) => (
                <button key={option.value} type="button" role="radio" aria-checked={placement === option.value} className={`svplace${placement === option.value ? " is-on" : ""}`} onClick={() => pickPlacement(option.value)}>
                  <PlacementSketch placement={option.value} />
                  <b>{placementName(option.value)}</b>
                  <small>{option.value === "banner" ? t("placementBannerHint") : option.value === "service_boost" ? t("placementServiceHint") : t("placementProfileHint")}</small>
                </button>
              ))}
            </div>
            <button type="button" className="svprom__live" onPointerEnter={() => setWarm(true)} onFocus={() => setWarm(true)} onClick={() => setLive(true)} data-ai-id={aiId ? `${aiId}.live` : undefined}>
              <span className="svprom__liveic" aria-hidden="true">
                <IconEye />
              </span>
              <span className="svprom__livet">
                <b>{tv("open")}</b>
                <small>{tv("openHint")}</small>
              </span>
              <IconArrowRight aria-hidden="true" />
            </button>

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
                <div className="svprom__refs">
                  <p>{t("bannerRefsLead")}</p>
                  <ul>
                    {BANNER_REFERENCES.map((k) => (
                      <li key={k}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- the backend's own example photo */}
                        <img src={bannerReferenceUrl(k)} alt={t(`bannerRef.${k}`)} loading="lazy" />
                        <small>{t(`bannerRef.${k}`)}</small>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="svprom__drop">
                  <div className="svprom__photorules" data-ai-id={aiId ? `${aiId}.photo-rules` : undefined}>
                    <b>{t("photoRulesTitle")}</b>
                    <ul>
                      {PHOTO_RULES.map(({ key, Icon }) => (
                        <li key={key} data-rule={key}>
                          <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                          <span>{t(`photoRule.${key}`, { mb: MAX_BANNER_MB })}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <label className="svfile">
                    <span>{t("bannerFile")}</span>
                    <input
                      className="svfile__in"
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.heic"
                      onChange={(e) => {
                        onBannerFile(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                      disabled={uploading || busy}
                      data-ai-id={aiId ? `${aiId}.banner-file` : undefined}
                    />
                    <span className={`svfile__box${bannerFile ? " is-on" : ""}`}>
                      <span className="btn btn--line btn--sm svfile__btn">
                        <IconUpload aria-hidden="true" />
                        {uploading ? t("bannerUploading") : t("bannerPick")}
                      </span>
                      <small>{bannerFile ? bannerFileName : t("bannerNoFile", { mb: MAX_BANNER_MB })}</small>
                    </span>
                  </label>
                </div>
                {bannerFile && bannerCheck ? <BannerVerdictBox verdict={bannerCheck} aiId={aiId ? `${aiId}.banner-check` : undefined} /> : null}
                {bannerFile ? (
                  <button type="button" className="svprom__clear" onClick={clearBanner} disabled={uploading || busy} data-ai-id={aiId ? `${aiId}.banner-clear` : undefined}>
                    <Trash2Icon size={14} strokeWidth={1.75} aria-hidden="true" />
                    {t("bannerClear")}
                  </button>
                ) : null}
                <span className="svprom__or">{t("or")}</span>
                <label className={badImage || urlBlocked ? "is-bad" : undefined}>
                  <span>{t("bannerImageUrl")}</span>
                  <input
                    value={bannerUrl}
                    onChange={(e) => {
                      setBannerUrl(e.target.value);
                      setUrlCheck(null);
                      setErr("");
                      if (bannerFile) clearBanner();
                    }}
                    placeholder="https://"
                    inputMode="url"
                    aria-invalid={badImage || urlBlocked || undefined}
                    disabled={uploading || busy}
                    data-ai-id={aiId ? `${aiId}.banner-url` : undefined}
                  />
                  {badImage ? <small className="svprom__ferr">{t("badUrl")}</small> : <small className="svprom__urlnote">{t("bannerUrlNote")}</small>}
                </label>
                {usingUrl && urlCheck ? <BannerVerdictBox verdict={urlCheck} aiId={aiId ? `${aiId}.banner-url-check` : undefined} /> : null}
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
                {uploading ? t("bannerUploading") : busy ? t("sending") : t("submit")}
              </button>
            </div>
          </div>
        )}
      </Modal>
      {warm || live ? (
        <MarketPreviewModal
          open={live}
          draft={draft}
          views={["market", "profile"]}
          subtitle={[placementName(placement), needsService && svc ? svc.service.name : ""].filter(Boolean).join(" · ")}
          onClose={() => setLive(false)}
        />
      ) : null}
    </InBody>
  );
}
