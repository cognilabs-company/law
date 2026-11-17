"use client";

import "./clickPay.css";
import "./atmosPay.css";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconAlert, IconCard, IconCheck, IconClock, IconClose, IconLock, IconRefresh } from "@/components/icons";
import { fmtUzs } from "@/lib/money";
import { track } from "@/lib/productAnalytics";
import { holdPaymentOnScreen, CHECKOUT_TTL_MS } from "@/lib/services/clickCheckout";
import { rememberPendingPayment } from "@/lib/services/paymentProviders";
import {
  ATMOS,
  ATMOS_LIST_STALE,
  ATMOS_SUPPORT,
  atmosErrorOf,
  atmosOutcomeOf,
  renewAtmosCheckout,
  sellerDeadlineOf,
  type AtmosError,
  type AtmosOrderState,
} from "@/lib/services/atmosCheckout";
import { refreshCheckoutProviders, useCheckoutProviders } from "@/lib/useCheckoutProviders";
import { useAtmosOrderWatch } from "@/lib/useAtmosOrderWatch";
import { clockOf, useCountdown } from "@/lib/useCountdown";

export const SUPPORT_HREF = "/portal/client/support";

// The payment as the purchase answer (or the order) gave it. `url` is the
// opaque ATMOS checkout: in memory only, opened exactly as given.
export type AtmosPayment = { id: string; amount: number; currency: string; url?: string };

// ATMOS's name as the backend labels it, in the card's own type.
export function AtmosMark({ label, className }: { label: string; className?: string }) {
  return (
    <span className={`atp-mark${className ? ` ${className}` : ""}`}>
      <IconCard aria-hidden="true" />
      <b>{label}</b>
    </span>
  );
}

// A new tab opened inside the click, cut off from this page before it goes
// anywhere (the "noopener" of the contract, while keeping a handle so a
// second window is never opened and its closing is noticed).
function blankTab(): Window | null {
  const w = window.open("", "_blank");
  if (w) w.opener = null;
  return w;
}

type Stage = "idle" | "opened" | "returned";
type Shown = "off" | "pending" | "opened" | "returned" | "late" | "paid" | "failed";
const TONE: Record<Shown, string> = { off: "off", pending: "wait", opened: "wait", returned: "wait", late: "wait", paid: "ok", failed: "bad" };

// One marketplace payment through ATMOS (contract "UI state rules"):
//   provider off → an honest "Unavailable", no active button;
//   payment_pending → "Pay with ATMOS";
//   checkout opened → "Complete payment in ATMOS";
//   back and still pending → "Waiting for payment confirmation";
//   paid → success and the seller's acceptance, with the backend's deadline.
// Only GET /marketplace/me/orders/{order_id} moves it on.
export function AtmosPayPanel({
  orderId,
  payment,
  title,
  compactPaid,
  onSettled,
  aiId = "atmos-pay",
}: {
  orderId: string;
  payment: AtmosPayment;
  title?: string;
  // Once paid, one slim line — the page goes on below it.
  compactPaid?: boolean;
  onSettled?: (s: AtmosOrderState) => void;
  aiId?: string;
}) {
  const t = useTranslations("atmosPay");
  const pays = useCheckoutProviders();
  const label = pays.labelOf(ATMOS) || "ATMOS";
  const enabled = pays.ready && pays.has(ATMOS);
  const watch = useAtmosOrderWatch(orderId, {
    paymentId: payment.id,
    onSettled: (s) => {
      if (atmosOutcomeOf(s) === "paid") track("payment_succeeded", { properties: { payment_id: payment.id, provider: ATMOS, amount: s.amount || payment.amount } });
      onSettled?.(s);
    },
  });
  const checkout = useRef<{ url: string; at: number }>({ url: payment.url ?? "", at: 0 });
  const tab = useRef<Window | null>(null);
  const openedAt = useRef(0);
  const [stage, setStage] = useState<Stage>("idle");
  const [busy, setBusy] = useState<"" | "open" | "renew">("");
  const [err, setErr] = useState<AtmosError | null>(null);

  useEffect(() => {
    if (checkout.current.url && !checkout.current.at) checkout.current.at = Date.now();
  }, []);

  const outcome = watch.state ? atmosOutcomeOf(watch.state) : "pending";
  const settled = outcome !== "pending";

  // Leaving with the payment still open: the app-wide watcher carries on.
  const settledRef = useRef(settled);
  useEffect(() => {
    settledRef.current = settled;
  }, [settled]);
  useEffect(() => {
    const id = payment.id;
    const amount = payment.amount;
    return holdPaymentOnScreen(id, () => {
      if (!settledRef.current) rememberPendingPayment({ id, amount });
    });
  }, [payment.id, payment.amount]);

  // The checkout tab closed, or the client came back to this page: they are
  // "back", and the order is read at once.
  const check = watch.check;
  useEffect(() => {
    if (stage !== "opened") return;
    const back = () => {
      setStage("returned");
      check();
    };
    const id = window.setInterval(() => {
      if (tab.current && tab.current.closed) {
        tab.current = null;
        back();
      }
    }, 1000);
    const onFocus = () => {
      if (Date.now() - openedAt.current > 1500) back();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [stage, check]);
  useEffect(() => {
    if (settled && tab.current && !tab.current.closed) tab.current = null;
  }, [settled]);

  const deadline = watch.state ? sellerDeadlineOf(watch.state) : "";
  const left = useCountdown(deadline);

  function fail(e: unknown) {
    const ae = atmosErrorOf(e);
    if (ATMOS_LIST_STALE.includes(ae.key)) refreshCheckoutProviders();
    if (ae.key === "notPayable") watch.check();
    setErr(ae);
  }

  // Into ATMOS, only from this click: a tab opened inside the click itself
  // (no popup blocker, no second window), pointed at the backend's page as
  // given. An old or missing link is renewed through the backend first.
  async function open(forceNew = false) {
    if (busy || !enabled || settled) return;
    const cur = tab.current && !tab.current.closed ? tab.current : null;
    if (cur && !forceNew) {
      cur.focus();
      return;
    }
    setErr(null);
    const c = checkout.current;
    const fresh = !forceNew && !!c.url && Date.now() - c.at < CHECKOUT_TTL_MS;
    const win = cur ?? blankTab();
    const go = (url: string) => {
      track("payment_page_opened", { properties: { payment_id: payment.id, provider: ATMOS } });
      if (win && !win.closed) {
        win.location.replace(url);
        tab.current = win;
        openedAt.current = Date.now();
        setStage("opened");
      } else {
        // No new tab allowed: this tab goes, and the return is watched.
        rememberPendingPayment({ id: payment.id, amount: payment.amount });
        window.location.assign(url);
      }
      watch.check();
    };
    if (fresh) {
      go(c.url);
      return;
    }
    setBusy(forceNew ? "renew" : "open");
    try {
      const r = await renewAtmosCheckout(payment.id);
      if (r.status === "paid" || !r.url) {
        // Already paid (or nothing to open): read the order, open nothing.
        if (!cur) win?.close();
        watch.check();
      } else {
        checkout.current = { url: r.url, at: Date.now() };
        go(r.url);
      }
    } catch (e) {
      if (!cur) win?.close();
      fail(e);
    } finally {
      setBusy("");
    }
  }

  const amount = watch.state?.amount || payment.amount;
  const currency = (watch.state?.currency || payment.currency || "UZS").toUpperCase();
  const shown: Shown = outcome === "paid" ? "paid" : outcome === "failed" ? "failed" : !enabled && pays.ready ? "off" : watch.late ? "late" : stage === "idle" ? "pending" : stage;
  const tone = TONE[shown];

  const errBox = err ? (
    <div className="ckp__err" role="alert">
      <IconAlert aria-hidden="true" />
      <span>{err.key === "rejected" && err.message ? `${t("errors.rejected")} ${err.message}` : t(`errors.${err.key}`)}</span>
      {err.key === "auth" ? (
        <Link href="/login" className="ckp__link">
          {t("signIn")}
        </Link>
      ) : ATMOS_SUPPORT.includes(err.key) ? (
        <Link href={SUPPORT_HREF} className="ckp__link" data-ai-id={`${aiId}.support`}>
          {t("support")}
        </Link>
      ) : null}
    </div>
  ) : null;

  if (compactPaid && shown === "paid") {
    return (
      <section className="ckp ckp--atmos ckp--ok ckp--slim" data-state="paid" data-ai-id={aiId} data-ai-type="section" aria-label={t("title")}>
        <AtmosMark label={label} />
        <span className="ckp__pill ckp__pill--ok" role="status">
          <i aria-hidden="true" />
          {t("status.paid")}
        </span>
      </section>
    );
  }

  return (
    <section className={`ckp ckp--atmos ckp--${tone}`} data-state={shown} data-ai-id={aiId} data-ai-type="section" data-ai-private aria-label={t("title")}>
      <header className="ckp__head">
        <AtmosMark label={label} />
        <span className={`ckp__pill ckp__pill--${tone}`} role="status" aria-live="polite">
          <i aria-hidden="true" />
          {t(`status.${shown}`)}
        </span>
      </header>

      <div className="ckp__sum">
        {title ? <span className="ckp__what">{title}</span> : null}
        <b className="ckp__amt">
          {amount ? fmtUzs(amount) : "—"} <span>{currency}</span>
        </b>
      </div>

      {shown === "paid" ? (
        <div className="ckp__done">
          <span className="ckp__stamp ckp__stamp--ok" aria-hidden="true">
            <IconCheck />
          </span>
          <div className="ckp__done-t">
            <b>{t("paidTitle")}</b>
            <p>{watch.state?.clientMessage || t("paidText")}</p>
          </div>
          {deadline && left !== null ? (
            <span className="ckp__pill ckp__pill--wait atp-clock" role="timer">
              <IconClock aria-hidden="true" />
              {left > 0 ? t("acceptClock", { time: clockOf(left) }) : t("acceptOver")}
            </span>
          ) : null}
        </div>
      ) : shown === "failed" ? (
        <div className="ckp__done">
          <span className="ckp__stamp ckp__stamp--bad" aria-hidden="true">
            <IconClose />
          </span>
          <div className="ckp__done-t">
            <b>{t("failedTitle")}</b>
            <p>{t("failedText")}</p>
          </div>
        </div>
      ) : shown === "off" ? (
        <>
          <p className="atp-off">{t("offText")}</p>
          <button type="button" className="ckp__btn" disabled aria-disabled="true" data-ai-id={`${aiId}.open`}>
            {t("status.off")}
          </button>
        </>
      ) : (
        <>
          {shown === "opened" || shown === "returned" ? (
            <p className="atp-note" role="status">
              {t(shown === "opened" ? "openedText" : "returnedText")}
            </p>
          ) : (
            <ol className="ckp__steps">
              <li>{t("steps.open")}</li>
              <li>{t("steps.card")}</li>
              <li>{t("steps.back")}</li>
            </ol>
          )}
          {watch.late ? (
            <div className="ckp__late" role="status">
              <IconClock aria-hidden="true" />
              <span>
                <b>{t("lateTitle")}</b>
                {t("lateText")}
              </span>
              <button type="button" className="ckp__ghost" onClick={watch.check} disabled={watch.checking} data-ai-id={`${aiId}.check`}>
                <IconRefresh aria-hidden="true" />
                {t("check")}
              </button>
            </div>
          ) : null}
          <button type="button" className="ckp__btn" onClick={() => void open()} disabled={!!busy || !enabled} data-ai-id={`${aiId}.open`}>
            <IconCard aria-hidden="true" className="ckp__btn-mark" />
            {busy ? t("opening") : stage === "idle" ? t("open") : t("reopen")}
          </button>
          {!watch.late ? (
            <p className="ckp__live">
              <i aria-hidden="true" />
              {t("live")}
            </p>
          ) : null}
          <p className="ckp__renew">
            {t("renewHint")}{" "}
            <button type="button" className="ckp__link" onClick={() => void open(true)} disabled={!!busy || !enabled} data-ai-id={`${aiId}.renew`}>
              {t("renew")}
            </button>
          </p>
        </>
      )}

      {errBox}

      <p className="ckp__secure">
        <IconLock aria-hidden="true" />
        {t("secure")}
      </p>
    </section>
  );
}
