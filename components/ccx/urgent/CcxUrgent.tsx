"use client";

import "../panel/panel.css";
import "./urgent.css";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  claimUrgentRequest,
  createUrgentMeeting,
  getCcUrgentRequest,
  isMissingRoute,
  isUrgentEvent,
  joinCall,
  listCcUrgentRequests,
  type CallSession,
  type LiveKitJoin,
  type UrgentRequest,
} from "@/lib/services/backend";
import { onUserSocketResync, subscribeUserEvents, subscribeUserSocketState } from "@/lib/userSocket";
import { ApiError, errDetail, isRoleDenied, logApiError } from "@/lib/http";
import { notify } from "@/lib/toast";
import { useAuth } from "@/lib/auth";
import CallRoom from "@/components/chat/CallRoom";
import { Loading, Note } from "../panel/bits";
import UrgentAssignedPanel from "@/components/portal/UrgentAssignedPanel";
import { IcArrowLeft, IcInbox, IcPipeline, IcRefresh } from "../icons";
import { FINAL, KINDS, OFFLINE_POLL_MS, PAGE, VIEWS, inView, isFinal, kindName, ntfId, sorterFor, type Ask, type Change, type Step } from "./model";
import { useNarrow } from "./parts";
import UrgentCard from "./UrgentCard";
import UrgentDetail from "./UrgentDetail";
import Select from "@/components/Select";
import { useAiField } from "@/lib/ai/registry";

type State = { status: "loading" | "ready" | "error" | "forbidden" | "missing"; items: UrgentRequest[]; error?: unknown };
type Meeting = { roomId: string; callId: string; title: string; lk: LiveKitJoin | null; caller: boolean };
type Pending = { id: string; act: Step };

function MobileSheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    box.current?.focus({ preventScroll: true });
    const root = document.documentElement;
    root.classList.add("opx-sheet-open");
    return () => {
      root.classList.remove("opx-sheet-open");
      back?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="opx-ug-sheet" role="dialog" aria-modal="true" aria-label={label} ref={box} tabIndex={-1}>
      {children}
    </div>,
    document.body,
  );
}

// `duty`: the duty lawyer's workspace opens on this queue and has no general
// queue board, so "All queues" would only lead back here.
export default function CcxUrgent({ duty = false }: { duty?: boolean } = {}) {
  const t = useTranslations("admin.urgent");
  const tl = useTranslations("crm.leads");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const x = useTranslations("admin.ccx.urgent");
  const tp = useTranslations("admin.ccx.panel");
  const tk = useTranslations("portal.client.urgent");
  const tn = useTranslations("common.notify");
  const params = useSearchParams();
  const urlId = params.get("id") ?? "";
  const narrow = useNarrow();
  const { session } = useAuth();
  const me = session?.id ?? "";

  const [kind, setKind] = useState("");
  const [channel, setChannel] = useState("");
  const [view, setView] = useState("active");
  const [state, setState] = useState<State>({ status: "loading", items: [] });
  const [busyId, setBusyId] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [pick, setPick] = useState(urlId);
  const [seenUrl, setSeenUrl] = useState(urlId);
  const [followId, setFollowId] = useState(urlId);
  const [ask, setAsk] = useState<Ask>({ id: "", act: "", n: 0 });
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [live, setLive] = useState(true);
  const [shown, setShown] = useState(PAGE);
  const listKey = `${view}|${kind}|${channel}`;
  const [seenKey, setSeenKey] = useState(listKey);
  if (listKey !== seenKey) {
    setSeenKey(listKey);
    setShown(PAGE);
  }
  if (urlId !== seenUrl) {
    setSeenUrl(urlId);
    if (urlId) {
      setPick(urlId);
      setFollowId(urlId);
      setPending(null);
    }
  }

  const seq = useRef(0);
  const held = useRef(0);
  useEffect(() => {
    held.current = state.status === "ready" ? state.items.length : 0;
  }, [state]);

  const load = useCallback(
    function loadList(): Promise<boolean> {
      const my = ++seq.current;
      return listCcUrgentRequests()
        .then((items) => {
          if (my !== seq.current) return false;
          setState({ status: "ready", items });
          return true;
        })
        .catch((e) => {
          const forbidden = e instanceof ApiError && (e.status === 401 || e.status === 403);
          const missing = isMissingRoute(e);
          logApiError("urgent queue", e);
          if (my !== seq.current) return false;
          const keep = !missing && !forbidden && held.current > 0;
          if (keep) {
            notify.error(t("notify.listFailed"), {
              id: "urgent-queue-load",
              error: e,
              action: {
                label: tn("retry"),
                onClick: () =>
                  void loadList().then((ok) => {
                    if (ok) notify.success(t("notify.listRefreshed"), { id: "urgent-queue-load" });
                  }),
              },
            });
          }
          setState((s) => ({
            status: missing ? "missing" : forbidden ? "forbidden" : keep ? "ready" : "error",
            items: keep ? s.items : [],
            error: e,
          }));
          return false;
        });
    },
    [t, tn],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const reload = useRef(load);
  useEffect(() => {
    reload.current = load;
  }, [load]);
  useEffect(() => {
    const offEvents = subscribeUserEvents((e) => {
      if (!isUrgentEvent(e.event)) return;
      void reload.current();
    });
    const offSync = onUserSocketResync(() => void reload.current());
    const offState = subscribeUserSocketState((s) => setLive(s === "online"));
    return () => {
      offEvents();
      offSync();
      offState();
    };
  }, []);

  useEffect(() => {
    if (live) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void reload.current();
    }, OFFLINE_POLL_MS);
    return () => clearInterval(timer);
  }, [live]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const follow = useCallback(
    (next: string): string => {
      void load();
      if (!next || next === view) return "";
      const final = FINAL.has(next);
      if (view === "active") return final ? t("movedToArchive") : "";
      if (view === "archive" && final) return "";
      const to = VIEWS.find((v) => v.value === next) ?? VIEWS.find((v) => v.value === (final ? "archive" : "active"));
      if (!to || to.value === view) return "";
      setView(to.value);
      return t("movedTo", { status: t(to.key) });
    },
    [view, load, t],
  );

  function refreshNow() {
    if (refreshing) return;
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }

  function report(c: Change) {
    const moved = follow(c.status || "");
    notify.success(c.title, { id: ntfId(c.id), body: [c.body, moved].filter(Boolean).join(" ") || undefined });
  }

  const ready = state.status === "ready";
  const scoped = useMemo(() => state.items.filter((r) => (!kind || r.serviceKind === kind) && (!channel || r.channel === channel)), [state.items, kind, channel]);
  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.value, scoped.filter((r) => inView(r, v.value)).length])), [scoped]);
  const rows = useMemo(() => scoped.filter((r) => inView(r, view)).sort(sorterFor(view)), [scoped, view]);

  if (followId && ready) {
    const hit = state.items.find((r) => r.id === followId);
    setFollowId("");
    if (hit && !inView(hit, view)) setView(isFinal(hit) ? "archive" : "active");
  }

  if (!narrow && !pick && !pending && rows.length) setPick(rows[0].id);

  const shownId = pick;

  const rootRef = useRef<HTMLDivElement>(null);
  const status = state.status;
  useEffect(() => {
    const root = rootRef.current;
    const stage = root?.closest<HTMLElement>(".opx-stage");
    if (!root || !stage || narrow) return;
    const fit = () => {
      const split = root.querySelector<HTMLElement>(".opx-ug-split");
      if (!split) return;
      const top = split.getBoundingClientRect().top - stage.getBoundingClientRect().top + stage.scrollTop;
      root.style.setProperty("--ug-fit", `${Math.max(420, Math.round(stage.clientHeight - top - 76))}px`);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    const bar = root.querySelector(".opx-ug-bar");
    if (bar) ro.observe(bar);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--ug-fit");
    };
  }, [narrow, status]);

  const deepSeen = useRef("");
  useEffect(() => {
    if (status !== "ready" || !urlId || deepSeen.current === urlId) return;
    const el = rootRef.current?.querySelector<HTMLElement>(`.opx-ug-card[data-ai-entity-id="${CSS.escape(urlId)}"]`);
    if (!el) return;
    deepSeen.current = urlId;
    el.scrollIntoView({ block: "nearest" });
  }, [status, urlId, rows]);

  function select(id: string, act: Step = "") {
    if (dirty && id !== shownId) {
      setPending({ id, act });
      return;
    }
    setPending(null);
    setPick(id);
    setAsk((a) => ({ id: act ? id : "", act, n: a.n + 1 }));
  }

  function discard() {
    if (!pending) return;
    setDirty(false);
    setPick(pending.id);
    setAsk((a) => ({ id: pending.act ? pending.id : "", act: pending.act, n: a.n + 1 }));
    setPending(null);
  }

  function rescope(apply: () => void) {
    apply();
    if (dirty) return;
    setPick("");
    setPending(null);
    setAsk((a) => ({ id: "", act: "", n: a.n + 1 }));
  }

  // The filters are handmade dropdowns now: the robot fills them through the registry.
  useAiField("call_center.urgent-advokat.filters.kind", {
    get: () => kind,
    set: (value) => {
      const w = value.trim().toLowerCase();
      const hit = KINDS.find((k) => k === w || (tk.has(`kinds.${k}`) && tk(`kinds.${k}`).toLowerCase() === w));
      if (hit) rescope(() => setKind(hit));
    },
  });
  useAiField("call_center.urgent-advokat.filters.channel", {
    get: () => channel,
    set: (value) => {
      const w = value.trim().toLowerCase();
      const hit = w === "video" || w === tk("chVideo").toLowerCase() ? "video" : w === "chat" || w === tk("chChat").toLowerCase() ? "chat" : "";
      if (hit) rescope(() => setChannel(hit));
    },
  });

  const closeSheet = useCallback(() => {
    if (dirty) {
      setPending({ id: "", act: "" });
      return;
    }
    setPick("");
  }, [dirty]);

  const openMeeting = useCallback(
    (call: CallSession, r: UrgentRequest) => {
      setMeeting({
        roomId: call.roomId || r.secureChatRoomId,
        callId: call.id,
        title: tk.has(`kinds.${r.serviceKind}`) ? tk(`kinds.${r.serviceKind}`) : r.serviceTitle || r.serviceKind,
        lk: call.livekitToken ? { url: call.livekitUrl, room: call.livekitRoom, token: call.livekitToken, hints: call.hints, quality: call.quality } : null,
        caller: true,
      });
    },
    [tk],
  );

  async function claim(r: UrgentRequest) {
    if (busyId) return;
    setBusyId(r.id);
    try {
      const out = await claimUrgentRequest(r.id);
      select(r.id);
      report({ id: r.id, title: t("notify.claimed"), body: out.secureChatRoomId ? t("notify.chatOpened") : undefined, status: out.status });
    } catch (e) {
      logApiError("urgent claim", e);
      notify.error(t("notify.claimFailed"), { id: ntfId(r.id), error: e, map: errDetail(e) ? undefined : { 409: t("alreadyTaken") } });
    } finally {
      setBusyId("");
    }
  }

  async function meet(r: UrgentRequest) {
    if (busyId) return;
    setBusyId(r.id);
    try {
      openMeeting(await createUrgentMeeting(r.id), r);
      report({ id: r.id, title: t("meetingStarted"), status: (await getCcUrgentRequest(r.id).catch(() => null))?.status || "" });
    } catch (e) {
      logApiError("urgent meeting", e);
      notify.error(t("notify.meetingFailed"), { id: ntfId(r.id), error: e });
    } finally {
      setBusyId("");
    }
  }

  const meetRef = useRef(meet);
  useEffect(() => {
    meetRef.current = meet;
  });

  async function join(r: UrgentRequest) {
    if (busyId) return;
    if (!r.callId || !r.secureChatRoomId) {
      void meet(r);
      return;
    }
    setBusyId(r.id);
    try {
      const lk = await joinCall(r.secureChatRoomId, r.callId);
      setMeeting({ roomId: r.secureChatRoomId, callId: r.callId, title: tk.has(`kinds.${r.serviceKind}`) ? tk(`kinds.${r.serviceKind}`) : r.serviceTitle || r.serviceKind, lk, caller: false });
    } catch (e) {
      logApiError("urgent meeting join", e);
      const ended = e instanceof ApiError && e.status === 409 && !/pause/i.test(e.detail ?? "");
      notify.error(t("notify.joinFailed"), {
        id: ntfId(r.id),
        error: e,
        map: ended ? { 409: t("notify.meetingEnded") } : undefined,
        action: ended && r.channel !== "chat" ? { label: t("startMeeting"), onClick: () => void meetRef.current(r) } : undefined,
      });
      if (ended) void load();
    } finally {
      setBusyId("");
    }
  }

  const head = (
    <header className="opx-ug-head">
      {duty ? null : (
        <Link href="/admin/call-center?view=queues" className="opx-ug-back">
          <IcArrowLeft size={16} />
          {x("back")}
        </Link>
      )}
      <h2>{x("title")}</h2>
      {state.status !== "forbidden" && state.status !== "missing" ? (
        <button type="button" className={`opx-ug-sync${refreshing ? " is-busy" : ""}`} onClick={refreshNow} aria-label={t("refresh")} title={t("refresh")} aria-busy={refreshing} data-ai-id="call_center.urgent-advokat.refresh">
          <IcRefresh size={17} />
        </button>
      ) : null}
    </header>
  );

  // Live backend (2026-11-03): a duty lawyer's operator queue still answers
  // 403 "Ruxsat yo'q" while GET /urgent-advokat/requests/assigned answers 200
  // with their urgent work, so the duty desk shows that list instead of a
  // dead end. role_page_access_denied is left to RoleNavHost's redirect.
  if (duty && state.status === "forbidden" && !isRoleDenied(state.error)) {
    return (
      <div className="opx-ug" data-ai-target="callcenter:urgent">
        <Note tone="info">{x("dutyAssigned")}</Note>
        <UrgentAssignedPanel />
      </div>
    );
  }

  if (state.status === "forbidden" || state.status === "missing") {
    return (
      <div className="opx-ug" data-ai-target="callcenter:urgent">
        {head}
        <Note tone="info">{x("unavailable")}</Note>
      </div>
    );
  }

  const viewLabel = (v: (typeof VIEWS)[number]) => t(v.key);
  const kindOpts = [{ value: "", label: t("allKinds") }, ...KINDS.map((k) => ({ value: k, label: tk.has(`kinds.${k}`) ? tk(`kinds.${k}`) : k }))];
  const channelOpts = [
    { value: "", label: t("allChannels") },
    { value: "video", label: tk("chVideo") },
    { value: "chat", label: tk("chChat") },
  ];
  const visible = rows.slice(0, shown);
  const rest = rows.length - visible.length;
  const seed = state.items.find((r) => r.id === shownId) ?? null;
  const sheetLabel = seed ? [kindName(tk, seed), seed.workId].filter(Boolean).join(" · ") : t("openDetail");

  const warn = pending ? (
    <p className="opx-sheet__warn opx-ug-warn" role="alert">
      <span>{tp("unsaved")}</span>
      <button type="button" onClick={discard}>
        {tp("discard")}
      </button>
      <button type="button" onClick={() => setPending(null)}>
        {tp("keep")}
      </button>
    </p>
  ) : null;

  const detail = shownId ? (
    <UrgentDetail key={shownId} id={shownId} seed={seed} ask={ask} onClose={narrow ? closeSheet : undefined} onChanged={report} onMeeting={openMeeting} onDirty={setDirty} onJoin={(r) => void join(r)} />
  ) : null;

  return (
    <div ref={rootRef} className="opx-ug" id="cc-urgent" data-ai-target="callcenter:urgent" data-ai-id="call_center.urgent-advokat.queue" data-ai-label={t("title")}>
      {head}

      <div className="opx-ug-bar">
        <div className="opx-ug-tabs" role="group" aria-label={t("fStatus")} data-ai-id="call_center.urgent-advokat.tabs">
          {VIEWS.filter((v) => !ready || view === v.value || v.value === "active" || (counts[v.value] ?? 0) > 0).map((v) => (
            <button
              key={v.value}
              type="button"
              className={`opx-ug-tab${view === v.value ? " is-on" : ""}`}
              aria-pressed={view === v.value}
              onClick={() => rescope(() => setView(v.value))}
              data-ai-id={`call_center.urgent-advokat.tab.${v.value}`}
            >
              {viewLabel(v)}
              {ready ? <b className="opx-num">{counts[v.value] ?? 0}</b> : null}
            </button>
          ))}
        </div>
        <button type="button" className="opx-pbtn opx-ug-filterbtn" aria-expanded={filtersOpen || !!kind || !!channel} onClick={() => setFiltersOpen((o) => !o)}>
          <IcPipeline size={16} />
          {tl("filter")}
        </button>
        <div className="opx-ug-filters" hidden={!(filtersOpen || !!kind || !!channel)} data-ai-id="call_center.urgent-advokat.filters">
          <span className="opx-ug-filter" data-ai-id="call_center.urgent-advokat.filters.kind">
            <Select value={kind} onChange={(v) => rescope(() => setKind(v))} ariaLabel={t("fKind")} options={kindOpts} />
          </span>
          <span className="opx-ug-filter" data-ai-id="call_center.urgent-advokat.filters.channel">
            <Select value={channel} onChange={(v) => rescope(() => setChannel(v))} ariaLabel={t("fChannel")} options={channelOpts} />
          </span>
        </div>
      </div>

      <div className="opx-ug-split">
        <div className="opx-ug-list" data-ai-target="callcenter:urgent-list">
          {state.status === "loading" ? (
            <div className="opx-ug-shims" aria-busy="true" aria-label={t("title")}>
              <i className="opx-shim" />
              <i className="opx-shim" />
              <i className="opx-shim" />
            </div>
          ) : state.status === "error" ? (
            <div className="opx-ug-err" role="alert">
              <p>
                <b>{t("loadError")}</b>
                {errDetail(state.error) ? <small>{errDetail(state.error)}</small> : null}
              </p>
              <button type="button" className="opx-pbtn opx-ug-sm" onClick={refreshNow}>
                <IcRefresh size={15} />
                {tn("retry")}
              </button>
            </div>
          ) : !rows.length ? (
            <div className="opx-ug-empty">
              <IcInbox size={30} />
              <b>{t("empty")}</b>
            </div>
          ) : (
            <>
              {visible.map((r, i) => (
                <UrgentCard
                  key={r.id}
                  r={r}
                  me={me}
                  index={i}
                  on={r.id === shownId}
                  busy={busyId === r.id}
                  onSelect={() => select(r.id)}
                  onClaim={() => void claim(r)}
                  onJoin={() => void join(r)}
                  onMeet={() => void meet(r)}
                  onStep={(act) => select(r.id, act)}
                />
              ))}
              {rest > 0 ? (
                <button type="button" className="opx-pbtn opx-ug-moreb" onClick={() => setShown((n) => n + PAGE)} data-ai-id="call_center.urgent-advokat.more">
                  {t("showMore", { n: rest })}
                </button>
              ) : null}
            </>
          )}
        </div>

        {narrow ? null : (
          <aside className="opx-ug-panel" aria-label={sheetLabel}>
            {warn}
            {state.status === "loading" && !shownId ? (
              <Loading label={t("openDetail")} />
            ) : detail ?? (
              <div className="opx-ug-panel__none">
                <IcInbox size={30} />
                <p>{x("pick")}</p>
              </div>
            )}
          </aside>
        )}
      </div>

      {narrow && (shownId || pending) ? (
        <MobileSheet label={sheetLabel} onClose={closeSheet}>
          {warn}
          {detail}
        </MobileSheet>
      ) : null}

      {meeting
        ? createPortal(
            <CallRoom roomId={meeting.roomId} callId={meeting.callId} callType="video" isCaller={meeting.caller} title={meeting.title} lk={meeting.lk} onEnd={() => setMeeting(null)} />,
            document.body,
          )
        : null}
    </div>
  );
}
