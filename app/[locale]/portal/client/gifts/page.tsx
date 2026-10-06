"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  listGifts,
  createGift,
  getSubscriptionPlans,
  getAllServices,
  type BackendPlan,
  type BackendService,
  type GiftResult,
} from "@/lib/services/backend";
import { isDemoUnavailable, isProviderUnavailable } from "@/lib/http";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { IconGift, IconPlus, IconCheck, IconArrowRight } from "@/components/icons";
import { dateOnly } from "@/lib/date";

const TERMS = [3, 6, 12];

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

export default function ClientGifts() {
  const t = useTranslations("portal.client.gifts");
  const tg = useTranslations("portal.client.gifts.statusMap");
  const tcommon = useTranslations("common");
  const tp = useTranslations("portal.common");
  const locale = useLocale();
  const [reloadKey, setReloadKey] = useState(0);
  const gifts = useResource(() => listGifts(), [reloadKey]);
  const plans = useResource<BackendPlan>(() => getSubscriptionPlans(locale), [locale]);
  // getAllServices, not getServices: /services is paged now (LEXGO_SERVICES_
  // CATALOG_OPTIMIZATION_FRONTEND.md) — this dropdown needs every giftable
  // service, not just the first page.
  const services = useResource<BackendService>(() => getAllServices(undefined, locale), [locale]);
  const giftable = plans.data.filter((p) => p.isGiftable);

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"plan" | "service">("plan");
  const [planId, setPlanId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [hint, setHint] = useState("");
  const [termPick, setTermPick] = useState(6);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
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
    setNote(null);
    setKind("plan");
    setPlanId("");
    setServiceId("");
    setTermPick(6);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const isService = kind === "service";
    if (busy || (isService ? !chosenService : !chosenPlan)) {
      setNote({ ok: false, msg: t("error") });
      return;
    }
    setBusy(true);
    setNote(null);
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
      setNote({
        ok: false,
        msg: isProviderUnavailable(e) || isDemoUnavailable(e) ? tcommon("paymentUnavailable") : t("error"),
      });
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

  return (
    <div className="ppanel" data-ai-target={gifts.status !== "loading" && gifts.data.length ? undefined : "gifts:list"}>
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <button className="btn btn--pri btn--sm" type="button" onClick={() => { reset(); setOpen(true); }} data-ai-target="button:give-gift">
          <IconPlus />
          {t("give")}
        </button>
      </div>

      {gifts.status === "loading" ? (
        <Skeleton rows={3} />
      ) : !gifts.data.length ? (
        <EmptyState icon={<IconGift />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="alist" data-ai-target="gifts:list">
          {gifts.data.map((g) => {
            const tone = statusTone(g.status);
            const incoming = g.direction === "received";
            return (
              <div className="creq" key={g.id}>
                <span className={`creq__st creq__st--${tone}`} />
                <div className="creq__m">
                  <b>{g.title || t("untitledGift")}</b>
                  {/* LEXGO_PUBLIC_WORK_IDS_FRONTEND.md: GFT-XXXXX — the gift's own
                      public id, distinct from the redemption code below. */}
                  {g.workId ? <small className="wid">{g.workId}</small> : null}
                  <small className="gift__kind">{t(g.kind === "service" ? "kindService" : "kindPlan")}</small>
                  {incoming ? <small className="gift__kind gift__kind--in">{t("gotIt")}</small> : null}
                  <span>
                    {[
                      incoming ? "" : g.recipientPhone,
                      g.termMonths ? `${g.termMonths} ${t("months")}` : "",
                      fmtDate(g.createdAt, locale),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {g.shareUrl && !incoming && g.status !== "claimed" ? (
                    <a className="gift__list-link" href={g.shareUrl} target="_blank" rel="noreferrer">
                      {t("shareCta")}
                    </a>
                  ) : null}
                </div>
                {/* Scoped to the status map: an unscoped lookup could collide with any
                    key on the page (a gift whose status is "title" would print the
                    page heading). */}
                <span className={`creq__badge creq__badge--${tone}`}>{tg.has(g.status) ? tg(g.status) : g.status}</span>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => { setOpen(false); reset(); }} title={t("give")}>
        {created ? (
          <div className="gift__done">
            <span className="gift__done-ic"><IconCheck /></span>
            <b>{t("shareTitle")}</b>
            <p className="advmuted">{t("shareHint")}</p>
            {created.qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="gift__qr" src={created.qrUrl} alt={t("qrAlt")} width={148} height={148} onError={(e) => { e.currentTarget.style.display = "none"; }} />
            ) : null}
            <div className="gift__share">
              <input readOnly value={created.shareUrl} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn btn--pri btn--sm" onClick={copyLink}>
                {copied ? <><IconCheck />{t("copied")}</> : t("copyLink")}
              </button>
            </div>
            <div className="gift__done-ft">
              {created.paymentUrl ? (
                <a className="btn btn--line btn--sm" href={created.paymentUrl} target="_blank" rel="noreferrer">
                  {t("openPayment")}
                  <IconArrowRight />
                </a>
              ) : null}
              <button type="button" className="btn btn--soft btn--sm" onClick={() => { setOpen(false); reset(); }}>
                {t("done")}
              </button>
            </div>
          </div>
        ) : (
          <form className="cform gift__form" onSubmit={submit}>
            <div className="rolerow gift__tabs">
              <button type="button" className="roletab" aria-pressed={kind === "plan"} onClick={() => setKind("plan")}>
                {t("kindPlan")}
              </button>
              <button type="button" className="roletab" aria-pressed={kind === "service"} onClick={() => setKind("service")}>
                {t("kindService")}
              </button>
            </div>

            {kind === "plan" ? (
              plans.status === "error" ? (
                <p className="rf__hint">{tp("loadError")}. {tp("loadErrorText")}</p>
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
                      <span className="gift__plan-ic"><IconGift /></span>
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

            {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
            <button
              className="btn btn--pri btn--full"
              type="submit"
              disabled={busy || (kind === "plan" ? !chosenPlan : !chosenService)}
            >
              {busy ? t("sending") : t("send")}
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
}
