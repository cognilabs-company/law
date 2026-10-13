"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getPaymentReceipt, listPayments } from "@/lib/services/backend";
import { saveBlob } from "@/lib/download";
import { useResource } from "@/lib/useResource";
import { aiId } from "@/lib/ai/ids";
import { useAiField, useAiSelection } from "@/lib/ai/registry";
import { fmtUzs } from "@/lib/money";
import { humanizeSlug } from "@/lib/lawyers";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import FilterBar, { type FilterField } from "@/components/filters/FilterBar";
import { IconCalendar, IconCard, IconClipboardCheck, IconDownload, IconSearch } from "@/components/icons";
import DatePicker from "@/components/DatePicker";
import { dateOnly } from "@/lib/date";

const som = (n: number, cur: string, uzs: string) =>
  n ? `${fmtUzs(n)} ${/^uzs$/i.test(cur) ? uzs : cur}` : "—";
const fmtDate = (s: string, locale: string) => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : dateOnly(s, locale);
};

const SLUG = /^[a-z0-9]+(_[a-z0-9]+)*$/;
const STATUS_ORDER = ["pending", "payment_pending", "held", "paid", "partially_refunded", "refunded", "failed", "cancelled", "expired"];
const statusRank = (s: string) => (STATUS_ORDER.includes(s) ? STATUS_ORDER.indexOf(s) : STATUS_ORDER.length);
const slugOf = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, "_");
const aiNorm = (v: string) => v.toLowerCase().replace(/[ʻʼ'‘’`]/g, "").replace(/\s*\(.*\)$/, "").replace(/\s+/g, " ").trim();

function aiPick(opts: { value: string; label: string }[], raw: string): string | null {
  const w = aiNorm(raw);
  if (!w) return "";
  const hit =
    opts.find((o) => o.value && aiNorm(o.value) === w) ??
    opts.find((o) => o.value && aiNorm(o.label) === w) ??
    opts.find((o) => o.value && w.length > 2 && aiNorm(o.label).includes(w));
  return hit ? hit.value : null;
}

function aiDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return "";
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  const dmy = iso ? null : /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s);
  const parts = iso ? [iso[1], iso[2], iso[3]] : dmy ? [dmy[3], dmy[2], dmy[1]] : null;
  if (!parts) return null;
  const [y, m, d] = parts;
  if (Number(m) < 1 || Number(m) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export default function ClientPayments() {
  const t = useTranslations("portal.client.payments");
  const tc = useTranslations("portal.common");
  const tf = useTranslations("filterBar");
  const te = useTranslations("enums");
  const locale = useLocale();
  // The backend falls back to the raw target type ("document_request", "gift") as the description.
  const whatOf = (desc: string, kind: string) => {
    const d = slugOf(desc);
    const k = slugOf(kind);
    const kindLabel = SLUG.test(k) && t.has(`kinds.${k}`) ? t(`kinds.${k}`) : "";
    if (SLUG.test(d) && t.has(`periods.${d}`)) return `${kindLabel || t("kinds.subscription_plan")} · ${t(`periods.${d}`)}`;
    if (SLUG.test(d) && t.has(`kinds.${d}`)) return t(`kinds.${d}`);
    if (desc.trim() && !SLUG.test(desc.trim())) return desc;
    return kindLabel || humanizeSlug(d || k) || "—";
  };
  const stLabel = (s: string) => (!s ? "—" : SLUG.test(s) && t.has(`statuses.${s}`) ? t(`statuses.${s}`) : humanizeSlug(s));
  const res = useResource(listPayments, []);
  const [busyId, setBusyId] = useState("");
  // T1-13 §6: search by description/status and filter by date range.
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pick, setPick] = useState("");
  const needle = q.trim().toLowerCase();
  const base = res.data.filter((p) => {
    const day = (p.createdAt || "").slice(0, 10);
    if (from && day && day < from) return false;
    if (to && day && day > to) return false;
    return !needle || `${whatOf(p.description, p.kind)} ${stLabel(p.status)} ${p.description} ${p.kind} ${p.status} ${p.amount} ${p.workId}`.toLowerCase().includes(needle);
  });
  const rows = pick ? base.filter((p) => p.status === pick) : base;
  const statuses = [...new Set(res.data.map((p) => p.status).filter(Boolean))].sort((a, b) => statusRank(a) - statusRank(b));
  const statusShown = statuses.length > 1;
  const statusOpts = [
    { value: "", label: `${tc("filterAllStatuses")} (${base.length})` },
    ...statuses.map((s) => ({ value: s, label: `${stLabel(s)} (${base.filter((p) => p.status === s).length})` })),
  ];
  const filterFields: FilterField[] = [
    {
      key: "status",
      label: tc("filterStatus"),
      icon: IconClipboardCheck,
      value: pick,
      onChange: setPick,
      options: statusOpts,
      hidden: !statusShown,
      aiId: "payments.filters.status",
    },
    {
      key: "from",
      label: t("from"),
      icon: IconCalendar,
      node: <DatePicker value={from} onChange={setFrom} max={to || undefined} placeholder={t("datePh")} ariaLabel={t("from")} />,
      active: Boolean(from),
      clear: () => setFrom(""),
      chip: `${t("from")}: ${fmtDate(from, locale)}`,
      aiId: "payments.filters.from",
    },
    {
      key: "to",
      label: t("to"),
      icon: IconCalendar,
      node: <DatePicker value={to} onChange={setTo} min={from || undefined} placeholder={t("datePh")} ariaLabel={t("to")} />,
      active: Boolean(to),
      clear: () => setTo(""),
      chip: `${t("to")}: ${fmtDate(to, locale)}`,
      aiId: "payments.filters.to",
    },
  ];
  useAiField("payments.search.input", { get: () => q, set: setQ });
  useAiField(statusShown ? "payments.filters.status" : "", {
    get: () => pick,
    set: (v) => {
      const next = aiPick(statusOpts, v);
      if (next !== null) setPick(next);
    },
  });
  useAiField("payments.filters.from", {
    get: () => from,
    set: (v) => {
      const next = aiDate(v);
      if (next !== null) setFrom(next);
    },
  });
  useAiField("payments.filters.to", {
    get: () => to,
    set: (v) => {
      const next = aiDate(v);
      if (next !== null) setTo(next);
    },
  });
  useAiSelection("payments_status", pick);
  useAiSelection("payments_date_from", from);
  useAiSelection("payments_date_to", to);
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
    <div
      className="ppanel"
      data-ai-target={res.status !== "loading" && rows.length ? undefined : "payments:history"}
      data-ai-id="payments.history"
      data-ai-type="section"
      data-ai-label={t("title")}
    >
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="advmuted">{t("history")}</span>
      </div>

      <FilterBar
        className="ppfilters"
        fields={filterFields}
        search={{ value: q, onChange: setQ, placeholder: t("searchPh"), aiId: "payments.search.input" }}
        count={res.status === "loading" ? undefined : rows.length}
        aiId="payments.filters"
        aiTarget="payments:filters"
        aiLabel={tf("title")}
      />
      {res.status === "loading" ? (
        <Skeleton rows={4} />
      ) : !res.data.length ? (
        <EmptyState icon={<IconCard />} title={t("empty")} text={t("emptyText")} />
      ) : !rows.length ? (
        <EmptyState icon={<IconSearch />} title={t("noResults")} text={t("noResultsText")} />
      ) : (
        <div className="ptable__wrap" data-ai-target="payments:history" data-ai-id="payments.history.table" data-ai-type="table">
          <div className="ptable">
            <div className="ptable__head">
              <span>{t("what")}</span>
              <span>{t("date")}</span>
              <span>{t("amount")}</span>
              <span>{t("statusCol")}</span>
            </div>
            {rows.map((p) => (
              <div
                className="ptable__row"
                key={p.id}
                data-ai-id={aiId("payments.item", p.id)}
                data-ai-type="list_item"
                data-ai-entity-type="payment"
                data-ai-entity-id={p.id}
              >
                <span data-l={t("what")}>
                  <b>{whatOf(p.description, p.kind)}</b>
                  {/* LEXGO_PUBLIC_WORK_IDS_FRONTEND.md: PAY-K1OWV, the id a
                      client can quote at support. The UUID this row is keyed
                      on is never printed. */}
                  {p.workId ? <small className="wid">{p.workId}</small> : null}
                </span>
                <span data-l={t("date")}>{fmtDate(p.createdAt, locale)}</span>
                <span data-l={t("amount")}>{som(p.amount, p.currency, te("currency"))}</span>
                <span data-l={t("statusCol")} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`creq__badge${p.status === "paid" ? " creq__badge--ok" : ""}`}>{stLabel(p.status)}</span>
                  {p.receiptUrl ? (
                    <button
                      type="button"
                      className="btn btn--line btn--sm"
                      onClick={() => downloadReceipt(p.id)}
                      disabled={busyId === p.id}
                      aria-label={t("receipt")}
                      title={failedId === p.id ? t("receiptError") : t("receipt")}
                      data-ai-id={aiId("payments.item", p.id, "receipt")}
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
