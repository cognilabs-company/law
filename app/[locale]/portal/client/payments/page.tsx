"use client";

import { useTranslations } from "next-intl";
import { listPayments } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
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
  const res = useResource(listPayments, []);

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
              <span>{t("id")}</span>
            </div>
            {res.data.map((p) => (
              <div className="ptable__row" key={p.id}>
                <span data-l={t("what")}>
                  <b>{p.description || p.kind || "—"}</b>
                </span>
                <span data-l={t("date")}>{fmtDate(p.createdAt)}</span>
                <span data-l={t("amount")}>{som(p.amount, p.currency)}</span>
                <span data-l={t("id")} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`creq__badge${p.status === "paid" ? " creq__badge--ok" : ""}`}>{p.status || "—"}</span>
                  {p.receiptUrl ? (
                    <a
                      className="btn btn--line btn--sm"
                      href={p.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("receipt")}
                    >
                      <IconDownload style={{ width: 14, height: 14 }} />
                    </a>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
