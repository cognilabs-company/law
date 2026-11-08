"use client";

import "../panel/panel.css";
import "./meetings.css";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useAuth, canMakeCalls } from "@/lib/auth";
import { localDay } from "@/lib/date";
import { statusSpecOf } from "@/lib/labels";
import { notify } from "@/lib/toast";
import { useAiSelection } from "@/lib/ai/registry";
import { subscribeUserEvents } from "@/lib/userSocket";
import CallRoom from "@/components/chat/CallRoom";
import { IcArrowRight, IcMeeting, IcRefresh } from "../icons";
import { IcCalendar, IcPlus } from "./glyphs";
import {
  ENDED_ORDER,
  END_TONE,
  LIVE,
  OUT,
  PAGE,
  RECHECK_DELAY,
  RECHECK_WINDOW,
  REFRESH_ID,
  TABS,
  countBy,
  domSafe,
  isMissing,
  isTransient,
  loadHistory,
  ordered,
  readMinute,
  readTab,
  reasonOf,
  saveTab,
  serverMinute,
  startMs,
  subscribeMinute,
  useCallStatusMap,
  type Active,
  type HistoryItem,
  type Tab,
} from "./model";
import Timeline from "./Timeline";
import NewMeeting from "./NewMeeting";
import QuickStart from "./QuickStart";
import AllMeetings from "./AllMeetings";
import CallDetail from "./CallDetail";
import { can } from "@/lib/permissions";

type MineTab = Exclude<Tab, "all">;

export default function CcxMeetings() {
  const t = useTranslations("admin.meetings");
  const tn = useTranslations("common.notify");
  const x = useTranslations("admin.ccx.meetings");
  const { session } = useAuth();
  const sessionId = session?.id ?? "";
  const sessionKey = session ? session.id || session.phone || "-" : "";
  const uid = `opx-mtg${domSafe(useId())}`;
  const minute = useSyncExternalStore(subscribeMinute, readMinute, serverMinute);
  const callMap = useCallStatusMap();
  const [active, setActive] = useState<Active | null>(null);
  const [creating, setCreating] = useState(false);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [histErr, setHistErr] = useState<{ missing: boolean; error: unknown } | null>(null);
  const [histTick, setHistTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [tabPick, setTabPick] = useState<Tab>(readTab);
  const [pastPager, setPastPager] = useState({ key: "", n: PAGE });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [platOn, setPlatOn] = useState(false);
  const sideRef = useRef<HTMLDivElement>(null);
  const resumedRef = useRef(false);
  const shownRef = useRef(false);

  const canHost = canMakeCalls(session);
  const canSeeAll = can(session, "leads.manage");
  const tab: Tab = tabPick === "all" && !canSeeAll ? "today" : tabPick;
  const mineTab: MineTab = tab === "all" ? "today" : tab;
  if (tab === "all" && !platOn) setPlatOn(true);
  useAiSelection("admin_meetings_scope", canSeeAll ? (tab === "all" ? "all" : "mine") : "");

  const refreshHistory = useCallback(() => setHistTick((n) => n + 1), []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = subscribeUserEvents((e) => {
      if (!e.event.startsWith("call.")) return;
      clearTimeout(timer);
      timer = setTimeout(refreshHistory, 400);
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [refreshHistory]);

  const takeHistory = useCallback((list: HistoryItem[]) => {
    shownRef.current = true;
    setHistory(list);
    setHistErr(null);
  }, []);

  const failHistory = useCallback((e: unknown) => {
    shownRef.current = false;
    setHistory([]);
    setHistErr({ missing: isMissing(e), error: e });
  }, []);

  useEffect(() => {
    if (!sessionKey || active) return;
    let alive = true;
    const me = sessionId;
    loadHistory()
      .then((list) => {
        if (!alive) return;
        takeHistory(list);
        if (resumedRef.current) return;
        resumedRef.current = true;
        let raw: string | null = null;
        try {
          raw = sessionStorage.getItem("lexgo_active_call");
        } catch {
          raw = null;
        }
        if (!raw) return;
        let stored: { roomId?: string; callId?: string } | null = null;
        try {
          stored = JSON.parse(raw);
        } catch {
          stored = null;
        }
        const roomId = stored?.roomId;
        const callId = stored?.callId;
        if (!roomId || !callId) return;
        const c = list.find((v) => v.callId === callId);
        if (!c || !LIVE.has(c.callStatus) || OUT.has(c.status)) {
          try {
            sessionStorage.removeItem("lexgo_active_call");
          } catch {}
          return;
        }
        if (c.callerUserId === me) setActive({ roomId, callId, callType: c.callType, isCaller: true, title: c.title || undefined, lk: null });
      })
      .catch((e: unknown) => {
        if (!alive || (shownRef.current && !isMissing(e))) return;
        failHistory(e);
      });
    return () => {
      alive = false;
    };
  }, [sessionKey, sessionId, active, histTick, takeHistory, failHistory]);

  useEffect(() => () => notify.dismiss(REFRESH_ID), []);

  async function reloadHistory() {
    if (refreshing) return;
    notify.dismiss(REFRESH_ID);
    setRefreshing(true);
    try {
      takeHistory(await loadHistory());
    } catch (e) {
      if (shownRef.current && !isMissing(e)) {
        notify.error(t("refreshFailed"), {
          id: REFRESH_ID,
          error: e,
          action: isTransient(e) ? { label: tn("retry"), onClick: () => void reloadHistory() } : undefined,
        });
      } else {
        failHistory(e);
      }
    } finally {
      setRefreshing(false);
    }
  }

  const all = history ?? [];
  const nowMs = minute * 60000;
  const today = minute ? localDay(nowMs) : "";
  const liveCount = all.filter((c) => c.callStatus === "active" && !OUT.has(c.status)).length;
  const todayList = all
    .filter((c) => c.callStatus === "active" || (Boolean(today) && Boolean(c.startedAt) && localDay(c.startedAt) === today))
    .sort((a, b) => startMs(a) - startMs(b));
  const scheduled = all.filter((c) => c.callStatus === "scheduled").sort((a, b) => startMs(a) - startMs(b));
  const ended = all.filter((c) => !LIVE.has(c.callStatus));
  const lists: Record<MineTab, HistoryItem[]> = { today: todayList, scheduled, past: ended };
  const pastLimit = pastPager.key === sessionKey ? pastPager.n : PAGE;
  const endedCounts = countBy(ended, (c) => c.callStatus);
  const endedSummary = endedCounts.size > 1 ? ordered(endedCounts, ENDED_ORDER).map((s) => ({ s, label: statusSpecOf(callMap, s)?.label ?? s, n: endedCounts.get(s) ?? 0 })) : [];

  const nextStart = scheduled.map(startMs).find((ms) => ms >= nowMs) ?? Number.POSITIVE_INFINITY;
  const recheckAt = minute > 0 && nextStart - nowMs <= RECHECK_WINDOW ? nextStart : 0;
  useEffect(() => {
    if (!recheckAt) return;
    const h = setTimeout(refreshHistory, Math.max(0, recheckAt - Date.now()) + RECHECK_DELAY);
    return () => clearTimeout(h);
  }, [recheckAt, refreshHistory]);

  const tabs = TABS.filter((k) => k !== "all" || canSeeAll);
  const tabLabel = (k: Tab) => (k === "today" ? t("statToday") : k === "scheduled" ? t("scheduledGroup") : k === "past" ? t("endedGroup") : t("scopeTab.all"));
  const headTitle = mineTab === "today" ? t("todayAgenda") : mineTab === "scheduled" ? t("scheduledGroup") : t("endedGroup");
  const emptyText = mineTab === "today" ? t("todayEmpty") : mineTab === "scheduled" ? x("scheduledEmpty") : t("pastEmpty");
  const ready = history !== null && !histErr;

  useEffect(() => {
    const el = document.getElementById(`${uid}-tab-${tab}`);
    const box = el?.parentElement;
    if (!el || !box || box.scrollWidth <= box.clientWidth + 1) return;
    const shift = el.getBoundingClientRect().left - box.getBoundingClientRect().left;
    box.scrollLeft += shift - (box.clientWidth - el.offsetWidth) / 2;
  }, [tab, uid, ready]);

  function pickTab(k: Tab) {
    setTabPick(k);
    saveTab(k);
  }

  function onTabKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const i = Math.max(0, tabs.indexOf(tab));
    const n = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    pickTab(tabs[n]);
    document.getElementById(`${uid}-tab-${tabs[n]}`)?.focus();
  }

  function goCreate() {
    setCreating(true);
    window.setTimeout(() => {
      const el = sideRef.current?.querySelector<HTMLInputElement>("[data-mtg-title]");
      if (!el) return;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
      el.focus({ preventScroll: true });
    }, 0);
  }

  function rejoin(c: HistoryItem) {
    setActive({ roomId: c.roomId, callId: c.callId, callType: c.callType, isCaller: c.callerUserId === sessionId, title: c.title || undefined, lk: null });
  }

  const listBody = () => {
    if (history === null) {
      return (
        <div className="opx-mtg-skel" aria-busy="true">
          <i className="opx-shim" />
          <i className="opx-shim" />
          <i className="opx-shim" />
        </div>
      );
    }
    if (histErr?.missing) {
      return (
        <div className="opx-mtg-state" role="status">
          <span className="opx-mtg-state__ic" aria-hidden="true">
            <IcMeeting size={26} />
          </span>
          <h4>{t("historyUnavailable")}</h4>
          <p>{t("historyUnavailableText")}</p>
          <button type="button" className="opx-pbtn" onClick={() => void reloadHistory()} disabled={refreshing}>
            <IcRefresh size={16} />
            {tn("retry")}
          </button>
        </div>
      );
    }
    if (histErr) {
      const why = reasonOf(histErr.error);
      return (
        <div className="opx-mtg-state is-bad" role="alert">
          <h4>{t("historyLoadFailed")}</h4>
          {why ? <p>{why}</p> : null}
          <button type="button" className="opx-pbtn" onClick={() => void reloadHistory()} disabled={refreshing}>
            <IcRefresh size={16} />
            {tn("retry")}
          </button>
        </div>
      );
    }
    if (!all.length) {
      return (
        <div className="opx-mtg-state">
          <span className="opx-mtg-state__ic" aria-hidden="true">
            <IcMeeting size={26} />
          </span>
          <h4>{t("historyEmpty")}</h4>
          <p>{t("historyEmptyText")}</p>
          {canHost ? (
            <button type="button" className="opx-pbtn opx-pbtn--main" onClick={goCreate}>
              <IcPlus size={17} />
              {t("newMeeting")}
            </button>
          ) : null}
        </div>
      );
    }
    const items = mineTab === "past" ? ended.slice(0, pastLimit) : lists[mineTab];
    if (!items.length) {
      return (
        <div className="opx-mtg-state is-quiet">
          <span className="opx-mtg-state__ic" aria-hidden="true">
            <IcCalendar size={24} />
          </span>
          <p>{emptyText}</p>
        </div>
      );
    }
    return (
      <>
        <Timeline items={items} minute={minute} sessionId={sessionId} uid={uid} canDetail={canSeeAll} mixed={mineTab === "today"} onJoin={rejoin} onDetail={setDetailId} />
        {mineTab === "past" && ended.length > pastLimit ? (
          <button type="button" className="opx-pbtn opx-mtg-more" onClick={() => setPastPager({ key: sessionKey, n: pastLimit + PAGE })}>
            {t("showMore", { n: ended.length - pastLimit })}
          </button>
        ) : null}
      </>
    );
  };

  return (
    <div className="opx-mtg" data-ai-target="callcenter:meetings">
      <header className="opx-mtg-head">
        <h2>{t("title")}</h2>
        <div className="opx-mtg-tabs" role="tablist" aria-label={t("scopeTabs")} data-ai-id="admin.meetings.scope" onKeyDown={onTabKey}>
          {tabs.map((k) => {
            const on = tab === k;
            const n = k !== "all" && ready ? lists[k].length : null;
            return (
              <button
                key={k}
                id={`${uid}-tab-${k}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={`${uid}-panel`}
                tabIndex={on ? 0 : -1}
                className={on ? "is-on" : undefined}
                onClick={() => pickTab(k)}
              >
                {k === "today" && liveCount ? <i className="opx-mtg-pulse" aria-hidden="true" /> : null}
                {tabLabel(k)}
                {n !== null ? <b className="opx-num">{n}</b> : null}
              </button>
            );
          })}
        </div>
        {canHost ? (
          <button type="button" className="opx-mtg-cta" onClick={goCreate}>
            <IcPlus size={18} />
            {t("newMeeting")}
          </button>
        ) : null}
      </header>

      {liveCount && tab !== "today" ? (
        <button type="button" className="opx-mtg-livebar" onClick={() => pickTab("today")}>
          <i className="opx-mtg-pulse" aria-hidden="true" />
          <span>{t("activeGroup")}</span>
          <b className="opx-num">{liveCount}</b>
          <IcArrowRight size={16} />
        </button>
      ) : null}

      <div className="opx-mtg-grid" data-solo={creating ? undefined : ""}>
        <section id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${tab}`} className="opx-mtg-panel">
          <div className="opx-mtg-panel__view" hidden={tab === "all"} data-ai-target="seller:meeting-list">
            <div className="opx-mtg-panel__head">
              <span className="opx-mtg-box__ic" aria-hidden="true">
                <IcCalendar size={19} />
              </span>
              <h3>{headTitle}</h3>
              {ready ? <b className="opx-mtg-count opx-num">{lists[mineTab].length}</b> : null}
              {mineTab === "past" && ready && endedSummary.length ? (
                <span className="opx-mtg-sum">
                  {endedSummary.map((e) => (
                    <span key={e.s} data-tone={END_TONE[e.s]}>
                      {e.label}
                      <b className="opx-num">{e.n}</b>
                    </span>
                  ))}
                </span>
              ) : null}
              <button
                type="button"
                className="opx-mtg-icon opx-mtg-panel__sync"
                onClick={() => void reloadHistory()}
                disabled={refreshing || history === null}
                aria-busy={refreshing || history === null || undefined}
                aria-label={t("refresh")}
                title={t("refresh")}
                data-ai-id="admin.meetings.refresh"
              >
                <IcRefresh size={17} />
              </button>
            </div>
            {listBody()}
          </div>
          {canSeeAll && platOn ? (
            <div className="opx-mtg-panel__view" hidden={tab !== "all"}>
              <AllMeetings minute={minute} onOpen={setDetailId} />
            </div>
          ) : null}
        </section>

        {canHost ? (
          <div className="opx-mtg-side" ref={sideRef} hidden={!creating}>
            <NewMeeting onOpen={setActive} />
            <QuickStart onOpen={setActive} />
          </div>
        ) : null}
      </div>

      {canSeeAll && detailId ? <CallDetail key={detailId} id={detailId} onClose={() => setDetailId(null)} /> : null}

      {active
        ? createPortal(
            <CallRoom
              roomId={active.roomId}
              callId={active.callId}
              callType={active.callType}
              isCaller={active.isCaller}
              title={active.title}
              lk={active.lk}
              onEnd={() => setActive(null)}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
