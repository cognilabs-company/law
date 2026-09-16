"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  listGifts,
  createGift,
  getSubscriptionPlans,
  getServices,
  type BackendPlan,
  type BackendService,
  type GiftResult,
} from "@/lib/services/backend";
import { isDemoUnavailable, isProviderUnavailable } from "@/lib/http";
import { useResource } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { IconGift, IconPlus, IconCheck, IconArrowRight } from "@/components/icons";

function fmtDate(s: string) {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("ru-RU");
}

export default function ClientGifts() {
  const t = useTranslations("portal.client.gifts");
  const tcommon = useTranslations("common");
  const tp = useTranslations("portal.common");
  const locale = useLocale();
  const [reloadKey, setReloadKey] = useState(0);
  const gifts = useResource(() => listGifts(), [reloadKey]);
  const plans = useResource<BackendPlan>(() => getSubscriptionPlans(locale), [locale]);
  const services = useResource<BackendService>(() => getServices(), []);
  // A dedicated gift plan (billing_type "gift") is the wrapper, not something to
  // gift — only offer the real giftable tariffs.
  const giftable = plans.data.filter((p) => p.isGiftable && p.billingType !== "gift");

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"plan" | "service">("plan");
  const [planId, setPlanId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [hint, setHint] = useState("");
  const [term, setTerm] = useState("6");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [created, setCreated] = useState<GiftResult | null>(null);
  const [copied, setCopied] = useState(false);

  const planOpts = (giftable.length ? giftable : plans.data).map((p) => ({ value: p.id, label: p.name }));
  const serviceOpts = services.data.filter((s) => s.isActive).map((s) => ({ value: s.id, label: s.name }));
  const termOpts = ["3", "6", "12"].map((n) => ({ value: n, label: `${n} ${t("months")}` }));

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
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const isService = kind === "service";
    const chosenPlan = giftable.find((p) => p.id === (planId || planOpts[0]?.value));
    const chosenService = serviceId || serviceOpts[0]?.value;
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
          : { plan_slug: chosenPlan!.slug, duration_months: parseInt(term, 10), recipient_hint: hint.trim() || undefined },
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
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <button className="btn btn--pri btn--sm" type="button" onClick={() => { reset(); setOpen(true); }}>
          <IconPlus />
          {t("give")}
        </button>
      </div>

      {gifts.status === "loading" ? (
        <Skeleton rows={3} />
      ) : !gifts.data.length ? (
        <EmptyState icon={<IconGift />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="alist">
          {gifts.data.map((g) => (
            <div className="creq" key={g.id}>
              <span className="creq__st" />
              <div className="creq__m">
                <b>{g.planName || t("untitledGift")}</b>
                <span>
                  {[g.recipientPhone, g.termMonths ? `${g.termMonths} ${t("months")}` : "", fmtDate(g.createdAt)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {g.shareUrl && g.status !== "claimed" ? (
                  <a className="gift__list-link" href={g.shareUrl} target="_blank" rel="noreferrer">
                    {t("shareCta")}
                  </a>
                ) : null}
              </div>
              <span className="creq__badge">{t.has(g.status) ? t(g.status) : g.status}</span>
            </div>
          ))}
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
              <img className="gift__qr" src={created.qrUrl} alt={t("qrAlt")} width={180} height={180} onError={(e) => { e.currentTarget.style.display = "none"; }} />
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
          <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit}>
            <div className="rolerow" style={{ display: "flex" }}>
              <button type="button" className="roletab" aria-pressed={kind === "plan"} onClick={() => setKind("plan")}>
                {t("kindPlan")}
              </button>
              <button type="button" className="roletab" aria-pressed={kind === "service"} onClick={() => setKind("service")}>
                {t("kindService")}
              </button>
            </div>
            {kind === "plan" ? (
              <div>
                <label>{t("plan")}</label>
                <Select
                  value={planId || planOpts[0]?.value || ""}
                  onChange={setPlanId}
                  options={planOpts.length ? planOpts : [{ value: "", label: "—" }]}
                  ariaLabel={t("plan")}
                />
                {plans.status === "error" ? <p className="rf__hint">{tp("loadError")}. {tp("loadErrorText")}</p> : null}
              </div>
            ) : (
              <div>
                <label>{t("service")}</label>
                <Select
                  value={serviceId || serviceOpts[0]?.value || ""}
                  onChange={setServiceId}
                  options={serviceOpts.length ? serviceOpts : [{ value: "", label: "—" }]}
                  ariaLabel={t("service")}
                />
              </div>
            )}
            {kind === "plan" ? (
              <div>
                <label>{t("term")}</label>
                <Select value={term} onChange={setTerm} options={termOpts} ariaLabel={t("term")} />
              </div>
            ) : null}
            <div>
              <label>{t("recipient")}</label>
              <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder={t("recipientHintPh")} />
            </div>
            {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
            <button className="btn btn--pri btn--full" type="submit" disabled={busy}>
              {busy ? t("sending") : t("send")}
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
}
