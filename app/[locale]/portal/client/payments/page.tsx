"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { getPaymentReceipt, listPayments } from "@/lib/services/backend";
import { saveBlob } from "@/lib/download";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { humanizeSlug } from "@/lib/lawyers";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { IconCard, IconDownload } from "@/components/icons";

const som = (n: number, cur: string) =>
  n ? `${fmtUzs(n)} ${cur}` : "—";
const fmtDate = (s: string) => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("ru-RU");
};

export default function ClientPayments() {
  const t = useTranslations("portal.client.payments");
  // The backend falls back to the raw target type ("document_request", "gift") as the description.
  const whatOf = (desc: string, kind: string) => {
    // A real title ("Private chat", a plan period) is shown as is; a bare key gets a label.
    const key = !desc || /^[a-z]+(_[a-z]+)*$/.test(desc) ? desc || kind : "";
    if (!key) return desc;
    return t.has(`kinds.${key}`) ? t(`kinds.${key}`) : humanizeSlug(key) || "—";
  };
  const res = useResource(listPayments, []);
  const [busyId, setBusyId] = useState("");
  const [failedId, setFailedId] = useState("");

  // GET /payments/{id}/receipt is an authed PDF: fetch it with the token.
  async function downloadReceipt(id: string) {
    if (busyId) return;
    setBusyId(id);
    setFailedId("");
    try {
      saveBlob(await getPaymentReceipt(id), `lexgo-receipt-${id}.pdf`);
    } catch {
      setFailedId(id);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="advmuted">{t("history")}</span>
      </div>

      {res.status === "loading" ? (
        <Skeleton rows={4} />
      ) : !res.data.length ? (
        <EmptyState icon={<IconCard />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="ptable__wrap">
          <div className="ptable">
            <div className="ptable__head">
              <span>{t("what")}</span>
              <span>{t("date")}</span>
              <span>{t("amount")}</span>
              <span>{t("statusCol")}</span>
            </div>
            {res.data.map((p) => (
              <div className="ptable__row" key={p.id}>
                <span data-l={t("what")}>
                  <b>{whatOf(p.description, p.kind)}</b>
                </span>
                <span data-l={t("date")}>{fmtDate(p.createdAt)}</span>
                <span data-l={t("amount")}>{som(p.amount, p.currency)}</span>
                <span data-l={t("statusCol")} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`creq__badge${p.status === "paid" ? " creq__badge--ok" : ""}`}>{p.status ? (t.has(`statuses.${p.status}`) ? t(`statuses.${p.status}`) : humanizeSlug(p.status)) : "—"}</span>
                  {p.receiptUrl ? (
                    <button
                      type="button"
                      className="btn btn--line btn--sm"
                      onClick={() => downloadReceipt(p.id)}
                      disabled={busyId === p.id}
                      aria-label={t("receipt")}
                      title={failedId === p.id ? t("receiptError") : t("receipt")}
                    >
                      <IconDownload style={{ width: 14, height: 14 }} />
                    </button>
                  ) : null}
                  {failedId === p.id ? <span className="rf__err" style={{ fontSize: ".75rem" }}>{t("receiptError")}</span> : null}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
