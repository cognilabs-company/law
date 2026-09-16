"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getCcClientCard, type CcClient, type CcClientCard as Card } from "@/lib/services/backend";
import { isForbidden } from "@/lib/http";
import { useResourceOne } from "@/lib/useResource";
import { shortDateTime } from "@/lib/date";
import { fmtUzs } from "@/lib/money";
import { leadCategoryLabel, leadSourceLabel } from "@/lib/leadLabels";
import { useOrderStatusLabel } from "@/lib/orderStatus";
import { Skeleton } from "@/components/portal/DataState";
import CcCallForm from "./CcCallForm";
import { IconPhone, IconPlus } from "@/components/icons";

// T4-02 client 360 (GET /call-center/clients/{id}) for the call-center and
// sales consoles: who the client is, what they ordered and paid, their leads
// and last actions — plus a one-click call log. Without the 360 permission
// (403) the card still shows what the search result knows.
export default function CcClientCard({ client, canLog, onLogged }: { client: CcClient; canLog: boolean; onLogged: () => void }) {
  const t = useTranslations("admin.callCenter.card");
  const tc = useTranslations("admin.callCenter");
  const tp = useTranslations("admin.pipeline");
  const tpay = useTranslations("portal.client.payments");
  const tsom = useTranslations("portal.payment");
  const locale = useLocale();
  const orderStatus = useOrderStatusLabel();
  const [forbidden, setForbidden] = useState(false);
  const res = useResourceOne<Card | null>(
    () => getCcClientCard(client.id).catch((e) => { if (isForbidden(e)) { setForbidden(true); return null; } throw e; }),
    [client.id],
  );
  const [tab, setTab] = useState<"orders" | "payments" | "leads" | "activity">("orders");
  const [logOpen, setLogOpen] = useState(false);
  const [logged, setLogged] = useState(false);
  const d = res.data;
  const when = (v: string) => shortDateTime(v, locale);
  const tel = client.phone.replace(/[^+\d]/g, "");

  return (
    <div className="ccc">
      <div className="ccc__head">
        <div className="ccc__id">
          <b>{client.name || client.phone}</b>
          <span>{[client.lexgoId, client.phone, client.status ? (tc.has(`status.${client.status}`) ? tc(`status.${client.status}`) : client.status) : ""].filter(Boolean).join(" · ")}</span>
          {d?.client.createdAt ? <span>{t("since", { date: when(d.client.createdAt) })}</span> : null}
        </div>
        <div className="ccc__acts">
          {tel ? <a className="btn btn--soft btn--sm" href={`tel:${tel}`}><IconPhone />{t("call")}</a> : null}
          {canLog ? (
            <button type="button" className="btn btn--pri btn--sm" onClick={() => setLogOpen((v) => !v)} aria-expanded={logOpen}>
              <IconPlus />{tc("logCall")}
            </button>
          ) : null}
        </div>
      </div>

      {logOpen ? (
        <div className="ccc__form">
          <CcCallForm phone={client.phone} clientUserId={client.id} onCancel={() => setLogOpen(false)} onDone={() => { setLogOpen(false); setLogged(true); onLogged(); }} />
        </div>
      ) : null}
      {logged && !logOpen ? <p className="anote anote--ok">{t("logged")}</p> : null}

      {res.status === "loading" ? (
        <Skeleton rows={3} />
      ) : forbidden ? (
        <p className="advmuted">{t("noAccess")}</p>
      ) : !d ? (
        <p className="advmuted">{t("loadError")}</p>
      ) : (
        <>
          <div className="ccc__sum">
            {[
              [t("sumOrders"), String(d.summary.orders)],
              [t("sumSpent"), `${fmtUzs(d.summary.totalSpent)} ${tsom("som")}`],
              [t("sumLeads"), String(d.summary.leads)],
              [t("sumChats"), String(d.summary.rooms)],
              [t("sumComplaints"), String(d.summary.complaints)],
              [t("sumSubs"), String(d.subscriptions.filter((s) => s.status === "active").length)],
            ].map(([k, v]) => (
              <div className="ccc__tile" key={k}><b>{v}</b><span>{k}</span></div>
            ))}
          </div>

          <div className="chiprow" style={{ marginInline: 0, paddingInline: 0 }}>
            {(["orders", "payments", "leads", "activity"] as const).map((k) => (
              <button key={k} type="button" className="fchip" aria-pressed={tab === k} onClick={() => setTab(k)}>{t(`tabs.${k}`)}</button>
            ))}
          </div>

          {tab === "orders" ? (
            d.orders.length ? d.orders.map((o) => (
              <div className="creq" key={o.id}>
                <span className="creq__st" />
                <div className="creq__m"><b>{o.serviceName || o.title || "—"}</b><span>{[o.lawyerName, when(o.createdAt)].filter(Boolean).join(" · ")}</span></div>
                <span className="creq__badge">{orderStatus(o.status)}</span>
              </div>
            )) : <p className="advmuted">{t("noOrders")}</p>
          ) : tab === "payments" ? (
            d.payments.length ? d.payments.map((p) => (
              <div className="creq" key={p.id}>
                <span className={`creq__st${p.status === "paid" ? " creq__st--resolved" : ""}`} />
                <div className="creq__m"><b>{fmtUzs(p.amount)} {tsom("som")}</b><span>{[tpay.has(`kinds.${p.kind}`) ? tpay(`kinds.${p.kind}`) : p.description || p.kind, when(p.createdAt)].filter(Boolean).join(" · ")}</span></div>
                <span className="creq__badge">{tpay.has(`statuses.${p.status}`) ? tpay(`statuses.${p.status}`) : p.status}</span>
              </div>
            )) : <p className="advmuted">{t("noPayments")}</p>
          ) : tab === "leads" ? (
            d.leads.length ? d.leads.map((l) => (
              <div className="creq" key={l.id}>
                <span className="creq__st" />
                <div className="creq__m"><b>{leadCategoryLabel(tp, l.category) || tp("untitledLead")}</b><span>{[l.source ? leadSourceLabel(tp, l.source) : "", l.region, when(l.createdAt)].filter(Boolean).join(" · ")}</span></div>
                <span className="creq__badge">{tc.has(`queue.stages.${l.status}`) ? tc(`queue.stages.${l.status}`) : l.status}</span>
              </div>
            )) : <p className="advmuted">{t("noLeads")}</p>
          ) : (
            d.activities.length ? d.activities.slice(0, 15).map((a) => (
              <div className="creq" key={a.id}>
                <span className="creq__st" />
                <div className="creq__m"><b>{t.has(`actions.${a.action}`) ? t(`actions.${a.action}`) : a.action.replace(/_/g, " ")}</b><span>{[a.detail, when(a.createdAt)].filter(Boolean).join(" · ")}</span></div>
              </div>
            )) : <p className="advmuted">{t("noActivity")}</p>
          )}
        </>
      )}
    </div>
  );
}
