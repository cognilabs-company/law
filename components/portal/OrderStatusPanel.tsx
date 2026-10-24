"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getOrderStatusHistory, updateOrderStatus, type OrderStatusEntry } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { nextStatusesFor, useOrderStatusLabel, type OrderSide } from "@/lib/orderStatus";
import { Skeleton, ErrorState } from "@/components/portal/DataState";
import { notify } from "@/lib/toast";
import { IconCheck, IconClock } from "@/components/icons";
import { dateTimeFull } from "@/lib/date";
import { useSameTickGuard } from "@/lib/useSameTickGuard";

function fmt(s: string, locale: string) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : dateTimeFull(s, locale);
}

// T1-10: order_status_history as a timeline plus the next steps this side may
// take (PATCH /orders/{id}/status with a note). The backend refuses illegal
// transitions with 409 — the allowed list is mirrored in lib/orderStatus.ts.
export default function OrderStatusPanel({ orderId, side, status, onChanged }: { orderId: string; side: OrderSide; status?: string; onChanged?: (status: string) => void }) {
  const t = useTranslations("portal.orderFlow");
  const locale = useLocale();
  const label = useOrderStatusLabel();
  const [key, setKey] = useState(0);
  const hist = useResource(() => getOrderStatusHistory(orderId), [orderId, key]);
  // Newest first from the backend; the top entry is the current status when the caller has none.
  const rows: OrderStatusEntry[] = [...hist.data].sort((a, b) => (a.at < b.at ? 1 : -1));
  const current = (status || rows[0]?.status || "").toLowerCase();
  const next = nextStatusesFor(side, current);
  const [busy, setBusy] = useState<string | null>(null);
  const once = useSameTickGuard();
  const [note, setNote] = useState("");

  async function move(to: string) {
    if (busy || !once()) return;
    setBusy(to);
    const nid = `order-status-${orderId}`;
    try {
      await updateOrderStatus(orderId, to, note.trim() || undefined);
      setNote("");
      notify.success(t("moved", { status: label(to) }), { id: nid });
      setKey((k) => k + 1);
      onChanged?.(to);
    } catch (e) {
      notify.error(t("error"), { id: nid, error: e, map: { 409: t("conflict"), 403: t("forbidden") } });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="ohist" data-ai-target="order:status">
      <div className="ohist__h">
        <b>{t("title")}</b>
        {current ? <span className="creq__badge">{label(current)}</span> : null}
      </div>
      {hist.status === "loading" ? (
        <Skeleton rows={2} />
      ) : hist.status === "error" ? (
        <ErrorState compact title={t("loadError")} error={hist.error} onRetry={hist.refresh} />
      ) : !rows.length ? (
        <p className="advmuted">{t("empty")}</p>
      ) : (
        <ol className="ohist__list">
          {rows.map((r, i) => (
            <li key={`${r.at}-${i}`} className={i === 0 ? "on" : ""}>
              <i>{i === 0 ? <IconClock /> : <IconCheck />}</i>
              <div>
                <b>{label(r.status)}</b>
                <span>{fmt(r.at, locale)}{r.note ? ` · ${r.note}` : ""}</span>
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
    </div>
  );
}
