"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { listAdminPayouts, updatePayout, getReconciliation } from "@/lib/services/backend";
import { useResource, useResourceOne } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { useReload, Notice } from "@/components/admin/AdminBits";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { errDetail } from "@/lib/http";
import { IconCard, IconCheck } from "@/components/icons";
import { aiId } from "@/lib/ai/ids";

const som = (n: number) => fmtUzs(n);
const REC0 = { paymentsCount: 0, paidCount: 0, gross: 0, platformFee: 0, providerFee: 0, sellerShare: 0, payoutStatuses: {}, byProvider: [] };

export default function AdminPayouts() {
  const t = useTranslations("admin.payouts");
  const [key, reload] = useReload();
  const rec = useResourceOne(getReconciliation, [key]);
  const list = useResource(() => listAdminPayouts(), [key]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const r = rec.data ?? REC0;

  async function mark(id: string, status: string) {
    setBusy(id);
    setErr(null);
    try {
      await updatePayout(id, status);
      reload();
    } catch (e) {
      setErr(errDetail(e) || t("error"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="ppanel">
        <div className="ppanel__h"><b>{t("title")}</b></div>
        {rec.status === "loading" ? (
          <Skeleton rows={2} />
        ) : (
          <div className="castat" data-ai-target="payouts:reconciliation" data-ai-id="admin.payouts.reconciliation" data-ai-type="section" data-ai-label={t("title")}>
            <div className="castat__c"><span className="castat__i"><IconCard /></span><b>{som(r.gross)}</b><span>{t("gross")}</span></div>
            <div className="castat__c"><span className="castat__i"><IconCard /></span><b>{som(r.platformFee)}</b><span>{t("platformFee")} · 18%</span></div>
            <div className="castat__c"><span className="castat__i"><IconCard /></span><b>{som(r.providerFee)}</b><span>{t("providerFee")} · 1%</span></div>
            <div className="castat__c"><span className="castat__i castat__i--ok"><IconCheck /></span><b>{som(r.sellerShare)}</b><span>{t("sellerShare")}</span></div>
            <div className="castat__c"><span className="castat__i"><IconCard /></span><b>{r.paidCount}/{r.paymentsCount}</b><span>{t("paidCount")}</span></div>
          </div>
        )}
      </div>

      <div className="ppanel">
        <div className="ppanel__h"><b>{t("listTitle")}</b><span className="advmuted">{list.data.length}</span></div>
        {err ? <Notice ok={false} msg={err} /> : null}
        {list.status === "loading" ? (
          <Skeleton rows={3} />
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
                  <span className={`creq__badge payout__st payout__st--${p.status}`}>{t.has(`status.${p.status}`) ? t(`status.${p.status}`) : p.status}</span>
                  {p.status !== "paid" ? (
                    <button className="btn btn--pri btn--sm" type="button" disabled={busy === p.id} onClick={() => mark(p.id, "paid")} data-ai-target="button:mark-paid" data-ai-id={p.id ? aiId("admin.payouts.item", p.id, "mark-paid") : undefined}>{t("markPaid")}</button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
