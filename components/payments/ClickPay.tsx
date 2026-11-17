"use client";

import "./clickPay.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import Modal from "@/components/admin/Modal";
import { IconAlert, IconCheck, IconClock, IconClose, IconDownload, IconLock, IconRefresh } from "@/components/icons";
import { fmtUzs } from "@/lib/money";
import { saveBlob } from "@/lib/download";
import { getPaymentReceipt } from "@/lib/services/backend";
import { rememberPendingPayment } from "@/lib/services/paymentProviders";
import { track } from "@/lib/productAnalytics";
import { refreshCheckoutProviders } from "@/lib/useCheckoutProviders";
import { usePaymentWatch } from "@/lib/usePaymentWatch";
import {
  PROVIDER_LIST_STALE,
  POLL_GIVE_UP_MS,
  checkoutLinkUsable,
  clickErrorOf,
  holdPaymentOnScreen,
  isTerminal,
  openCheckoutTab,
  renewClickCheckout,
  sendCheckoutTab,
  type CheckoutLink,
  type ClickError,
  type ClickPayment,
  type PaymentInfo,
  type RenewedCheckout,
} from "@/lib/services/clickCheckout";

// Click's mark and wordmark, drawn from its own logo (docs.click.uz): the
// blue rounded ring, and "click" in the text colour (black on light, white on
// dark). `mono` paints the mark white for the blue button.
export function ClickMark({ className, mono }: { className?: string; mono?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 40 40" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill={mono ? "#fff" : "var(--click-blue,#0065FF)"}
        d="M39.3739 20.1572C39.3739 27.7941 27.2594 40.0006 19.6797 40.0006C12.1 40.0006 -0.0146637 27.7941 -0.0146637 20.1572C-0.0146637 12.5203 12.1 0.313477 19.6797 0.313477C27.2594 0.313477 39.3739 12.5203 39.3739 20.1572ZM27.5573 20.1572C27.5573 23.212 22.7113 28.0945 19.6797 28.0945C16.6477 28.0945 11.8019 23.212 11.8019 20.1572C11.8019 17.1025 16.6479 12.2197 19.6797 12.2197C22.7113 12.2197 27.5573 17.1025 27.5573 20.1572Z"
      />
    </svg>
  );
}
export function ClickLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 157 40" width="78" height="20" role="img" aria-label="Click" focusable="false">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="var(--click-blue,#0065FF)"
        d="M39.3739 20.1572C39.3739 27.7941 27.2594 40.0006 19.6797 40.0006C12.1 40.0006 -0.0146637 27.7941 -0.0146637 20.1572C-0.0146637 12.5203 12.1 0.313477 19.6797 0.313477C27.2594 0.313477 39.3739 12.5203 39.3739 20.1572ZM27.5573 20.1572C27.5573 23.212 22.7113 28.0945 19.6797 28.0945C16.6477 28.0945 11.8019 23.212 11.8019 20.1572C11.8019 17.1025 16.6479 12.2197 19.6797 12.2197C22.7113 12.2197 27.5573 17.1025 27.5573 20.1572Z"
      />
      <path
        fill="currentColor"
        d="M60.8212 39.9981C68.1709 39.9981 72.7769 35.3571 74.1744 29.2556H66.1004C65.1172 31.3415 63.5644 32.906 60.8212 32.906C57.5088 32.906 55.0764 30.5073 55.0764 26.3874C55.0764 22.2678 57.5088 19.8687 60.8212 19.8687C63.5644 19.8687 65.1172 21.4332 66.1004 23.5194H74.1744C72.7769 17.4179 68.1709 12.7766 60.8212 12.7766C52.9541 12.7766 47.2093 18.826 47.2093 26.3874C47.2093 33.9491 52.9541 39.9981 60.8212 39.9981ZM76.9305 39.4246H84.7459V0.313209H76.9305V39.4246ZM93.2986 9.80409C96.0417 9.80409 98.2155 7.61389 98.2155 4.90212C98.2155 2.19056 96.0417 0.000366211 93.2986 0.000366211C90.6592 0.000366211 88.4334 2.19056 88.4334 4.90212C88.4334 7.61389 90.6592 9.80409 93.2986 9.80409ZM89.4169 39.4246H97.2323V13.3504H89.4169V39.4246ZM113.963 39.9981C121.312 39.9981 125.918 35.3571 127.316 29.2556H119.242C118.258 31.3415 116.706 32.906 113.963 32.906C110.65 32.906 108.218 30.5073 108.218 26.3874C108.218 22.2678 110.65 19.8687 113.963 19.8687C116.706 19.8687 118.258 21.4332 119.242 23.5194H127.316C125.918 17.4179 121.312 12.7766 113.963 12.7766C106.096 12.7766 100.351 18.826 100.351 26.3874C100.351 33.9491 106.096 39.9981 113.963 39.9981ZM147.514 39.4246H156.985L145.185 25.136L154.708 13.3504H145.443L137.887 22.6849V0.313209H130.072V39.4246H137.887V27.7954L147.514 39.4246Z"
      />
    </svg>
  );
}

type Tone = "wait" | "ok" | "bad" | "off";
const TONE: Record<string, Tone> = { pending: "wait", prepared: "wait", confirming: "wait", late: "wait", paid: "ok", cancelled: "bad", failed: "bad", refunded: "off" };
// A second press this soon after opening Click is the same press (a double
// click), not a wish for a second checkout.
const REOPEN_GUARD_MS = 1500;
// Errors after which the Click button rests until the client asks again
// (Click web contract 2026-11-17 §8).
const RESTING: readonly ClickError["key"][] = ["notConfigured", "unavailable"];
// Support in the cabinet the client is in (a lawyer buying a plan has their own).
const supportHref = (path: string) => `/portal/${/^\/portal\/(lawyer|advocate)(\/|$)/.exec(path)?.[1] ?? "client"}/support`;

// One payment, the Click way (§16): what is bought, the backend's amount in
// UZS, the Click button, the Click Up instruction, the live status, a renewal
// through the backend only, and the receipt once paid. Nothing here says
// "paid" until GET /payments/{id} does — or, for a marketplace order
// (`orderId`), until GET /marketplace/me/orders/{order_id} does.
export function ClickPayPanel({
  payment,
  orderId,
  title,
  onPaid,
  onSettled,
  onStale,
  paidActions,
  compactPaid,
  urlIssuedAt,
  aiId = "click-pay",
}: {
  payment: ClickPayment;
  // The marketplace order this payment pays: its state is read from there.
  orderId?: string;
  title?: string;
  onPaid?: (info: PaymentInfo) => void;
  // Any final answer (paid, cancelled, failed, refunded).
  onSettled?: (info: PaymentInfo) => void;
  // The backend no longer knows this payment or will not take it: whatever
  // shows it should be read again (§8).
  onStale?: () => void;
  paidActions?: ReactNode;
  // Once paid, one slim line (status + receipt) — the page goes on below it.
  compactPaid?: boolean;
  // When the checkout URL was issued, if it came from somewhere older than
  // this screen (a notification): an old one is renewed before opening.
  urlIssuedAt?: number;
  aiId?: string;
}) {
  const t = useTranslations("clickPay");
  const path = usePathname();
  const watch = usePaymentWatch(payment.id, {
    orderId,
    onSettled: (p) => {
      if (p.status === "paid") {
        track("payment_succeeded", { properties: { payment_id: p.id, provider: "click", amount: p.amount } });
        onPaid?.(p);
      }
      onSettled?.(p);
    },
  });
  // The opaque checkout lives only here, in memory, with the time it came
  // and whether the browser has been sent to it (it works once, §6).
  const checkout = useRef<CheckoutLink>({ url: payment.url, at: 0, used: false });
  const busyRef = useRef(false);
  const lastOpen = useRef(0);
  const [busy, setBusy] = useState<"" | "open" | "renew">("");
  // Click was opened and its answer has not come yet (§7).
  const [opened, setOpened] = useState(false);
  const [err, setErr] = useState<ClickError | null>(null);
  const [receiptErr, setReceiptErr] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);

  // The URL's clock starts when this payment first shows (render must stay pure).
  useEffect(() => {
    if (checkout.current.url && !checkout.current.at) checkout.current.at = urlIssuedAt || Date.now();
  }, [urlIssuedAt]);

  const status = watch.status;
  const settled = isTerminal(status);
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

  // §5: the Click tab closed → read the state now (the client may have paid
  // and come straight back). Watched only while that tab is ours to see.
  const tabRef = useRef<Window | null>(null);
  const tabTimer = useRef(0);
  const check = watch.check;
  const watchTab = (tab: Window) => {
    window.clearInterval(tabTimer.current);
    tabRef.current = tab;
    const since = Date.now();
    tabTimer.current = window.setInterval(() => {
      const w = tabRef.current;
      if (!w || Date.now() - since > POLL_GIVE_UP_MS) {
        window.clearInterval(tabTimer.current);
        return;
      }
      if (w.closed) {
        window.clearInterval(tabTimer.current);
        tabRef.current = null;
        check();
      }
    }, 1000);
  };
  useEffect(() => () => window.clearInterval(tabTimer.current), []);
  useEffect(() => {
    if (settled) window.clearInterval(tabTimer.current);
  }, [settled]);

  function fail(e: unknown) {
    const ce = clickErrorOf(e);
    if (PROVIDER_LIST_STALE.includes(ce.key)) refreshCheckoutProviders();
    // §8: not payable / not found → the state is read again, never retried.
    if (ce.key === "mismatch" || ce.key === "notPayable" || ce.key === "notFound") {
      watch.check();
      onStale?.();
    }
    setErr(ce);
  }

  // Into Click: a tab opened inside the click itself (so no popup blocker),
  // pointed at the backend's page as given. A link already used, or too old,
  // is never opened again: the backend gives a new one first (§6).
  async function open(forceNew = false) {
    if (busyRef.current) return;
    if (!forceNew && Date.now() - lastOpen.current < REOPEN_GUARD_MS) return;
    setErr(null);
    const c = checkout.current;
    const fresh = !forceNew && checkoutLinkUsable(c);
    const tab = openCheckoutTab();
    const go = (url: string) => {
      track("payment_page_opened", { properties: { payment_id: payment.id, provider: "click" } });
      checkout.current = { ...checkout.current, url, used: true };
      lastOpen.current = Date.now();
      const where = sendCheckoutTab(tab, url, () => {
        // No new tab allowed: the same tab goes, and the return is watched.
        rememberPendingPayment({ id: payment.id, amount: payment.amount });
      });
      if (where === "tab" && tab) watchTab(tab);
      setOpened(true);
      watch.check();
    };
    if (fresh) {
      go(c.url);
      return;
    }
    busyRef.current = true;
    setBusy(forceNew ? "renew" : "open");
    try {
      let r: RenewedCheckout;
      try {
        r = await renewClickCheckout(payment.id);
      } catch (e) {
        // §8: 410 click_checkout_expired → one more new link, then give up.
        if (clickErrorOf(e).key !== "expired") throw e;
        r = await renewClickCheckout(payment.id);
      }
      if (r.url) {
        checkout.current = { url: r.url, at: Date.now(), used: false };
        go(r.url);
      } else {
        // Already paid (idempotent) or nothing to open: read the status.
        tab?.close();
        watch.check();
      }
    } catch (e) {
      tab?.close();
      fail(e);
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }

  async function receipt() {
    if (receiptBusy) return;
    setReceiptBusy(true);
    setReceiptErr(false);
    try {
      saveBlob(await getPaymentReceipt(payment.id), "tezkor-himoya-chek.pdf");
    } catch {
      setReceiptErr(true);
    } finally {
      setReceiptBusy(false);
    }
  }

  const amount = watch.info?.amount || payment.amount;
  const currency = watch.info?.currency || payment.currency || "UZS";
  // Opened and not answered yet: waiting for Click's confirmation, never
  // "paid" (§7).
  const shown = watch.late && !settled ? "late" : opened && status === "pending" ? "confirming" : status;
  const tone = TONE[shown] ?? "wait";
  const waiting = !settled;
  // The order itself closed (cancelled by the backend): nothing to pay, and
  // the backend's own words say why (§7).
  const closed = !!orderId && !!watch.info?.orderClosed && status !== "paid";
  // Click rests after "not configured"/"unavailable" until the client tries
  // again; a payment the backend does not know is not offered again (§8).
  const resting = !!err && RESTING.includes(err.key);
  const gone = err?.key === "notFound";

  if (compactPaid && status === "paid") {
    return (
      <section className="ckp ckp--ok ckp--slim" data-state="paid" data-ai-id={aiId} data-ai-type="section" aria-label={t("title")}>
        <ClickLogo className="ckp__logo" />
        <span className="ckp__pill ckp__pill--ok" role="status">
          <i aria-hidden="true" />
          {t("paidTitle")}
        </span>
        <button type="button" className="ckp__ghost" onClick={() => void receipt()} disabled={receiptBusy} data-ai-id={`${aiId}.receipt`}>
          <IconDownload aria-hidden="true" />
          {t("receipt")}
        </button>
        {receiptErr ? <p className="ckp__err" role="alert">{t("receiptError")}</p> : null}
      </section>
    );
  }

  return (
    <section className={`ckp ckp--${tone}`} data-state={shown} data-ai-id={aiId} data-ai-type="section" data-ai-private aria-label={t("title")}>
      <header className="ckp__head">
        <ClickLogo className="ckp__logo" />
        <span className={`ckp__pill ckp__pill--${tone}`} role="status" aria-live="polite">
          <i aria-hidden="true" />
          {t(`status.${shown}`)}
        </span>
      </header>

      <div className="ckp__sum">
        {title ? <span className="ckp__what">{title}</span> : null}
        <b className="ckp__amt">
          {amount ? fmtUzs(amount) : "—"} <span>{currency.toUpperCase()}</span>
        </b>
      </div>

      {status === "paid" ? (
        <div className="ckp__done">
          <span className="ckp__stamp ckp__stamp--ok" aria-hidden="true">
            <IconCheck />
          </span>
          <div className="ckp__done-t">
            <b>{t("paidTitle")}</b>
            <p>{t("paidText")}</p>
          </div>
          <div className="ckp__acts">
            <button type="button" className="ckp__ghost" onClick={() => void receipt()} disabled={receiptBusy} data-ai-id={`${aiId}.receipt`}>
              <IconDownload aria-hidden="true" />
              {t("receipt")}
            </button>
            {paidActions}
          </div>
          {receiptErr ? <p className="ckp__err" role="alert">{t("receiptError")}</p> : null}
        </div>
      ) : closed ? (
        <div className="ckp__done">
          <span className={`ckp__stamp ckp__stamp--${status === "refunded" ? "off" : "bad"}`} aria-hidden="true">
            {status === "refunded" ? <IconRefresh /> : <IconClose />}
          </span>
          <div className="ckp__done-t">
            <b>{status === "refunded" ? t("refundedTitle") : t("orderClosedTitle")}</b>
            <p>{watch.info?.message || (status === "refunded" ? t("refundedText") : t("orderClosedText"))}</p>
          </div>
        </div>
      ) : status === "cancelled" || status === "failed" || status === "refunded" ? (
        <div className="ckp__done">
          <span className={`ckp__stamp ckp__stamp--${status === "refunded" ? "off" : "bad"}`} aria-hidden="true">
            {status === "refunded" ? <IconRefresh /> : <IconClose />}
          </span>
          <div className="ckp__done-t">
            <b>{t(`${status}Title`)}</b>
            <p>{t(`${status}Text`)}</p>
          </div>
          {status === "refunded" || gone ? null : (
            <button type="button" className="ckp__btn" onClick={() => void open(true)} disabled={!!busy || resting} data-ai-id={`${aiId}.retry`}>
              <ClickMark mono className="ckp__btn-mark" />
              {busy ? t("opening") : t("retry")}
            </button>
          )}
        </div>
      ) : (
        <>
          <ol className="ckp__steps">
            <li>{t("steps.open")}</li>
            <li>{t("steps.approve")}</li>
            <li>{t("steps.back")}</li>
          </ol>
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
          {gone ? null : (
            <button type="button" className="ckp__btn" onClick={() => void open()} disabled={!!busy || resting} data-ai-id={`${aiId}.open`}>
              <ClickMark mono className="ckp__btn-mark" />
              {busy ? t("opening") : t("open")}
            </button>
          )}
          {waiting && !watch.late ? (
            <p className="ckp__live">
              <i aria-hidden="true" />
              {opened ? t("liveOpened") : t("live")}
            </p>
          ) : null}
          {gone || resting ? null : (
            <p className="ckp__renew">
              {t("renewHint")}{" "}
              <button type="button" className="ckp__link" onClick={() => void open(true)} disabled={!!busy} data-ai-id={`${aiId}.renew`}>
                {t("renew")}
              </button>
            </p>
          )}
        </>
      )}

      {err ? (
        <div className="ckp__err" role="alert">
          <IconAlert aria-hidden="true" />
          <span>{err.key === "rejected" && err.message ? `${t("errors.rejected")} ${err.message}` : t(`errors.${err.key}`)}</span>
          {err.key === "auth" ? (
            <Link href="/login" className="ckp__link">
              {t("signIn")}
            </Link>
          ) : null}
          {resting ? (
            <span className="ckp__err-acts">
              <button
                type="button"
                className="ckp__link"
                onClick={() => {
                  refreshCheckoutProviders();
                  setErr(null);
                }}
                data-ai-id={`${aiId}.try-again`}
              >
                {t("tryAgain")}
              </button>
              <Link href={supportHref(path)} className="ckp__link" data-ai-id={`${aiId}.support`}>
                {t("support")}
              </Link>
            </span>
          ) : null}
        </div>
      ) : null}

      <p className="ckp__secure">
        <IconLock aria-hidden="true" />
        {t("secure")}
      </p>
    </section>
  );
}

// While the backend is still making the invoice (§16: a safe loading state).
export function ClickPayLoading({ title }: { title?: string }) {
  const t = useTranslations("clickPay");
  return (
    <section className="ckp ckp--wait ckp--loading" aria-busy="true" aria-label={t("title")}>
      <header className="ckp__head">
        <ClickLogo className="ckp__logo" />
        <span className="ckp__pill ckp__pill--wait" role="status">
          <i aria-hidden="true" />
          {t("creating")}
        </span>
      </header>
      <div className="ckp__sum">
        {title ? <span className="ckp__what">{title}</span> : null}
        <span className="ckp__sk" aria-hidden="true" />
      </div>
      <span className="ckp__btn ckp__btn--sk" aria-hidden="true">
        <ClickMark mono className="ckp__btn-mark" />
        {t("open")}
      </span>
    </section>
  );
}

// The same, in its own dialog: for plans, gifts, documents and SOS.
export default function ClickPayDialog({
  open,
  payment,
  title,
  onPaid,
  onClose,
  paidActions,
  urlIssuedAt,
  aiId,
}: {
  open: boolean;
  payment: ClickPayment | null;
  title?: string;
  onPaid?: (info: PaymentInfo) => void;
  onClose: () => void;
  paidActions?: ReactNode;
  urlIssuedAt?: number;
  aiId?: string;
}) {
  const t = useTranslations("clickPay");
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("title")}
      size="sm"
      aiId={aiId ? `${aiId}.dialog` : "click-pay.dialog"}
      footer={
        <div className="ckp-foot">
          <button type="button" className="btn btn--line" onClick={onClose}>
            {t("close")}
          </button>
        </div>
      }
    >
      {payment ? <ClickPayPanel key={payment.id} payment={payment} title={title} onPaid={onPaid} paidActions={paidActions} urlIssuedAt={urlIssuedAt} aiId={aiId} /> : <ClickPayLoading title={title} />}
    </Modal>
  );
}
