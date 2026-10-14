"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth, canMakeCalls, sessionRoles } from "@/lib/auth";
import { createSecureChat, startCall, listAdminCalls, getAdminCallDetail, type AdminCallDetail, type AdminCallRow, type LiveKitJoin } from "@/lib/services/backend";
import { http, asArr, asDict, asNum, asStr, ApiError, parseServerTime } from "@/lib/http";
import { notify } from "@/lib/toast";
import { useResource } from "@/lib/useResource";
import { dateTimeFull, fmtDate, fmtDateTime, fmtDuration, localDay as localDayKey, shortDateTime, timeOnly } from "@/lib/date";
import { initials } from "@/lib/lawyers";
import { makeInviteSearch } from "@/lib/inviteSearch";
import { matchesSearch } from "@/lib/searchText";
import { useAiSelection } from "@/lib/ai/registry";
import SearchSelect from "@/components/SearchSelect";
import FilterBar from "@/components/filters/FilterBar";
import CallRoom from "@/components/chat/CallRoom";
import Modal from "@/components/admin/Modal";
import DatePicker from "@/components/DatePicker";
import { Skeleton, EmptyState, ErrorState } from "@/components/portal/DataState";
import FieldError from "@/components/ui/FieldError";
import ListPager, { usePaged } from "@/components/ui/ListPager";
import Tabs, { tabDomId, useTabMemory } from "@/components/ui/Tabs";
import IconButton from "@/components/ui/IconButton";
import InlineAlert from "@/components/ui/InlineAlert";
import ScrollCue from "@/components/ui/ScrollCue";
import { CountBadge, StatusBadge } from "@/components/ui/Badge";
import MiniCalendar, { type MiniCalEvent } from "@/components/portal/MiniCalendar";
import { IconVideo, IconClock, IconRefresh, IconUsers, IconUser, IconCalendar, IconPlus, IconMoreHorizontal, IconPhone, IconClipboardCheck, IconSearch, IconChevronRight, IconChevronDown } from "@/components/icons";
import { regionLabel, humanize, statusMap, statusSpecOf, type StatusMap, type StatusTone, type StatusToneRule } from "@/lib/labels";
import { subscribeUserEvents } from "@/lib/userSocket";

const DETAIL_SHOWN = 8;
const PART_JOINED = new Set(["joined", "left"]);
const PART_ORDER: Record<string, number> = { joined: 1, left: 2, invited: 3 };
const PART_TONE: Record<string, StatusTone> = { joined: "ok", left: "neutral", invited: "info", declined: "err", removed: "err", kicked: "err" };
const CALL_TONES: Readonly<Record<string, StatusToneRule>> = {
  active: { tone: "ok", dot: "live" },
  scheduled: "info",
  ended: "neutral",
  expired: "warn",
  cancelled: "err",
};
const SCOPES = ["mine", "all"] as const;
type Scope = (typeof SCOPES)[number];
const SCOPE_STORE = "admin-meetings-scope";

const minuteSubs = new Set<() => void>();
let minuteTimer: ReturnType<typeof setInterval> | undefined;
function subscribeMinute(cb: () => void) {
  minuteSubs.add(cb);
  if (minuteSubs.size === 1) minuteTimer = setInterval(() => minuteSubs.forEach((fn) => fn()), 15000);
  return () => {
    minuteSubs.delete(cb);
    if (!minuteSubs.size) clearInterval(minuteTimer);
  };
}
const readMinute = () => Math.floor(Date.now() / 60000);
const serverMinute = () => 0;

const PHONE_QUERY = "(max-width: 640px)";
function subscribePhone(cb: () => void) {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const readPhone = () => window.matchMedia(PHONE_QUERY).matches;
const serverPhone = () => false;

const domSafe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "");

function useCallStatusMap(): StatusMap {
  const t = useTranslations("admin.meetings");
  return statusMap(t, "callStatus", CALL_TONES);
}

const partRank = (p: { role: string; status: string }) => (p.role === "host" ? 0 : PART_ORDER[p.status] ?? 4);
const avatarText = (name: string) => initials(name.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).join(" "));

function sameDay(a: string, b: string): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return !Number.isNaN(x.getTime()) && !Number.isNaN(y.getTime()) && x.toDateString() === y.toDateString();
}

// Platform-wide meeting detail (superadmin/leads.manage tab only) — any
// user's meeting, not just this account's own. GET /admin/calls/:id.
function CallDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useTranslations("admin.callHistory");
  const tm = useTranslations("admin.meetings");
  const tc = useTranslations("call");
  const locale = useLocale();
  const callMap = useCallStatusMap();
  const [d, setD] = useState<AdminCallDetail | null>(null);
  const [err, setErr] = useState<{ error: unknown } | null>(null);
  const [tick, setTick] = useState(0);
  const [allFor, setAllFor] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const h = setTimeout(() => { setD(null); setErr(null); }, 0);
    getAdminCallDetail(id).then((x) => alive && setD(x)).catch((e: unknown) => alive && setErr({ error: e }));
    return () => { alive = false; clearTimeout(h); };
  }, [id, tick]);
  const row = (k: string, v?: string | number | null) => (v === undefined || v === null || v === "" ? null : (
    <div className="dkv__row" key={k}><span>{k}</span><b>{String(v)}</b></div>
  ));
  const close = () => {
    setAllFor(null);
    setD(null);
    setErr(null);
    onClose();
  };
  const partStatus = (s: string) => (t.has(`detail.pstatus.${s}`) ? t(`detail.pstatus.${s}`) : tc.has(`pstatus.${s}`) ? tc(`pstatus.${s}`) : humanize(s));
  const partMap: StatusMap = Object.fromEntries(Object.entries(PART_TONE).map(([s, tone]) => [s, { label: partStatus(s), tone }]));
  const partRole = (r: string) =>
    r === "host" ? tc("hostLabel") : t.has(`detail.role.${r}`) ? t(`detail.role.${r}`) : tc.has(`role.${r}`) ? tc(`role.${r}`) : t("detail.role.participant");

  const body = () => {
    if (!d) return null;
    const c = d.call;
    const people = d.participants
      .map((p, i) => ({ p, i }))
      .sort((a, b) => partRank(a.p) - partRank(b.p) || a.i - b.i)
      .map((x) => x.p);
    const guests = d.participants.some((p) => p.role === "host") ? d.participants.filter((p) => p.role !== "host") : d.participants;
    const joined = guests.filter((p) => PART_JOINED.has(p.status)).length;
    const secs = d.durationSeconds || Math.round(d.durationMinutes * 60) || c.durationSeconds;
    const start = c.startedAt || c.createdAt;
    const facts = [
      start ? fmtDate(start, locale) : "",
      c.status !== "scheduled" ? fmtDuration(secs, locale) : "",
      guests.length ? t("detail.joinedOf", { joined, invited: guests.length }) : "",
    ].filter(Boolean);
    const all = allFor === id;
    const shown = all ? people : people.slice(0, DETAIL_SHOWN);
    const hidden = people.length - DETAIL_SHOWN;
    return (
      <div className="dkv">
        {c.status || facts.length ? (
          <div className="mdet__sum" aria-label={t("detail.summary")} role="group">
            <StatusBadge status={c.status} map={callMap} />
            {facts.length ? (
              <ul className="mdet__facts">
                {facts.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div className="dkv__sect">
          <b>{t("detail.meeting")}</b>
          {/* LEXGO_PUBLIC_WORK_IDS_FRONTEND.md: CALL-83JVE. */}
          {row(t("detail.workId"), c.workId)}
          {row(t("detail.type"), tm.has(`formatLabel.${c.callType}`) ? tm(`formatLabel.${c.callType}`) : humanize(c.callType))}
          {d.room?.title ? row(t("detail.room"), d.room.title) : null}
          {row(t("detail.started"), fmtDateTime(c.startedAt, locale))}
          {row(t("detail.endedAt"), c.endedAt && c.startedAt && sameDay(c.startedAt, c.endedAt) ? timeOnly(c.endedAt, locale) : fmtDateTime(c.endedAt, locale))}
        </div>
        <div className="dkv__sect">
          <b>{t("detail.creator")}</b>
          {row(t("detail.name"), d.creator?.name || c.creatorName)}
          {row(t("detail.phone"), d.creator?.phone)}
        </div>
        <div className="dkv__sect">
          <b>{t("detail.participants")} ({people.length})</b>
          {people.length ? (
            <>
              <ul className="mdet__ppl">
                {shown.map((p, i) => (
                  <li key={p.userId || `p${i}`} className="mdet__p">
                    <span className="mdet__av" aria-hidden="true">{avatarText(p.name) || <IconUser style={{ width: 16, height: 16 }} />}</span>
                    <span className="mdet__pm">
                      <b>{p.name.trim() || t("detail.noName")}</b>
                      <small>{partRole(p.role)}</small>
                    </span>
                    <StatusBadge status={p.status} map={partMap} fallback={p.status ? partStatus(p.status) : undefined} className="mdet__pst" />
                  </li>
                ))}
              </ul>
              {hidden > 0 ? (
                <button type="button" className="btn btn--line btn--sm mdet__more" aria-expanded={all} onClick={() => setAllFor(all ? null : id)}>
                  {all ? t("detail.less") : t("detail.more", { n: hidden })}
                </button>
              ) : null}
            </>
          ) : <p className="advmuted">{t("detail.noParticipants")}</p>}
        </div>
      </div>
    );
  };

  return (
    <Modal open={!!id} onClose={close} title={d?.call.title || t("detailTitle")}>
      {err ? <ErrorState compact title={t("detailError")} error={err.error} onRetry={() => setTick((n) => n + 1)} /> : !d ? <Skeleton rows={3} /> : body()}
    </Modal>
  );
}

type Active = { roomId: string; callId: string; callType: "audio" | "video"; isCaller: boolean; title?: string; lk: LiveKitJoin | null };

// One row of GET /calls/invited — every meeting this account hosted or was
// invited to (the host also has a participant record). Read raw so the list
// shows when a meeting started and who hosted it.
type HistoryItem = {
  roomId: string;
  callId: string;
  callType: "audio" | "video";
  title: string;
  callerName: string;
  callerUserId: string;
  status: string; // my participant status: invited | joined | left | declined | removed
  callStatus: string; // active | scheduled | ended | cancelled | expired
  startedAt: string;
  autoEndAt: string;
  endedAt: string;
  durationSeconds: number;
  participantCount: number;
  canStartNow: boolean | null;
};
type MineGroup = "live" | "scheduled" | "past";
type JoinState = { show: boolean; ok: boolean; why: string };
const LIVE = new Set(["active", "scheduled"]);
const OUT = new Set(["removed", "kicked", "declined"]);
const RECHECK_WINDOW = 86400000;
const RECHECK_DELAY = 1500;
const START_ID = "meeting-start";
const REFRESH_ID = "meetings-refresh";
const PLAT_REFRESH_ID = "meetings-all-refresh";
const PAGE = 20;
const ENDED_ORDER = ["ended", "expired", "cancelled"];
const STATUS_ORDER = ["active", "scheduled", "ended", "expired", "cancelled"];
const isMissing = (e: unknown) => e instanceof ApiError && [404, 405, 501].includes(e.status);
const isTransient = (e: unknown) => !(e instanceof ApiError) || e.status === 0 || (e.status >= 500 && e.status !== 501);

function localDay(value: string, shift = 0): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + shift).getTime() : null;
}
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function countBy<T>(list: T[], key: (x: T) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const x of list) {
    const k = key(x);
    if (k) out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}
const ordered = (counts: Map<string, number>, order: string[]) => [
  ...order.filter((s) => counts.has(s)),
  ...[...counts.keys()].filter((s) => !order.includes(s)),
];

async function loadHistory(): Promise<HistoryItem[]> {
  const raw = await http("/calls/invited");
  const list = Array.isArray(raw) ? raw : asArr(asDict(raw).items ?? asDict(raw).data ?? asDict(raw).calls);
  return list
    .map((v) => {
      const d = asDict(v);
      return {
        roomId: asStr(d.room_id),
        callId: asStr(d.call_id ?? d.id),
        callType: asStr(d.call_type) === "audio" ? ("audio" as const) : ("video" as const),
        title: asStr(d.title),
        callerName: asStr(d.caller_name),
        callerUserId: asStr(d.caller_user_id),
        status: asStr(d.status),
        callStatus: asStr(d.call_status ?? d.status),
        startedAt: asStr(d.started_at),
        autoEndAt: asStr(d.auto_end_at),
        endedAt: asStr(d.ended_at),
        durationSeconds: asNum(d.duration_seconds),
        participantCount: asNum(d.participant_count) || asArr(d.participants).length,
        canStartNow: typeof d.can_start_now === "boolean" ? d.can_start_now : null,
      };
    })
    .filter((c) => c.roomId && c.callId);
}

function secondsOf(c: HistoryItem): number {
  if (c.durationSeconds > 0) return c.durationSeconds;
  const a = parseServerTime(c.startedAt);
  const b = parseServerTime(c.endedAt);
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? (b - a) / 1000 : 0;
}

const startMs = (c: HistoryItem) => {
  const at = parseServerTime(c.startedAt);
  return Number.isFinite(at) ? at : Number.POSITIVE_INFINITY;
};

// Meeting launcher shared by /admin/meetings (call-center, managers) and the
// seller portals: name the meeting, pick invitees, start → the LiveKit room
// opens inline. Below it, the meetings this account hosted or was invited to,
// active ones first with a re-join button.
// `rich`: the fuller portal layout (hero, stat tiles, today's agenda, mini
// calendar, history as a table) — opt-in so the shared admin/call-center
// usage of this same launcher keeps its plain, compact layout unchanged.
export default function MeetingLauncher({ rich = false }: { rich?: boolean }) {
  const t = useTranslations("admin.meetings");
  const tch = useTranslations("admin.callHistory");
  const tc = useTranslations("call");
  const tn = useTranslations("common.notify");
  const tpc = useTranslations("portal.common");
  const te = useTranslations("enums");
  const locale = useLocale();
  const { session } = useAuth();
  const sessionId = session?.id ?? "";
  const sessionKey = session ? session.id || session.phone || "-" : "";
  const seller = session?.role === "advocate" || session?.role === "lawyer";
  const [title, setTitle] = useState("");
  const [picks, setPicks] = useState<string[]>([]);
  const [pickNames, setPickNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pickErr, setPickErr] = useState("");
  const [howOpen, setHowOpen] = useState(false);
  const pickErrId = useId();
  const scopeIds = `mhist${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const uid = `ml${domSafe(useId())}`;
  const minute = useSyncExternalStore(subscribeMinute, readMinute, serverMinute);
  const phone = useSyncExternalStore(subscribePhone, readPhone, serverPhone);
  const labelCache = useRef(new Map<string, string>());
  const callMap = useCallStatusMap();
  const pickBox = useRef<HTMLDivElement>(null);
  const startRef = useRef<() => void>(() => undefined);
  const [active, setActive] = useState<Active | null>(null);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [histErr, setHistErr] = useState<{ missing: boolean; error: unknown } | null>(null);
  const [histTick, setHistTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // The former standalone /admin/call-history page — every meeting on the
  // platform, not just this account's own — folded in as a second tab here
  // instead of a separate nav entry, gated the same way that page's nav link
  // used to be (superadmin, or the leads.manage permission).
  const canSeeAllHistory = !rich && (sessionRoles(session).includes("superadmin") || (session?.permissions ?? []).includes("leads.manage"));
  const [scopeMemo, pickScope] = useTabMemory<Scope>(canSeeAllHistory ? SCOPE_STORE : undefined, SCOPES, "mine");
  const histTab: Scope = canSeeAllHistory && scopeMemo === "all" ? "all" : "mine";
  const [platOn, setPlatOn] = useState(false);
  if (histTab === "all" && !platOn) setPlatOn(true);
  const [platFrom, setPlatFrom] = useState("");
  const [platTo, setPlatTo] = useState("");
  const [platQuery, setPlatQuery] = useState("");
  const [platStatus, setPlatStatus] = useState("");
  const [platBusy, setPlatBusy] = useState(false);
  const fromStart = localDay(platFrom);
  const toEnd = localDay(platTo, 1);
  const apiFrom = fromStart === null ? undefined : utcDay(fromStart);
  const apiTo = toEnd === null ? undefined : utcDay(toEnd - 1);
  const platKey = `${apiFrom ?? ""}|${apiTo ?? ""}`;
  const platKeyRef = useRef(platKey);
  const platReloadRef = useRef<() => void>(() => undefined);
  const platRes = useResource(
    () => (platOn ? listAdminCalls({ from: apiFrom, to: apiTo }) : Promise.resolve<AdminCallRow[]>([])),
    [platOn, apiFrom, apiTo],
  );
  const [platDetail, setPlatDetail] = useState<string | null>(null);
  useAiSelection("admin_meetings_scope", canSeeAllHistory ? histTab : "");
  const searchRef = useRef<ReturnType<typeof makeInviteSearch> | null>(null);
  const clientLabel = tc("inviteClient");

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

  // History: reloaded on mount, after every meeting and on demand. A backend
  // without /calls/invited (404/405/501) gets an honest notice, not an error.
  // The first load also resumes a meeting I host after a reload (the call
  // itself is only in memory); a meeting I merely joined is offered again by
  // IncomingCallWatcher's resume card instead.
  const resumedRef = useRef(false);
  const shownRef = useRef(false);
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
        try { raw = sessionStorage.getItem("lexgo_active_call"); } catch { raw = null; }
        if (!raw) return;
        let stored: { roomId?: string; callId?: string } | null = null;
        try { stored = JSON.parse(raw); } catch { stored = null; }
        if (!stored?.roomId || !stored?.callId) return;
        const c = list.find((x) => x.callId === stored!.callId);
        if (!c || !LIVE.has(c.callStatus) || OUT.has(c.status)) {
          try { sessionStorage.removeItem("lexgo_active_call"); } catch { /* ignore */ }
          return;
        }
        if (c.callerUserId === me) setActive({ roomId: stored.roomId, callId: stored.callId, callType: c.callType, isCaller: true, title: c.title || undefined, lk: null });
      })
      .catch((e) => {
        if (!alive || (shownRef.current && !isMissing(e))) return;
        failHistory(e);
      });
    return () => { alive = false; };
  }, [sessionKey, sessionId, active, histTick, takeHistory, failHistory]);

  useEffect(() => () => {
    notify.dismiss(START_ID);
    notify.dismiss(REFRESH_ID);
    notify.dismiss(PLAT_REFRESH_ID);
  }, []);

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

  async function reloadPlat() {
    if (platBusy || platRes.status === "loading") return;
    notify.dismiss(PLAT_REFRESH_ID);
    setPlatBusy(true);
    const key = platKey;
    try {
      if (platRes.status === "error") {
        await platRes.refresh();
        return;
      }
      const rows = await listAdminCalls({ from: apiFrom, to: apiTo });
      if (platKeyRef.current === key) platRes.setData(rows);
    } catch (e) {
      if (platKeyRef.current !== key) return;
      notify.error(t("refreshFailed"), {
        id: PLAT_REFRESH_ID,
        error: e,
        action: isTransient(e) ? { label: tn("retry"), onClick: () => platReloadRef.current() } : undefined,
      });
    } finally {
      setPlatBusy(false);
    }
  }

  useEffect(() => {
    platKeyRef.current = platKey;
    platReloadRef.current = () => void reloadPlat();
  });

  // Staff search any platform user; sellers (no /users/search) get lawyers +
  // their own clients — see lib/inviteSearch.
  function searchOptions(q: string) {
    if (!searchRef.current) searchRef.current = makeInviteSearch({ clientLabel, regionLabel: (v) => regionLabel(te, v), exclude: () => (session?.id ? [session.id] : []), roleLabel: (r) => t(`role.${r}`) });
    return searchRef.current(q).then((list) => {
      for (const o of list) labelCache.current.set(o.value, o.label === "—" ? "" : o.label);
      return list;
    });
  }

  function changePicks(v: string[]) {
    setPicks(v);
    setPickNames(Object.fromEntries(v.map((id) => [id, labelCache.current.get(id) ?? ""])));
    if (v.length) setPickErr("");
  }

  function resetForm() {
    setTitle("");
    setPicks([]);
    setPickNames({});
    setPickErr("");
  }

  const firstName = picks.length ? (pickNames[picks[0]] ?? "").trim() : "";
  const autoTitle = firstName
    ? picks.length > 1
      ? t("defaultTitleMore", { name: firstName, n: picks.length - 1 })
      : t("defaultTitle", { name: firstName })
    : t("defaultTitleNoName");

  async function start() {
    if (busy || !session) return;
    // Backend allows a meeting with any count (even host-only); require at least
    // one invitee so the room has a counterpart.
    if (picks.length < 1) {
      setPickErr(t("needParticipants"));
      pickBox.current?.querySelector<HTMLElement>("input")?.focus();
      return;
    }
    notify.dismiss(START_ID);
    setBusy(true);
    try {
      // A meeting lives under a secure-chat room (no payment for staff/sellers).
      // A seller hosts as the room's seller side with the first invitee as the
      // client side; staff take the client side themselves. All picks are invited.
      const room = await createSecureChat(
        seller
          ? { client_user_id: picks[0], seller_user_id: session.id }
          : { client_user_id: session.id || picks[0], seller_user_id: picks[0] },
      );
      const name = title.trim() || autoTitle;
      const call = await startCall(room.id, "video", name, {
        participantUserIds: picks,
        maxDurationMinutes: 60,
      });
      setActive({
        roomId: room.id,
        callId: call.id,
        callType: "video",
        isCaller: true,
        title: name,
        lk: call.livekitToken ? { url: call.livekitUrl, room: call.livekitRoom, token: call.livekitToken, hints: call.hints, quality: call.quality } : null,
      });
    } catch (e) {
      notify.error(t("startFailed"), {
        id: START_ID,
        error: e,
        map: { 402: t("planLimit"), 403: t("noPermission"), 405: t("backendMissing"), 501: t("backendMissing") },
        action: isTransient(e) ? { label: tn("retry"), onClick: () => startRef.current() } : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    startRef.current = () => void start();
  });

  function rejoin(c: HistoryItem) {
    setActive({ roomId: c.roomId, callId: c.callId, callType: c.callType, isCaller: c.callerUserId === session?.id, title: c.title || undefined, lk: null });
  }

  const effectiveHistory = history ?? [];
  const live = effectiveHistory.filter((c) => LIVE.has(c.callStatus));
  const liveNow = effectiveHistory.filter((c) => c.callStatus === "active");
  const scheduled = effectiveHistory.filter((c) => c.callStatus === "scheduled").sort((a, b) => startMs(a) - startMs(b));
  const ended = effectiveHistory.filter((c) => !LIVE.has(c.callStatus));
  const minePager = usePaged(ended, PAGE, sessionKey);
  const platInRange =
    fromStart === null && toEnd === null
      ? platRes.data
      : platRes.data.filter((c) => {
          const ts = new Date(c.startedAt || c.createdAt).getTime();
          return Number.isNaN(ts) || ((fromStart === null || ts >= fromStart) && (toEnd === null || ts < toEnd));
        });
  const platMatched = platQuery.trim() ? platInRange.filter((c) => matchesSearch(`${c.title} ${c.creatorName}`, platQuery)) : platInRange;
  const platCounts = countBy(platMatched, (c) => c.status);
  const platFound = ordered(platCounts, STATUS_ORDER);
  const platStatuses = platStatus && !platFound.includes(platStatus) ? [...platFound, platStatus] : platFound;
  const platList = platStatus ? platMatched.filter((c) => c.status === platStatus) : platMatched;
  const platFilterKey = [platQuery.trim(), platStatus, platFrom, platTo].join("|");
  const platPager = usePaged(platList, PAGE, platFilterKey);
  const nowMs = minute * 60000;
  const nextStart = scheduled.map(startMs).find((ms) => ms >= nowMs) ?? Number.POSITIVE_INFINITY;
  const recheckAt = minute > 0 && nextStart - nowMs <= RECHECK_WINDOW ? nextStart : 0;
  useEffect(() => {
    if (!recheckAt) return;
    const h = setTimeout(refreshHistory, Math.max(0, recheckAt - Date.now()) + RECHECK_DELAY);
    return () => clearTimeout(h);
  }, [recheckAt, refreshHistory]);

  if (active) {
    return (
      <CallRoom
        roomId={active.roomId}
        callId={active.callId}
        callType={active.callType}
        isCaller={active.isCaller}
        title={active.title}
        lk={active.lk}
        onEnd={() => {
          setActive(null);
          resetForm();
        }}
      />
    );
  }

  const canHost = canMakeCalls(session);
  const canDetail = canSeeAllHistory;
  const statusOf = (s: string) => statusSpecOf(callMap, s)?.label ?? "";
  const thisYear = localDayKey(new Date()).slice(0, 4);
  const when = (iso: string) => fmtDateTime(iso, locale, localDayKey(iso).slice(0, 4) !== thisYear);
  const shortWhen = (iso: string) => {
    const s = localDayKey(iso).slice(0, 4) !== thisYear ? dateTimeFull(iso, locale) : shortDateTime(iso, locale);
    return locale === "ru" || locale === "en" ? s : s.replace(/^(\d{1,2}) (\p{L}+)/u, (_m, d: string, mon: string) => `${d}-${mon.toLowerCase()}`);
  };
  const rowWhen = (iso: string) => (phone ? shortWhen(iso) : when(iso));
  const today = minute ? localDayKey(nowMs) : "";
  const isToday = (iso: string) => Boolean(today) && localDayKey(iso) === today;
  const clock = (iso: string) => (isToday(iso) ? timeOnly(iso, locale) : when(iso));
  const endedCounts = countBy(ended, (c) => c.callStatus);
  const endedSummary = endedCounts.size > 1
    ? ordered(endedCounts, ENDED_ORDER)
        .map((s) => `${statusOf(s)} ${endedCounts.get(s)}`)
        .join(" · ")
    : "";

  const startsIn = (iso: string) => {
    const at = parseServerTime(iso);
    if (!minute || !Number.isFinite(at)) return "";
    if (Math.floor(at / 60000) <= minute) return "";
    const mins = Math.ceil((at - nowMs) / 60000);
    if (mins <= 0) return "";
    if (mins < 60) return t("startsInMin", { n: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 48) return t("startsInHour", { n: hours });
    return t("startsInDay", { n: Math.floor(hours / 24) });
  };

  const joinState = (c: HistoryItem): JoinState => {
    if (!LIVE.has(c.callStatus) || OUT.has(c.status)) return { show: false, ok: false, why: "" };
    const at = parseServerTime(c.startedAt);
    if (c.callStatus === "scheduled" && Number.isFinite(at) && Math.floor(at / 60000) > minute) {
      return {
        show: true,
        ok: false,
        why: isToday(c.startedAt) ? t("opensAt", { time: timeOnly(c.startedAt, locale) }) : t("opensOn", { date: when(c.startedAt) }),
      };
    }
    if (c.canStartNow === false) return { show: true, ok: false, why: t("joinClosed") };
    return { show: true, ok: true, why: "" };
  };
  const whyId = (c: HistoryItem) => `${uid}-why-${domSafe(c.callId)}`;

  const joinControl = (c: HistoryItem, label: string) => {
    const js = joinState(c);
    if (!js.show) return null;
    return (
      <div className="mjoin">
        <button type="button" className="btn btn--line btn--sm" onClick={() => rejoin(c)} disabled={!js.ok} aria-describedby={js.why ? whyId(c) : undefined}>
          {c.callType === "audio" ? <IconPhone /> : <IconVideo />}
          {label}
        </button>
        {js.why ? <span id={whyId(c)} className="mjoin__why">{js.why}</span> : null}
      </div>
    );
  };

  function goCreate() {
    const el = titleRef.current;
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  }

  const moreButton = (left: number, onMore: () => void) =>
    left > 0 ? (
      <div className="mmore">
        <button type="button" className="btn btn--line btn--sm" onClick={onMore}>
          {t("showMore", { n: left })}
        </button>
      </div>
    ) : null;

  const emptyHistory = (
    <div className="mempty">
      <EmptyState icon={<IconVideo />} title={t("historyEmpty")} text={t("historyEmptyText")} />
      {canHost ? (
        <button type="button" className="btn btn--pri btn--sm" onClick={goCreate}>
          <IconPlus />
          {t("newMeeting")}
        </button>
      ) : null}
    </div>
  );

  // Local calendar day on both sides of the comparison: toISOString() is UTC,
  // and in UTC+5 that makes everything after 19:00 count as tomorrow.
  const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayStr = dayKey(new Date());
  const todayItems = effectiveHistory.filter((c) => {
    if (!c.startedAt) return false;
    const d = new Date(c.startedAt);
    return !Number.isNaN(d.getTime()) && dayKey(d) === todayStr;
  });
  const calEvents: MiniCalEvent[] = effectiveHistory
    .filter((c) => c.startedAt)
    .map((c) => ({ id: c.callId, date: c.startedAt, label: c.title || t("untitled"), sub: c.callerName || undefined }));
  const durationOf = (c: HistoryItem) => fmtDuration(secondsOf(c), locale);

  const metaItem = (key: string, node: ReactNode, cls?: string) => (
    <span key={key} className={cls}>{node}</span>
  );
  const peopleItem = (n: number) =>
    n > 0
      ? metaItem(
          "ppl",
          <span className="mrow__chip"><IconUsers aria-hidden="true" />{tch("participantCount", { n })}</span>,
        )
      : null;

  const rowView = (o: {
    key: string;
    icon: ReactNode;
    on?: boolean;
    live?: boolean;
    out?: boolean;
    title: string;
    meta: ReactNode[];
    act?: ReactNode;
    open?: () => void;
  }) => {
    const cls = ["mrow", o.live ? "mrow--live" : "", o.out ? "mrow--out" : "", o.act ? "mrow--act" : "", o.open ? "mrow--open" : ""].filter(Boolean).join(" ");
    const body = (
      <>
        <span className={`mlist__ic${o.on ? " on" : ""}`} aria-hidden="true">{o.icon}</span>
        <span className="mrow__m">
          <span className="mrow__t" title={o.title}>{o.title}</span>
          {o.meta.length ? <span className="mrow__meta">{o.meta}</span> : null}
        </span>
        {o.act ?? null}
        {o.open ? <IconChevronRight className="mrow__go" aria-hidden="true" /> : null}
      </>
    );
    return (
      <li key={o.key}>
        {o.open ? (
          <button type="button" className={cls} onClick={o.open} aria-haspopup="dialog">{body}</button>
        ) : (
          <div className={cls}>{body}</div>
        )}
      </li>
    );
  };

  const mineRow = (c: HistoryItem, group: MineGroup) => {
    const mine = c.callerUserId === sessionId;
    const out = OUT.has(c.status);
    const audio = c.callType === "audio";
    const meta: ReactNode[] = [];
    if (group === "live" && c.startedAt) meta.push(metaItem("when", t("since", { time: clock(c.startedAt) })));
    if (group === "scheduled" && c.startedAt) {
      const left = startsIn(c.startedAt);
      meta.push(
        metaItem(
          "when",
          <>
            <span className="mrow__nw">{t("startsAt", { time: clock(c.startedAt) })}</span>
            {left ? <span className="mrow__nw">{left}</span> : null}
          </>,
          "mrow__wrap",
        ),
      );
    }
    if (group === "past") {
      if (c.startedAt) meta.push(metaItem("when", rowWhen(c.startedAt)));
      const dur = fmtDuration(secondsOf(c), locale);
      if (dur) meta.push(metaItem("dur", dur));
    }
    const ppl = peopleItem(c.participantCount);
    if (ppl) meta.push(ppl);
    if (!mine) meta.push(metaItem("host", t("hostedBy", { name: c.callerName || tc("someone") }), "mrow__wrap mrow__host"));
    if (out) meta.push(metaItem("out", c.status === "declined" ? t("youDeclined") : t("youRemoved"), "mrow__out"));
    if (group === "past" && c.callStatus && c.callStatus !== "ended") {
      meta.push(metaItem("st", <StatusBadge status={c.callStatus} map={callMap} size="sm" />, "mrow__st"));
    }
    const act = group === "past" ? null : joinControl(c, t("join"));
    return rowView({
      key: c.callId,
      icon: audio ? <IconPhone /> : group === "scheduled" ? <IconCalendar /> : <IconVideo />,
      on: group === "live" && !out,
      live: group === "live" && !out,
      out,
      title: c.title || t("untitled"),
      meta,
      act,
      open: !act && canDetail ? () => setPlatDetail(c.callId) : undefined,
    });
  };

  const platRow = (c: AdminCallRow, i: number) => {
    const start = c.startedAt || c.createdAt;
    const meta: ReactNode[] = [];
    if (start) meta.push(metaItem("when", rowWhen(start)));
    const dur = fmtDuration(c.durationSeconds, locale);
    if (dur) meta.push(metaItem("dur", dur));
    const ppl = peopleItem(c.participantCount);
    if (ppl) meta.push(ppl);
    if (c.creatorName) meta.push(metaItem("host", c.creatorName, "mrow__wrap"));
    if (c.status && c.status !== platStatus) meta.push(metaItem("st", <StatusBadge status={c.status} map={callMap} size="sm" />, "mrow__st"));
    return rowView({
      key: c.id || `p${i}`,
      icon: c.callType === "audio" ? <IconPhone /> : c.status === "scheduled" ? <IconCalendar /> : <IconVideo />,
      on: c.status === "active",
      title: c.title || tch("untitled"),
      meta,
      open: c.id ? () => setPlatDetail(c.id) : undefined,
    });
  };

  const formBody = (wide: boolean) =>
    canHost ? (
      <form
        className={`cform mform${wide ? " mform--wide" : ""}`}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void start();
        }}
      >
        <div>
          <label htmlFor={`${uid}-title`}>{t("titleLabel")}</label>
          <input
            id={`${uid}-title`}
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={picks.length ? autoTitle : t("titlePh")}
            autoComplete="off"
            enterKeyHint="go"
          />
        </div>
        <div ref={pickBox} data-invalid={pickErr ? "true" : undefined}>
          <label>{t("participants")}</label>
          <SearchSelect
            value={picks}
            onChange={changePicks}
            onSearch={searchOptions}
            placeholder={t("participantsPh")}
            searchPlaceholder={t("participantsSearch")}
            emptyText={t("participantsEmpty")}
            hint={t("participantsHint")}
            ariaLabel={t("participants")}
            invalid={!!pickErr}
            describedBy={pickErr ? pickErrId : undefined}
          />
          <FieldError id={pickErrId} msg={pickErr} />
        </div>
        <p className="advmuted mform__hint">{seller ? t("sellerHint") : t("hint")}</p>
        <div className="mform__acts">
          <button className="btn btn--pri" type="submit" disabled={busy} aria-busy={busy || undefined}>
            <IconVideo />
            {busy ? t("starting") : t("start")}
          </button>
          {rich && (title || picks.length) ? (
            <button className="btn btn--line" type="button" onClick={resetForm}>
              <IconRefresh />
              {t("clear")}
            </button>
          ) : null}
          {!rich ? <span className="mform__enter">{t("enterHint")}</span> : null}
        </div>
      </form>
    ) : (
      <InlineAlert tone="locked" className="mcreate__lock">{t("noPermission")}</InlineAlert>
    );

  const historyBody =
    history === null ? (
      <Skeleton rows={3} />
    ) : histErr?.missing ? (
      <InlineAlert title={t("historyUnavailable")} action={{ label: tn("retry"), onClick: reloadHistory }}>
        {t("historyUnavailableText")}
      </InlineAlert>
    ) : histErr ? (
      <ErrorState title={t("historyLoadFailed")} error={histErr.error} onRetry={reloadHistory} />
    ) : null;

  if (!rich) {
    const showMine = histTab === "mine";
    const dayLabel = (iso: string) => (iso ? fmtDateTime(iso, locale, iso.slice(0, 4) !== thisYear) : "…");
    const platChip = platFrom || platTo ? (platFrom && platFrom === platTo ? dayLabel(platFrom) : `${dayLabel(platFrom)} – ${dayLabel(platTo)}`) : null;
    const platFiltered = Boolean(platQuery.trim() || platStatus || platFrom || platTo);
    const refreshBusy = showMine ? refreshing || history === null : platBusy || platRes.status === "loading";
    const mineCount = history !== null && !histErr ? history.length : null;
    const allCount = platOn && platRes.status === "ready" ? platInRange.length : null;
    const bodyId = `${scopeIds}-body`;
    const refreshButton = (
      <IconButton
        label={t("refresh")}
        icon={<IconRefresh />}
        onClick={showMine ? () => void reloadHistory() : () => void reloadPlat()}
        busy={refreshBusy}
        tipAlign="end"
        aiId="admin.meetings.refresh"
      />
    );
    const liveBlock = (
      <section className="mlive" aria-labelledby={`${uid}-live`} data-ai-id="admin.meetings.live" data-ai-type="section" data-ai-label={t("activeGroup")}>
        <h3 id={`${uid}-live`} className="mgrp__h">
          <i className={`mlist__dot${liveNow.length ? "" : " mlist__dot--off"}`} aria-hidden="true" />
          {t("activeGroup")}
          {liveNow.length ? <CountBadge n={liveNow.length} /> : null}
        </h3>
        {history === null ? (
          <Skeleton rows={1} />
        ) : histErr ? (
          <p className="advmuted mlive__note">{t("liveUnavailable")}</p>
        ) : liveNow.length ? (
          <ul className="mrows">{liveNow.map((c) => mineRow(c, "live"))}</ul>
        ) : (
          <p className="advmuted mlive__note">{t("liveEmpty")}</p>
        )}
      </section>
    );
    const howId = `${uid}-how`;
    const howTo = (
      <div className={`mhow${phone ? " mhow--fold" : ""}`}>
        {phone ? (
          <button type="button" className="mhow__toggle" aria-expanded={howOpen} aria-controls={howId} onClick={() => setHowOpen((v) => !v)}>
            <span>{t("howTitle")}</span>
            <IconChevronDown aria-hidden="true" />
          </button>
        ) : (
          <h3 className="mhow__h">{t("howTitle")}</h3>
        )}
        <ol id={howId} className="mhow__list" hidden={phone && !howOpen}>
          <li>{t("how1")}</li>
          <li>{t("how2")}</li>
          <li>{t("how3")}</li>
        </ol>
      </div>
    );
    return (
      <div className="mlaunch">
        <section className="ppanel mnew" data-ai-target="meetings:create" aria-labelledby={`${uid}-new`}>
          <div className="mnew__head">
            <h2 id={`${uid}-new`} className="ppanel__t mnew__t"><span className="pico"><IconPlus /></span>{t("newMeeting")}</h2>
            <p className="advmuted">{t("subtitle")}</p>
          </div>
          <div className="mnew__grid">
            <div className="mnew__main">{formBody(false)}</div>
            <div className="mnew__side">
              {liveBlock}
              {canHost ? howTo : null}
            </div>
          </div>
        </section>
        <div className="ppanel mhist">
          <div className="ppanel__h mhist__h">
            <h2 className="ppanel__t"><span className="pico"><IconClock /></span>{canSeeAllHistory ? tch("title") : t("history")}</h2>
            {canSeeAllHistory ? (
              <Tabs<Scope>
                idPrefix={scopeIds}
                items={[
                  { key: "mine", label: t("scopeTab.mine"), count: mineCount },
                  { key: "all", label: t("scopeTab.all"), count: allCount },
                ]}
                value={histTab}
                onChange={pickScope}
                controls={bodyId}
                label={t("scopeTabs")}
                aiId="admin.meetings.scope"
                reveal={{ mine: "seller:meeting-list" }}
                end={refreshButton}
                className="mhist__tabs"
              />
            ) : (
              <div className="mhist__end">
                {mineCount !== null ? <CountBadge n={mineCount} /> : null}
                {refreshButton}
              </div>
            )}
          </div>
          <div
            id={canSeeAllHistory ? bodyId : undefined}
            role={canSeeAllHistory ? "tabpanel" : undefined}
            aria-labelledby={canSeeAllHistory ? tabDomId(scopeIds, histTab) : undefined}
            className="mhist__body"
          >
            <div hidden={!showMine} data-ai-target="seller:meeting-list">
              {historyBody ??
                (!effectiveHistory.length ? (
                  emptyHistory
                ) : (
                  <div className="mlist">
                    {scheduled.length ? (
                      <section className="mlist__grp" aria-labelledby={`${uid}-sch`}>
                        <h3 id={`${uid}-sch`} className="mgrp__h">
                          <IconCalendar aria-hidden="true" />
                          {t("scheduledGroup")}
                          <CountBadge n={scheduled.length} />
                        </h3>
                        <ul className="mrows">{scheduled.map((c) => mineRow(c, "scheduled"))}</ul>
                      </section>
                    ) : null}
                    {ended.length ? (
                      <section className="mlist__grp" aria-labelledby={`${uid}-past`}>
                        <div className="mlist__gh">
                          <h3 id={`${uid}-past`} className="mgrp__h">
                            {t("endedGroup")}
                            <CountBadge n={ended.length} />
                          </h3>
                          {endedSummary ? <span className="mlist__sum">{endedSummary}</span> : null}
                        </div>
                        <ul className="mrows">{minePager.visible.map((c) => mineRow(c, "past"))}</ul>
                        <ListPager {...minePager.bind} less />
                      </section>
                    ) : null}
                    {!scheduled.length && !ended.length ? <p className="advmuted">{t("pastEmpty")}</p> : null}
                  </div>
                ))}
            </div>
            {canSeeAllHistory && platOn ? (
              <div hidden={showMine}>
                <FilterBar
                  className="uf--tray"
                  fields={[
                    {
                      key: "status",
                      label: tpc("filterStatus"),
                      icon: IconClipboardCheck,
                      value: platStatus,
                      empty: "",
                      onChange: setPlatStatus,
                      options: [
                        { value: "", label: tpc("filterAllStatuses") },
                        ...platStatuses.map((s) => ({ value: s, label: `${statusOf(s)} (${platCounts.get(s) ?? 0})` })),
                      ],
                    },
                    {
                      key: "from",
                      label: tch("from"),
                      icon: IconCalendar,
                      active: Boolean(platFrom || platTo),
                      chip: platChip,
                      clear: () => {
                        setPlatFrom("");
                        setPlatTo("");
                      },
                      node: <DatePicker value={platFrom} onChange={setPlatFrom} placeholder={tch("from")} ariaLabel={tch("from")} max={platTo || undefined} clearLabel={tch("clearDates")} />,
                    },
                    {
                      key: "to",
                      label: tch("to"),
                      icon: IconCalendar,
                      chip: null,
                      node: <DatePicker value={platTo} onChange={setPlatTo} placeholder={tch("to")} ariaLabel={tch("to")} min={platFrom || undefined} clearLabel={tch("clearDates")} />,
                    },
                  ]}
                  search={{ value: platQuery, onChange: setPlatQuery, placeholder: tch("searchPh") }}
                  count={platRes.status === "ready" ? platList.length : undefined}
                />
                <p className="advmuted" style={{ marginBottom: 16 }}>{tch("lead")}</p>
                {platRes.status === "loading" ? (
                  <Skeleton rows={4} />
                ) : platRes.status === "error" ? (
                  <ErrorState title={t("historyLoadFailed")} error={platRes.error} onRetry={platRes.refresh} />
                ) : !platList.length ? (
                  platFiltered ? (
                    <EmptyState icon={<IconSearch />} title={tch("noMatch")} text={tch("noMatchText")} />
                  ) : (
                    <EmptyState icon={<IconVideo />} title={tch("empty")} text={tch("emptyText")} />
                  )
                ) : (
                  <>
                    <ul className="mrows">{platPager.visible.map(platRow)}</ul>
                    <ListPager {...platPager.bind} less />
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
        {canSeeAllHistory ? <CallDetailModal id={platDetail} onClose={() => setPlatDetail(null)} /> : null}
      </div>
    );
  }

  const createForm = (
    <div className="ppanel" data-ai-target="meetings:create">
      <div className="ppanel__h">
        <b className="ppanel__t"><span className="pico"><IconPlus /></span>{t("createTitle")}</b>
      </div>
      <p className="advmuted" style={{ marginBottom: 16 }}>{t("subtitle")}</p>
      {formBody(true)}
    </div>
  );

  const tableRow = (c: HistoryItem, i: number) => {
    const mine = c.callerUserId === session?.id;
    const join = joinControl(c, c.status === "joined" || mine ? t("rejoin") : t("join"));
    return (
      <tr key={c.callId}>
        <td>{i + 1}</td>
        <td>
          <b>{c.title || t("untitled")}</b>
          <div className="advmuted" style={{ fontSize: ".78rem" }}>{mine ? t("hostedByYou") : t("hostedBy", { name: c.callerName || tc("someone") })}</div>
        </td>
        <td>
          <span className="tavstack">
            <span className="tavatar" style={{ background: "var(--grad)" }}>{(c.callerName || "?").slice(0, 2).toUpperCase()}</span>
          </span>
        </td>
        <td>{c.startedAt ? when(c.startedAt) : "—"}</td>
        <td>{durationOf(c) || "—"}</td>
        <td>
          <span className="fmticon">
            {c.callType === "audio" ? <IconPhone /> : <IconVideo />}
            {t(`formatLabel.${c.callType}`)}
          </span>
        </td>
        <td><StatusBadge status={c.callStatus} map={callMap} size="sm" /></td>
        <td>
          {join ?? (
            <span style={{ display: "inline-flex", color: "var(--gray2)" }}><IconMoreHorizontal /></span>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="mlaunch">
      <div className="mhero">
        <span className="mhero__ico"><IconVideo /></span>
        <div className="mhero__t">
          <h2 className="psec-h">{t("title")}</h2>
          <p>{t("subtitle")}</p>
        </div>
        <span className="mhero__art">
          <span className="mhero__art-cal"><IconCalendar /></span>
          <span className="mhero__art-vid"><IconVideo /></span>
        </span>
      </div>

      {history !== null && !histErr ? (
        <div className="pk">
          <div className="pk__i pk__i--ic pk__i--active">
            <span className="pk__ico"><IconCalendar /></span>
            <b>{live.length}</b>
            <span>{t("statLive")}</span>
          </div>
          <div className="pk__i pk__i--ic pk__i--neutral">
            <span className="pk__ico"><IconCalendar /></span>
            <b>{todayItems.length}</b>
            <span>{t("statToday")}</span>
          </div>
          <div className="pk__i pk__i--ic pk__i--ok">
            <span className="pk__ico"><IconClock /></span>
            <b>{ended.length}</b>
            <span>{t("statEnded")}</span>
          </div>
          <div className="pk__i pk__i--ic pk__i--warn">
            <span className="pk__ico"><IconUsers /></span>
            <b>{effectiveHistory.length}</b>
            <span>{t("statTotal")}</span>
          </div>
        </div>
      ) : null}

      <div className="mgrid3">
        {createForm}

        <div className="ppanel" data-ai-target="meetings:today">
          <div className="ppanel__h">
            <b className="ppanel__t"><span className="pico"><IconCalendar /></span>{t("todayAgenda")}</b>
          </div>
          {history === null ? (
            <Skeleton rows={2} />
          ) : histErr ? (
            <ErrorState compact error={histErr.error} />
          ) : !todayItems.length ? (
            <p className="advmuted">{t("todayEmpty")}</p>
          ) : (
            <div className="magenda">
              {todayItems.map((c) => (
                <div className="magenda__row" key={c.callId}>
                  <span className="magenda__t">{timeOnly(c.startedAt, locale)}</span>
                  <div className="magenda__m">
                    <b>{c.title || t("untitled")}</b>
                    <span>{statusOf(c.callStatus)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ppanel">
          <div className="ppanel__h">
            <b className="ppanel__t"><span className="pico"><IconCalendar /></span>{t("calendar")}</b>
          </div>
          {history === null ? (
            <Skeleton rows={3} />
          ) : histErr ? (
            <ErrorState compact error={histErr.error} />
          ) : (
            <MiniCalendar events={calEvents} />
          )}
        </div>
      </div>

      <div className="ppanel" data-ai-target="seller:meeting-list">
        <div className="ppanel__h">
          <b className="ppanel__t"><span className="pico"><IconClock /></span>{t("history")}</b>
          <button type="button" className="btn btn--line btn--sm" onClick={reloadHistory} disabled={history === null} aria-disabled={refreshing || undefined} aria-busy={refreshing || undefined}>
            <IconRefresh />{t("refresh")}
          </button>
        </div>
        {historyBody ??
          (effectiveHistory.length ? (
            <>
              <ScrollCue className="ptable__wrap">
                <table className="ptable">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("col.name")}</th>
                      <th>{t("col.participants")}</th>
                      <th>{t("col.date")}</th>
                      <th>{t("col.duration")}</th>
                      <th>{t("col.format")}</th>
                      <th>{t("col.status")}</th>
                      <th>{t("col.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...live, ...minePager.visible].map((c, i) => tableRow(c, i))}
                  </tbody>
                </table>
              </ScrollCue>
              {moreButton(minePager.rest, minePager.more)}
            </>
          ) : (
            emptyHistory
          ))}
      </div>
    </div>
  );
}
