"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getPaymentPolicy, demoPayOrder, type PaymentPolicy } from "@/lib/services/backend";
import { isDemoUnavailable, isProviderUnavailable } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { Skeleton } from "./DataState";
import { Notice } from "@/components/admin/AdminBits";
import { IconLock, IconCheck } from "@/components/icons";

const som = (n: number) => (n ? fmtUzs(n) : "0");

// Staged order payment: shows the 10% advance that unlocks the private chat.
// Partial payments are cumulative on the backend; we re-read the policy after
// each payment and open the chat once `contactUnlocked` (or a chat room comes
// back from the payment).
export default function OrderPayment({
  orderId,
  onChat,
}: {
  orderId: string;
  onChat: (roomId?: string) => void;
}) {
  const t = useTranslations("portal.payment");
  const tcommon = useTranslations("common");
  const [pol, setPol] = useState<PaymentPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Back to loading when the order changes (during render, not in the effect).
  const [prevOrderId, setPrevOrderId] = useState(orderId);
  if (orderId !== prevOrderId) {
    setPrevOrderId(orderId);
    setLoading(true);
  }

  useEffect(() => {
    let alive = true;
    getPaymentPolicy(orderId)
      .then((p) => alive && setPol(p))
      .catch(() => alive && setPol(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [orderId]);

  async function pay() {
    if (paying) return;
    setPaying(true);
    setErr(null);
    try {
      const r = await demoPayOrder(orderId);
      if (r.paymentUrl) {
        // A real provider checkout: same-tab navigation (a popup opened after
        // an await is blocked).
        window.location.assign(r.paymentUrl);
        return;
      }
      const next = await getPaymentPolicy(orderId).catch(() => null);
      if (next) setPol(next);
      if (r.chatRoomId || next?.contactUnlocked) onChat(r.chatRoomId);
    } catch (e) {
      // 503 = Payme/Click not configured yet; 404 "Demo endpoint yopiq" = the
      // demo checkout is closed in production. Both: provider not connected.
      setErr(isProviderUnavailable(e) || isDemoUnavailable(e) ? tcommon("paymentUnavailable") : t("error"));
    } finally {
      setPaying(false);
    }
  }

  if (loading) return <Skeleton rows={3} />;
  if (!pol) return <Notice ok={false} msg={t("error")} />;

  const pct = pol.totalAmount ? Math.min(100, Math.round((pol.paidAmount / pol.totalAmount) * 100)) : 0;
  const advPct = pol.advancePercent || 10;

  return (
    <div className="opay">
      <div className="opay__rows">
        <div className="opay__row"><span>{t("total")}</span><b>{som(pol.totalAmount)} {t("som")}</b></div>
        <div className="opay__row"><span>{t("advance", { pct: advPct })}</span><b>{som(pol.advanceAmount)} {t("som")}</b></div>
        <div className="opay__row"><span>{t("paid")}</span><span>{som(pol.paidAmount)} {t("som")}</span></div>
      </div>
      <div className="opay__bar"><span style={{ width: `${pct}%` }} /></div>
      {pol.contactUnlocked ? (
        <p className="opay__ok"><IconCheck />{t("unlocked")}</p>
      ) : (
        <p className="opay__note"><IconLock />{t("locked", { amount: `${som(pol.remainingToUnlock)} ${t("som")}` })}</p>
      )}
      {err ? <Notice ok={false} msg={err} /> : null}
      {pol.contactUnlocked ? (
        <button className="btn btn--grad btn--full btn--lg" type="button" onClick={() => onChat()}>{t("openChat")}</button>
      ) : (
        <button className="btn btn--grad btn--full btn--lg" type="button" disabled={paying} onClick={pay}>
          {paying ? t("paying") : t("payAdvance", { pct: advPct })}
        </button>
      )}
    </div>
  );
}
