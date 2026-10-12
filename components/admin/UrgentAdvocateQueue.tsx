"use client";

import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import {
  listCcUrgentRequests,
  getCcUrgentRequest,
  claimUrgentRequest,
  assignUrgentGroup,
  createUrgentMeeting,
  completeUrgentRequest,
  setUrgentStatus,
  cancelUrgentRequest,
  transferUrgentRequest,
  listUrgentCandidates,
  searchUrgentCandidates,
  urgentAssignRefusal,
  isUrgentEvent,
  urgentEventInfo,
  isMissingRoute,
  type UrgentRequest,
  type UrgentCandidate,
  type UrgentEligibleSource,
  type CallSession,
  type LiveKitJoin,
} from "@/lib/services/backend";
import { subscribeUserEvents, subscribeUserSocketState, onUserSocketResync } from "@/lib/userSocket";
import { ApiError, errDetail, logApiError } from "@/lib/http";
import { notify, notifyStore } from "@/lib/toast";
import { useAuth, sessionRoles } from "@/lib/auth";
import { dateTimeFull } from "@/lib/date";
import { statusLabel, regionLabel, regionKeyOf, humanize, labelOf, statusMap, statusSpecOf, type StatusMap, type StatusToneRule } from "@/lib/labels";
import { fmtUzs } from "@/lib/money";
import { aiId, aiSeg } from "@/lib/ai/ids";
import { useAiField, useAiSelection } from "@/lib/ai/registry";
import { useAiReveal } from "@/lib/guide/targets";
import { Link } from "@/i18n/navigation";
import FilterBar from "@/components/filters/FilterBar";
import Select from "@/components/Select";
import DatePicker from "@/components/DatePicker";
import TimePicker from "@/components/TimePicker";
import CheckBox from "@/components/CheckBox";
import Modal from "@/components/admin/Modal";
import FieldError from "@/components/ui/FieldError";
import ListPager, { usePaged } from "@/components/ui/ListPager";
import { Badge, CountBadge, StatusBadge, WorkId } from "@/components/ui/Badge";
import IconButton from "@/components/ui/IconButton";
import { useScrollEdges } from "@/lib/useScrollEdges";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { isCoarsePointer, usePopover } from "@/lib/usePopover";
import { VoiceNotePlayer } from "@/components/portal/AttachmentPreview";
import { Skeleton, EmptyState, ErrorState } from "@/components/portal/DataState";
import CallRoom from "@/components/chat/CallRoom";
import {
  IconBolt,
  IconVideo,
  IconChat,
  IconUsers,
  IconScale,
  IconRefresh,
  IconClock,
  IconCheck,
  IconAlert,
  IconCalendar,
  IconUser,
  IconPhone,
  IconMapPin,
  IconFileText,
  IconMic,
  IconStar,
  IconShieldCheck,
  IconHeadset,
  IconClose,
  IconChevronRight,
  IconVideoConsult,
  IconExpressCall,
  IconTrafficCase,
  IconChatConsult,
  IconSecondOpinion,
  IconOpinionPanel,
  IconBriefcase,
  IconChatDots,
  IconChevronDown,
  IconMoreHorizontal,
} from "@/components/icons";

// LEXGO_URGENT_ADVOKAT_FRONTEND_UPDATE.md — the call-center side of "Tezkor
// Advokat". One board: claim a request (which opens the private secure chat
// and notifies the client), open its detail, pick the advocates for a group
// second opinion off the backend's own ranked candidate list, start the
// 30-minute LiveKit meeting, move the status and write the result.
//
// The board does not poll. Every step of the flow emits an `urgent_advokat.*`
// event on /ws/users/me and the MD is explicit about what to do with it —
// "har sekund polling qilish kerak emas. WS event kelganda list/detailni
// refetch qilish yetarli" — so a refetch is driven by the event, plus one
// after a dropped socket reconnects. The slow interval below only runs while
// the socket is actually offline.
const OFFLINE_POLL_MS = 45_000;
const KINDS = [
  "video_consultation",
  // Routed to whoever is on duty (payload.assignment_mode = on_duty_pool).
  "express_video_consultation",
  "traffic_accident_consultation",
  "chat_consultation",
  "second_opinion_single",
  "second_opinion_group",
] as const;
const VIEWS: { value: string; key: string; archive: boolean }[] = [
  { value: "active", key: "viewActive", archive: false },
  { value: "open_pool", key: "tabOpenPool", archive: false },
  { value: "claimed", key: "tabClaimed", archive: false },
  { value: "scheduled", key: "tabScheduled", archive: false },
  { value: "in_progress", key: "tabInProgress", archive: false },
  { value: "meeting_active", key: "tabMeetingActive", archive: false },
  { value: "archive", key: "viewArchive", archive: true },
  { value: "completed", key: "tabCompleted", archive: true },
  { value: "cancelled", key: "tabCancelled", archive: true },
];
const FINAL = new Set(["completed", "cancelled", "expired"]);
const PAGE = 20;
const statusOf = (r: UrgentRequest) => r.status || "open_pool";
const isFinal = (r: UrgentRequest) => (r.finalStatuses.length ? r.finalStatuses.includes(statusOf(r)) : FINAL.has(statusOf(r)));
const inView = (r: UrgentRequest, view: string) => (view === "active" ? !isFinal(r) : view === "archive" ? isFinal(r) : statusOf(r) === view);
const stamp = (v: string, none: number) => {
  const n = v ? Date.parse(v) : NaN;
  return Number.isFinite(n) ? n : none;
};
const dueAt = (r: UrgentRequest) => (r.slaBreached ? 0 : stamp(r.scheduledAt, Infinity));
const byUrgency = (a: UrgentRequest, b: UrgentRequest) => {
  const pool = Number(statusOf(a) !== "open_pool") - Number(statusOf(b) !== "open_pool");
  if (pool) return pool;
  const due = dueAt(a) - dueAt(b);
  if (due) return due;
  return stamp(a.createdAt, Infinity) - stamp(b.createdAt, Infinity) || 0;
};
const byRecent = (a: UrgentRequest, b: UrgentRequest) =>
  stamp(b.completedAt || b.cancelledAt || b.updatedAt || b.createdAt, 0) - stamp(a.completedAt || a.cancelledAt || a.updatedAt || a.createdAt, 0);
const sorterFor = (view: string) => (VIEWS.find((x) => x.value === view)?.archive ? byRecent : byUrgency);
const GROUP = "second_opinion_group";
// The practice-area slugs the client form sends (see UrgentAdvocatePanel) —
// what GET /call-center/urgent-advokat/candidates?directions= expects.
const DIRECTION_SLUGS = ["jinoiy", "fuqarolik", "oila", "mehnat", "mamuriy", "iqtisodiy", "soliq", "shartnoma"];
// messages/enums.areas is keyed by the English practice area, but a record's
// `directions` are the Uzbek slugs above, so te("areas.fuqarolik") never
// resolved and every chip fell back to the bare slug. The live queue also
// carries slugs with no area at all ("ytx", "avtoavariya", "yo'l transport
// hodisasi"), which is why the fallback humanizes rather than blanks.
const DIRECTION_AREA: Record<string, string> = {
  jinoiy: "criminal",
  fuqarolik: "civil",
  oila: "family",
  mehnat: "labor",
  mamuriy: "administrative",
  iqtisodiy: "economic",
  soliq: "tax",
};
type Te = ((key: string) => string) & { has: (key: string) => boolean };
// Production writes the same slug two ways ("mamuriy" and "ma'muriy"), so the
// apostrophe is dropped before the lookup.
export function directionLabel(te: Te, slug: string, tx?: Te): string {
  const key = slug.trim().toLowerCase().replace(/[‘’'`]/g, "");
  const area = DIRECTION_AREA[key];
  if (area && te.has(`areas.${area}`)) return te(`areas.${area}`);
  if (te.has(`areas.${key}`)) return te(`areas.${key}`);
  const extra = key.replace(/[\s-]+/g, "_");
  if (tx && extra && tx.has(`dirs.${extra}`)) return tx(`dirs.${extra}`);
  return humanize(slug);
}

const URGENT_TONES: Readonly<Record<string, StatusToneRule>> = {
  open_pool: { tone: "warn", dot: true },
  claimed: "info",
  scheduled: "info",
  in_progress: "info",
  meeting_active: { tone: "ok", dot: "live" },
  completed: "ok",
  cancelled: "err",
  expired: "warn",
};

export function useUrgentStatuses(): StatusMap {
  const t = useTranslations("admin.urgent");
  return useMemo(() => statusMap(t, "st", URGENT_TONES), [t]);
}

const candidateMeta = (t: Te, te: Te, c: UrgentCandidate): string[] => [
  c.sellerType || c.role ? labelOf(t, "roles", c.sellerType || c.role) : "",
  c.region ? regionLabel(te, c.region) : "",
];

// A chat opened from the board carries the record it belongs to, so the
// chat screen can offer the end-chat action the backend only allows staff.
//
// R28/R29 (LEXGO_URGENT_GROUP_CHAT_FRONTEND L253-254): the chat header shows
// the work id and the service name. `label` is the localised catalogue title
// this board has already computed for the row — the record's own `title` is
// the backend's single ASCII spelling of it ("Ikkinchi fikr - advokatlar
// guruhi", captured live on record 77ada6f5), so sending that instead would
// put an untranslated hyphenated string into a Russian operator's chat
// header. The raw title stays as the fallback for a kind the catalogue has
// no wording for.
function chatHref(r: Pick<UrgentRequest, "secureChatRoomId" | "id" | "workId" | "serviceTitle">, label?: string): string {
  const q = new URLSearchParams({ ua: r.id });
  if (r.workId) q.set("wid", r.workId);
  const svc = label || r.serviceTitle;
  if (svc) q.set("svc", svc);
  return `/portal/chat/${r.secureChatRoomId}?${q.toString()}`;
}

// The same six icons the client's own Tezkor advokat grid uses — one
// service, one icon, wherever it is shown. See components/icons.tsx.
const KIND_ICON: Record<string, typeof IconVideo> = {
  video_consultation: IconVideoConsult,
  express_video_consultation: IconExpressCall,
  traffic_accident_consultation: IconTrafficCase,
  chat_consultation: IconChatConsult,
  second_opinion_single: IconSecondOpinion,
  second_opinion_group: IconOpinionPanel,
};

type State = { status: "loading" | "ready" | "error" | "forbidden" | "missing"; items: UrgentRequest[]; error?: unknown };
type Meeting = { roomId: string; callId: string; title: string; lk: LiveKitJoin | null };
type Outcome = { title: string; body?: string };
type Change = Outcome & { id: string; status?: string };
type Msgs = { ok: (r: UrgentRequest) => Outcome; fail: string; map?: Partial<Record<number, string>> };

const ntfId = (id: string) => `urgent-${id}`;

type Step = "" | "complete" | "transfer" | "cancel" | "candidates" | "status";
type Ask = { act: string; n: number };
type MenuItem = {
  key: string;
  label: string;
  icon: ReactNode;
  group: number;
  danger?: boolean;
  href?: string;
  title?: string;
  aiId?: string;
  onSelect?: () => void;
};

const STATUS_SKIP = new Set(["completed", "cancelled", "expired"]);
const MIN_SUMMARY = 5;
const MIN_REASON = 3;
const CAND_PAGE = 8;
const SOURCES_SHOWN = 3;
const STEP_FIELD = 'input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled])';

function dropStepError(nid: string) {
  if (notifyStore.getSnapshot().items.some((x) => x.id === nid && x.tone === "error" && !x.leaving)) notify.dismiss(nid);
}

function useReportDirty(dirty: boolean, report: (dirty: boolean) => void) {
  const sent = useRef<boolean | null>(null);
  useEffect(() => {
    if (sent.current === dirty) return;
    sent.current = dirty;
    report(dirty);
  }, [dirty, report]);
}

function dedupeSources(list: UrgentEligibleSource[]): UrgentEligibleSource[] {
  const by = new Map<string, UrgentEligibleSource>();
  for (const s of list) {
    const k = s.id || `${s.type}|${s.title}|${s.createdAt}`;
    const had = by.get(k);
    if (!had || stamp(s.createdAt, 0) > stamp(had.createdAt, 0)) by.set(k, s);
  }
  return [...by.values()].sort((a, b) => stamp(b.createdAt, 0) - stamp(a.createdAt, 0));
}

const AI_ITEM = "call_center.urgent-advokat.item";
const AI_DRAWER_ONLY = new Set(["detail-modal", "complete", "transfer", "cancel", "status", "assign-group", "more"]);

const aiNorm = (s: string) => s.toLowerCase().replace(/\(\d+\)/g, "").replace(/[ʻʼ'‘’`]/g, "").replace(/[\s_-]+/g, " ").trim();

function aiPick(opts: { value: string; label: string }[], raw: string): string | null {
  const w = aiNorm(raw);
  if (!w || w === "all") return "";
  const hit = opts.find((o) => aiNorm(o.value) === w) ?? opts.find((o) => aiNorm(o.label) === w) ?? opts.find((o) => w.length >= 3 && aiNorm(o.label).includes(w));
  return hit ? hit.value : null;
}

export default function UrgentAdvocateQueue({ onCount }: { onCount?: (n: number) => void }) {
  const t = useTranslations("admin.urgent");
  const tk = useTranslations("portal.client.urgent");
  const tcm = useTranslations("portal.common");
  const tn = useTranslations("common.notify");
  const te = useTranslations("enums");
  const locale = useLocale();
  const urg = useUrgentStatuses();

  const [kind, setKind] = useState("");
  const [channel, setChannel] = useState("");
  const [view, setView] = useState("active");
  const [state, setState] = useState<State>({ status: "loading", items: [] });
  const [busyId, setBusyId] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState("");
  const [ask, setAsk] = useState<Ask>({ act: "", n: 0 });
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [live, setLive] = useState(true);
  const listKey = `${view}|${kind}|${channel}`;

  const seq = useRef(0);
  const held = useRef(0);
  useEffect(() => {
    held.current = state.status === "ready" ? state.items.length : 0;
  }, [state]);

  const load = useCallback(function loadList(): Promise<boolean> {
    const my = ++seq.current;
    return listCcUrgentRequests()
      .then((items) => {
        if (my !== seq.current) return false;
        setState({ status: "ready", items });
        return true;
      })
      .catch((e) => {
        // A module the backend has not enabled yet, and a role without
        // call-center access, are both "nothing to show here" rather than
        // an error banner on an otherwise working console.
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
              onClick: () => void loadList().then((ok) => { if (ok) notify.success(t("notify.listRefreshed"), { id: "urgent-queue-load" }); }),
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
  }, [t, tn]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime. The events carry the record, but the board is a filtered list —
  // whether a changed record still belongs in it is the server's answer, not
  // ours — so an event refetches the list rather than patching a row in place.
  const reload = useRef(load);
  useEffect(() => { reload.current = load; }, [load]);
  useEffect(() => {
    const offEvents = subscribeUserEvents((e) => {
      if (!isUrgentEvent(e.event)) return;
      void reload.current();
    });
    const offSync = onUserSocketResync(() => void reload.current());
    const offState = subscribeUserSocketState((s) => setLive(s === "online"));
    return () => { offEvents(); offSync(); offState(); };
  }, []);

  // Only while the realtime channel is down, and never in a background tab.
  useEffect(() => {
    if (live) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") void reload.current(); }, OFFLINE_POLL_MS);
    return () => clearInterval(timer);
  }, [live]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void reload.current(); };
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
      const to = VIEWS.find((x) => x.value === next) ?? VIEWS.find((x) => x.value === (final ? "archive" : "active"));
      if (!to || to.value === view) return "";
      setView(to.value);
      return t("movedTo", { status: urg[to.value]?.label ?? t(to.key) });
    },
    [view, load, t, urg],
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

  async function claim(r: UrgentRequest) {
    if (busyId) return;
    setBusyId(r.id);
    try {
      const out = await claimUrgentRequest(r.id);
      // Taking the work IS the decision to start on it, so the operator lands
      // in the same detail drawer that "Batafsil" opens rather than being
      // left on the board to find the row again — the candidates, the
      // meeting, the chat and the result are all in there.
      setOpenId(r.id);
      report({ id: r.id, title: t("notify.claimed"), body: out.secureChatRoomId ? t("notify.chatOpened") : undefined, status: out.status });
    } catch (e) {
      logApiError("urgent claim", e);
      notify.error(t("notify.claimFailed"), { id: ntfId(r.id), error: e, map: errDetail(e) ? undefined : { 409: t("alreadyTaken") } });
    } finally {
      setBusyId("");
    }
  }

  const openMeeting = useCallback(
    (call: CallSession, r: UrgentRequest) => {
      setMeeting({
        roomId: call.roomId || r.secureChatRoomId,
        callId: call.id,
        title: tk.has(`kinds.${r.serviceKind}`) ? tk(`kinds.${r.serviceKind}`) : r.serviceTitle || r.serviceKind,
        lk: call.livekitToken ? { url: call.livekitUrl, room: call.livekitRoom, token: call.livekitToken, hints: call.hints, quality: call.quality } : null,
      });
    },
    [tk],
  );

  async function meet(r: UrgentRequest) {
    if (busyId) return;
    setBusyId(r.id);
    try {
      openMeeting(await createUrgentMeeting(r.id), r);
      // POST /meeting answers with the call session, not the record, so the
      // status it moved to is read back rather than assumed; if that read
      // fails the board just reloads the tab it is on.
      report({ id: r.id, title: t("meetingStarted"), status: (await getCcUrgentRequest(r.id).catch(() => null))?.status || "" });
    } catch (e) {
      logApiError("urgent meeting", e);
      notify.error(t("notify.meetingFailed"), { id: ntfId(r.id), error: e });
    } finally {
      setBusyId("");
    }
  }

  const ready = state.status === "ready";
  const fresh = ready ? state.items.filter((r) => statusOf(r) === "open_pool").length : null;
  const countRef = useRef(onCount);
  useEffect(() => {
    countRef.current = onCount;
  });
  useEffect(() => {
    if (fresh !== null) countRef.current?.(fresh);
  }, [fresh]);

  const scoped = useMemo(
    () => state.items.filter((r) => (!kind || r.serviceKind === kind) && (!channel || r.channel === channel)),
    [state.items, kind, channel],
  );
  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.value, scoped.filter((r) => inView(r, v.value)).length])), [scoped]);
  const rows = useMemo(() => scoped.filter((r) => inView(r, view)).sort(sorterFor(view)), [scoped, view]);
  const pager = usePaged(rows, PAGE, listKey);

  const viewsRef = useRef<HTMLDivElement>(null);
  useScrollEdges(viewsRef, { silent: true });
  useEffect(() => {
    const box = viewsRef.current;
    const el = box?.querySelector<HTMLElement>("[aria-pressed=true]");
    if (!box || !el || box.scrollWidth <= box.clientWidth) return;
    const outer = box.getBoundingClientRect();
    const at = el.getBoundingClientRect();
    if (at.left < outer.left + 32) box.scrollLeft -= outer.left + 32 - at.left;
    else if (at.right > outer.right - 32) box.scrollLeft += at.right - outer.right + 32;
  }, [view]);

  useAiSelection("urgent_queue_tab", view);
  useAiSelection("urgent_filter_kind", kind);
  useAiSelection("urgent_filter_channel", channel);
  useAiReveal(/^call_center\.urgent-advokat\.item\.[^.]+(\.[a-z-]+)?$/, (id) => {
    const parts = id.split(".");
    const seg = parts[3] ?? "";
    const action = parts[4] ?? "";
    const r = state.items.find((x) => aiSeg(x.id) === seg);
    if (AI_DRAWER_ONLY.has(action)) {
      setOpenId(r?.id ?? seg);
      setAsk((a) => ({ act: action, n: a.n + 1 }));
      return;
    }
    if (!r) return;
    const k = kind && r.serviceKind !== kind ? "" : kind;
    const c = channel && r.channel !== channel ? "" : channel;
    const v = inView(r, view) ? view : isFinal(r) ? "archive" : "active";
    const list = state.items.filter((x) => (!k || x.serviceKind === k) && (!c || x.channel === c) && inView(x, v)).sort(sorterFor(v));
    const at = list.findIndex((x) => x.id === r.id);
    setKind(k);
    setChannel(c);
    setView(v);
    pager.revealIndex(at, `${v}|${k}|${c}`);
  });

  const viewLabel = (x: (typeof VIEWS)[number]) => urg[x.value]?.label ?? t(x.key);
  const activeAll = ready ? state.items.filter((r) => !isFinal(r)).length : 0;
  const viewOpts = VIEWS.map((x) => ({ value: x.value, label: ready ? `${viewLabel(x)} (${counts[x.value] ?? 0})` : viewLabel(x) }));
  const kindOpts = [{ value: "", label: t("allKinds") }, ...KINDS.map((k) => ({ value: k, label: tk.has(`kinds.${k}`) ? tk(`kinds.${k}`) : k }))];
  const channelOpts = [
    { value: "", label: t("allChannels") },
    { value: "video", label: tk("chVideo") },
    { value: "chat", label: tk("chChat") },
  ];
  useAiField("call_center.urgent-advokat.tabs", {
    get: () => view,
    set: (raw) => {
      const v = aiPick(viewOpts, raw);
      if (v !== null) setView(v || "active");
    },
  });
  useAiField("call_center.urgent-advokat.filters.kind", {
    get: () => kind,
    set: (raw) => {
      const v = aiPick(kindOpts, raw);
      if (v !== null) setKind(v);
    },
  });
  useAiField("call_center.urgent-advokat.filters.channel", {
    get: () => channel,
    set: (raw) => {
      const v = aiPick(channelOpts, raw);
      if (v !== null) setChannel(v);
    },
  });
  useAiReveal(/^call_center\.urgent-advokat\.tab\.[a-z_]+$/, (id) => {
    const seg = id.split(".")[3] ?? "";
    const next = seg === "all" ? "active" : seg;
    if (VIEWS.some((x) => x.value === next)) setView(next);
  });

  if (state.status === "forbidden" || state.status === "missing") return null;

  return (
    <section className="ppanel uaq" id="cc-urgent" data-ai-target="callcenter:urgent" data-ai-id="call_center.urgent-advokat.queue" data-ai-label={t("title")}>
      <div className="ppanel__h cch">
        <h2 className="ppanel__t cch__t"><span className="pico"><IconBolt /></span><span className="cch__tt">{t("title")}</span></h2>
        <div className="cch__a">
          <span className={`uaq__live${live ? " on" : ""}`}>
            <i aria-hidden />{live ? t("liveOn") : t("liveOff")}
          </span>
          {ready ? <CountBadge n={activeAll} label={t("activeCount", { n: activeAll })} /> : null}
          <IconButton label={t("refresh")} icon={<IconRefresh />} onClick={refreshNow} busy={refreshing} tipAlign="end" aiId="call_center.urgent-advokat.refresh" />
        </div>
      </div>
      <p className="advmuted uaq__lead">{t("lead")}</p>

      <div
        ref={viewsRef}
        className="uaq__views scue-x"
        role="group"
        aria-label={t("fStatus")}
        data-ai-id="call_center.urgent-advokat.tabs"
        data-ai-target="callcenter:urgent-tabs"
        data-ai-type="select"
        data-ai-label={t("fStatus")}
      >
        {VIEWS.map((v, i) => (
          <Fragment key={v.value}>
            {i > 0 && v.archive !== VIEWS[i - 1].archive ? <i className="uaq__vsep" aria-hidden="true" /> : null}
            <button
              type="button"
              className={`uaq__view${v.value === "active" || v.value === "archive" ? " uaq__view--main" : ""}`}
              aria-pressed={view === v.value}
              onClick={() => setView(v.value)}
              data-ai-id={`call_center.urgent-advokat.tab.${v.value}`}
              data-ai-type="tab"
              data-ai-label={viewLabel(v)}
            >
              {viewLabel(v)}
              {ready ? <em>{counts[v.value] ?? 0}</em> : null}
            </button>
          </Fragment>
        ))}
      </div>

      <FilterBar
        className="uf--tray"
        fields={[
          { key: "kind", label: t("fKind"), icon: IconBriefcase, value: kind, onChange: setKind, options: kindOpts, aiId: "call_center.urgent-advokat.filters.kind" },
          { key: "channel", label: t("fChannel"), icon: IconChatDots, value: channel, onChange: setChannel, options: channelOpts, aiId: "call_center.urgent-advokat.filters.channel" },
        ]}
        count={ready ? rows.length : undefined}
        aiId="call_center.urgent-advokat.filters"
        aiTarget="callcenter:urgent-filters"
      />

      {state.status === "loading" ? (
        <Skeleton rows={3} />
      ) : state.status === "error" ? (
        <ErrorState error={state.error} onRetry={load} title={t("loadError")} />
      ) : !rows.length ? (
        <EmptyState icon={<IconBolt />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <ul className="uaq__list" data-ai-target="callcenter:urgent-list">
          {pager.visible.map((r) => {
            const Icon = KIND_ICON[r.serviceKind] ?? IconScale;
            const open = (r.status || "open_pool") === "open_pool";
            const isGroup = r.serviceKind === GROUP;
            const final = r.nextStatuses.length === 0 && !open;
            const claimable = open || (r.nextStatuses.includes("claimed") && !r.claimedByUserId);
            const kindName = tk.has(`kinds.${r.serviceKind}`) ? tk(`kinds.${r.serviceKind}`) : r.serviceTitle || humanize(r.serviceKind);
            return (
              <li
                key={r.id}
                className={`uaq__row${open ? " uaq__row--open" : ""}${r.slaBreached ? " uaq__row--sla" : ""}`}
                data-ai-id={aiId(AI_ITEM, r.id)}
                data-ai-type="list_item"
                data-ai-label={[kindName, r.workId].filter(Boolean).join(" · ")}
                data-ai-entity-type="urgent_advokat_request"
                data-ai-entity-id={r.id}
              >
                <span className={`uaq__i uaq__i--${r.channel || "video"}`}><Icon /></span>
                <div className="uaq__m" data-ai-private>
                  <b>
                    {kindName}
                    {r.channel ? <em className="uaq__ch">{r.channel === "chat" ? <IconChat /> : <IconVideo />}{r.channel === "chat" ? tk("chChat") : tk("chVideo")}</em> : null}
                    <WorkId id={r.workId} label={tk("workId")} className="ua__wid" />
                    {/* on_duty_pool: nobody has to pick this out of the pool. */}
                    {r.immediateCall ? <em className="uaq__ch uaq__ch--now"><IconBolt />{t("onDuty")}</em> : null}
                  </b>
                  {r.need ? <span className="uaq__need">{r.need}</span> : null}
                  <span className="uaq__sub">
                    {/* Name AND number: the row used to drop the phone as soon
                        as a name existed, so ringing the client back meant
                        opening the drawer for a number the row already had. */}
                    {r.clientName ? <b>{r.clientName}</b> : null}
                    {r.clientPhone ? (
                      <a href={`tel:${r.clientPhone}`} className="uaq__tel"><IconPhone />{r.clientPhone}</a>
                    ) : null}
                    {[
                      r.region ? regionLabel(te, r.region) : "",
                      isGroup && r.lawyerCount ? t("lawyersN", { n: r.lawyerCount }) : "",
                      r.createdAt ? dateTimeFull(r.createdAt, locale) : "",
                    ].filter(Boolean).join(" · ")}
                  </span>
                  {r.directions.length ? (
                    <span className="uaq__dirs">
                      {/* Keyed by position: the same area reaches the row
                          spelled two ways ("mamuriy", "ma'muriy"), and a
                          record can carry both. */}
                      {r.directions.map((d, i) => <Badge key={`${d}-${i}`} tone="info" size="sm">{directionLabel(te, d, t)}</Badge>)}
                    </span>
                  ) : null}
                  {r.scheduledAt ? (
                    <span className="uaq__when"><IconCalendar />{t("scheduledFor", { when: dateTimeFull(r.scheduledAt, locale) })}</span>
                  ) : null}
                  {r.groupLawyers.length ? (
                    <span className="uaq__when"><IconUsers />{r.groupLawyers.map((g) => g.name).join(", ")}</span>
                  ) : null}
                </div>
                <div className="uaq__r">
                  <StatusBadge status={statusOf(r)} map={urg} fallback={statusLabel(tcm, statusOf(r))} size="sm" className="uaq__st" />
                  <div className="uaq__acts">
                    {claimable ? (
                      <button type="button" className="btn btn--pri btn--sm" disabled={busyId === r.id} onClick={() => void claim(r)} data-ai-target="button:urgent-claim" data-ai-id={aiId(AI_ITEM, r.id, "claim")}>
                        <IconCheck />{busyId === r.id ? t("claiming") : t("claim")}
                      </button>
                    ) : null}
                    {/* Reachable from every non-final, non-chat row, so a
                        record sitting on the Rejalashtirilgan tab can be
                        started without opening the drawer — `scheduled`
                        really does list meeting_active in next_statuses. */}
                    {!open && !final && r.channel !== "chat" ? (
                      <button type="button" className="btn btn--line btn--sm" disabled={busyId === r.id} onClick={() => void meet(r)} data-ai-id={aiId(AI_ITEM, r.id, "meeting")}>
                        <IconVideo />{t("startMeeting")}
                      </button>
                    ) : null}
                    {/* The claim opened this room and notified the client, but
                        until now nothing on the board led into it.

                        On a `channel=chat` record the room IS the
                        consultation — there is no meeting to start, and
                        R3/R32 (MD L16, L260-262) put the operator in it
                        alongside the selected advocates with the "Chatni
                        yakunlash" action — so on those rows it is the primary
                        action rather than one outline button among four. */}
                    {r.secureChatRoomId ? (
                      <Link
                        href={chatHref(r, kindName)}
                        className={`btn btn--sm ${!open && r.channel === "chat" ? "btn--pri" : "btn--line"}`}
                        title={t("openChatTitle")}
                        data-ai-id={aiId(AI_ITEM, r.id, "chat")}
                      >
                        <IconChat />{t("openChat")}
                      </Link>
                    ) : null}
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpenId(r.id)} data-ai-id={aiId(AI_ITEM, r.id, "detail")}>
                      {t("openDetail")}<IconChevronRight />
                    </button>
                  </div>
                  {!open && !final && r.channel !== "chat" ? <span className="uaq__hint"><IconClock />{t("meetingHint")}</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {ready && rows.length ? <ListPager {...pager.bind} less aiId="call_center.urgent-advokat.more" /> : null}

      <UrgentDetailDrawer
        id={openId}
        ask={ask}
        onClose={() => setOpenId("")}
        onChanged={report}
        onMeeting={openMeeting}
      />

      {meeting
        ? createPortal(
            <CallRoom
              roomId={meeting.roomId}
              callId={meeting.callId}
              callType="video"
              isCaller
              title={meeting.title}
              lk={meeting.lk}
              onEnd={() => setMeeting(null)}
            />,
            document.body,
          )
        : null}
    </section>
  );
}

// ── One request, in full ───────────────────────────────────────────
// Everything the operator needs to work the record without leaving it: who
// asked, what for, what they attached, who is on it, where it has been, and
// every action the record's own lifecycle still allows.
function UrgentDetailDrawer({
  id,
  ask,
  onClose,
  onChanged,
  onMeeting,
}: {
  id: string;
  ask: Ask;
  onClose: () => void;
  // The status the record landed on, so the board can follow it to that tab
  // rather than losing the row behind this drawer.
  onChanged: (c: Change) => void;
  onMeeting: (call: CallSession, r: UrgentRequest) => void;
}) {
  const t = useTranslations("admin.urgent");
  const tk = useTranslations("portal.client.urgent");
  const tcm = useTranslations("portal.common");
  const tn = useTranslations("common.notify");
  const te = useTranslations("enums");
  const tv = useTranslations("secureChat");
  const locale = useLocale();
  const histId = useId();
  const urg = useUrgentStatuses();
  const urgLabel = (s: string) => statusSpecOf(urg, s, statusLabel(tcm, s))?.label ?? "";

  const [req, setReq] = useState<UrgentRequest | null>(null);
  const [load2, setLoad2] = useState<"loading" | "ready" | "error">("loading");
  const [loadErr, setLoadErr] = useState<unknown>(undefined);
  const [busy, setBusy] = useState("");
  const [step, setStep] = useState<Step>("");
  const [stepDirty, setStepDirty] = useState(false);
  const [stepBusy, setStepBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [wanted, setWanted] = useState("");
  const [allSources, setAllSources] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const { session } = useAuth();
  const me = session?.id ?? "";
  const isAdmin = sessionRoles(session).some((x) => x === "superadmin" || x === "admin");

  const view = useRef({ id, ready: false });
  useEffect(() => { view.current = { id, ready: load2 === "ready" }; }, [id, load2]);

  // Answers with the record so a caller that has to know where it went (the
  // meeting, whose own response is only the call session) need not guess.
  const fetchOne = useCallback(function fetchRecord(): Promise<UrgentRequest | null> {
    if (!id) return Promise.resolve(null);
    return getCcUrgentRequest(id)
      .then((r) => {
        if (view.current.id !== id) return null;
        setReq(r);
        setLoad2("ready");
        return r;
      })
      .catch((e) => {
        logApiError("urgent detail", e);
        if (view.current.id !== id) return null;
        if (view.current.ready) {
          notify.error(t("notify.detailFailed"), {
            id: "urgent-detail-load",
            error: e,
            action: {
              label: tn("retry"),
              onClick: () => void fetchRecord().then((r) => { if (r) notify.success(t("notify.detailRefreshed"), { id: "urgent-detail-load" }); }),
            },
          });
        } else {
          setLoadErr(e);
          setLoad2("error");
        }
        return null;
      });
  }, [id, t, tn]);

  // Opening a different record (or closing the drawer) resets the view during
  // render rather than in an effect: an effect would paint the previous
  // record's detail for one frame under the new title.
  const [prevId, setPrevId] = useState(id);
  const switched = id !== prevId;
  if (switched) {
    setPrevId(id);
    setReq(null);
    setLoad2("loading");
    setStep("");
    setStepDirty(false);
    setStepBusy(false);
    setMenu(false);
    setWanted("");
    setAllSources(false);
    setHistOpen(false);
    setLoadErr(undefined);
  }

  const [seenAsk, setSeenAsk] = useState(ask);

  useEffect(() => {
    if (!id) return;
    void fetchOne();
  }, [id, fetchOne]);

  // Refetch this record when the backend says it moved — including when
  // somebody else in the call centre moved it.
  const again = useRef(fetchOne);
  useEffect(() => { again.current = fetchOne; }, [fetchOne]);
  useEffect(() => {
    if (!id) return;
    return subscribeUserEvents((e) => {
      if (!isUrgentEvent(e.event)) return;
      const info = urgentEventInfo(e);
      if (info.recordId && info.recordId !== id) return;
      void again.current();
    });
  }, [id]);

  // Answers whether it worked, so the caller can keep a half-written summary
  // on screen when it did not — closing the form on a failed request threw
  // away everything the operator had typed.
  async function run(key: string, fn: () => Promise<UrgentRequest>, msgs: Msgs): Promise<boolean> {
    if (busy) return false;
    setBusy(key);
    try {
      const moved = await fn();
      setReq(moved);
      onChanged({ id, ...msgs.ok(moved), status: moved.status });
      return true;
    } catch (e) {
      logApiError("urgent " + key, e);
      notify.error(msgs.fail, { id: ntfId(id), error: e, map: errDetail(e) ? undefined : msgs.map });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function meet() {
    if (!req || busy) return;
    setBusy("meeting");
    try {
      const call = await createUrgentMeeting(req.id);
      onMeeting(call, req);
      const moved = await fetchOne();
      onChanged({ id: req.id, title: t("meetingStarted"), status: moved?.status });
    } catch (e) {
      logApiError("urgent meeting", e);
      notify.error(t("notify.meetingFailed"), { id: ntfId(req.id), error: e });
    } finally {
      setBusy("");
    }
  }

  function go(next: Step) {
    dropStepError(ntfId(id));
    setStep(next);
    setStepDirty(false);
    setMenu(false);
    setWanted("");
  }

  function finishStep() {
    setStep("");
    setStepDirty(false);
  }

  function openMenu(open: boolean) {
    setMenu(open);
    if (!open) setWanted("");
  }

  const kindLabel = req ? (tk.has(`kinds.${req.serviceKind}`) ? tk(`kinds.${req.serviceKind}`) : req.serviceTitle || humanize(req.serviceKind)) : "";
  const isGroup = req?.serviceKind === GROUP;
  const isSecond = !!req && (req.serviceKind === GROUP || req.serviceKind === "second_opinion_single");
  const finished = !!req && req.nextStatuses.length === 0;
  const claimOpen = !!req && (req.status === "open_pool" || req.nextStatuses.includes("claimed"));
  const takeOver = claimOpen && !!req?.claimedByUserId && req.claimedByUserId !== me && isAdmin;
  const canClaim = (claimOpen && !req?.claimedByUserId) || takeOver;
  const claimMsgs: Msgs = {
    ok: (r) => ({ title: t("notify.claimed"), body: r.secureChatRoomId ? t("notify.chatOpened") : undefined }),
    fail: t("notify.claimFailed"),
    map: { 409: t("alreadyTaken") },
  };

  const statusChoices = req
    ? req.nextStatuses.filter((s) => !STATUS_SKIP.has(s) && (s !== "claimed" || (!!req.claimedByUserId && req.claimedByUserId === me)))
    : [];
  const working = !!req && !finished && req.status !== "open_pool";
  const can = {
    meeting: working && req?.channel !== "chat",
    chat: !!req?.secureChatRoomId,
    complete: working,
    transfer: working,
    status: statusChoices.length > 0,
    cancel: !!req && !finished,
    group: !!req && isGroup && !finished,
  };
  const primary = !req
    ? ""
    : canClaim
      ? "claim"
      : finished
        ? can.chat ? "chat" : ""
        : req.channel === "chat" && can.chat && working
          ? "chat"
          : can.group && !req.groupLawyers.length
            ? "group"
            : can.meeting && (req.status === "claimed" || req.status === "scheduled")
              ? "meeting"
              : can.complete
                ? "complete"
                : can.meeting
                  ? "meeting"
                  : "";
  const allowed: Record<Step, boolean> = {
    "": true,
    complete: can.complete,
    transfer: can.transfer,
    cancel: can.cancel,
    candidates: can.group,
    status: can.status,
  };
  const ready = load2 === "ready" && !!req;
  const shownStep: Step = ready && allowed[step] ? step : "";

  if (ask !== seenAsk) {
    setSeenAsk(ask);
    const keep = !switched && shownStep !== "" && (stepDirty || ask.act === "detail-modal" || ask.act === shownStep);
    if (ask.act && !keep) {
      setStep("");
      setStepDirty(false);
      setMenu(false);
      setWanted(ask.act);
    }
  }

  const items: MenuItem[] = [];
  if (req) {
    if (can.meeting && primary !== "meeting") {
      items.push({ key: "meeting", group: 0, label: t("startMeeting"), icon: <IconVideo />, aiId: aiId(AI_ITEM, req.id, "meeting"), onSelect: () => void meet() });
    }
    if (can.chat && primary !== "chat") {
      items.push({ key: "chat", group: 0, label: t("openChat"), icon: <IconChat />, href: chatHref(req, kindLabel), title: t("openChatTitle"), aiId: aiId(AI_ITEM, req.id, "chat") });
    }
    if (can.complete && primary !== "complete") {
      items.push({ key: "complete", group: 0, label: t("complete"), icon: <IconCheck />, aiId: aiId(AI_ITEM, req.id, "complete"), onSelect: () => go("complete") });
    }
    if (can.transfer) {
      items.push({ key: "transfer", group: 1, label: t("transfer"), icon: <IconUsers />, aiId: aiId(AI_ITEM, req.id, "transfer"), onSelect: () => go("transfer") });
    }
    if (can.status) {
      items.push({ key: "status", group: 1, label: t("moveTo"), icon: <IconClock />, aiId: aiId(AI_ITEM, req.id, "status"), onSelect: () => go("status") });
    }
    if (can.cancel) {
      items.push({ key: "cancel", group: 2, label: t("cancelAsk"), icon: <IconClose />, danger: true, aiId: aiId(AI_ITEM, req.id, "cancel"), onSelect: () => go("cancel") });
    }
  }
  const wantedHere = !!wanted && shownStep === "" && items.some((x) => x.key === wanted);
  if (wanted && ready && shownStep === "" && !wantedHere) setWanted("");
  const menuOpen = menu || wantedHere;

  const seenStep = useRef<Step>("");
  useEffect(() => {
    if (seenStep.current === shownStep) return;
    seenStep.current = shownStep;
    const el = root.current;
    if (!el) return;
    el.closest<HTMLElement>(".amodal__b")?.scrollTo({ top: 0 });
    const title = el.closest(".amodal__c")?.querySelector<HTMLElement>(".amodal__t") ?? null;
    const field = shownStep && shownStep !== "transfer" && shownStep !== "candidates" && !isCoarsePointer() ? el.querySelector<HTMLElement>(STEP_FIELD) : null;
    (field ?? title)?.focus({ preventScroll: true });
  }, [shownStep]);

  function cancelNow(reason: string) {
    if (!req) return;
    const rid = req.id;
    void confirmDialog({
      tone: "danger",
      title: t("cancelConfirmTitle"),
      text: t("cancelConfirmText"),
      confirmLabel: t("cancelYes"),
      cancelLabel: t("back"),
      busyLabel: tcm("processingShort"),
      onConfirm: () => run("cancel", () => cancelUrgentRequest(rid, reason), { ok: () => ({ title: t("cancelDone") }), fail: t("notify.cancelFailed") }),
    }).then((ok) => {
      if (ok) finishStep();
    });
  }

  const sources = req && isSecond ? dedupeSources(req.eligibleSources) : [];
  const stepTitle: Record<Step, string> = {
    "": kindLabel || t("openDetail"),
    complete: t("stepComplete"),
    transfer: t("stepTransfer"),
    cancel: t("stepCancel"),
    candidates: req?.groupLawyers.length ? t("regroup") : t("assignGroup"),
    status: t("moveTo"),
  };
  const hasFoot = ready && (shownStep !== "" || !!primary || items.length > 0);

  // ── Everything the lifecycle still allows ───────────────────────
  const primaryBtn = !req ? null : primary === "claim" ? (
    <button
      type="button"
      className="btn btn--pri"
      disabled={!!busy}
      title={takeOver ? t("takeOverTitle") : undefined}
      onClick={() => void run("claim", () => claimUrgentRequest(req.id), claimMsgs)}
      data-ai-id={aiId(AI_ITEM, req.id, "claim")}
    >
      <IconCheck />{busy === "claim" ? t("claiming") : takeOver ? t("takeOver") : t("claim")}
    </button>
  ) : primary === "chat" ? (
    // The private room the claim created. It is where the client is
    // already being answered, so it stays reachable on a finished
    // record too — that is where the conversation lives.
    <Link href={chatHref(req, kindLabel)} className="btn btn--pri" title={t("openChatTitle")} data-ai-id={aiId(AI_ITEM, req.id, "chat")}>
      <IconChat />{t("openChat")}
    </Link>
  ) : primary === "meeting" ? (
    <button type="button" className="btn btn--pri" disabled={!!busy} onClick={() => void meet()} data-ai-id={aiId(AI_ITEM, req.id, "meeting")}>
      <IconVideo />{busy === "meeting" ? t("starting") : t("startMeeting")}
    </button>
  ) : primary === "complete" ? (
    <button type="button" className="btn btn--pri" disabled={!!busy} onClick={() => go("complete")} data-ai-id={aiId(AI_ITEM, req.id, "complete")}>
      <IconCheck />{t("complete")}
    </button>
  ) : primary === "group" ? (
    <button
      type="button"
      className="btn btn--pri"
      disabled={!!busy}
      onClick={() => go("candidates")}
      data-ai-id={aiId(AI_ITEM, req.id, "assign-group")}
      data-ai-label={t("assignGroup")}
    >
      <IconUsers />{t("assignGroup")}
    </button>
  ) : null;

  return (
    <Modal
      open={!!id}
      onClose={onClose}
      title={ready ? stepTitle[shownStep] : kindLabel || t("openDetail")}
      description={req && shownStep ? [kindLabel, req.workId].filter(Boolean).join(" · ") : undefined}
      wide
      initialFocus="title"
      busy={!!busy || stepBusy}
      dirty={shownStep !== "" && stepDirty}
      footer={hasFoot ? <div className="ccslot uadf" ref={setSlot} /> : undefined}
    >
      {load2 === "loading" ? (
        <Skeleton rows={5} />
      ) : load2 === "error" || !req ? (
        <ErrorState error={loadErr} onRetry={fetchOne} title={t("detailLoadError")} />
      ) : (
        <div
          ref={root}
          className={`uad${shownStep ? " uad--step" : ""}`}
          data-ai-id={aiId(AI_ITEM, req.id, "detail-modal")}
          data-ai-type="modal"
          data-ai-label={kindLabel || t("openDetail")}
          data-ai-entity-type="urgent_advokat_request"
          data-ai-entity-id={req.id}
        >
          {shownStep === "complete" ? (
            <CompleteForm
              slot={slot}
              busy={!!busy}
              onBack={() => go("")}
              onDirty={setStepDirty}
              onSubmit={(summary, nextAction) => {
                void run("complete", () => completeUrgentRequest(req.id, { summary, nextAction }), { ok: () => ({ title: t("completed") }), fail: t("notify.completeFailed") })
                  .then((ok) => { if (ok) finishStep(); });
              }}
            />
          ) : shownStep === "transfer" ? (
            <TransferPanel
              req={req}
              slot={slot}
              busy={!!busy}
              onBack={() => go("")}
              onDirty={setStepDirty}
              onSubmit={(uid, reason, name) => {
                void run("transfer", () => transferUrgentRequest(req.id, { targetLawyerUserId: uid, reason }), {
                  ok: () => ({ title: t("transferred"), body: name ? t("notify.transferredTo", { name }) : undefined }),
                  fail: t("notify.transferFailed"),
                }).then((ok) => { if (ok) finishStep(); });
              }}
            />
          ) : shownStep === "cancel" ? (
            <CancelForm slot={slot} busy={!!busy} onBack={() => go("")} onDirty={setStepDirty} onSubmit={cancelNow} />
          ) : shownStep === "candidates" ? (
            <CandidatePanel
              req={req}
              slot={slot}
              onBack={() => go("")}
              onDirty={setStepDirty}
              onBusy={setStepBusy}
              onDone={(r, msg) => { setReq(r); finishStep(); onChanged({ id, title: msg, status: r.status }); }}
            />
          ) : shownStep === "status" ? (
            <StatusStep
              key={`${req.status}|${req.claimedByUserId}`}
              req={req}
              choices={statusChoices}
              slot={slot}
              busy={!!busy}
              onBack={() => go("")}
              onDirty={setStepDirty}
              onMove={(s, n) => {
                void run(
                  "status",
                  () => (s === "claimed" ? claimUrgentRequest(req.id) : setUrgentStatus(req.id, s, n)),
                  s === "claimed" ? claimMsgs : { ok: () => ({ title: t("statusMoved", { status: urgLabel(s) }) }), fail: t("notify.statusFailed") },
                ).then((ok) => { if (ok) finishStep(); });
              }}
            />
          ) : (
            <>
              {/* ── Header line: status, channel, price, SLA ───────────── */}
              <div className="uad__top">
                <StatusBadge status={statusOf(req)} map={urg} fallback={statusLabel(tcm, statusOf(req))} className="uaq__st" />
                <WorkId id={req.workId} label={tk("workId")} copy tipSide="bottom" className="ua__wid" />
                {req.channel ? (
                  <span className="uad__chip">{req.channel === "chat" ? <IconChat /> : <IconVideo />}{req.channel === "chat" ? tk("chChat") : tk("chVideo")}</span>
                ) : null}
                {req.meetingMinutes ? <span className="uad__chip"><IconClock />{tk("minutesN", { n: req.meetingMinutes })}</span> : null}
                {req.amount ? <span className="uad__chip"><IconCheck />{fmtUzs(req.amount)} {te("currency")}</span> : null}
                {req.slaBreached ? <span className="uad__chip uad__chip--warn"><IconAlert />{t("slaBreached")}</span> : null}
              </div>

              <div className="uad__cols" data-ai-private>
                <div className="uad__main">
                  {/* ── Who asked ───────────────────────────────────────── */}
                  <section className="uad__sec">
                    <h4><IconUser />{t("client")}</h4>
                    <p className="uad__who">
                      <b>{req.clientName || t("unknownClient")}</b>
                      {req.clientPhone ? <a href={`tel:${req.clientPhone}`}><IconPhone />{req.clientPhone}</a> : null}
                      {req.client?.lexgoId ? <span className="advmuted">{req.client.lexgoId}</span> : null}
                      {req.region ? <span className="advmuted"><IconMapPin />{regionLabel(te, req.region)}</span> : null}
                    </p>
                  </section>

                  {/* ── What for ────────────────────────────────────────── */}
                  <section className="uad__sec">
                    <h4><IconFileText />{t("need")}</h4>
                    <p className="uad__need">{req.need || t("noNeed")}</p>
                    {req.directions.length ? (
                      <div className="uaq__dirs uad__dirs">
                        {req.directions.map((d, i) => (
                          <Badge key={`${d}-${i}`} tone="info" size="sm">{directionLabel(te, d, t)}</Badge>
                        ))}
                      </div>
                    ) : null}
                    {isGroup ? <p className="advmuted uad__note">{t("requestedN", { n: req.lawyerCount || 0 })}</p> : null}
                  </section>

                  {/* ── What they attached ──────────────────────────────── */}
                  {req.files.length || req.voiceMessages.length ? (
                    <section className="uad__sec">
                      <h4><IconFileText />{t("attachments")}</h4>
                      <ul className="uad__files">
                        {req.files.map((f, i) => (
                          <li key={`f${i}`}>
                            <IconFileText />
                            {f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer">{f.name}</a> : <span>{f.name}</span>}
                          </li>
                        ))}
                        {req.voiceMessages.map((v, i) => (
                          <li key={`v${i}`}>
                            <IconMic />
                            {v.url ? (
                              <VoiceNotePlayer
                                src={v.url}
                                className="uad__vnote"
                                playLabel={tv("voicePlay")}
                                pauseLabel={tv("voicePause")}
                                seekLabel={tv("voiceSeek")}
                                seed={v.url || v.name || String(i)}
                              />
                            ) : (
                              <span>{v.name}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {/* ── The panel, for a group second opinion ───────────── */}
                  {isGroup ? (
                    <section className="uad__sec">
                      <h4><IconUsers />{t("panel")}</h4>
                      {req.groupLawyers.length ? (
                        <ul className="uad__people">
                          {req.groupLawyers.map((g) => (
                            <li key={g.id}><b>{g.name}</b><span className="advmuted">{g.phone}</span></li>
                          ))}
                        </ul>
                      ) : (
                        <p className="advmuted">{t("panelEmpty")}</p>
                      )}
                      {req.scheduledAt ? (
                        <p className="uad__when"><IconCalendar />{t("scheduledFor", { when: dateTimeFull(req.scheduledAt, locale) })}</p>
                      ) : null}
                      {req.meetingNote ? <p className="advmuted uad__note">{req.meetingNote}</p> : null}
                      {can.group && primary !== "group" ? (
                        <button
                          type="button"
                          className="btn btn--line btn--sm uad__regroup"
                          disabled={!!busy}
                          onClick={() => go("candidates")}
                          data-ai-id={aiId(AI_ITEM, req.id, "assign-group")}
                          data-ai-label={req.groupLawyers.length ? t("regroup") : t("assignGroup")}
                        >
                          <IconUsers />{req.groupLawyers.length ? t("regroup") : t("assignGroup")}
                        </button>
                      ) : null}
                    </section>
                  ) : null}

                  {/* ── The result, once there is one ───────────────────── */}
                  {req.resultSummary || req.nextAction ? (
                    <section className="uad__sec uad__sec--ok">
                      <h4><IconCheck />{t("result")}</h4>
                      {req.resultSummary ? <p className="uad__need">{req.resultSummary}</p> : null}
                      {req.nextAction ? <p className="advmuted uad__note">{t("nextAction")}: {req.nextAction}</p> : null}
                      {req.completedAt ? <p className="advmuted uad__note">{dateTimeFull(req.completedAt, locale)}</p> : null}
                    </section>
                  ) : null}
                  {req.cancelReason ? (
                    <section className="uad__sec uad__sec--warn">
                      <h4><IconClose />{t("cancelled")}</h4>
                      <p className="uad__need">{req.cancelReason}</p>
                      {req.cancelledAt ? <p className="advmuted uad__note">{dateTimeFull(req.cancelledAt, locale)}</p> : null}
                    </section>
                  ) : null}
                </div>

                <div className="uad__side">
                  {/* ── Who is on it ────────────────────────────────────── */}
                  <section className="uad__sec">
                    <h4><IconHeadset />{t("assignment")}</h4>
                    <dl className="uad__dl">
                      <div><dt>{t("claimedBy")}</dt><dd>{req.claimedBy?.name || "—"}</dd></div>
                      <div><dt>{t("operator")}</dt><dd>{req.operator?.name || "—"}</dd></div>
                      <div><dt>{t("assignedLawyer")}</dt><dd>{req.assignedLawyer?.name || "—"}</dd></div>
                      <div><dt>{t("created")}</dt><dd>{req.createdAt ? dateTimeFull(req.createdAt, locale) : "—"}</dd></div>
                    </dl>
                  </section>

                  {/* ── Why this client may order a second opinion ──────── */}
                  {sources.length ? (
                    <section className="uad__sec">
                      <h4><IconShieldCheck />{t("eligibleSources")}</h4>
                      <p className="advmuted uad__note">{t("eligibleSourcesLead")}</p>
                      <ul className="uad__sources">
                        {(allSources ? sources : sources.slice(0, SOURCES_SHOWN)).map((s, i) => (
                          <li key={`${s.type}-${s.id}-${i}`}>
                            <b>{s.title || (s.serviceKind && tk.has(`kinds.${s.serviceKind}`) ? tk(`kinds.${s.serviceKind}`) : humanize(s.serviceKind || s.type))}</b>
                            <span className="advmuted">{[statusLabel(tcm, s.status), s.createdAt ? dateTimeFull(s.createdAt, locale) : ""].filter(Boolean).join(" · ")}</span>
                          </li>
                        ))}
                      </ul>
                      {sources.length > SOURCES_SHOWN ? (
                        <button type="button" className="uad__more" aria-expanded={allSources} onClick={() => setAllSources((v) => !v)}>
                          {allSources ? t("sourcesLess") : t("sourcesAll", { n: sources.length })}
                        </button>
                      ) : null}
                    </section>
                  ) : null}

                  {/* ── Where it has been ───────────────────────────────── */}
                  {req.statusHistory.length ? (
                    <section className="uad__sec">
                      <h4>
                        <button type="button" className="uad__htog" aria-expanded={histOpen} aria-controls={histId} onClick={() => setHistOpen((v) => !v)}>
                          <IconClock />
                          {t("history")}
                          <em className="uad__hn">{req.statusHistory.length}</em>
                          <IconChevronDown className="uad__hcv" />
                        </button>
                      </h4>
                      <ol id={histId} className="uad__hist" hidden={!histOpen}>
                        {req.statusHistory.map((h, i) => (
                          <li key={i}>
                            <b>{urgLabel(h.to)}</b>
                            <span className="advmuted">{h.at ? dateTimeFull(h.at, locale) : ""}</span>
                          </li>
                        ))}
                      </ol>
                    </section>
                  ) : null}
                </div>
              </div>
            </>
          )}
          {slot && shownStep === "" ? createPortal(
            <>
              {items.length ? (
                <MoreMenu
                  open={menuOpen}
                  onOpenChange={openMenu}
                  items={items}
                  label={t("more")}
                  title={t("moreTitle")}
                  disabled={!!busy}
                  aiId={aiId(AI_ITEM, req.id, "more")}
                />
              ) : null}
              {primaryBtn}
            </>,
            slot,
          ) : null}
        </div>
      )}
    </Modal>
  );
}

function MoreMenu({
  open,
  onOpenChange,
  items,
  label,
  title,
  disabled,
  aiId: triggerAiId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: MenuItem[];
  label: string;
  title: string;
  disabled?: boolean;
  aiId?: string;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const pane = useRef<HTMLElement | null>(null);
  const list = useRef<HTMLElement | null>(null);
  const menuId = useId();
  const pop = usePopover({ open, onClose: () => onOpenChange(false), trigger: btn, popup: pane });

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      list.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  function onKey(e: ReactKeyboardEvent<HTMLElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      pop.close("select");
      return;
    }
    const all = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (!all.length) return;
    const at = all.findIndex((x) => x === document.activeElement);
    const to =
      e.key === "ArrowDown" ? (at + 1) % all.length
        : e.key === "ArrowUp" ? (at <= 0 ? all.length - 1 : at - 1)
          : e.key === "Home" ? 0
            : e.key === "End" ? all.length - 1
              : -1;
    if (to < 0) return;
    e.preventDefault();
    all[to].focus({ preventScroll: true });
  }

  function pick(item: MenuItem) {
    pop.close("select");
    item.onSelect?.();
  }

  const bindPane = (el: HTMLDivElement | null) => {
    pane.current = el;
  };
  const bindList = (el: HTMLDivElement | null) => {
    list.current = el;
  };
  const bindBoth = (el: HTMLDivElement | null) => {
    pane.current = el;
    list.current = el;
  };

  const rows = items.map((it, i) => (
    <Fragment key={it.key}>
      {i > 0 && it.group !== items[i - 1].group ? <div role="separator" className="uamenu__sep" /> : null}
      {it.href ? (
        <Link
          href={it.href}
          role="menuitem"
          tabIndex={-1}
          className="dsel__opt uamenu__i"
          title={it.title}
          data-ai-id={it.aiId}
          onClick={() => pop.close("select")}
        >
          {it.icon}
          <span>{it.label}</span>
        </Link>
      ) : (
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          className={`dsel__opt uamenu__i${it.danger ? " uamenu__i--danger" : ""}`}
          data-ai-id={it.aiId}
          onClick={() => pick(it)}
        >
          {it.icon}
          <span>{it.label}</span>
        </button>
      )}
    </Fragment>
  ));

  const popup: ReactNode = !open ? null : pop.isSheet ? (
    <>
      <div className="dsel__scrim" style={{ zIndex: pop.z - 1 }} aria-hidden="true" />
      <div ref={bindPane} className="dsel__sheet uamenu__sheet" role="dialog" aria-label={title} tabIndex={-1} data-placement="sheet" style={pop.style} onKeyDown={onKey}>
        <div className="dsel__shead">
          <span className="dsel__grip" aria-hidden="true" />
          <b className="dsel__stitle">{title}</b>
        </div>
        <div ref={bindList} id={menuId} role="menu" aria-label={title} className="dsel__menu uamenu">
          {rows}
        </div>
      </div>
    </>
  ) : (
    <div
      ref={bindBoth}
      id={menuId}
      role="menu"
      aria-label={title}
      tabIndex={-1}
      className="dsel__menu uamenu"
      data-placement={pop.placement}
      style={pop.style}
      onKeyDown={onKey}
    >
      {rows}
    </div>
  );

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="btn btn--line uadf__more"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
        data-ai-id={triggerAiId}
        data-ai-label={title}
        data-ai-description={triggerAiId ? items.map((x) => x.label).join(", ") : undefined}
      >
        <IconMoreHorizontal aria-hidden="true" />
        {label}
      </button>
      {popup ? createPortal(popup, document.body) : null}
    </>
  );
}

// ── Status, by the record's own rules ──────────────────────────────
// lifecycle.next_statuses is the whole permitted set — a status outside it is
// answered 409 ("in_progress holatidan open_pool holatiga o'tkazib
// bo'lmaydi") — so the control offers exactly that and disappears on a final
// status, where the list is empty.
function StatusStep({
  req,
  choices,
  slot,
  busy,
  onBack,
  onDirty,
  onMove,
}: {
  req: UrgentRequest;
  choices: string[];
  slot: HTMLElement | null;
  busy: boolean;
  onBack: () => void;
  onDirty: (dirty: boolean) => void;
  onMove: (status: string, note: string) => void;
}) {
  const t = useTranslations("admin.urgent");
  const tcm = useTranslations("portal.common");
  const urg = useUrgentStatuses();
  const urgLabel = (s: string) => statusSpecOf(urg, s, statusLabel(tcm, s))?.label ?? "";
  const uid = useId();
  const [next, setNext] = useState("");
  const [note, setNote] = useState("");
  const sel = choices.includes(next) ? next : "";
  const withNote = !!sel && sel !== "claimed";
  useReportDirty(!!sel || !!note.trim(), onDirty);
  useAiField(aiId(AI_ITEM, req.id, "status"), {
    get: () => sel,
    set: (raw) => {
      const v = aiPick(choices.map((s) => ({ value: s, label: urgLabel(s) })), raw);
      if (v) setNext(v);
    },
    disabled: busy,
  });

  function submit() {
    if (!sel || busy) return;
    onMove(sel, withNote ? note.trim() : "");
  }

  return (
    <div className="uad__form uad__form--flat" data-ai-id={aiId(AI_ITEM, req.id, "status")} data-ai-type="select" data-ai-label={t("moveTo")} data-ai-private>
      <p className="advmuted uad__lead">{t("statusNow", { status: urgLabel(statusOf(req)) })}</p>
      <div className="uad__field">
        <span className="uad__lbl" id={`${uid}-l`}>{t("statusPick")}</span>
        <div className="ccpick" role="radiogroup" aria-labelledby={`${uid}-l`} aria-required="true">
          {choices.map((s) => (
            <label key={s} className={`ccpick__o${sel === s ? " on" : ""}`}>
              <input className="ccpick__in" type="radio" name={`${uid}-s`} value={s} checked={sel === s} onChange={() => setNext(s)} />
              <span className="ccpick__dot" aria-hidden="true" />
              <span className="ccpick__m"><b>{urgLabel(s)}</b></span>
            </label>
          ))}
        </div>
      </div>
      {withNote ? (
        <div>
          <label htmlFor={`${uid}-n`}>{t("statusNotePh")}</label>
          <textarea id={`${uid}-n`} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      ) : null}
      {slot
        ? createPortal(
            <>
              <button type="button" className="btn btn--line" disabled={busy} onClick={onBack}>{t("back")}</button>
              <button type="button" className="btn btn--pri" disabled={!sel || busy} onClick={submit}>
                {busy ? tcm("processingShort") : t("statusSave")}
              </button>
            </>,
            slot,
          )
        : null}
    </div>
  );
}

function CompleteForm({
  slot,
  busy,
  onBack,
  onDirty,
  onSubmit,
}: {
  slot: HTMLElement | null;
  busy: boolean;
  onBack: () => void;
  onDirty: (dirty: boolean) => void;
  onSubmit: (summary: string, nextAction: string) => void;
}) {
  const t = useTranslations("admin.urgent");
  const tcm = useTranslations("portal.common");
  const [summary, setSummary] = useState("");
  const [next, setNext] = useState("");
  const short = summary.trim().length < MIN_SUMMARY;
  useReportDirty(!!summary.trim() || !!next.trim(), onDirty);

  function submit() {
    if (short || busy) return;
    onSubmit(summary.trim(), next.trim());
  }

  return (
    <div className="uad__form uad__form--flat" data-ai-private>
      <p className="advmuted uad__lead">{t("completeLead")}</p>
      <div>
        <label htmlFor="uad-sum">{t("summary")}</label>
        <textarea
          id="uad-sum"
          rows={3}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder={t("summaryPh")}
          aria-required="true"
          aria-describedby="uad-sum-min"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <p id="uad-sum-min" className={`uad__hint${short ? "" : " ok"}`}>{t("minChars", { n: MIN_SUMMARY })}</p>
      </div>
      <div>
        <label htmlFor="uad-next">{t("nextAction")}</label>
        <input id="uad-next" type="text" value={next} onChange={(e) => setNext(e.target.value)} placeholder={t("nextActionPh")} />
      </div>
      {slot
        ? createPortal(
            <>
              <button type="button" className="btn btn--line" disabled={busy} onClick={onBack}>{t("back")}</button>
              <button type="button" className="btn btn--pri" disabled={short || busy} onClick={submit}>
                <IconCheck />{busy ? tcm("processingShort") : t("completeSubmit")}
              </button>
            </>,
            slot,
          )
        : null}
    </div>
  );
}

function CancelForm({
  slot,
  busy,
  onBack,
  onDirty,
  onSubmit,
}: {
  slot: HTMLElement | null;
  busy: boolean;
  onBack: () => void;
  onDirty: (dirty: boolean) => void;
  onSubmit: (reason: string) => void;
}) {
  const t = useTranslations("admin.urgent");
  const tcm = useTranslations("portal.common");
  const [reason, setReason] = useState("");
  const short = reason.trim().length < MIN_REASON;
  useReportDirty(!!reason.trim(), onDirty);

  function submit() {
    if (short || busy) return;
    onSubmit(reason.trim());
  }

  return (
    <div className="uad__form uad__form--flat" data-ai-private>
      <p className="advmuted uad__lead">{t("cancelLead")}</p>
      <div>
        <label htmlFor="uad-reason">{t("reason")}</label>
        <input
          id="uad-reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("reasonPh")}
          aria-required="true"
          aria-describedby="uad-reason-min"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <p id="uad-reason-min" className={`uad__hint${short ? "" : " ok"}`}>{t("minChars", { n: MIN_REASON })}</p>
      </div>
      {slot
        ? createPortal(
            <>
              <button type="button" className="btn btn--line" disabled={busy} onClick={onBack}>{t("back")}</button>
              <button type="button" className="btn btn--danger" disabled={short || busy} onClick={submit}>
                <IconClose />{busy ? tcm("processingShort") : t("cancelRequest")}
              </button>
            </>,
            slot,
          )
        : null}
    </div>
  );
}

// ── Handing the work to another advocate ───────────────────────────
// Same ranked candidate list the group assignment uses, but one pick: the
// backend moves assigned_lawyer AND claimed_by to the target and records it
// in payload.transfer_history (verified against production).
function TransferPanel({
  req,
  slot,
  busy,
  onBack,
  onDirty,
  onSubmit,
}: {
  req: UrgentRequest;
  slot: HTMLElement | null;
  busy: boolean;
  onBack: () => void;
  onDirty: (dirty: boolean) => void;
  onSubmit: (targetUserId: string, reason: string, name: string) => void;
}) {
  const t = useTranslations("admin.urgent");
  const tcm = useTranslations("portal.common");
  const te = useTranslations("enums");
  const [list, setList] = useState<UrgentCandidate[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [fail, setFail] = useState<unknown>(undefined);
  const [tries, setTries] = useState(0);
  const [pick, setPick] = useState("");
  const [reason, setReason] = useState("");
  const [shown, setShown] = useState(CAND_PAGE);
  useReportDirty(!!pick || !!reason.trim(), onDirty);

  useEffect(() => {
    let alive = true;
    listUrgentCandidates(req.id, { limit: 50 })
      .then((c) => { if (alive) { setList(c); setState("ready"); } })
      .catch((e) => { if (alive) { logApiError("urgent transfer candidates", e); setFail(e); setState("error"); } });
    return () => { alive = false; };
  }, [req.id, tries]);

  // Whoever holds it now cannot be the target.
  const holder = req.assignedLawyerUserId || req.claimedByUserId;
  const options = useMemo(
    () => [...list].filter((c) => c.userId !== holder).sort((a, b) => b.score - a.score),
    [list, holder],
  );
  const visible = options.slice(0, shown);
  const rest = options.length - visible.length;

  return (
    <section className="uad__form uad__form--flat" data-ai-private>
      <p className="advmuted uad__lead">{t("transferLead")}</p>
      <div className="uad__field">
        <span className="uad__lbl" id="uad-tpick">{t("transferPick")}</span>
        {state === "loading" ? (
          <Skeleton rows={2} />
        ) : state === "error" ? (
          <ErrorState
            compact
            title={t("candidatesError")}
            error={fail}
            onRetry={() => {
              setState("loading");
              setTries((n) => n + 1);
            }}
          />
        ) : !options.length ? (
          <p className="advmuted">{t("noAdvocates")}</p>
        ) : (
          <>
            <ul className="ucand__list ucand__list--paged" aria-labelledby="uad-tpick">
              {visible.map((c) => (
                <li key={c.userId}>
                  <button type="button" className={`ucand${pick === c.userId ? " on" : ""}`} aria-pressed={pick === c.userId} onClick={() => setPick(c.userId)}>
                    <span className="ucand__score" aria-hidden>{c.score}</span>
                    <span className="ucand__m">
                      <b>{c.name}</b>
                      <span className="ucand__meta">{[...candidateMeta(t, te, c), t("workloadN", { n: c.workload })].filter(Boolean).join(" · ")}</span>
                      {c.specializations.length ? (
                        <span className="ucand__spec">{c.specializations.map((x) => directionLabel(te, x, t)).join(", ")}</span>
                      ) : null}
                    </span>
                    <span className="ucand__tags">
                      {!c.directionMatch ? <em className="ucand__tag ucand__tag--warn"><IconAlert />{t("tagOffDirection")}</em> : null}
                    </span>
                    {pick === c.userId ? <IconCheck className="ucand__ck" /> : null}
                  </button>
                </li>
              ))}
            </ul>
            {rest > 0 ? (
              <button type="button" className="btn btn--line btn--sm ucand__page" onClick={() => setShown((n) => n + CAND_PAGE)}>
                {t("showMore", { n: rest })}
              </button>
            ) : null}
          </>
        )}
      </div>
      <div>
        <label htmlFor="uad-treason">{t("reason")}</label>
        <input id="uad-treason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("transferReasonPh")} />
      </div>
      {slot
        ? createPortal(
            <>
              <button type="button" className="btn btn--line" disabled={busy} onClick={onBack}>{t("back")}</button>
              <button
                type="button"
                className="btn btn--pri"
                disabled={!pick || busy}
                onClick={() => onSubmit(pick, reason.trim(), list.find((c) => c.userId === pick)?.name ?? "")}
              >
                <IconUsers />{busy ? tcm("processingShort") : t("transferSubmit")}
              </button>
            </>,
            slot,
          )
        : null}
    </section>
  );
}

// ── Picking the panel ──────────────────────────────────────────────
// The backend ranks the candidates and says why (`score`, `reasons`); this
// shows them in that order and puts anyone who does not cover the request's
// practice area last, behind a warning, because assigning one is refused
// unless the operator says so on purpose.
function CandidatePanel({
  req,
  slot,
  onBack,
  onDirty,
  onBusy,
  onDone,
}: {
  req: UrgentRequest;
  slot: HTMLElement | null;
  onBack: () => void;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
  onDone: (r: UrgentRequest, msg: string) => void;
}) {
  const t = useTranslations("admin.urgent");
  const te = useTranslations("enums");
  const errId = "ucand-err";
  const errBox = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<UrgentCandidate[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [fail, setFail] = useState<unknown>(undefined);
  const [ids, setIds] = useState<string[]>(req.groupLawyerUserIds);
  const [date, setDate] = useState("");
  // Empty, not a prefilled 16:00: the copy under these fields says the time is
  // optional, and a default the operator never chose is what actually decides
  // whether assign-group returns `scheduled` or `in_progress`.
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Only offered once the backend has actually refused for that reason —
  // "Oddiy UI uchun override ishlatmaslik tavsiya qilinadi."
  const [okCount, setOkCount] = useState(false);
  const [okDirection, setOkDirection] = useState(false);
  const [offer, setOffer] = useState<"" | "count" | "direction">("");
  const [external, setExternal] = useState(true);
  const [callcenter, setCallcenter] = useState(true);
  // "Umumiy qidiruv" — the same ranking without a request behind it. Used when
  // the request's own practice area turns up nobody free: the operator widens
  // to other areas or another region rather than being stuck with an empty
  // list. Empty means "search by the request", which is the default.
  const [wide, setWide] = useState(false);
  const [wideDirs, setWideDirs] = useState<string[]>(req.directions);
  const [wideRegion, setWideRegion] = useState(req.region);
  const [applied, setApplied] = useState(0);
  const [shown, setShown] = useState(CAND_PAGE);

  // Back to the skeleton the moment the source changes, during render — doing
  // it in the effect would leave the previous list on screen for a frame while
  // already claiming to be loading something else.
  const fetchKey = `${req.id}|${external}|${callcenter}|${wide}|${applied}`;
  const [prevKey, setPrevKey] = useState(fetchKey);
  if (fetchKey !== prevKey) {
    setPrevKey(fetchKey);
    setState("loading");
    setShown(CAND_PAGE);
  }

  useEffect(() => {
    let alive = true;
    const load = wide
      ? searchUrgentCandidates({ directions: wideDirs, region: wideRegion, limit: 50 })
      : listUrgentCandidates(req.id, { includeExternal: external, includeCallcenter: callcenter, limit: 50 });
    load
      .then((c) => { if (alive) { setList(c); setState("ready"); } })
      .catch((e) => { if (alive) { logApiError("urgent candidates", e); setFail(e); setState("error"); } });
    return () => { alive = false; };
    // wideDirs / wideRegion are read on apply, not per keystroke — `applied`
    // is what re-runs the wide search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req.id, external, callcenter, wide, applied]);

  useEffect(() => {
    if (err) errBox.current?.scrollIntoView({ block: "nearest" });
  }, [err]);

  const [matched, mismatched] = useMemo(() => {
    const sorted = [...list].sort((a, b) => b.score - a.score);
    return [sorted.filter((c) => c.directionMatch), sorted.filter((c) => !c.directionMatch)];
  }, [list]);
  const shownMatched = matched.slice(0, shown);
  const shownOff = mismatched.slice(0, Math.max(0, shown - matched.length));
  const rest = matched.length + mismatched.length - shownMatched.length - shownOff.length;

  const startIds = req.groupLawyerUserIds;
  const changed = ids.length !== startIds.length || ids.some((x) => !startIds.includes(x));
  useReportDirty(changed || !!date || !!time || !!note.trim(), onDirty);

  const regionSeen = new Map<string, string>();
  for (const v of [wideRegion, req.region, ...list.map((c) => c.region)]) {
    const raw = (v || "").trim();
    if (!raw) continue;
    const k = regionKeyOf(te, raw) || raw.toLowerCase();
    if (!regionSeen.has(k)) regionSeen.set(k, raw);
  }
  const regionOpts = [{ value: "", label: te("regions.all") }, ...[...regionSeen.values()].map((v) => ({ value: v, label: regionLabel(te, v) }))];

  const want = req.lawyerCount || 2;
  // The client asked for `want` advocates, so `want` is what can be ticked.
  // The picker used to take as many as the operator clicked and only find out
  // on submit, when the backend refused the whole panel — with four ticked
  // against a request for three, every click after the third was work thrown
  // away. Deselecting always works, so a full panel can still be changed.
  //
  // The cap lifts once the count override is on. That checkbox only appears
  // after the backend has refused the count, which it still can: the operator
  // reaches that refusal by submitting FEWER than asked, and from then on may
  // deliberately go over.
  const full = !okCount && ids.length >= want;
  const toggle = (uid: string) => {
    setErr("");
    setIds((cur) => {
      if (cur.includes(uid)) return cur.filter((x) => x !== uid);
      if (!okCount && cur.length >= want) return cur;
      return [...cur, uid];
    });
  };

  async function submit() {
    if (!ids.length || busy) return;
    setBusy(true);
    onBusy(true);
    setErr("");
    try {
      // The operator picks a local wall clock, so the offset comes from the
      // browser rather than a hardcoded +05:00 — a staff account abroad would
      // otherwise schedule the panel five hours out. Leaving the time empty is
      // allowed: the record then becomes `in_progress` instead of `scheduled`.
      const scheduledAt = date && time ? new Date(`${date}T${time}:00`).toISOString() : undefined;
      const out = await assignUrgentGroup(req.id, {
        lawyerUserIds: ids,
        scheduledAt,
        note: note.trim(),
        allowCountOverride: okCount,
        allowDirectionMismatch: okDirection,
      });
      onDone(out, t("notify.groupAssigned", { n: ids.length }));
    } catch (e) {
      const refusal = urgentAssignRefusal(e);
      // A panel below the service minimum is a real validation error, not a
      // choice: there is no override for it, so none is offered.
      if (refusal?.kind === "minimum") {
        setOffer("");
        setErr(t("belowMinimum", { min: refusal.minimum, got: refusal.selected || ids.length }));
      } else if (refusal?.kind === "count") {
        setOffer("count");
        setErr(t("countMismatch", { want: refusal.requested || want, got: refusal.selected || ids.length }));
      } else if (refusal?.kind === "direction") {
        setOffer("direction");
        setErr(t("directionMismatch", { n: refusal.userIds.length }));
      } else {
        logApiError("urgent assign-group", e);
        notify.error(t("notify.groupFailed"), { id: ntfId(req.id), error: e });
      }
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }

  // The operator's own today, not UTC's: toISOString() names the previous day
  // right through the Tashkent small hours (00:00–05:00 local is still
  // yesterday at +00:00), and the picker was letting a panel be scheduled into
  // a date that had already passed. Same wall clock the submit above reads.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const row = (c: UrgentCandidate) => (
    <li key={c.userId}>
      {/* Disabled rather than silently inert once the panel is full: a row
          that does nothing when clicked, with no reason on screen, is the
          worse of the two. */}
      <button
        type="button"
        className={`ucand${ids.includes(c.userId) ? " on" : ""}`}
        aria-pressed={ids.includes(c.userId)}
        disabled={full && !ids.includes(c.userId)}
        title={full && !ids.includes(c.userId) ? t("pickedFullHint", { n: want }) : undefined}
        onClick={() => toggle(c.userId)}
      >
        <span className="ucand__score" aria-hidden>{c.score}</span>
        <span className="ucand__m">
          <b>{c.name}</b>
          <span className="ucand__meta">
            {[
              ...candidateMeta(t, te, c),
              c.rating ? `${c.rating.toFixed(1)}★ (${c.reviewsCount})` : "",
              c.successRate ? t("successRate", { n: Math.round(c.successRate) }) : "",
              t("workloadN", { n: c.workload }),
            ].filter(Boolean).join(" · ")}
          </span>
          {c.specializations.length ? (
            <span className="ucand__spec">{c.specializations.map((s) => directionLabel(te, s, t)).join(", ")}</span>
          ) : null}
        </span>
        <span className="ucand__tags">
          {c.isCallcenterMember ? <em className="ucand__tag ucand__tag--cc">{t("tagCallcenter")}</em> : null}
          {c.isExternalSeller ? <em className="ucand__tag">{t("tagExternal")}</em> : null}
          {!c.directionMatch ? <em className="ucand__tag ucand__tag--warn"><IconAlert />{t("tagOffDirection")}</em> : null}
        </span>
        {ids.includes(c.userId) ? <IconCheck className="ucand__ck" /> : null}
      </button>
    </li>
  );

  return (
    <section className="uad__sec uad__sec--flat ucand__wrap">
      <h4>
        <IconStar />{t("candidates")}
        {/* How many of the asked-for places are taken, next to the heading:
            the cap is only obvious once you can see the count it counts to. */}
        <em className={`ucand__count${full ? " ucand__count--full" : ""}`}>{ids.length} / {want}</em>
      </h4>
      <p className="advmuted uad__note">{t("candidatesLead", { n: want })}</p>

      <div className="ucand__filters">
        <CheckBox id="ucand-ext" checked={external} onChange={setExternal} disabled={wide}>{t("includeExternal")}</CheckBox>
        <CheckBox id="ucand-cc" checked={callcenter} onChange={setCallcenter} disabled={wide}>{t("includeCallcenter")}</CheckBox>
        <button type="button" className="btn btn--line btn--sm" aria-pressed={wide} onClick={() => setWide((v) => !v)}>
          <IconStar />{wide ? t("searchNarrow") : t("searchWide")}
        </button>
      </div>

      {wide ? (
        <div className="ucand__wide">
          <p className="advmuted uad__note">{t("searchWideLead")}</p>
          <span className="uad__lbl" id="ucand-dirs">{t("directions")}</span>
          <div className="chiprow" style={{ margin: 0 }} role="group" aria-labelledby="ucand-dirs">
            {DIRECTION_SLUGS.map((d) => (
              <button
                key={d}
                type="button"
                className="fchip"
                aria-pressed={wideDirs.includes(d)}
                onClick={() => setWideDirs((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))}
              >
                {directionLabel(te, d, t)}
              </button>
            ))}
          </div>
          <span className="uad__lbl" id="ucand-reg">{t("region")}</span>
          <div className="ucand__widerow">
            <Select value={wideRegion} onChange={setWideRegion} options={regionOpts} labelId="ucand-reg" />
            <button type="button" className="btn btn--line btn--sm" onClick={() => setApplied((n) => n + 1)}>
              {t("searchApply")}
            </button>
          </div>
        </div>
      ) : null}

      {state === "loading" ? (
        <Skeleton rows={3} />
      ) : state === "error" ? (
        <ErrorState compact title={t("candidatesError")} error={fail} onRetry={() => setApplied((n) => n + 1)} />
      ) : !list.length ? (
        <p className="advmuted">{t("noAdvocates")}</p>
      ) : (
        <>
          {shownMatched.length ? <ul className="ucand__list ucand__list--paged">{shownMatched.map(row)}</ul> : null}
          {shownOff.length ? (
            <>
              <p className="ucand__warn"><IconAlert />{t("offDirectionLead")}</p>
              <ul className="ucand__list ucand__list--paged ucand__list--off">{shownOff.map(row)}</ul>
            </>
          ) : null}
          {rest > 0 ? (
            <button type="button" className="btn btn--line btn--sm ucand__page" onClick={() => setShown((n) => n + CAND_PAGE)}>
              {t("showMore", { n: rest })}
            </button>
          ) : null}
        </>
      )}

      <p className={`ucand__count${ids.length === want ? " ok" : ""}`}>
        {t("pickedOf", { n: ids.length, want })}
      </p>

      <div className="uaq__when2">
        <div>
          <span className="uad__lbl">{t("date")}</span>
          <DatePicker value={date} onChange={setDate} placeholder={t("datePh")} ariaLabel={t("date")} min={today} />
        </div>
        <div>
          <span className="uad__lbl">{t("time")}</span>
          <TimePicker value={time} onChange={setTime} placeholder={t("timePh")} ariaLabel={t("time")} />
        </div>
      </div>
      <p className="advmuted uad__note">{t("timeOptional")}</p>

      <div>
        <label className="uad__lbl" htmlFor="uaq-note">{t("note")}</label>
        <textarea id="uaq-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePh")} />
      </div>

      <div ref={errBox} className="ucand__errs">
        <FieldError id={errId} msg={err} />
        {offer === "count" ? (
          <CheckBox id="uad-ovc" checked={okCount} onChange={setOkCount} hint={t("overrideCountHint")}>{t("overrideCount")}</CheckBox>
        ) : null}
        {offer === "direction" ? (
          <CheckBox id="uad-ovd" checked={okDirection} onChange={setOkDirection} hint={t("overrideDirectionHint")}>{t("overrideDirection")}</CheckBox>
        ) : null}
      </div>

      {slot
        ? createPortal(
            <>
              <button type="button" className="btn btn--line" disabled={busy} onClick={onBack}>{t("back")}</button>
              <button type="button" className="btn btn--pri" disabled={!ids.length || busy} onClick={() => void submit()} aria-describedby={err ? errId : undefined}>
                <IconUsers />{busy ? t("assigning") : t("assignSubmit")}
              </button>
            </>,
            slot,
          )
        : null}
    </section>
  );
}
