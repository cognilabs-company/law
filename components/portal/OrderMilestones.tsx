"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  listOrderMilestones,
  payOrderMilestone,
  releaseOrderMilestone,
  demoConfirmPayment,
  type OrderMilestone,
} from "@/lib/services/backend";
import { isDemoCheckout, type PaymentIntent } from "@/lib/services/checkout";
import { isConflict, isForbidden, isProviderUnavailable } from "@/lib/http";
import { humanizeSlug } from "@/lib/lawyers";
import { fmtUzs } from "@/lib/money";
import { Notice } from "@/components/admin/AdminBits";
import { IconCheck, IconCard } from "@/components/icons";

// The invoice a checkout just created: amount and status first, then the user
// goes to the provider page (same tab — a popup opened after an await is blocked).
// `untitled`: the caller already shows a title (e.g. a modal header).
export function CheckoutIntent({ intent, onCancel, untitled }: { intent: PaymentIntent; onCancel?: () => void; untitled?: boolean }) {
  const t = useTranslations("portal.payment");
  const st = (intent.status || "pending").toLowerCase();
  return (
    <div className="opay ckint">
      {untitled ? null : <b className="ckint__h"><IconCard />{t("intentTitle")}</b>}
      <div className="opay__rows">
        <div className="opay__row"><span>{t("intentAmount")}</span><b>{fmtUzs(intent.amount)} {t("som")}</b></div>
        <div className="opay__row"><span>{t("intentStatus")}</span><span>{t.has(`intentStates.${st}`) ? t(`intentStates.${st}`) : humanizeSlug(st)}</span></div>
      </div>
      {intent.paymentUrl ? (
        <button className="btn btn--grad btn--full" type="button" onClick={() => window.location.assign(intent.paymentUrl!)}>
          {t("proceed")}
        </button>
      ) : (
        <Notice ok={false} msg={t("noLink")} />
      )}
      {onCancel ? (
        <button className="rf__link rf__link--muted" type="button" onClick={onCancel}>{t("cancel")}</button>
      ) : null}
    </div>
  );
}

// T1A-01 payment stages of an order (30/40/30 by default): the client pays each
// milestone on the provider page and releases a paid one once the work is done.
// 403 hides the actions; 409 reloads the list; an empty list renders nothing.
export default function OrderMilestones({ orderId }: { orderId: string }) {
  const t = useTranslations("portal.payment.milestones");
  const tp = useTranslations("portal.payment");
  const tcommon = useTranslations("common");
  const [rows, setRows] = useState<OrderMilestone[]>([]);
  const [key, setKey] = useState(0);
  const [readOnly, setReadOnly] = useState(false);
  const [busy, setBusy] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

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

  const reload = () => setKey((k) => k + 1);

  function fail(e: unknown, fallback: string) {
    if (isForbidden(e)) {
      setReadOnly(true);
      setNote({ ok: false, msg: t("forbidden") });
    } else if (isConflict(e)) {
      reload();
      setNote({ ok: false, msg: t("conflict") });
    } else {
      setNote({ ok: false, msg: isProviderUnavailable(e) ? tcommon("paymentUnavailable") : fallback });
    }
  }

  async function pay(m: OrderMilestone) {
    if (busy) return;
    setBusy(m.id);
    setNote(null);
    setIntent(null);
    try {
      const r = await payOrderMilestone(orderId, m.id);
      if (isDemoCheckout() && r.paymentId) {
        // Staging: the demo provider settles instantly.
        await demoConfirmPayment(r.paymentId).catch(() => null);
        reload();
        setNote({ ok: true, msg: t("paidDemo") });
      } else if (!r.paymentId) {
        // Already paid or released on the server.
        reload();
      } else {
        setIntent({ id: r.paymentId, status: r.status, amount: m.amount, currency: m.currency, paymentUrl: r.paymentUrl });
      }
    } catch (e) {
      fail(e, t("error"));
    } finally {
      setBusy("");
    }
  }

  async function release(m: OrderMilestone) {
    if (busy) return;
    setBusy(m.id);
    setNote(null);
    try {
      const next = await releaseOrderMilestone(orderId, m.id);
      setRows((list) => list.map((x) => (x.id === m.id ? { ...x, ...next, id: x.id } : x)));
      setConfirmId("");
      setNote({ ok: true, msg: t("releasedMsg") });
    } catch (e) {
      setConfirmId("");
      fail(e, t("error"));
    } finally {
      setBusy("");
    }
  }

  if (!rows.length) return null;

  // per_milestone: the client pays each stage before it starts, in order.
  const firstUnpaid = rows.findIndex((m) => m.status === "waiting_payment" || m.status === "payment_pending" || m.status === "pending");
  const statusLabel = (s: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : humanizeSlug(s));

  return (
    <div className="omile">
      <b className="omile__h">{t("title")}</b>
      <ol className="omile__list">
        {rows.map((m, i) => {
          const done = m.status === "released";
          const payable = !readOnly && i === firstUnpaid;
          const releasable = !readOnly && (m.status === "paid" || m.status === "held");
          return (
            <li key={m.id} className={`omile__i omile__i--${m.status}`}>
              <span className="omile__n">{done ? <IconCheck /> : m.index || i + 1}</span>
              <span className="omile__m">
                <b>{m.title || t("stage", { n: m.index || i + 1 })}</b>
                <small>{[m.percent ? `${m.percent}%` : "", `${fmtUzs(m.amount)} ${tp("som")}`, statusLabel(m.status)].filter(Boolean).join(" · ")}</small>
              </span>
              {payable ? (
                <button className="btn btn--pri btn--sm" type="button" disabled={!!busy} onClick={() => pay(m)}>
                  {busy === m.id ? t("paying") : t("pay")}
                </button>
              ) : releasable ? (
                confirmId === m.id ? (
                  <span className="omile__confirm">
                    <button className="btn btn--pri btn--sm" type="button" disabled={!!busy} onClick={() => release(m)}>
                      {busy === m.id ? t("releasing") : t("releaseYes")}
                    </button>
                    <button className="btn btn--line btn--sm" type="button" disabled={!!busy} onClick={() => setConfirmId("")}>
                      {tp("cancel")}
                    </button>
                  </span>
                ) : (
                  <button className="btn btn--line btn--sm" type="button" disabled={!!busy} onClick={() => setConfirmId(m.id)}>
                    {t("release")}
                  </button>
                )
              ) : null}
            </li>
          );
        })}
      </ol>
      {confirmId ? <p className="omile__hint">{t("releaseConfirm")}</p> : null}
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
      {intent ? <CheckoutIntent intent={intent} onCancel={() => { setIntent(null); reload(); }} /> : null}
    </div>
  );
}
