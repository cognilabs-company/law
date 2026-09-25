"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getPaymentReceipt, listPayments } from "@/lib/services/backend";
import { saveBlob } from "@/lib/download";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { humanizeSlug } from "@/lib/lawyers";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { IconCard, IconDownload, IconSearch } from "@/components/icons";
import DatePicker from "@/components/DatePicker";
import { dateOnly } from "@/lib/date";

const som = (n: number, cur: string, uzs: string) =>
  n ? `${fmtUzs(n)} ${/^uzs$/i.test(cur) ? uzs : cur}` : "—";
const fmtDate = (s: string, locale: string) => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : dateOnly(s, locale);
};

export default function ClientPayments() {
  const t = useTranslations("portal.client.payments");
  const te = useTranslations("enums");
  const locale = useLocale();
  // The backend falls back to the raw target type ("document_request", "gift") as the description.
  const whatOf = (desc: string, kind: string) => {
    // A real title ("Private chat", a plan period) is shown as is; a bare key gets a label.
    const key = !desc || /^[a-z]+(_[a-z]+)*$/.test(desc) ? desc || kind : "";
    if (!key) return desc;
    return t.has(`kinds.${key}`) ? t(`kinds.${key}`) : humanizeSlug(key) || "—";
  };
  const res = useResource(listPayments, []);
  const [busyId, setBusyId] = useState("");
  // T1-13 §6: search by description/status and filter by date range.
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rows = res.data.filter((p) => {
    const day = (p.createdAt || "").slice(0, 10);
    if (from && day && day < from) return false;
    if (to && day && day > to) return false;
    const needle = q.trim().toLowerCase();
    return !needle || `${p.description} ${p.kind} ${p.status} ${p.amount}`.toLowerCase().includes(needle);
  });
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

      <div className="lfilters">
        <div className="lsearch"><IconSearch /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPh")} aria-label={t("searchPh")} /></div>
        <DatePicker value={from} onChange={setFrom} max={to || undefined} placeholder={t("from")} ariaLabel={t("from")} />
        <DatePicker value={to} onChange={setTo} min={from || undefined} placeholder={t("to")} ariaLabel={t("to")} />
      </div>
      {res.status === "loading" ? (
        <Skeleton rows={4} />
      ) : !res.data.length ? (
        <EmptyState icon={<IconCard />} title={t("empty")} text={t("emptyText")} />
      ) : !rows.length ? (
        <EmptyState icon={<IconSearch />} title={t("noResults")} text={t("noResultsText")} />
      ) : (
        <div className="ptable__wrap">
          <div className="ptable">
            <div className="ptable__head">
              <span>{t("what")}</span>
              <span>{t("date")}</span>
              <span>{t("amount")}</span>
              <span>{t("statusCol")}</span>
            </div>
            {rows.map((p) => (
              <div className="ptable__row" key={p.id}>
                <span data-l={t("what")}>
                  <b>{whatOf(p.description, p.kind)}</b>
                </span>
                <span data-l={t("date")}>{fmtDate(p.createdAt, locale)}</span>
                <span data-l={t("amount")}>{som(p.amount, p.currency, te("currency"))}</span>
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
