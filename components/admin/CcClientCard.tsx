"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getCcClientCard, listCcCalls, type CcCall, type CcClient, type CcClientCard as Card } from "@/lib/services/backend";
import { isForbidden } from "@/lib/http";
import { useResource, useResourceOne } from "@/lib/useResource";
import { dateOnly, fmtDuration, shortDateTime } from "@/lib/date";
import { fmtUzs } from "@/lib/money";
import { leadCategoryLabel, leadSourceLabel } from "@/lib/leadLabels";
import { humanize, labelOf, regionLabel } from "@/lib/labels";
import { useOrderStatusLabel } from "@/lib/orderStatus";
import { isCoarsePointer } from "@/lib/usePopover";
import { useScrollEdges } from "@/lib/useScrollEdges";
import { ErrorState, Skeleton } from "@/components/portal/DataState";
import InlineAlert from "@/components/ui/InlineAlert";
import { Badge } from "@/components/ui/Badge";
import Modal from "@/components/admin/Modal";
import CcCallForm from "./CcCallForm";
import { IconInfo, IconPhone, IconPlus } from "@/components/icons";

type Tab = "calls" | "leads" | "orders" | "payments" | "activity";

const ALL_TABS: Tab[] = ["calls", "leads", "orders", "payments", "activity"];
const ACTIVITY_SHOWN = 15;
const NO_CALLS = () => Promise.resolve<CcCall[]>([]);

type Tr = ((key: string) => string) & { has: (key: string) => boolean };

const ACTIVITY_GROUPS: readonly [RegExp, string][] = [
  [/^marketplace_/, "marketplace"],
  [/^(document_|service_document_|custom_document|existing_document)/, "document"],
  [/^urgent_advokat_/, "urgent"],
  [/^(payment_|milestone_|upsell_)/, "payment"],
  [/^subscription/, "subscription"],
  [/^secure_chat_/, "chat"],
  [/^ai(_|$)/, "ai"],
  [/^call_/, "call"],
  [/^contract_/, "contract"],
  [/^support_/, "support"],
  [/^(login|logout|session_|totp_|password_|telegram_|identity_|notification_)/, "account"],
  [/^order_/, "order"],
];

function activityLabel(t: Tr, action: string): string {
  const a = action.trim().toLowerCase();
  if (!a) return "";
  if (t.has(`actions.${a}`)) return t(`actions.${a}`);
  const group = ACTIVITY_GROUPS.find(([re]) => re.test(a))?.[1] ?? "other";
  return t.has(`actionGroups.${group}`) ? t(`actionGroups.${group}`) : humanize(a);
}

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const HEX_ID_RE = /\b[0-9a-f]{24,}\b/gi;
const BOILERPLATE = new Set(["user logged in", "logged in", "order", "lead", "call-center call"]);
const digits = (s: string) => s.replace(/\D/g, "");

function activityDetail(detail: string): string {
  const s = detail
    .replace(UUID_RE, "")
    .replace(HEX_ID_RE, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s:#·,;-]+|[\s:#·,;-]+$/g, "")
    .trim();
  if (!s || /^[a-z][a-z0-9_]*$/.test(s) || BOILERPLATE.has(s.toLowerCase())) return "";
  return s;
}

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
  const none = useTranslations("common")("none");
  const tc = useTranslations("admin.callCenter");
  const tcl = useTranslations("admin.callCenter.calls");
  const tp = useTranslations("admin.pipeline");
  const te = useTranslations("enums");
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
  const calls = useResource<CcCall>(canLog ? () => listCcCalls(client.id) : NO_CALLS, [client.id, canLog]);
  const tabs = canLog ? ALL_TABS : ALL_TABS.filter((k) => k !== "calls");
  const [pick, setPick] = useState<Tab>(tabs[0]);
  const tab = tabs.includes(pick) ? pick : tabs[0];
  const [logging, setLogging] = useState(false);
  const [logDirty, setLogDirty] = useState(false);
  const [logBusy, setLogBusy] = useState(false);
  const [freshId, setFreshId] = useState("");
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const freshRow = useRef<HTMLDivElement>(null);
  useScrollEdges(panelRef, { silent: true });
  useScrollEdges(tabsRef, { silent: true });
  const d = res.data;
  const when = (v: string) => shortDateTime(v, locale);
  const tel = client.phone.replace(/[^+\d]/g, "");
  const name = client.name || client.phone;
  const subs = d ? d.subscriptions.filter((s) => s.status === "active").length : 0;
  const counts: Record<Tab, number | null> = {
    calls: calls.status === "ready" ? calls.data.length : null,
    leads: d?.leads.length ?? 0,
    orders: d?.orders.length ?? 0,
    payments: d?.payments.length ?? 0,
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

  useEffect(() => {
    const list = tabsRef.current;
    const el = list?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!list || !el || list.scrollWidth <= list.clientWidth) return;
    const box = list.getBoundingClientRect();
    const at = el.getBoundingClientRect();
    if (at.left < box.left + 24) list.scrollLeft -= box.left + 24 - at.left;
    else if (at.right > box.right - 24) list.scrollLeft += at.right - box.right + 24;
  }, [tab]);

  useEffect(() => {
    const el = freshRow.current;
    if (!freshId || !el || typeof el.animate !== "function") return;
    el.scrollIntoView({ block: "nearest" });
    const tint = getComputedStyle(el).getPropertyValue("--dk-tint-ok").trim() || "#E3F6EE";
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const anim = el.animate(
      [
        { backgroundColor: tint, borderRadius: "10px" },
        { backgroundColor: tint, borderRadius: "10px", offset: 0.6 },
        { backgroundColor: "transparent", borderRadius: "10px" },
      ],
      { duration: 2400, easing: still ? "steps(1, end)" : "ease-out" },
    );
    return () => anim.cancel();
  }, [freshId]);

  function openLog(on: boolean) {
    setLogging(on);
    setLogDirty(false);
  }

  function afterLog(phone: string) {
    if (!canLog) return;
    const known = new Set(calls.data.map((c) => c.id));
    void listCcCalls(client.id).then(
      (list) => {
        calls.setData(list);
        const added = list.filter((c) => !known.has(c.id));
        const hit = added.find((c) => digits(c.phone) === digits(phone)) ?? added[0];
        setPick("calls");
        if (hit) setFreshId(hit.id);
      },
      () => undefined,
    );
  }

  function onTabKey(e: ReactKeyboardEvent<HTMLButtonElement>, k: Tab) {
    const at = tabs.indexOf(k);
    const to =
      e.key === "ArrowRight" ? tabs[(at + 1) % tabs.length]
        : e.key === "ArrowLeft" ? tabs[(at - 1 + tabs.length) % tabs.length]
          : e.key === "Home" ? tabs[0]
            : e.key === "End" ? tabs[tabs.length - 1]
              : null;
    if (!to) return;
    e.preventDefault();
    setPick(to);
    document.getElementById(`${uid}-tab-${to}`)?.focus();
  }

  const facts = [client.name ? client.phone : "", client.lexgoId ? t("lexgoId", { id: client.lexgoId }) : ""].filter(Boolean).join(" · ");
  const head = (
    <span className="ccc__meta">
      <Badge tone="info" size="sm">{t("role")}</Badge>
      {subs ? <Badge tone="ok" size="sm">{t("subActive")}</Badge> : null}
      {facts ? <span className="ccc__facts">{facts}</span> : null}
    </span>
  );

  const resultLabel = (r: string) => (!r ? "" : tcl.has(`results.${r}`) ? tcl(`results.${r}`) : labelOf(tc, "status", r));
  const dirLabel = (v: string) => (tc.has(`dir.${v}`) ? tc(`dir.${v}`) : humanize(v));

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

  const tiles: [string, string][] = d
    ? [
        [t("sumLeads"), String(d.summary.leads)],
        [t("sumOrders"), String(d.summary.orders)],
        canLog ? [t("sumCalls"), calls.status === "ready" ? String(calls.data.length) : none] : [t("sumChats"), String(d.summary.rooms)],
        [t("sumSpent"), `${fmtUzs(d.summary.totalSpent)} ${tsom("som")}`],
        [t("sumComplaints"), String(d.summary.complaints)],
        [t("sumSince"), d.client.createdAt ? dateOnly(d.client.createdAt, locale) : none],
      ]
    : [];

  return (
    <Modal
      open
      onClose={onClose}
      title={logging ? tc("logCall") : name || t("title")}
      description={logging ? [name, client.phone].filter((x, i, all) => x && all.indexOf(x) === i).join(" · ") : head}
      initialFocus="title"
      busy={logBusy}
      dirty={logging && logDirty}
      footer={footer}
      scroll={logging ? "body" : "inner"}
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
              onDone={(call) => { openLog(false); onLogged(call.phone); afterLog(call.phone); }}
            />
          </>
        ) : res.status === "loading" ? (
          <Skeleton rows={3} />
        ) : forbidden ? (
          <InlineAlert tone="locked" compact>{t("noAccess")}</InlineAlert>
        ) : !d ? (
          <ErrorState error={failure} onRetry={() => setAttempt((n) => n + 1)} title={t("loadError")} compact />
        ) : (
          <>
            <div className="ccc__sum">
              {tiles.map(([k, v]) => (
                <div className="ccc__tile" key={k}><b>{v}</b><span>{k}</span></div>
              ))}
            </div>

            <div className="ccc__tabsw">
              <div ref={tabsRef} className="ccc__tabs scue-x" role="tablist" aria-label={t("tabsAria")}>
                {tabs.map((k) => (
                  <button
                    key={k}
                    id={`${uid}-tab-${k}`}
                    type="button"
                    role="tab"
                    className="ccc__tab"
                    aria-selected={tab === k}
                    aria-controls={`${uid}-panel`}
                    tabIndex={tab === k ? 0 : -1}
                    onClick={() => setPick(k)}
                    onKeyDown={(e) => onTabKey(e, k)}
                  >
                    <span>{t(`tabs.${k}`)}</span>
                    {counts[k] === null ? null : <em className="ccc__n">{counts[k]}</em>}
                  </button>
                ))}
              </div>
            </div>

            <div ref={panelRef} id={`${uid}-panel`} className="ccc__panel scue-y" role="tabpanel" aria-labelledby={`${uid}-tab-${tab}`} tabIndex={0}>
              {tab === "calls" ? (
                calls.status === "loading" ? (
                  <Skeleton rows={3} />
                ) : calls.status === "error" ? (
                  <ErrorState error={calls.error} onRetry={calls.refresh} title={tcl("loadError")} compact />
                ) : calls.data.length ? (
                  calls.data.map((c) => (
                    <div className="creq" key={c.id} ref={c.id === freshId ? freshRow : undefined}>
                      <span className={`creq__st${c.status === "missed" ? " creq__st--matching" : c.direction === "incoming" ? " creq__st--consultation" : ""}`} />
                      <div className="creq__m">
                        <b>{[dirLabel(c.direction), resultLabel(c.result)].filter(Boolean).join(" · ")}</b>
                        <span>{[when(c.createdAt), c.durationSec ? fmtDuration(c.durationSec, locale) : "", c.topic].filter(Boolean).join(" · ")}</span>
                        {c.nextAction ? <em className="creq__next">{tcl("next")}: {c.nextAction}</em> : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="advmuted">{t("noCalls")}</p>
                )
              ) : tab === "orders" ? (
                d.orders.length ? d.orders.map((o) => (
                  <div className="creq" key={o.id}>
                    <span className="creq__st" />
                    <div className="creq__m"><b>{o.serviceName || o.title || none}</b><span>{[o.lawyerName, when(o.createdAt)].filter(Boolean).join(" · ")}</span></div>
                    <span className="creq__badge">{orderStatus(o.status)}</span>
                  </div>
                )) : <p className="advmuted">{t("noOrders")}</p>
              ) : tab === "payments" ? (
                d.payments.length ? d.payments.map((p) => (
                  <div className="creq" key={p.id}>
                    <span className={`creq__st${p.status === "paid" ? " creq__st--resolved" : ""}`} />
                    <div className="creq__m"><b>{fmtUzs(p.amount)} {tsom("som")}</b><span>{[tpay.has(`kinds.${p.kind}`) ? tpay(`kinds.${p.kind}`) : p.description || humanize(p.kind), when(p.createdAt)].filter(Boolean).join(" · ")}</span></div>
                    <span className="creq__badge">{labelOf(tpay, "statuses", p.status)}</span>
                  </div>
                )) : <p className="advmuted">{t("noPayments")}</p>
              ) : tab === "leads" ? (
                d.leads.length ? d.leads.map((l) => (
                  <div className="creq" key={l.id}>
                    <span className="creq__st" />
                    <div className="creq__m"><b>{leadCategoryLabel(tp, l.category) || tp("untitledLead")}</b><span>{[l.source ? leadSourceLabel(te, l.source) : "", l.region ? regionLabel(te, l.region) : "", when(l.createdAt)].filter(Boolean).join(" · ")}</span></div>
                    <span className="creq__badge">{labelOf(tc, "queue.stages", l.status)}</span>
                  </div>
                )) : <p className="advmuted">{t("noLeads")}</p>
              ) : (
                d.activities.length ? d.activities.slice(0, ACTIVITY_SHOWN).map((a) => (
                  <div className="creq" key={a.id}>
                    <span className="creq__st" />
                    <div className="creq__m"><b>{activityLabel(t, a.action)}</b><span>{[activityDetail(a.detail), when(a.createdAt)].filter(Boolean).join(" · ")}</span></div>
                  </div>
                )) : <p className="advmuted">{t("noActivity")}</p>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
