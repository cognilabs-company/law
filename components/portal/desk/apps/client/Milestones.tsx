"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { demoConfirmPayment, listOrderMilestones, payOrderMilestone, releaseOrderMilestone, type OrderMilestone } from "@/lib/services/backend";
import { isDemoCheckout } from "@/lib/services/checkout";
import { isConflict, isForbidden } from "@/lib/http";
import { humanizeSlug } from "@/lib/lawyers";
import { fmtUzs } from "@/lib/money";
import { IconCard, IconCheck } from "@/components/icons";
import { Btn } from "../../kit/kit";

// The payment stages (30/40/30): pay the next, release a paid one when the
// work is done.
export default function Milestones({ orderId, onError, onDone }: { orderId: string; onError: (m: string) => void; onDone: (m: string) => void }) {
  const t = useTranslations("portal.payment.milestones");
  const tp = useTranslations("portal.payment");
  const [rows, setRows] = useState<OrderMilestone[]>([]);
  const [key, setKey] = useState(0);
  const [readOnly, setReadOnly] = useState(false);
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState("");
  const [payUrl, setPayUrl] = useState("");
  useEffect(() => {
    let alive = true;
    listOrderMilestones(orderId)
      .then((r) => alive && setRows(r))
      .catch((e) => {
        if (!alive) return;
        setRows([]);
        if (isForbidden(e)) setReadOnly(true);
      });
    return () => {
      alive = false;
    };
  }, [orderId, key]);
  const fail = (e: unknown) => {
    if (isForbidden(e)) setReadOnly(true);
    if (isConflict(e)) setKey((k) => k + 1);
    onError(t(isForbidden(e) ? "forbidden" : isConflict(e) ? "conflict" : "error"));
  };
  async function pay(m: OrderMilestone) {
    setBusy(m.id);
    setPayUrl("");
    try {
      const r = await payOrderMilestone(orderId, m.id);
      if (isDemoCheckout() && r.paymentId) {
        await demoConfirmPayment(r.paymentId).catch(() => null);
        setKey((k) => k + 1);
        onDone(t("paidDemo"));
      } else if (!r.paymentId) setKey((k) => k + 1);
      else setPayUrl(r.paymentUrl || "");
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  }
  async function release(m: OrderMilestone) {
    setBusy(m.id);
    try {
      const next = await releaseOrderMilestone(orderId, m.id);
      setRows((list) => list.map((x) => (x.id === m.id ? { ...x, ...next, id: x.id } : x)));
      setConfirm("");
      onDone(t("releasedMsg"));
    } catch (e) {
      setConfirm("");
      fail(e);
    } finally {
      setBusy("");
    }
  }
  if (!rows.length) return null;
  const firstUnpaid = rows.findIndex((m) => m.status === "waiting_payment" || m.status === "payment_pending" || m.status === "pending");
  const label = (s: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : humanizeSlug(s));
  return (
    <section>
      <h3>{t("title")}</h3>
      <ol className="dxcr-miles">
        {rows.map((m, i) => {
          const done = m.status === "released";
          const payable = !readOnly && i === firstUnpaid;
          const releasable = !readOnly && (m.status === "paid" || m.status === "held");
          return (
            <li key={m.id} className={done ? "is-done" : payable ? "is-now" : ""}>
              <i>{done ? <IconCheck /> : m.index || i + 1}</i>
              <span>
                <b>{m.title || t("stage", { n: m.index || i + 1 })}</b>
                <small>{[m.percent ? `${m.percent}%` : "", `${fmtUzs(m.amount)} ${tp("som")}`, label(m.status)].filter(Boolean).join(" · ")}</small>
              </span>
              {payable ? (
                <Btn small kind="primary" busy={busy === m.id} disabled={!!busy} onClick={() => void pay(m)}>
                  {t("pay")}
                </Btn>
              ) : releasable ? (
                confirm === m.id ? (
                  <Btn small kind="primary" busy={busy === m.id} onClick={() => void release(m)}>
                    {t("releaseYes")}
                  </Btn>
                ) : (
                  <Btn small disabled={!!busy} onClick={() => setConfirm(m.id)}>
                    {t("release")}
                  </Btn>
                )
              ) : null}
            </li>
          );
        })}
      </ol>
      {confirm ? <small className="dx-field__h">{t("releaseConfirm")}</small> : null}
      {payUrl ? (
        <Btn kind="primary" icon={<IconCard />} onClick={() => (window.open(payUrl, "_blank", "noopener"), setPayUrl(""), setKey((k) => k + 1))}>
          {tp("proceed")}
        </Btn>
      ) : null}
    </section>
  );
}
