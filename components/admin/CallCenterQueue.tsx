"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { leadCategoryLabel } from "@/lib/leadLabels";
import { fmtAgeMin } from "@/lib/date";
import { humanize, labelOf, regionLabel, statusSpecOf } from "@/lib/labels";
import { getCallCenterQueue, assignNextSeller, type QueueItem } from "@/lib/services/backend";
import { Link } from "@/i18n/navigation";
import { ApiError, isForbidden } from "@/lib/http";
import { notify } from "@/lib/toast";
import { aiId, aiSeg } from "@/lib/ai/ids";
import { useAiReveal } from "@/lib/guide/targets";
import ListPager, { PAGE_STEP, usePaged } from "@/components/ui/ListPager";
import { EmptyState, ErrorState, Skeleton } from "@/components/portal/DataState";
import PersonName from "@/components/ui/PersonName";
import { Badge, CountBadge } from "@/components/ui/Badge";
import IconButton from "@/components/ui/IconButton";
import { directionLabel, useUrgentStatuses } from "./UrgentAdvocateQueue";
import { IconClock, IconRefresh, IconArrowRight, IconInbox, IconUser } from "@/components/icons";

const REFRESH_MS = 60_000;
// Default lead board columns a call-center operator moves a lead to.
// Titles the backend sends when the record has none of its own; the row
// shows the client's name instead.
const GENERIC_TITLE = new Set(["", "order", "lead", "buyurtma", "заказ"]);

const AI_ENTITY: Record<string, string> = { lead: "lead", order: "order", urgent_advokat: "urgent_advokat_request" };

type State = { status: "loading" | "ready" | "error" | "forbidden"; items: QueueItem[]; error?: unknown };

// T1-12 call-center queue (GET /call-center/queue, callcenter.access): leads and
// unassigned orders, SLA-breached first. Refreshes every minute while the tab
// is visible; hidden entirely for users without call-center access (403).
export default function CallCenterQueue({ onCount }: { onCount?: (n: number) => void }) {
  const t = useTranslations("admin.callCenter.queue");
  const te = useTranslations("enums");
  const tp = useTranslations("admin.pipeline");
  // Tezkor Advokat rows name their service in the client's own vocabulary.
  const tk = useTranslations("portal.client.urgent");
  const tu = useTranslations("admin.urgent");
  const tn = useTranslations("common.notify");
  const locale = useLocale();
  const urg = useUrgentStatuses();
  const [state, setState] = useState<State>({ status: "loading", items: [] });
  const [busyId, setBusyId] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const shown = useRef(false);
  const warned = useRef(false);
  const again = useRef<() => void>(() => undefined);

  const load = useCallback(
    (manual = false) =>
      getCallCenterQueue()
        .then((items) => {
          shown.current = items.length > 0;
          warned.current = false;
          setState({ status: "ready", items });
        })
        .catch((e: unknown) => {
          const forbidden = e instanceof ApiError && (e.status === 403 || e.status === 401);
          setState((s) => ({ status: forbidden ? "forbidden" : s.items.length ? "ready" : "error", items: s.items, error: e }));
          if (forbidden || !shown.current || (warned.current && !manual)) return;
          warned.current = true;
          notify.error(t("refreshFailed"), { id: "cc-queue-refresh", error: e, action: { label: tn("retry"), onClick: () => again.current() } });
        }),
    [t, tn],
  );

  useEffect(() => {
    again.current = () => void load(true);
  }, [load]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (document.visibilityState === "visible") void load();
      }, REFRESH_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    void load();
    start();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const countRef = useRef(onCount);
  useEffect(() => {
    countRef.current = onCount;
  });
  const itemCount = state.status === "forbidden" ? 0 : state.items.length;
  const settled = state.status === "ready" || state.status === "forbidden";
  useEffect(() => {
    if (settled) countRef.current?.(itemCount);
  }, [settled, itemCount]);

  const pager = usePaged(state.items, PAGE_STEP, "queue");
  useAiReveal(/^call_center\.leads\.item\.[^.]+\.[^.]+$/, (id) => {
    const [, , , type = "", seg = ""] = id.split(".");
    pager.reveal((i) => aiSeg(i.type) === type && aiSeg(i.id) === seg);
  });

  if (state.status === "forbidden") return null;

  function refreshNow() {
    if (refreshing) return;
    setRefreshing(true);
    void load(true).finally(() => setRefreshing(false));
  }

  async function assignNext(item: QueueItem) {
    if (busyId) return;
    setBusyId(item.id);
    try {
      await assignNextSeller(item.id);
      notify.success(t("assignDone"), { id: `cc-queue-assign-${item.id}` });
      await load();
    } catch (e) {
      notify.error(t("assignFailed"), {
        id: `cc-queue-assign-${item.id}`,
        error: e,
        map: { 403: t("noPermission") },
        action: isForbidden(e) ? undefined : { label: tn("retry"), onClick: () => void assignNext(item) },
      });
    } finally {
      setBusyId("");
    }
  }

  const age = (min: number) => fmtAgeMin(min, locale);
  const breached = state.items.filter((i) => i.slaBreached).length;
  const ready = state.status === "ready";

  return (
    <div className="ppanel" data-ai-target="callcenter:queue" data-ai-id="call_center.leads.queue" data-ai-type="section" data-ai-label={t("title")}>
      <div className="ppanel__h cch">
        <h2 className="ppanel__t cch__t"><span className="pico"><IconInbox /></span><span className="cch__tt">{t("title")}</span></h2>
        <div className="cch__a">
          {breached ? <Badge tone="err" size="sm">{t("breachedN", { n: breached })}</Badge> : null}
          {ready ? <CountBadge n={state.items.length} /> : null}
          <IconButton label={t("refresh")} icon={<IconRefresh />} onClick={refreshNow} busy={refreshing} tipAlign="end" aiId="call_center.leads.queue.refresh" />
        </div>
      </div>
      <p className="ppanel__note">{t("lead")}</p>

      {state.status === "loading" ? (
        <Skeleton rows={3} />
      ) : state.status === "error" ? (
        <ErrorState error={state.error} onRetry={() => load(true)} title={t("loadError")} compact />
      ) : !state.items.length ? (
        <EmptyState size="sm" icon={<IconInbox />} title={t("empty")} />
      ) : (
        <>
          <div className="alist alist--flow">
            {pager.visible.map((item) => {
              const left = item.slaMinutes - item.ageMinutes;
              const region = item.region ? regionLabel(te, item.region) : "";
              const hot = item.score === "hot" || item.urgency === "urgent";
              // A Tezkor Advokat request is a third row type with a 15-minute
              // SLA and its own board. It is NOT a lead: dropping it into the
              // else-branch below offered the lead-stage mover, which would have
              // called /call-center/leads/{id}/move on a record that is not one.
              const urgent = item.type === "urgent_advokat";
              const typeLabel = labelOf(t, "type", item.type);
              const statusText = !item.status ? "" : urgent ? (statusSpecOf(urg, item.status)?.label ?? "") : labelOf(t, "status", item.status);
              return (
                <div
                  className={`ccq${item.slaBreached ? " ccq--breach" : ""}`}
                  key={`${item.type}-${item.id}`}
                  data-ai-id={aiId("call_center.leads.item", item.type, item.id)}
                  data-ai-type="list_item"
                  data-ai-label={[typeLabel, statusText].filter(Boolean).join(" · ")}
                  data-ai-entity-type={AI_ENTITY[item.type] ?? item.type}
                  data-ai-entity-id={item.id}
                  data-ai-private
                >
                  <div className="ccq__top">
                    <span className={`tprio tprio--${urgent ? "high" : item.type === "order" ? "medium" : "low"}`}>{typeLabel}</span>
                    {hot ? <span className="tprio tprio--high">{t("hot")}</span> : null}
                    <b className="ccq__t">
                      {item.type === "lead" ? (
                        leadCategoryLabel(tp, item.title) || t("untitled")
                      ) : !GENERIC_TITLE.has(item.title.trim().toLowerCase()) ? (
                        item.title
                      ) : item.clientUserId ? (
                        <PersonName id={item.clientUserId} />
                      ) : (
                        t("untitled")
                      )}
                    </b>
                  </div>
                  <div className="ccq__meta">
                    <span className={`ccq__sla${item.slaBreached ? " on" : ""}`}>
                      <IconClock />
                      {item.slaBreached ? t("slaBreached", { age: age(item.ageMinutes) }) : t("slaLeftAge", { left: age(Math.max(1, left)), age: age(item.ageMinutes) })}
                    </span>
                    {region ? <span>{region}</span> : null}
                    {statusText ? <span>{statusText}</span> : null}
                    {item.recommendedSellerUserId && !urgent ? (
                      <span className="ccq__rec">
                        <IconUser aria-hidden="true" />
                        {t("recommended")}: <PersonName id={item.recommendedSellerUserId} />
                        {item.recommendedSellerLoad != null ? ` · ${t("loadN", { n: item.recommendedSellerLoad })}` : ""}
                      </span>
                    ) : null}
                    {urgent && item.serviceKind ? <span>{tk.has(`kinds.${item.serviceKind}`) ? tk(`kinds.${item.serviceKind}`) : humanize(item.serviceKind)}</span> : null}
                    {urgent && item.channel ? <span>{item.channel === "chat" ? tk("chChat") : tk("chVideo")}</span> : null}
                    {urgent && item.directions?.length ? <span>{item.directions.map((d) => directionLabel(te, d, tu)).join(", ")}</span> : null}
                    {urgent && item.requestedLawyerCount ? <span>{t("lawyersN", { n: item.requestedLawyerCount })}</span> : null}
                  </div>
                  <div className="ccq__act">
                    {urgent ? (
                      // The claim / candidates / meeting / result actions all
                      // live on the Tezkor Advokat board further down this page.
                      <a className="btn btn--line btn--sm" href="#cc-urgent">
                        {t("openUrgentBoard")}
                        <IconArrowRight />
                      </a>
                    ) : item.type === "order" ? (
                      <button type="button" className="btn btn--line btn--sm" disabled={busyId === item.id} onClick={() => assignNext(item)}>
                        {busyId === item.id ? t("working") : t("assignNext")}
                        <IconArrowRight />
                      </button>
                    ) : (
                      // A lead's status changes in the CRM, with its lock,
                      // a reason for Rejected and the paid order Won needs
                      // (CRM contract 13cb257 §6).
                      <Link className="btn btn--line btn--sm" href={`/admin/crm/leads/${encodeURIComponent(item.id)}`}>
                        {t("openInCrm")}
                        <IconArrowRight />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <ListPager {...pager.bind} less aiId="call_center.leads.queue.more" />
        </>
      )}
    </div>
  );
}
