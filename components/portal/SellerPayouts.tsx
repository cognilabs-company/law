"use client";

import { useTranslations } from "next-intl";
import { listMyPayouts } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Skeleton, EmptyState } from "./DataState";
import { IconCard, IconClock, IconCheck } from "@/components/icons";

const MIN_PAYOUT = 100000; // so'm (S-30)
const PAID = new Set(["paid", "released", "completed", "done"]);

// Next Thursday (S-30: weekly payout on Thursdays), as a date string.
function nextThursday(from = new Date()): string {
  const d = new Date(from);
  const diff = (4 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toLocaleDateString("ru-RU");
}

// T2-06: the seller's payout ledger — balance waiting for the weekly payout,
// what was paid, and each payout row from /payouts/me (payment_split records).
export default function SellerPayouts() {
  const t = useTranslations("portal.sellerDash.payouts");
  const res = useResource(listMyPayouts, []);
  const rows = res.data;
  const pending = rows.filter((p) => !PAID.has(p.status.toLowerCase())).reduce((s, p) => s + p.amount, 0);
  const paid = rows.filter((p) => PAID.has(p.status.toLowerCase())).reduce((s, p) => s + p.amount, 0);
  const label = (s: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : s);
  const fmt = (s: string) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("ru-RU"); };

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="advmuted">{t("nextPayout", { date: nextThursday() })}</span>
      </div>
      {res.status === "loading" ? (
        <Skeleton rows={2} />
      ) : (
        <>
          <div className="amet">
            <div className="amet__c"><span className="amet__i"><IconClock /></span><b>{fmtUzs(pending)} UZS</b><span className="amet__l">{t("pending")}</span></div>
            <div className="amet__c"><span className="amet__i"><IconCheck /></span><b>{fmtUzs(paid)} UZS</b><span className="amet__l">{t("paid")}</span></div>
            <div className="amet__c"><span className="amet__i"><IconCard /></span><b>{rows.length}</b><span className="amet__l">{t("count")}</span></div>
          </div>
          <p className="advmuted" style={{ marginTop: 10, fontSize: ".82rem" }}>
            {pending > 0 && pending < MIN_PAYOUT ? t("belowMin", { min: fmtUzs(MIN_PAYOUT) }) : t("rule", { min: fmtUzs(MIN_PAYOUT) })}
          </p>
          {!rows.length ? (
            <EmptyState icon={<IconCard />} title={t("empty")} text={t("emptyText")} />
          ) : (
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table className="ptable">
                <thead><tr><th>{t("date")}</th><th>{t("period")}</th><th>{t("amount")}</th><th>{t("statusCol")}</th></tr></thead>
                <tbody>
                  {rows.slice(0, 12).map((p) => (
                    <tr key={p.id}>
                      <td>{fmt(p.createdAt)}</td>
                      <td>{p.period || "—"}</td>
                      <td><b>{fmtUzs(p.amount)} {p.currency}</b></td>
                      <td><span className={`creq__badge${PAID.has(p.status.toLowerCase()) ? " creq__badge--ok" : ""}`}>{label(p.status.toLowerCase())}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
