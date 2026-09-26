"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { leadCategoryLabel } from "@/lib/leadLabels";
import { getCallCenterQueue, assignNextSeller, moveCallCenterLead, type QueueItem } from "@/lib/services/backend";
import { ApiError } from "@/lib/http";
import Select from "@/components/Select";
import { Skeleton } from "@/components/portal/DataState";
import { Notice } from "@/components/admin/AdminBits";
import { IconClock, IconRefresh, IconArrowRight } from "@/components/icons";

const REFRESH_MS = 60_000;
// Default lead board columns a call-center operator moves a lead to.
const LEAD_STAGES = ["contacted", "qualified", "proposal", "won", "lost"] as const;

type State = { status: "loading" | "ready" | "error" | "forbidden"; items: QueueItem[] };

// T1-12 call-center queue (GET /call-center/queue, callcenter.access): leads and
// unassigned orders, SLA-breached first. Refreshes every minute while the tab
// is visible; hidden entirely for users without call-center access (403).
export default function CallCenterQueue() {
  const t = useTranslations("admin.callCenter.queue");
  const te = useTranslations("enums");
  const tp = useTranslations("admin.pipeline");
  // Tezkor Advokat rows name their service in the client's own vocabulary.
  const tk = useTranslations("portal.client.urgent");
  const [state, setState] = useState<State>({ status: "loading", items: [] });
  const [busyId, setBusyId] = useState("");
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(
    () =>
      getCallCenterQueue()
        .then((items) => setState({ status: "ready", items }))
        .catch((e) => {
          const forbidden = e instanceof ApiError && (e.status === 403 || e.status === 401);
          setState((s) => ({ status: forbidden ? "forbidden" : s.items.length ? "ready" : "error", items: s.items }));
        }),
    [],
  );

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

  if (state.status === "forbidden") return null;

  async function assignNext(item: QueueItem) {
    if (busyId) return;
    setBusyId(item.id);
    setNote(null);
    try {
      await assignNextSeller(item.id);
      setNote({ ok: true, msg: t("assigned") });
      await load();
    } catch (e) {
      setNote({ ok: false, msg: e instanceof ApiError && e.status === 403 ? t("noPermission") : t("actionError") });
    } finally {
      setBusyId("");
    }
  }

  async function moveLead(item: QueueItem, stage: string) {
    if (busyId || !stage) return;
    setBusyId(item.id);
    setNote(null);
    try {
      await moveCallCenterLead(item.id, stage, 0);
      setNote({ ok: true, msg: t("moved", { stage: t(`stages.${stage}`) }) });
      await load();
    } catch (e) {
      setNote({ ok: false, msg: e instanceof ApiError && e.status === 403 ? t("noPermission") : t("actionError") });
    } finally {
      setBusyId("");
    }
  }

  const age = (min: number) => (min >= 60 ? t("ageHours", { h: Math.floor(min / 60), m: min % 60 }) : t("ageMin", { n: Math.max(0, min) }));
  const breached = state.items.filter((i) => i.slaBreached).length;

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {breached ? <span className="ccq__breach">{t("breachedN", { n: breached })}</span> : null}
          <span className="advmuted">{state.items.length}</span>
          <button type="button" className="btn btn--line btn--sm" onClick={() => void load()} aria-label={t("refresh")}>
            <IconRefresh />
          </button>
        </span>
      </div>
      <p className="ppanel__note">{t("lead")}</p>
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}

      {state.status === "loading" ? (
        <Skeleton rows={3} />
      ) : state.status === "error" ? (
        <p className="advmuted">{t("loadError")}</p>
      ) : !state.items.length ? (
        <p className="advmuted">{t("empty")}</p>
      ) : (
        <div className="alist">
          {state.items.map((item) => {
            const left = item.slaMinutes - item.ageMinutes;
            const region = item.region ? (te.has(`regions.${item.region}`) ? te(`regions.${item.region}`) : item.region) : "";
            const hot = item.score === "hot" || item.urgency === "urgent";
            // A Tezkor Advokat request is a third row type with a 15-minute
            // SLA and its own board. It is NOT a lead: dropping it into the
            // else-branch below offered the lead-stage mover, which would have
            // called /call-center/leads/{id}/move on a record that is not one.
            const urgent = item.type === "urgent_advokat";
            return (
              <div className={`ccq${item.slaBreached ? " ccq--breach" : ""}`} key={`${item.type}-${item.id}`}>
                <div className="ccq__top">
                  <span className={`tprio tprio--${urgent ? "high" : item.type === "order" ? "medium" : "low"}`}>{t.has(`type.${item.type}`) ? t(`type.${item.type}`) : item.type}</span>
                  {hot ? <span className="tprio tprio--high">{t("hot")}</span> : null}
                  <b className="ccq__t">{(item.type === "lead" ? leadCategoryLabel(tp, item.title) : item.title) || "—"}</b>
                </div>
                <div className="ccq__meta">
                  <span className={`ccq__sla${item.slaBreached ? " on" : ""}`}>
                    <IconClock />
                    {item.slaBreached ? t("slaBreached", { age: age(item.ageMinutes) }) : t("slaLeft", { n: Math.max(0, left), age: age(item.ageMinutes) })}
                  </span>
                  {region ? <span>{region}</span> : null}
                  {item.status ? <span>{t.has(`status.${item.status}`) ? t(`status.${item.status}`) : item.status}</span> : null}
                  {item.recommendedSellerLoad != null && !urgent ? <span>{t("sellerLoad", { n: item.recommendedSellerLoad })}</span> : null}
                  {urgent && item.serviceKind ? <span>{tk.has(`kinds.${item.serviceKind}`) ? tk(`kinds.${item.serviceKind}`) : item.serviceKind}</span> : null}
                  {urgent && item.channel ? <span>{item.channel === "chat" ? tk("chChat") : tk("chVideo")}</span> : null}
                  {urgent && item.directions?.length ? <span>{item.directions.join(", ")}</span> : null}
                  {urgent && item.requestedLawyerCount ? <span>{t("lawyersN", { n: item.requestedLawyerCount })}</span> : null}
                  {urgent && item.claimedByUserId ? <span>{t("urgentClaimed")}</span> : null}
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
                    <button type="button" className="btn btn--pri btn--sm" disabled={busyId === item.id} onClick={() => assignNext(item)}>
                      {busyId === item.id ? t("working") : t("assignNext")}
                      <IconArrowRight />
                    </button>
                  ) : (
                    <Select
                      value=""
                      onChange={(v) => moveLead(item, v)}
                      options={LEAD_STAGES.filter((s) => s !== item.status).map((s) => ({ value: s, label: t(`stages.${s}`) }))}
                      ariaLabel={t("moveTo")}
                      placeholder={busyId === item.id ? t("working") : t("moveTo")}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
