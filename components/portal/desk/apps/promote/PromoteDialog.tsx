"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { fmtUzs } from "@/lib/money";
import { pendingPromoKey, savePendingPromo, serviceErrorOf, type ManagedService, type PromotionRequest, type ServiceScope } from "@/lib/services/sellerServices";
import { BANNER_REFERENCES, bannerReferenceUrl, checkoutMarketplacePromotion, listPromotionPackages, promotionErrorCode, promotionErrorRetryable, uploadPromotionBanner, type BannerAsset, type PromotionPackage, type PromotionPlacement } from "@/lib/services/promotions";
import { newIdempotencyKey } from "@/lib/services/promoEvents";
import { usePackageName } from "@/components/services/bits";
import { IconCheck, IconClock, IconCrown, IconGem, IconImage, IconRocket, IconUpload } from "@/components/icons";
import { Banner, Btn, Dialog, Field, Input, Loading, Select, Seg } from "../../kit/kit";
import "./promote.css";

// Starting a promotion, the desktop's way: where to appear (a service ad,
// the TOP card, the banner on top), the package, the service when one is
// needed, the banner picture checked by the backend before it can be used.
// The request goes to an admin in Telegram; the dialog then says so.

const PLACES: PromotionPlacement[] = ["service_boost", "profile_boost", "banner"];
const TIER = [IconRocket, IconGem, IconCrown];
const MAX_MB = 12;
const HTTP_URL = /^https?:\/\/\S+\.\S+/i;
const SCOPE: ServiceScope = { kind: "me" };

export default function PromoteDialog({ open, start, services, onClose, onSent }: { open: boolean; start: PromotionPlacement; services: ManagedService[]; onClose: () => void; onSent: (r: PromotionRequest) => void }) {
  const t = useTranslations("sellerServices.promote");
  const tc = useTranslations("sellerServices");
  const packName = usePackageName();
  const uid = useAuth().session?.id ?? "";
  const [place, setPlace] = useState<PromotionPlacement>(start);
  const [packs, setPacks] = useState<PromotionPackage[] | null>(null);
  const [picked, setPicked] = useState("");
  const [svc, setSvc] = useState(services[0]?.id ?? "");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [asset, setAsset] = useState<BannerAsset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<PromotionRequest | null>(null);
  const attempt = useRef("");
  const pick = useRef<HTMLInputElement>(null);
  const [was, setWas] = useState({ open, start });
  if (was.open !== open || was.start !== start) {
    setWas({ open, start });
    if (open) {
      setPlace(start);
      setDone(null);
      setErr("");
    }
  }
  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    listPromotionPackages(place, c.signal)
      .then((cat) => {
        if (c.signal.aborted) return;
        setPacks(cat.items);
        setPicked(cat.items.length >= 3 ? cat.items[1].id : (cat.items.at(-1)?.id ?? ""));
      })
      .catch(() => !c.signal.aborted && setPacks([]));
    return () => c.abort();
  }, [open, place]);

  const chosen = (packs ?? []).find((p) => p.id === picked) ?? null;
  const accepts = !!chosen?.acceptsBanner || place === "banner";
  const needsBanner = !!chosen?.requiresBanner;
  const needsService = !!chosen?.requiresService || place === "service_boost";
  const service = services.find((s) => s.id === svc) ?? null;
  const notReady = accepts && !!file && (uploading || !asset || asset.status !== "active");
  const blocked = !chosen || (needsService && !service) || (needsBanner && !url && !file) || (accepts && !!url && !HTTP_URL.test(url)) || notReady;

  function onFile(f: File | undefined) {
    if (!f) return;
    if (!/\.(jpe?g|png|webp|heic)$/i.test(f.name)) return setErr(t("bannerType"));
    if (f.size > MAX_MB * 1048576) return setErr(t("bannerTooBig", { mb: MAX_MB }));
    setErr("");
    setFile(f);
    setAsset(null);
    setUrl("");
    setUploading(true);
    uploadPromotionBanner(f)
      .then(setAsset)
      .catch(() => setErr(t("bannerUploadError")))
      .finally(() => setUploading(false));
  }
  async function send() {
    if (!chosen || blocked || busy) return;
    setBusy(true);
    setErr("");
    if (!attempt.current) attempt.current = newIdempotencyKey();
    try {
      const req = await checkoutMarketplacePromotion(
        {
          packageId: chosen.id,
          days: chosen.days,
          placement: place,
          serviceId: needsService && service ? service.id : undefined,
          bannerImageUrl: accepts ? url.trim() : "",
          bannerFileUrl: accepts && file && asset?.status === "active" ? asset.fileUrl : "",
          idempotencyKey: attempt.current,
          previewContext: { placement: place, ...(needsService && service ? { service_title: service.service.name } : {}) },
        },
        SCOPE,
        uid,
      );
      if (req.telegramSent) savePendingPromo(uid, needsService && service ? pendingPromoKey(SCOPE, service.id) : pendingPromoKey("profile"), { requestId: req.requestId, packageTitle: packName(chosen.title, chosen.placement), amount: req.amount, currency: req.currency, telegramSent: req.telegramSent });
      attempt.current = "";
      setDone(req);
      onSent(req);
    } catch (e) {
      if (!promotionErrorRetryable(e)) attempt.current = "";
      const code = promotionErrorCode(e);
      const kind = serviceErrorOf(e).kind;
      setErr(code ? t(`errors.${code}`) : kind === "notFound" ? t("notFound") : tc.has(`errors.${kind}`) ? tc(`errors.${kind}`) : tc("errors.unknown"));
    } finally {
      setBusy(false);
    }
  }

  const placeName = (p: PromotionPlacement) => t(p === "banner" ? "placementBanner" : p === "profile_boost" ? "placementProfile" : "placementService");
  return (
    <Dialog
      open={open}
      title={done ? t("doneTitle") : t("titleAny")}
      onClose={() => !busy && onClose()}
      onSubmit={() => (done ? onClose() : void send())}
      width={620}
      actions={
        done ? (
          <Btn kind="primary" type="submit">
            {t("close")}
          </Btn>
        ) : (
          <>
            <Btn onClick={onClose} disabled={busy}>
              {t("close")}
            </Btn>
            <Btn kind="primary" type="submit" busy={busy} disabled={blocked}>
              {t("submit")}
            </Btn>
          </>
        )
      }
    >
      {done ? (
        <>
          <Banner tone={done.telegramSent || done.activated ? "ok" : "err"} title={done.telegramSent || done.activated ? t("telegramOk") : t("failTitle")}>
            {done.telegramSent || done.activated ? t("doneText") : t("failText")}
          </Banner>
          <dl className="dxp-sum">
            <div>
              <dt>{t("request")}</dt>
              <dd>{done.requestId || "—"}</dd>
            </div>
            <div>
              <dt>{t("amount")}</dt>
              <dd>
                {fmtUzs(done.amount)} {done.currency}
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <>
          <p className="dx-dlg__text">{t("leadAny")}</p>
          <Field label={t("placementTitle")}>
            <Seg label={t("placementTitle")} value={place} onChange={(p) => (setPlace(p), setPacks(null))} items={PLACES.map((p) => ({ id: p, label: placeName(p) }))} />
          </Field>
          <p className="dxp-hint">{t(place === "banner" ? "placementBannerHint" : place === "profile_boost" ? "placementProfileHint" : "placementServiceHint")}</p>
          {packs === null ? (
            <Loading label={t("packages")} />
          ) : !packs.length ? (
            <Banner tone="info" title={t("empty")}>
              {t("emptyText")}
            </Banner>
          ) : (
            <div className="dxp-packs" role="radiogroup" aria-label={t("packages")}>
              {packs.map((p, i) => {
                const Ic = TIER[Math.min(i, TIER.length - 1)];
                return (
                  <button key={p.id} type="button" role="radio" aria-checked={picked === p.id} className={`dxp-pack${picked === p.id ? " is-on" : ""}`} onClick={() => setPicked(p.id)}>
                    <i>
                      <Ic />
                    </i>
                    <b>{packName(p.title, p.placement)}</b>
                    <span>{t("days", { d: p.days })}</span>
                    {p.reach ? <span>{t("reach", { x: p.reach })}</span> : null}
                    <em>
                      {fmtUzs(p.price)} {p.currency}
                    </em>
                    {packs.length >= 3 && i === 1 ? <small>{t("popular")}</small> : null}
                    {picked === p.id ? <IconCheck className="dxp-pack__ok" aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
          )}
          {needsService ? (
            <Field label={t("service")}>
              <Select ariaLabel={t("service")} value={svc} onChange={setSvc} options={services.map((s) => ({ value: s.id, label: s.service.name }))} />
            </Field>
          ) : null}
          {accepts ? (
            <section className="dxp-banner">
              <b>{needsBanner ? t("bannerRequired") : t("bannerOptional")}</b>
              <p className="dxp-hint">{t("bannerRefsLead")}</p>
              <div className="dxp-refs">
                {BANNER_REFERENCES.map((r) => (
                  <figure key={r}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- the backend's own reference picture */}
                    <img src={bannerReferenceUrl(r)} alt={t(`bannerRef.${r}`)} loading="lazy" />
                    <figcaption>{t(`bannerRef.${r}`)}</figcaption>
                  </figure>
                ))}
              </div>
              <p className="dxp-hint">{t("bannerRules")}</p>
              <div className="dxp-file">
                <Btn icon={<IconUpload />} busy={uploading} onClick={() => pick.current?.click()}>
                  {uploading ? t("bannerUploading") : t("bannerPick")}
                </Btn>
                <span>
                  {file ? (
                    <>
                      <IconImage aria-hidden />
                      {file.name}
                    </>
                  ) : (
                    t("bannerNoFile", { mb: MAX_MB })
                  )}
                </span>
                <input ref={pick} type="file" accept=".jpg,.jpeg,.png,.webp,.heic" hidden onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ""))} />
              </div>
              {asset ? (
                <Banner tone={asset.status === "active" ? "ok" : asset.status === "manual_review" ? "warn" : "err"} title={t(`bannerStatus.${asset.status}`)}>
                  {[...asset.reasons, ...(asset.suggestions.length ? [`${t("bannerSuggest")} ${asset.suggestions.join("; ")}`] : [])].join(" ")}
                </Banner>
              ) : null}
              {!file ? (
                <Field label={t("bannerImageUrl")}>
                  <Input value={url} onChange={setUrl} placeholder="https://" />
                </Field>
              ) : null}
            </section>
          ) : null}
          {chosen ? (
            <p className="dxp-note">
              <IconClock aria-hidden />
              {t("note")}
            </p>
          ) : null}
          {err ? <Banner tone="err" title={err} /> : null}
        </>
      )}
    </Dialog>
  );
}
