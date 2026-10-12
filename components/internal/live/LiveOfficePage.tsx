"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { asDict, asStr } from "@/lib/http";
import { canInternal, getMyProfile } from "@/lib/services/internalHrm";
import { LIVE_STATUSES, startBusy, stopBusy, type LiveActivity, type LiveBusy, type LivePerson } from "@/lib/services/internalLive";
import Select from "@/components/Select";
import { IconChartBar, IconFlag, IconGrid, IconHourglass, IconList, IconLock, IconMapPin, IconRefresh, IconSearch, IconSliders } from "@/components/icons";
import { EntitySelect, HrmError, HrmHead, HrmLoading, HrmPanel, useHrmFormat, useNow } from "@/components/internal/HrmUi";
import { useHrmDirectory } from "@/components/internal/useHrmDirectory";
import { useLiveBoard } from "./useLiveBoard";
import LiveBoardView from "./LiveBoardView";
import LiveFloor from "./LiveFloor";
import LiveEmployeeDrawer, { type CorrectionTarget } from "./LiveEmployeeDrawer";
import LiveAnalytics from "./LiveAnalytics";
import LiveCorrections, { CorrectionForm } from "./LiveCorrections";
import LiveSettings from "./LiveSettings";
import { LiveStatus, ReasonModal, STATUS_TONE, apiMessage, shownStatus, useLiveText } from "./bits";

type Tab = "board" | "analytics" | "corrections" | "settings";
const offlinePerson = (id: string, name: string, code: string, unitId: string): LivePerson => ({ id, userId: "", name: name || code || "—", code, position: "", status: "offline", unitId, roomId: "", extraUnitIds: [], activity: null, lastSeenAt: "", since: "", busy: null, raw: {} });
const INACTIVE_AFTER = 300;

// Live Office (guide §9–§14): who is at work right now, where and on what,
// kept live over the socket; one's own busy switch; each person's day; the
// period analytics; correction requests; and, for admins, rooms,
// memberships, temporary access and the activity registry.
export default function LiveOfficePage() {
  const { t } = useLiveText();
  const f = useHrmFormat();
  const { session } = useAuth();
  const dir = useHrmDirectory();
  const now = useNow(30_000);
  const canManage = canInternal(session, "internal_org.manage") || canInternal(session, "internal_hr.manage");
  const [tab, setTab] = useState<Tab>("board");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [unitId, setUnitId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [status, setStatus] = useState("");
  const [view, setView] = useState<"floor" | "list">("floor");
  const [openId, setOpenId] = useState("");
  const [events, setEvents] = useState<{ id: string; list: LiveActivity[] }>({ id: "", list: [] });
  const [analyticsFor, setAnalyticsFor] = useState("");
  const [correction, setCorrection] = useState<CorrectionTarget | null>(null);
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [myBusy, setMyBusy] = useState<LiveBusy | null | undefined>(undefined);
  const [busyDialog, setBusyDialog] = useState<"start" | "stop" | null>(null);

  // The search box asks the backend (§9 q=) once typing settles.
  useEffect(() => {
    const id = setTimeout(() => setQuery(q.trim()), 350);
    return () => clearTimeout(id);
  }, [q]);

  const onActivity = useCallback((employeeId: string, a: LiveActivity) => {
    setEvents((cur) => (cur.id === employeeId ? { id: cur.id, list: [a, ...cur.list].slice(0, 100) } : cur));
  }, []);
  const { board, phase, error, reload, upsert } = useLiveBoard({ unitId, roomId, status, q: query }, onActivity);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("employee") || "";
    if (!id) return;
    const h = setTimeout(() => {
      setOpenId(id);
      setEvents({ id, list: [] });
    }, 0);
    return () => clearTimeout(h);
  }, []);

  useEffect(() => {
    const c = new AbortController();
    getMyProfile(c.signal)
      .then((p) => {
        const e = asDict(asDict(p).employee);
        if (!c.signal.aborted && asStr(e.id)) setMe({ id: asStr(e.id), name: asStr(e.display_name) });
      })
      .catch(() => undefined);
    return () => c.abort();
  }, []);

  const mine = board.people.find((p) => (me && p.id === me.id) || (session?.id && p.userId === session.id)) ?? null;
  const busy = myBusy === undefined ? (mine?.busy && !mine.busy.endedAt ? mine.busy : null) : myBusy;
  const myStatus = busy ? "busy" : mine ? shownStatus(mine.status, mine.lastSeenAt, now, INACTIVE_AFTER) : "online";
  const myId = me?.id || mine?.id || "";

  const unitName = useCallback((id: string) => board.units.find((u) => u.id === id)?.name || dir.unitName(id), [board.units, dir]);
  const roomName = useCallback((id: string) => board.rooms.find((r) => r.id === id)?.name || "", [board.rooms]);
  const unitOptions = useMemo(() => (dir.unitOptions.length ? dir.unitOptions : board.units.map((u) => ({ value: u.id, label: u.name, sub: u.code }))), [dir.unitOptions, board.units]);
  const roomOptions = useMemo(() => board.rooms.filter((r) => !unitId || r.unitId === unitId).map((r) => ({ value: r.id, label: r.name, sub: unitName(r.unitId) })), [board.rooms, unitId, unitName]);
  const employeeOptions = useMemo(() => (dir.employeeOptions.length ? dir.employeeOptions : board.people.map((p) => ({ value: p.id, label: p.name, sub: p.code }))), [dir.employeeOptions, board.people]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of board.people) {
      const s = shownStatus(p.status, p.lastSeenAt, now, INACTIVE_AFTER);
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [board.people, now]);
  // A person opened by link (?employee=… from the 360 drawer) who is not on
  // the board right now still gets their record, shown as offline.
  const open = board.people.find((p) => p.id === openId) ?? (openId ? offlinePerson(openId, dir.employee(openId)?.name || "", dir.employee(openId)?.code || "", dir.employee(openId)?.unitId || "") : null);
  const filtered = Boolean(query || unitId || roomId || status);
  // A grant the viewer is looking through: what and until when (§23).
  const grants = board.grants.filter((g) => g.status === "active" || !g.status);

  const openPerson = (p: LivePerson) => {
    setOpenId(p.id);
    setEvents({ id: p.id, list: [] });
  };

  return (
    <section className="hrm-page lv">
      <HrmHead
        kicker={t("kicker")}
        title={t("title")}
        lead={t("lead")}
        actions={
          <button className="btn btn--line btn--sm" type="button" onClick={reload}>
            <IconRefresh />
            {t("refresh")}
          </button>
        }
      />

      <div className={`lv-me lv-me--${STATUS_TONE[myStatus] ?? "gray"}`}>
        <div className="lv-me__t">
          <span className="hrm-kicker">{t("me.title")}</span>
          <LiveStatus value={myStatus} />
          {busy ? (
            <p>
              <b>{busy.reason}</b>
              {busy.startedAt ? <small> · {t("detail.since", { time: f.time(busy.startedAt) })}</small> : null}
            </p>
          ) : mine?.activity?.label ? (
            <p>{mine.activity.label}</p>
          ) : (
            <p className="hrm-muted">{t("me.hint")}</p>
          )}
        </div>
        <div className="lv-me__a">
          {busy ? (
            <button type="button" className="btn btn--pri btn--sm" onClick={() => setBusyDialog("stop")} disabled={!busy.id}>
              {t("busy.stop")}
            </button>
          ) : (
            <button type="button" className="btn btn--line btn--sm" onClick={() => setBusyDialog("start")}>
              <IconHourglass />
              {t("busy.start")}
            </button>
          )}
          {myId ? (
            <button type="button" className="btn btn--line btn--sm" onClick={() => setCorrection({ targetType: "employee", targetId: myId, title: "", type: "department" })}>
              <IconFlag />
              {t("corrections.wrongPlace")}
            </button>
          ) : null}
        </div>
      </div>

      {grants.length ? (
        <div className="lv-grant-note" role="note">
          <IconLock />
          <span>
            {grants.map((g) => t("grants.viewing", { scope: g.scopeName || (g.scopeType === "employee" ? t("grants.scope.employee") : unitName(g.scopeId) || t("grants.scope.org_unit")), until: f.dateTime(g.validUntil) })).join(" · ")}
          </span>
        </div>
      ) : null}

      <div className="hrm-tabs lv-tabs" role="tablist" aria-label={t("title")}>
        {(["board", "analytics", "corrections", ...(canManage ? (["settings"] as Tab[]) : [])] as Tab[]).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={tab === v} className={tab === v ? "on" : ""} onClick={() => setTab(v)}>
            {v === "board" ? <IconGrid /> : v === "analytics" ? <IconChartBar /> : v === "corrections" ? <IconFlag /> : <IconSliders />}
            {t(`tabs.${v}`)}
          </button>
        ))}
      </div>

      {tab === "board" ? (
        <>
          <div className="lv-stats" role="group" aria-label={t("filters.status")}>
            {LIVE_STATUSES.map((s) => (
              <button key={s} type="button" className={`lv-stat lv-stat--${STATUS_TONE[s]}${status === s ? " on" : ""}`} aria-pressed={status === s} onClick={() => setStatus(status === s ? "" : s)}>
                <i aria-hidden />
                <b>{counts[s] ?? 0}</b>
                <span>{t(`status.${s}`)}</span>
              </button>
            ))}
          </div>
          <div className="lv-filters">
            <div className="uf-search lv-filters__q">
              <IconSearch aria-hidden />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("filters.search")} aria-label={t("filters.search")} maxLength={80} />
            </div>
            <div className="lv-filters__sel">
              <EntitySelect value={unitId} onChange={(v) => { setUnitId(v); setRoomId(""); }} options={unitOptions} placeholder={t("filters.allUnits")} ariaLabel={t("filters.unit")} />
            </div>
            <div className="lv-filters__sel">
              <EntitySelect value={roomId} onChange={setRoomId} options={roomOptions} placeholder={t("filters.allRooms")} ariaLabel={t("filters.room")} />
            </div>
            <div className="lv-filters__sel">
              <Select value={status} onChange={setStatus} options={[{ value: "", label: t("filters.allStatuses") }, ...LIVE_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))]} ariaLabel={t("filters.status")} />
            </div>
            <div className="lv-view" role="group" aria-label={t("floor.view")}>
              <button type="button" className={view === "floor" ? "on" : ""} aria-pressed={view === "floor"} onClick={() => setView("floor")}>
                <IconMapPin />
                {t("floor.viewFloor")}
              </button>
              <button type="button" className={view === "list" ? "on" : ""} aria-pressed={view === "list"} onClick={() => setView("list")}>
                <IconList />
                {t("floor.viewList")}
              </button>
            </div>
            <span className="lv-live" title={t("live")}>
              <i aria-hidden />
              {t("live")}
            </span>
          </div>
          {error && phase === "ready" ? <HrmError text={apiMessage(error, t("errors.load"))} onRetry={reload} retryLabel={t("retry")} /> : null}
          {phase === "loading" ? (
            <HrmPanel>
              <HrmLoading rows={6} />
            </HrmPanel>
          ) : phase === "error" ? (
            <HrmError text={apiMessage(error, t("errors.load"))} onRetry={reload} retryLabel={t("retry")} />
          ) : view === "floor" ? (
            <LiveFloor board={board} now={now} inactiveAfter={INACTIVE_AFTER} onOpen={openPerson} filtered={filtered} />
          ) : (
            <LiveBoardView board={board} now={now} inactiveAfter={INACTIVE_AFTER} onOpen={openPerson} filtered={filtered} />
          )}
        </>
      ) : tab === "analytics" ? (
        <LiveAnalytics employeeId={analyticsFor} onEmployee={setAnalyticsFor} unitOptions={unitOptions} employeeOptions={employeeOptions} />
      ) : tab === "corrections" ? (
        <LiveCorrections unitName={unitName} roomName={roomName} canReview={canManage} onNew={() => setCorrection({ targetType: "employee", targetId: myId, title: "", type: "department" })} />
      ) : (
        <LiveSettings opts={{ unitOptions, employeeOptions, userOptions: dir.userOptions, unitName }} grants={board.grants} onChanged={reload} />
      )}

      {open ? (
        <LiveEmployeeDrawer
          person={open}
          onClose={() => setOpenId("")}
          canManage={canManage}
          isMe={!!myId && open.id === myId}
          unitName={unitName}
          roomName={roomName}
          inactiveAfter={INACTIVE_AFTER}
          liveEvents={events.id === open.id ? events.list : []}
          onAnalytics={(id) => {
            setOpenId("");
            setAnalyticsFor(id);
            setTab("analytics");
          }}
          onCorrect={(target) => setCorrection(target)}
          onBusyStopped={() => {
            upsert(open.id, (cur) => (cur ? { ...cur, busy: null, status: cur.status === "busy" ? "working" : cur.status } : null));
            if (open.id === myId) setMyBusy(null);
          }}
        />
      ) : null}

      {correction ? <CorrectionForm key={`${correction.targetType}-${correction.targetId}-${correction.title}`} target={correction} onClose={() => setCorrection(null)} onSent={() => undefined} unitOptions={unitOptions} roomOptions={board.rooms.map((r) => ({ value: r.id, label: r.name, sub: unitName(r.unitId) }))} /> : null}

      <ReasonModal
        open={busyDialog === "start"}
        title={t("busy.startTitle")}
        lead={t("busy.startLead")}
        label={t("busy.reason")}
        placeholder={t("busy.reasonPh")}
        submitLabel={t("busy.start")}
        onClose={() => setBusyDialog(null)}
        onSubmit={async (reason) => {
          const b = await startBusy(reason);
          setMyBusy(b ?? { id: "", reason, startedAt: new Date().toISOString(), endedAt: "", stopReason: "", raw: {} });
          if (myId) upsert(myId, (cur) => (cur ? { ...cur, status: "busy", busy: b } : null));
        }}
      />
      <ReasonModal
        open={busyDialog === "stop"}
        title={t("busy.stopTitle")}
        label={t("busy.stopReason")}
        placeholder={t("busy.stopPh")}
        submitLabel={t("busy.stop")}
        onClose={() => setBusyDialog(null)}
        onSubmit={async (reason) => {
          if (!busy?.id) return;
          await stopBusy(busy.id, reason);
          setMyBusy(null);
          if (myId) upsert(myId, (cur) => (cur ? { ...cur, busy: null, status: "working" } : null));
        }}
      />
    </section>
  );
}
