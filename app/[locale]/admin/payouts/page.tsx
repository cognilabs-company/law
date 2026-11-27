"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { listAdminPayouts, updatePayout, getReconciliation } from "@/lib/services/backend";
import { useResource, useResourceOne } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { useReload } from "@/components/admin/AdminBits";
import { Skeleton, EmptyState, ErrorState } from "@/components/portal/DataState";
import { ApiError, isForbidden } from "@/lib/http";
import { notify } from "@/lib/toast";
import { IconCard } from "@/components/icons";
import { aiId } from "@/lib/ai/ids";

const som = (n: number) => fmtUzs(n);
const transient = (e: unknown) => !(e instanceof ApiError) || e.status === 0 || (e.status >= 500 && e.status !== 501);
const REC0 = { paymentsCount: 0, paidCount: 0, gross: 0, platformFee: 0, providerFee: 0, sellerShare: 0, payoutStatuses: {}, byProvider: [] };

export default function AdminPayouts() {
  const t = useTranslations("admin.payouts");
  const tn = useTranslations("common.notify");
  const [key, reload] = useReload();
  const rec = useResourceOne(getReconciliation, [key]);
  const list = useResource(() => listAdminPayouts(), [key]);
  const [busy, setBusy] = useState<string | null>(null);
  // The page needs payments.manage (AdminShell). A 403 on "mark paid" all
  // the same: the button leaves every row instead of failing again.
  const [denied, setDenied] = useState(false);
  const r = rec.data ?? REC0;

  async function mark(id: string, status: string, label: string) {
    setBusy(id);
    try {
      await updatePayout(id, status);
      notify.success(t("markedPaid"), { id: `payout-${id}`, body: label });
      reload();
    } catch (e) {
      if (isForbidden(e)) setDenied(true);
      notify.error(t("markFailed"), {
        id: `payout-${id}`,
        error: e,
        action: transient(e) ? { label: tn("retry"), onClick: () => void mark(id, status, label) } : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {/* Owner's PDF 2026-11-27 (S9): the reconciliation as KPI tiles, the
          payouts as the main column, statuses and providers on the right. */}
      {rec.status === "error" ? (
        <div className="ppanel"><ErrorState compact onRetry={reload} /></div>
      ) : (
        <div className="adm-kpis" data-ai-target="payouts:reconciliation" data-ai-id="admin.payouts.reconciliation" data-ai-type="section" data-ai-label={t("title")}>
          <div className="adm-kpi adm-kpi--pri"><span>{t("gross")}</span><b className="sx-num">{rec.status === "loading" ? "…" : som(r.gross)}</b></div>
          <div className="adm-kpi"><span>{t("platformFee")} · 18%</span><b className="sx-num">{rec.status === "loading" ? "…" : som(r.platformFee)}</b></div>
          <div className="adm-kpi"><span>{t("sellerShare")}</span><b className="sx-num">{rec.status === "loading" ? "…" : som(r.sellerShare)}</b></div>
          <div className="adm-kpi"><span>{t("paidCount")}</span><b className="sx-num">{rec.status === "loading" ? "…" : `${r.paidCount}/${r.paymentsCount}`}</b></div>
        </div>
      )}
      <div className="adm-split">
        <div className="ppanel adm-split__main">
        <div className="ppanel__h"><b>{t("listTitle")}</b><span className="advmuted">{list.data.length}</span></div>
        {list.status === "loading" ? (
          <Skeleton rows={3} />
        ) : list.status === "error" ? (
          <ErrorState error={list.error} onRetry={list.refresh} />
        ) : !list.data.length ? (
          <EmptyState icon={<IconCard />} title={t("empty")} text={t("emptyText")} />
        ) : (
          <div className="alist" data-ai-target="payouts:list" data-ai-id="admin.payouts.list" data-ai-type="list" data-ai-label={t("listTitle")}>
            {list.data.map((p) => (
              <div
                className="aitem"
                key={p.id}
                data-ai-id={p.id ? aiId("admin.payouts.item", p.id) : undefined}
                data-ai-type="list_item"
                data-ai-entity-type="payout"
                data-ai-entity-id={p.id || undefined}
              >
                <span className="aitem__n"><IconCard /></span>
                <div className="aitem__m">
                  <b>{som(p.sellerShare)} {p.currency}</b>
                  <span className="aitem__meta">{t("gross")}: {som(p.gross)} · {t("fees")}: {som(p.platformFee + p.providerFee)}</span>
                </div>
                <div className="aitem__r" style={{ display: "flex", gap: 8, alignItems: "center" }} data-ai-target="payouts:item-actions">
                  <span className={`creq__badge payout__st payout__st--${p.status}`}>{t.has(`status.${p.status}`) ? t(`status.${p.status}`) : t.has("statusOther") ? t("statusOther") : "—"}</span>
                  {p.status !== "paid" && !denied ? (
                    <button className="btn btn--pri btn--sm" type="button" disabled={busy === p.id} onClick={() => mark(p.id, "paid", `${som(p.sellerShare)} ${p.currency}`)} data-ai-target="button:mark-paid" data-ai-id={p.id ? aiId("admin.payouts.item", p.id, "mark-paid") : undefined}>{t("markPaid")}</button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
        <aside className="ppanel adm-split__side">
          <div className="ppanel__h"><b>{t("title")}</b></div>
          <ul className="adm-bars">
            {Object.entries(r.payoutStatuses ?? {}).map(([k, n]) => (
              <li key={k}>
                <span>{t.has(`status.${k}`) ? t(`status.${k}`) : t.has("statusOther") ? t("statusOther") : k}</span>
                <b className="sx-num">{n}</b>
                <i aria-hidden="true"><em style={{ width: `${Math.round((Number(n) / Math.max(1, ...Object.values(r.payoutStatuses ?? {}).map(Number))) * 100)}%` }} /></i>
              </li>
            ))}
          </ul>
          <p className="advmuted">{t("providerFee")} · 1% — {som(r.providerFee)}</p>
          {r.byProvider?.length ? (
            <ul className="adm-plain">
              {r.byProvider.map((x) => (
                <li key={x.provider}><span>{x.provider}</span><b className="sx-num">{som(x.amount)}</b><small>{x.count}</small></li>
              ))}
            </ul>
          ) : null}
        </aside>
      </div>
    </>
  );
}
