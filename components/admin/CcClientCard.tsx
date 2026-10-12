"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getCcClientCard, type CcClient, type CcClientCard as Card } from "@/lib/services/backend";
import { isForbidden } from "@/lib/http";
import { useResourceOne } from "@/lib/useResource";
import { shortDateTime } from "@/lib/date";
import { fmtUzs } from "@/lib/money";
import { leadCategoryLabel, leadSourceLabel } from "@/lib/leadLabels";
import { useOrderStatusLabel } from "@/lib/orderStatus";
import { isCoarsePointer } from "@/lib/usePopover";
import { ErrorState, Skeleton } from "@/components/portal/DataState";
import Modal from "@/components/admin/Modal";
import CcCallForm from "./CcCallForm";
import { IconInfo, IconPhone, IconPlus } from "@/components/icons";

type Tab = "orders" | "payments" | "leads" | "activity";

const TABS: Tab[] = ["orders", "payments", "leads", "activity"];
const ACTIVITY_SHOWN = 15;

// T4-02 client 360 (GET /call-center/clients/{id}) for the call-center and
// sales consoles: who the client is, what they ordered and paid, their leads
// and last actions — plus a one-click call log. Without the 360 permission
// (403) the card still shows what the search result knows.
export default function CcClientCard({
  client,
  canLog,
  onLogged,
  onClose,
}: {
  client: CcClient;
  canLog: boolean;
  onLogged: (phone: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("admin.callCenter.card");
  const tc = useTranslations("admin.callCenter");
  const tp = useTranslations("admin.pipeline");
  const tpay = useTranslations("portal.client.payments");
  const tsom = useTranslations("portal.payment");
  const locale = useLocale();
  const orderStatus = useOrderStatusLabel();
  const uid = useId();
  const [forbidden, setForbidden] = useState(false);
  const [failure, setFailure] = useState<unknown>(undefined);
  const [attempt, setAttempt] = useState(0);
  const res = useResourceOne<Card | null>(
    () => getCcClientCard(client.id).catch((e) => { if (isForbidden(e)) { setForbidden(true); return null; } setFailure(e); throw e; }),
    [client.id, attempt],
  );
  const [tab, setTab] = useState<Tab>("orders");
  const [logging, setLogging] = useState(false);
  const [logDirty, setLogDirty] = useState(false);
  const [logBusy, setLogBusy] = useState(false);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const d = res.data;
  const when = (v: string) => shortDateTime(v, locale);
  const tel = client.phone.replace(/[^+\d]/g, "");
  const name = client.name || client.phone;
  const counts: Record<Tab, number> = {
    orders: d?.orders.length ?? 0,
    payments: d?.payments.length ?? 0,
    leads: d?.leads.length ?? 0,
    activity: Math.min(ACTIVITY_SHOWN, d?.activities.length ?? 0),
  };

  const seen = useRef(false);
  useEffect(() => {
    if (seen.current === logging) return;
    seen.current = logging;
    const el = root.current;
    if (!el) return;
    el.closest<HTMLElement>(".amodal__b")?.scrollTo({ top: 0 });
    const title = el.closest(".amodal__c")?.querySelector<HTMLElement>(".amodal__t") ?? null;
    const field = logging && !isCoarsePointer() ? el.querySelector<HTMLElement>('input[type="tel"]') : null;
    (field ?? title)?.focus({ preventScroll: true });
  }, [logging]);

  function openLog(on: boolean) {
    setLogging(on);
    setLogDirty(false);
  }

  function onTabKey(e: ReactKeyboardEvent<HTMLButtonElement>, k: Tab) {
    const at = TABS.indexOf(k);
    const to =
      e.key === "ArrowRight" ? TABS[(at + 1) % TABS.length]
        : e.key === "ArrowLeft" ? TABS[(at - 1 + TABS.length) % TABS.length]
          : e.key === "Home" ? TABS[0]
            : e.key === "End" ? TABS[TABS.length - 1]
              : null;
    if (!to) return;
    e.preventDefault();
    setTab(to);
    document.getElementById(`${uid}-tab-${to}`)?.focus();
  }

  const meta = [client.lexgoId, client.name ? client.phone : "", client.status ? (tc.has(`status.${client.status}`) ? tc(`status.${client.status}`) : client.status) : ""].filter(Boolean).join(" · ");

  const footer = logging ? (
    <div className="ccslot" ref={setSlot} />
  ) : tel || canLog ? (
    <>
      {tel ? <a className="btn btn--line" href={`tel:${tel}`}><IconPhone />{t("call")}</a> : null}
      {canLog ? (
        <button type="button" className="btn btn--pri" onClick={() => openLog(true)}>
          <IconPlus />{tc("logCall")}
        </button>
      ) : null}
    </>
  ) : undefined;

  return (
    <Modal
      open
      onClose={onClose}
      title={logging ? tc("logCall") : name || t("title")}
      description={logging ? [name, client.phone].filter((x, i, all) => x && all.indexOf(x) === i).join(" · ") : meta || undefined}
      initialFocus="title"
      busy={logBusy}
      dirty={logging && logDirty}
      footer={footer}
    >
      <div ref={root} className={`ccc${logging ? " ccc--log" : ""}`}>
        {logging ? (
          <>
            <p className="ccc__note" role="note"><IconInfo aria-hidden="true" />{t("logFor", { name })}</p>
            <CcCallForm
              phone={client.phone}
              clientUserId={client.id}
              footSlot={slot}
              cancelLabel={t("back")}
              onDirtyChange={setLogDirty}
              onBusyChange={setLogBusy}
              onCancel={() => openLog(false)}
              onDone={(call) => { openLog(false); onLogged(call.phone); }}
            />
          </>
        ) : (
          <>
            {d?.client.createdAt ? <p className="ccc__since">{t("since", { date: when(d.client.createdAt) })}</p> : null}

            {res.status === "loading" ? (
              <Skeleton rows={3} />
            ) : forbidden ? (
              <p className="advmuted">{t("noAccess")}</p>
            ) : !d ? (
              <ErrorState error={failure} onRetry={() => setAttempt((n) => n + 1)} title={t("loadError")} compact />
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

                <div className="ccc__tabs" role="tablist" aria-label={t("tabsAria")}>
                  {TABS.map((k) => (
                    <button
                      key={k}
                      id={`${uid}-tab-${k}`}
                      type="button"
                      role="tab"
                      className="ccc__tab"
                      aria-selected={tab === k}
                      aria-controls={`${uid}-panel`}
                      tabIndex={tab === k ? 0 : -1}
                      onClick={() => setTab(k)}
                      onKeyDown={(e) => onTabKey(e, k)}
                    >
                      <span>{t(`tabs.${k}`)}</span>
                      <em className="ccc__n">{counts[k]}</em>
                    </button>
                  ))}
                </div>

                <div id={`${uid}-panel`} className="ccc__panel" role="tabpanel" aria-labelledby={`${uid}-tab-${tab}`} tabIndex={0}>
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
                    d.activities.length ? d.activities.slice(0, ACTIVITY_SHOWN).map((a) => (
                      <div className="creq" key={a.id}>
                        <span className="creq__st" />
                        <div className="creq__m"><b>{t.has(`actions.${a.action}`) ? t(`actions.${a.action}`) : a.action.replace(/_/g, " ")}</b><span>{[a.detail, when(a.createdAt)].filter(Boolean).join(" · ")}</span></div>
                      </div>
                    )) : <p className="advmuted">{t("noActivity")}</p>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
