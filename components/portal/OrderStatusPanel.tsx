"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { getOrderStatusHistory, updateOrderStatus, type OrderStatusEntry } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { nextStatusesFor, useOrderStatusLabel, type OrderSide } from "@/lib/orderStatus";
import { ApiError } from "@/lib/http";
import { Skeleton } from "@/components/portal/DataState";
import { Notice } from "@/components/admin/AdminBits";
import { IconCheck, IconClock } from "@/components/icons";

function fmt(s: string) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// T1-10: order_status_history as a timeline plus the next steps this side may
// take (PATCH /orders/{id}/status with a note). The backend refuses illegal
// transitions with 409 — the allowed list is mirrored in lib/orderStatus.ts.
export default function OrderStatusPanel({ orderId, side, status, onChanged }: { orderId: string; side: OrderSide; status?: string; onChanged?: (status: string) => void }) {
  const t = useTranslations("portal.orderFlow");
  const label = useOrderStatusLabel();
  const [key, setKey] = useState(0);
  const hist = useResource(() => getOrderStatusHistory(orderId), [orderId, key]);
  // Newest first from the backend; the top entry is the current status when the caller has none.
  const rows: OrderStatusEntry[] = [...hist.data].sort((a, b) => (a.at < b.at ? 1 : -1));
  const current = (status || rows[0]?.status || "").toLowerCase();
  const next = nextStatusesFor(side, current);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function move(to: string) {
    if (busy) return;
    setBusy(to);
    setMsg(null);
    try {
      await updateOrderStatus(orderId, to, note.trim() || undefined);
      setNote("");
      setMsg({ ok: true, text: t("moved", { status: label(to) }) });
      setKey((k) => k + 1);
      onChanged?.(to);
    } catch (e) {
      const conflict = e instanceof ApiError && e.status === 409;
      setMsg({ ok: false, text: conflict ? t("conflict") : e instanceof ApiError && e.status === 403 ? t("forbidden") : t("error") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="ohist">
      <div className="ohist__h">
        <b>{t("title")}</b>
        {current ? <span className="creq__badge">{label(current)}</span> : null}
      </div>
      {hist.status === "loading" ? (
        <Skeleton rows={2} />
      ) : hist.status === "error" ? (
        <Notice ok={false} msg={t("loadError")} />
      ) : !rows.length ? (
        <p className="advmuted">{t("empty")}</p>
      ) : (
        <ol className="ohist__list">
          {rows.map((r, i) => (
            <li key={`${r.at}-${i}`} className={i === 0 ? "on" : ""}>
              <i>{i === 0 ? <IconClock /> : <IconCheck />}</i>
              <div>
                <b>{label(r.status)}</b>
                <span>{fmt(r.at)}{r.note ? ` · ${r.note}` : ""}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
      {next.length ? (
        <div className="ohist__next">
          <label>{t("nextStep")}</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePh")} maxLength={300} />
          <div className="ohist__btns">
            {next.map((s) => (
              <button key={s} type="button" className={`btn btn--sm ${s === "cancelled" || s === "declined" ? "btn--line" : "btn--pri"}`} disabled={!!busy} onClick={() => move(s)}>
                {busy === s ? t("moving") : t.has(`actions.${s}`) ? t(`actions.${s}`) : label(s)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {msg ? <Notice ok={msg.ok} msg={msg.text} /> : null}
    </div>
  );
}
