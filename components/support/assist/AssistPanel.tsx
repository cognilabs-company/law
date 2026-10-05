"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { isAborted } from "@/lib/http";
import { errorText } from "@/lib/errorText";
import type { BackendPlan } from "@/lib/services/backend";
import { isClosedStatus, type SupportTicket } from "@/lib/services/support";
import { assistBlockOf, getAssistContext, loadAssistPlans, type AssistBlock, type AssistContext } from "@/lib/services/supportAssist";
import { IconAlert, IconHeadset, IconInfo, IconLock, IconRefresh, IconUser } from "@/components/icons";
import { AssistClientCard, AssistOverview } from "./AssistSummary";
import AssistPlan, { type AssistPlansState } from "./AssistPlan";
import AssistDoc from "./AssistDoc";
import AssistMarket from "./AssistMarket";
import { AssistNote } from "./bits";

type Tab = "plan" | "doc" | "market";
const TABS: Tab[] = ["plan", "doc", "market"];

type Load = { ticketId: string; key: string; ctx: AssistContext | null; error: unknown };
type Plans = { locale: string; status: "ready" | "error"; all: BackendPlan[]; sellable: BackendPlan[] };
type Lock = "claim" | "other" | "closed" | "notClient" | "missing" | "unavailable";

const LOCK_OF: Record<AssistBlock, Lock> = {
  closed: "closed",
  notClient: "notClient",
  notAssigned: "other",
  missing: "missing",
  unavailable: "unavailable",
};
const RELOADABLE = new Set<AssistBlock>(["unavailable", "notAssigned"]);

export default function AssistPanel({
  ticket,
  mine,
  readOnly = false,
  missing = false,
  refreshKey = 0,
  onCall,
  calling = "",
  onActed,
}: {
  ticket: SupportTicket;
  mine: boolean;
  readOnly?: boolean;
  missing?: boolean;
  refreshKey?: number;
  onCall?: (type: "audio" | "video") => void;
  calling?: "audio" | "video" | "";
  onActed?: (ticketId: string) => void;
}) {
  const t = useTranslations("support.assist");
  const tc = useTranslations("common");
  const locale = useLocale();
  const uid = useId();
  const ticketId = ticket.id;
  const closed = isClosedStatus(ticket.status);
  const viewOnly = readOnly && !mine;
  const active = (mine || viewOnly) && !missing && Boolean(ticketId) && Boolean(ticket.operatorUserId) && !closed;
  const [tick, setTick] = useState(0);
  const [load, setLoad] = useState<Load>({ ticketId: "", key: "", ctx: null, error: null });
  const [hard, setHard] = useState<{ ticketId: string; block: AssistBlock } | null>(null);
  const [plans, setPlans] = useState<Plans | null>(null);
  const [planTick, setPlanTick] = useState(0);
  const [tab, setTab] = useState<Tab>("plan");
  const [seen, setSeen] = useState<Record<Tab, boolean>>({ plan: true, doc: false, market: false });
  const plansFor = useRef("");
  const reqKey = `${ticketId}|${refreshKey}|${tick}`;
  const planKey = `${locale}|${planTick}`;

  useEffect(() => {
    if (!active) return;
    const c = new AbortController();
    getAssistContext(ticketId, c.signal)
      .then((ctx) => {
        if (c.signal.aborted) return;
        setLoad({ ticketId, key: reqKey, ctx, error: null });
        setHard(null);
      })
      .catch((e: unknown) => {
        if (isAborted(e) || c.signal.aborted) return;
        setLoad((cur) => ({ ticketId, key: reqKey, ctx: cur.ticketId === ticketId ? cur.ctx : null, error: e }));
      });
    return () => c.abort();
  }, [active, ticketId, reqKey]);

  useEffect(() => {
    if (!active || plansFor.current === planKey) return;
    let alive = true;
    const lang = locale;
    loadAssistPlans(lang)
      .then((r) => {
        if (!alive) return;
        plansFor.current = planKey;
        setPlans({ locale: lang, status: "ready", all: r.all, sellable: r.sellable });
      })
      .catch(() => {
        if (alive) setPlans({ locale: lang, status: "error", all: [], sellable: [] });
      });
    return () => {
      alive = false;
    };
  }, [active, locale, planKey]);

  const current = load.ticketId === ticketId ? load : null;
  const ctx = current?.ctx ?? null;
  const error = current?.error ?? null;
  const block = (hard && hard.ticketId === ticketId ? hard.block : null) ?? assistBlockOf(error);
  const refreshing = active && current !== null && current.key !== reqKey;
  const plansNow = plans && plans.locale === locale ? plans : null;
  const plansState: AssistPlansState = {
    status: plansNow ? plansNow.status : "loading",
    sellable: plansNow?.sellable ?? [],
    retry: () => {
      setPlans(null);
      setPlanTick((n) => n + 1);
    },
  };

  const reload = () => setTick((n) => n + 1);
  const done = () => {
    onActed?.(ticketId);
    reload();
  };
  const onBlock = (e: unknown) => {
    const b = assistBlockOf(e);
    if (!b || b === "unavailable") return false;
    setHard({ ticketId, block: b });
    return true;
  };

  const pick = (k: Tab) => {
    setTab(k);
    setSeen((s) => (s[k] ? s : { ...s, [k]: true }));
  };
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.indexOf(tab);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    pick(TABS[next]);
    document.getElementById(`${uid}-tab-${TABS[next]}`)?.focus();
  };

  const lockOf = (): Lock => (closed ? "closed" : ticket.operatorUserId ? "other" : "claim");
  const lockIcon = (k: Lock) => (k === "notClient" ? <IconUser /> : k === "missing" || k === "unavailable" ? <IconInfo /> : <IconLock />);
  const lockView = (k: Lock, extra?: ReactNode) => (
    <AssistNote icon={lockIcon(k)} title={t(`locked.${k}Title`)} text={t(`locked.${k}Text`)}>
      {extra}
    </AssistNote>
  );
  const retry = (
    <button type="button" className="btn btn--line btn--sm" onClick={reload} disabled={refreshing}>
      <IconRefresh />
      {tc("retry")}
    </button>
  );
  const skeleton = (
    <div className="sasst__sk" aria-busy="true">
      <i />
      <i />
      <i />
    </div>
  );

  let body: ReactNode;
  if (missing) {
    body = lockView("missing");
  } else if (!active) {
    body = ticket.status ? lockView(lockOf()) : skeleton;
  } else if (block) {
    body = lockView(LOCK_OF[block], RELOADABLE.has(block) ? retry : null);
  } else if (!ctx && !error) {
    body = skeleton;
  } else if (!ctx) {
    body = (
      <AssistNote icon={<IconAlert />} title={t("locked.errorTitle")} text={errorText(error, tc)}>
        {retry}
      </AssistNote>
    );
  } else {
    const caps = ctx.capabilities;
    const allowed: Record<Tab, boolean> = { plan: caps.subscriptionCheckout, doc: caps.documentLawyerRequest, market: caps.marketplacePurchaseRequest };
    const section = (k: Tab) => {
      if (!allowed[k]) return <p className="sasst__empty">{t("tabs.capOff")}</p>;
      const common = { ticketId, client: ctx.client, clientName: ticket.clientName, onDone: done, onBlock };
      if (k === "plan") return <AssistPlan key={ticketId} {...common} plans={plansState} />;
      if (k === "doc") return <AssistDoc key={ticketId} {...common} />;
      return <AssistMarket key={ticketId} {...common} />;
    };
    body = (
      <>
        {error ? (
          <div className="sasst__staleb" role="status">
            <span>{t("stale")}</span>
            <button type="button" className="sasst__link" onClick={reload} disabled={refreshing}>
              {tc("retry")}
            </button>
          </div>
        ) : null}
        {viewOnly ? (
          <p className="sasst__view" role="note">
            <IconInfo aria-hidden="true" />
            <span>{t("viewOnly")}</span>
          </p>
        ) : null}
        <AssistClientCard ctx={ctx} ticket={ticket} onCall={viewOnly ? undefined : onCall} calling={calling} />
        <AssistOverview ctx={ctx} plans={plansNow?.all ?? []} plansReady={plansNow !== null} />
        {viewOnly ? null : (
          <div className="sasst__card">
            <div className="suptabs sasst__tabs" role="tablist" aria-label={t("tabs.label")} onKeyDown={onTabKey}>
              {TABS.map((k) => (
                <button
                  key={k}
                  id={`${uid}-tab-${k}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  aria-controls={seen[k] ? `${uid}-panel-${k}` : undefined}
                  tabIndex={tab === k ? 0 : -1}
                  className="suptab"
                  onClick={() => pick(k)}
                >
                  {t(`tabs.${k}`)}
                </button>
              ))}
            </div>
            {TABS.map((k) =>
              seen[k] ? (
                <div key={k} id={`${uid}-panel-${k}`} role="tabpanel" aria-labelledby={`${uid}-tab-${k}`} hidden={tab !== k} className="sasst__sec">
                  {section(k)}
                </div>
              ) : null,
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <section className="sasst" data-ai-target="support:assist" aria-label={t("title")}>
      <header className="sasst__h">
        <span className="sasst__hic" aria-hidden="true">
          <IconHeadset />
        </span>
        <div className="sasst__ht">
          <b>{t("title")}</b>
          <small>{t("lead")}</small>
        </div>
        {active && (!block || RELOADABLE.has(block)) && (ctx || error) ? (
          <button
            type="button"
            className={`sasst__re${refreshing ? " is-spin" : ""}`}
            onClick={reload}
            disabled={refreshing}
            aria-label={t("refresh")}
            title={t("refresh")}
          >
            <IconRefresh />
          </button>
        ) : null}
      </header>
      <div className="sasst__body">{body}</div>
    </section>
  );
}
