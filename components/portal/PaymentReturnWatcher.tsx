"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconCheck, IconClose, IconAlert, IconClock } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { fmtUzs } from "@/lib/money";
import { listPayments } from "@/lib/services/backend";
import { forgetPendingPayment, paymentOutcome, readPendingPayment, type PendingPayment } from "@/lib/services/paymentProviders";
import "./payment-return.css";

// Polling after a return from the provider page: quick at first (the
// callback usually lands in seconds), then slower, for at most 3 minutes.
const STEPS_MS = [2000, 3000, 4000, 6000, 8000, 10000];
const GIVE_UP_MS = 3 * 60 * 1000;
// Pages that show payment state listen for this to refresh themselves.
export const PAYMENT_CONFIRMED_EVENT = "lexgo:payment-confirmed";

type View = { state: "waiting" | "paid" | "failed" | "late"; p: PendingPayment };

// TSK-664399: a payment is paid only once the provider's verified callback
// says so. Back from Click / Payme, nothing is assumed: this card watches the
// payment until the backend confirms it (or reports a failure), so the client
// never sees "paid" because they merely came back.
export default function PaymentReturnWatcher(): ReactElement | null {
  const t = useTranslations("portal.payReturn");
  const { session } = useAuth();
  const user = session ? 1 : 0;
  const [view, setView] = useState<View | null>(null);
  const timer = useRef(0);
  const run = useRef(0);

  const stop = useCallback(() => {
    run.current++;
    window.clearTimeout(timer.current);
  }, []);

  const watch = useCallback(() => {
    const p = readPendingPayment();
    if (!p) return;
    stop();
    const mine = run.current;
    const started = Date.now();
    setView({ state: "waiting", p });
    const tick = async (step: number) => {
      if (mine !== run.current) return;
      try {
        const list = await listPayments();
        if (mine !== run.current) return;
        const hit = list.find((x) => x.id === p.id);
        const outcome = hit ? paymentOutcome(hit.status) : "waiting";
        if (outcome === "paid") {
          forgetPendingPayment();
          setView({ state: "paid", p: { ...p, amount: hit?.amount || p.amount } });
          window.dispatchEvent(new CustomEvent(PAYMENT_CONFIRMED_EVENT, { detail: { id: p.id } }));
          timer.current = window.setTimeout(() => setView(null), 7000);
          return;
        }
        if (outcome === "failed") {
          forgetPendingPayment();
          setView({ state: "failed", p });
          return;
        }
      } catch {
        /* a blip: keep waiting */
      }
      if (Date.now() - started > GIVE_UP_MS) {
        setView({ state: "late", p });
        return;
      }
      timer.current = window.setTimeout(() => void tick(step + 1), STEPS_MS[Math.min(step, STEPS_MS.length - 1)]);
    };
    timer.current = window.setTimeout(() => void tick(0), 600);
  }, [stop]);

  useEffect(() => {
    if (!user) return;
    const id = window.setTimeout(watch, 0);
    // Back from the provider through the bfcache, or the tab shown again.
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) watch();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && readPendingPayment()) watch();
    };
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(id);
      stop();
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, watch, stop]);

  if (!view) return null;
  const close = () => {
    stop();
    if (view.state !== "waiting") forgetPendingPayment();
    setView(null);
  };
  const amount = view.p.amount ? `${fmtUzs(view.p.amount)} ${t("som")}` : "";
  return (
    <div className="payret" data-state={view.state} role="status" aria-live="polite">
      <span className="payret__ic" aria-hidden="true">
        {view.state === "waiting" ? <span className="payret__spin" /> : view.state === "paid" ? <IconCheck /> : view.state === "failed" ? <IconAlert /> : <IconClock />}
      </span>
      <span className="payret__m">
        <b>{t(`${view.state}.title`)}</b>
        <small>{t(`${view.state}.text`)}</small>
        {amount ? <em>{amount}</em> : null}
        {view.state === "late" || view.state === "failed" ? (
          <Link href="/portal/client/payments" className="payret__link" onClick={close}>
            {t("history")}
          </Link>
        ) : null}
      </span>
      <button type="button" className="payret__x" onClick={close} aria-label={view.state === "waiting" ? t("hide") : t("close")}>
        <IconClose aria-hidden="true" />
      </button>
    </div>
  );
}
