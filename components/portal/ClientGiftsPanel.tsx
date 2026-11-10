"use client";

import "./plans1920.css";
import { useEffect, useId, useState, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, CircleCheck, CircleX, Copy, Gift, Hourglass, Plus, QrCode } from "lucide-react";
import { planPlate } from "./PlanCard";
import {
  listGifts,
  createGift,
  getSubscriptionPlans,
  getAllServices,
  type BackendPlan,
  type BackendService,
  type GiftResult,
  canGiftPlan
} from "@/lib/services/backend";
import { isDemoUnavailable, isProviderUnavailable } from "@/lib/http";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Skeleton, EmptyState, ErrorState } from "@/components/portal/DataState";
import { notify } from "@/lib/toast";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { IconGift, IconArrowRight } from "@/components/icons";
import { dateOnly } from "@/lib/date";

const TERMS = [3, 6, 12];

// The dashboard's black line drawings (public/img/xizmatlar), shown in a
// white circle: the gift box for the tab and a gifted service, the gift box
// with a membership card for a gifted plan, the video call for a service.
const mArt = (name: string) => ({ "--art": `url(/img/xizmatlar/${name}.webp)` }) as CSSProperties;
// A gift's status in the dashboard's pill tones (.cx-pill), with its icon.
const PILL = {
  ok: { cls: "cx-pill--ok", Icon: CircleCheck },
  wait: { cls: "cx-pill--warn", Icon: Hourglass },
  live: { cls: "cx-pill--blue", Icon: Gift },
  off: { cls: "plx-pill--off", Icon: CircleX },
} as const;

// The gift's exact price is fixed at checkout by the backend; this is only a
// preview so the sender isn't guessing before they submit. Uses the plan's
// own 6/12-month total when the term matches it, else the monthly rate × months.
function estimateGiftTotal(plan: BackendPlan, months: number): number {
  if (months === 12 && plan.yearlyPrice) return plan.yearlyPrice;
  if (months === 6 && plan.sixMonthPrice) return plan.sixMonthPrice;
  return plan.monthlyPrice * months;
}

function statusTone(status: string): "ok" | "wait" | "live" | "off" {
  if (status === "claimed" || status === "activated") return "ok";
  if (status === "pending" || status === "unpaid") return "wait";
  if (status === "expired" || status === "canceled" || status === "cancelled") return "off";
  return "live";
}

function fmtDate(s: string, locale: string) {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : dateOnly(s, locale);
}

export default function ClientGiftsPanel() {
  const t = useTranslations("portal.client.gifts");
  const tg = useTranslations("portal.client.gifts.statusMap");
  const tcommon = useTranslations("common");
  const tl = useTranslations("lxPlans");
  const locale = useLocale();
  const formId = useId();
  const [reloadKey, setReloadKey] = useState(0);
  const gifts = useResource(() => listGifts(), [reloadKey]);
  const plans = useResource<BackendPlan>(() => getSubscriptionPlans(locale), [locale]);
  // getAllServices, not getServices: /services is paged now (LEXGO_SERVICES_
  // CATALOG_OPTIMIZATION_FRONTEND.md) — this dropdown needs every giftable
  // service, not just the first page.
  const services = useResource<BackendService>(() => getAllServices(undefined, locale), [locale]);
  // Every active paid tariff can be a gift (TSK-342697).
  const giftable = plans.data.filter(canGiftPlan);

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"plan" | "service">("plan");
  const [planId, setPlanId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [hint, setHint] = useState("");
  const [termPick, setTermPick] = useState(6);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<GiftResult | null>(null);
  const [copied, setCopied] = useState(false);

  const chosenPlan = giftable.find((p) => p.id === planId) || giftable[0] || null;
  const planOpts = giftable.map((p) => ({ value: p.id, label: p.name }));
  const serviceOpts = services.data.filter((s) => s.isActive).map((s) => ({ value: s.id, label: s.name }));
  const chosenService = serviceId || serviceOpts[0]?.value || "";
  const terms = chosenPlan?.allowedGiftDurations.length ? chosenPlan.allowedGiftDurations : TERMS;
  const term = terms.includes(termPick) ? termPick : terms[0];
  const priced = chosenPlan && chosenPlan.monthlyPrice > 0 ? chosenPlan : null;

  // Back from the checkout page may restore this page from the bfcache with the
  // button still busy (it stays busy while the browser navigates away).
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  function reset() {
    setCreated(null);
    setCopied(false);
    setHint("");
    setKind("plan");
    setPlanId("");
    setServiceId("");
    setTermPick(6);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const isService = kind === "service";
    if (busy) return;
    if (isService ? !chosenService : !chosenPlan) {
      notify.error(t("error"), { id: "gift-create" });
      return;
    }
    setBusy(true);
    let leaving = false; // stay busy while the browser opens the checkout
    try {
      const r = await createGift(
        isService
          ? { service_id: chosenService, recipient_hint: hint.trim() || undefined }
          : { plan_slug: chosenPlan!.slug, duration_months: term, recipient_hint: hint.trim() || undefined },
      );
      setCreated(r);
      setReloadKey((k) => k + 1);
      // Real checkout: same-tab navigation (a popup after an await is blocked).
      // The gift and its share link stay listed here after payment.
      if (r.paymentUrl) {
        leaving = true;
        window.location.assign(r.paymentUrl);
      }
    } catch (e) {
      const unavailable = isProviderUnavailable(e) || isDemoUnavailable(e);
      notify.error(t("createFailed"), { id: "gift-create", body: unavailable ? tcommon("paymentUnavailable") : undefined, error: unavailable ? undefined : e });
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  async function copyLink() {
    if (!created?.shareUrl) return;
    try {
      await navigator.clipboard.writeText(created.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the field is selectable */
    }
  }

  const close = () => { setOpen(false); reset(); };
  const give = () => { reset(); setOpen(true); };
  const listed = gifts.status !== "loading" && gifts.data.length > 0;

  return (
    <div className="plx-gifts">
      {/* The dashboard's navy gift banner ("Yaqinlaringizga g'amxo'rlik
          qiling" sends people here), with the gift picture in a white circle. */}
      <section className="cx-gift plx-banner" aria-labelledby={`${formId}-h`}>
        <span className="plx-banner__art" style={mArt("Sovga")} aria-hidden />
        <div className="plx-banner__main">
          <h2 id={`${formId}-h`}>{tl("gifts.bannerTitle")}</h2>
          <p>{tl("gifts.bannerText")}</p>
        </div>
        <button className="btn cx-gift__cta plx-banner__cta" type="button" onClick={give} data-ai-target="button:give-gift">
          <Plus aria-hidden />
          {t("give")}
        </button>
      </section>

      <section className="ppanel plx-list" data-ai-target={listed ? undefined : "gifts:list"}>
        <div className="ppanel__h cx-works__h">
          <h3 className="cx-h3">
            {t("title")}
            {listed ? <span className="cx-count">{gifts.data.length}</span> : null}
          </h3>
        </div>

        {gifts.status === "loading" ? (
          <Skeleton rows={3} />
        ) : !gifts.data.length ? (
          <EmptyState icon={<IconGift />} title={t("empty")} text={t("emptyText")} />
        ) : (
          <div className="alist plx-rows" data-ai-target="gifts:list">
            {gifts.data.map((g) => {
              const tone = statusTone(g.status);
              const pill = PILL[tone];
              const incoming = g.direction === "received";
              const meta = [incoming ? "" : g.recipientPhone, g.termMonths ? `${g.termMonths} ${t("months")}` : "", fmtDate(g.createdAt, locale)].filter(Boolean).join(" · ");
              return (
                <article className="creq cx-work plx-gift" key={g.id}>
                  <span className="plx-gift__art" style={mArt(g.kind === "service" ? "Sovga" : "Sovga_tarif")} aria-hidden />
                  <div className="creq__m plx-gift__m">
                    <div className="plx-gift__h">
                      <b>{g.title || t("untitledGift")}</b>
                      {/* Scoped to the status map: an unscoped lookup could collide with any
                          key on the page (a gift whose status is "title" would print the
                          page heading). */}
                      <span className={`creq__badge creq__badge--${tone} cx-pill ${pill.cls}`}>
                        <pill.Icon aria-hidden />
                        {tg.has(g.status) ? tg(g.status) : g.status}
                      </span>
                    </div>
                    <div className="plx-gift__tags">
                      {/* LEXGO_PUBLIC_WORK_IDS_FRONTEND.md: GFT-XXXXX — the gift's own
                          public id, distinct from the redemption code below. */}
                      {g.workId ? <small className="wid">{g.workId}</small> : null}
                      <small className="gift__kind cx-tag">{t(g.kind === "service" ? "kindService" : "kindPlan")}</small>
                      {incoming ? <small className="gift__kind gift__kind--in cx-tag">{t("gotIt")}</small> : null}
                    </div>
                    {meta ? <span className="plx-gift__meta">{meta}</span> : null}
                    {g.shareUrl && !incoming && g.status !== "claimed" ? (
                      <a className="gift__list-link cx-link" href={g.shareUrl} target="_blank" rel="noreferrer">
                        <QrCode aria-hidden />
                        {t("shareCta")}
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <Modal
        open={open}
        onClose={close}
        title={t("give")}
        footer={
          created ? (
            <div className="plx-acts">
              <button type="button" className="btn btn--line" onClick={close}>
                {t("done")}
              </button>
              {created.paymentUrl ? (
                <a className="btn btn--pri" href={created.paymentUrl} target="_blank" rel="noreferrer">
                  {t("openPayment")}
                  <IconArrowRight />
                </a>
              ) : null}
            </div>
          ) : (
            <div className="plx-acts">
              <button type="button" className="btn btn--line" onClick={close} disabled={busy}>
                {tl("cancel")}
              </button>
              <button className="btn btn--pri" type="submit" form={formId} disabled={busy || (kind === "plan" ? !chosenPlan : !chosenService)}>
                {busy ? t("sending") : t("send")}
              </button>
            </div>
          )
        }
      >
        {created ? (
          <div className="gift__done plx-made">
            <span className="gift__done-ic plx-made__art" style={mArt("Sovga")} aria-hidden />
            <b>{t("shareTitle")}</b>
            <p className="advmuted">{t("shareHint")}</p>
            {created.qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="gift__qr" src={created.qrUrl} alt={t("qrAlt")} width={148} height={148} onError={(e) => { e.currentTarget.style.display = "none"; }} />
            ) : null}
            <div className="gift__share plx-share">
              <input readOnly value={created.shareUrl} onFocus={(e) => e.currentTarget.select()} aria-label={t("copyLink")} />
              <button type="button" className="btn btn--pri" onClick={copyLink}>
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                {copied ? t("copied") : t("copyLink")}
              </button>
            </div>
          </div>
        ) : (
          <form id={formId} className="cform gift__form plx-giftform" onSubmit={submit}>
            {/* Plan or service: two option cards, each with its picture. */}
            <div className="rolerow gift__tabs plx-kinds">
              <button type="button" className="roletab plx-kind" aria-pressed={kind === "plan"} onClick={() => setKind("plan")}>
                <span className="plx-kind__art" style={mArt("Sovga_tarif")} aria-hidden />
                <span className="plx-kind__t">
                  <b>{t("kindPlan")}</b>
                  <small>{tl("gifts.kindPlanSub")}</small>
                </span>
              </button>
              <button type="button" className="roletab plx-kind" aria-pressed={kind === "service"} onClick={() => setKind("service")}>
                <span className="plx-kind__art" style={mArt("Onlayn_konsultatsiya")} aria-hidden />
                <span className="plx-kind__t">
                  <b>{t("kindService")}</b>
                  <small>{tl("gifts.kindServiceSub")}</small>
                </span>
              </button>
            </div>

            {kind === "plan" ? (
              plans.status === "error" ? (
                <ErrorState compact error={plans.error} onRetry={plans.refresh} />
              ) : !giftable.length && plans.status !== "loading" ? (
                <p className="gift__none">{t("noPlans")}</p>
              ) : (
                <>
                  {giftable.length > 1 ? (
                    <div>
                      <label>{t("plan")}</label>
                      <Select value={chosenPlan?.id || ""} onChange={setPlanId} options={planOpts} ariaLabel={t("plan")} />
                    </div>
                  ) : chosenPlan ? (
                    <div className="gift__plan">
                      <span className="gift__plan-ic plx-plate-sq" style={planPlate(chosenPlan.slug, true)} aria-hidden />
                      <span className="gift__plan-tx">
                        <b>{chosenPlan.name}</b>
                        {chosenPlan.description ? <small>{chosenPlan.description}</small> : null}
                      </span>
                    </div>
                  ) : null}
                  <div>
                    <label>{t("term")}</label>
                    <div className="gift__terms" role="group" aria-label={t("term")}>
                      {terms.map((n) => (
                        <button key={n} type="button" className="fchip" aria-pressed={n === term} onClick={() => setTermPick(n)}>
                          {n} {t("months")}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )
            ) : (
              <div>
                <label>{t("service")}</label>
                <Select
                  value={chosenService}
                  onChange={setServiceId}
                  options={serviceOpts.length ? serviceOpts : [{ value: "", label: "—" }]}
                  ariaLabel={t("service")}
                />
              </div>
            )}

            <div>
              <label>{t("recipient")}</label>
              <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder={t("recipientHintPh")} />
            </div>

            {kind === "plan" && priced ? (
              <div className="gift__price">
                <div className="pgift__est">
                  <span>{t("estTotal")} · {term} {t("months")}</span>
                  <b>{fmtUzs(estimateGiftTotal(priced, term))} {t("som")}</b>
                </div>
                <p className="rf__hint">{t("estHint")}</p>
              </div>
            ) : null}
          </form>
        )}
      </Modal>
    </div>
  );
}
