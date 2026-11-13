"use client";

import { urgentStage } from "@/lib/urgentStage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  listAssignedUrgentRequests,
  getUrgentRequest,
  isUrgentEvent,
  urgentEventInfo,
  isMissingRoute,
  type UrgentRequest,
} from "@/lib/services/backend";
import { subscribeUserEvents, onUserSocketResync } from "@/lib/userSocket";
import { ApiError, logApiError } from "@/lib/http";
import { dateTimeFull } from "@/lib/date";
import { statusLabel, statusSpecOf, regionLabel, humanize, type StatusTone } from "@/lib/labels";
import { notify } from "@/lib/toast";
import { fmtUzs } from "@/lib/money";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { hasRole } from "@/lib/permissions";
import DutyAiDraft, { urgentDraftContext } from "@/components/portal/dutyDraft/DutyAiDraft";
import WorkFilterBar, { inPeriod, useStoredFilters, type Period } from "./WorkFilterBar";
import { matchesSearch } from "@/lib/searchText";
import { aiId, aiSeg } from "@/lib/ai/ids";
import { useAiReveal } from "@/lib/guide/targets";
import CallRoom from "@/components/chat/CallRoom";
import PhoneLock from "@/components/marketplace/order/PhoneLock";
import { Skeleton, EmptyState, ErrorState } from "./DataState";
import IconButton from "@/components/ui/IconButton";
import { StatusBadge } from "@/components/ui/Badge";
import { Chip, CodeRow, Disclosure, Facts, Failed, Grid, Group, Hero, History, NextFact, People, Root, Skeleton as DkSkeleton, When, statusIcon, useWhen, type DkTone, type HistoryStep, type Person } from "@/components/ccx/panel/Detail";
import { IcBolt, IcCoins, IcInbox, IcMeeting, IcTimeline } from "@/components/ccx/icons";
import { useUrgentStatuses } from "@/components/admin/UrgentAdvocateQueue";
import {
  IconBolt,
  IconVideo,
  IconChat,
  IconUsers,
  IconScale,
  IconClock,
  IconCheck,
  IconCalendar,
  IconPhone,
  IconMapPin,
  IconFileText,
  IconRefresh,
  IconChevronRight,
  IconClose,
  IconVideoConsult,
  IconExpressCall,
  IconTrafficCase,
  IconChatConsult,
  IconSecondOpinion,
  IconOpinionPanel,
  IconClipboardCheck,
  IconBriefcase,
  IconMic,
} from "@/components/icons";

const px = (n: number) => ({ width: n, height: n, style: { width: n, height: n } });

// "Mening Tezkor ishlarim" — the advocate's and lawyer's side of Tezkor
// Advokat, on GET /urgent-advokat/requests/assigned (backend 273953a,
// 2026-09-26).
//
// Before that endpoint existed this screen could not be built: the client's
// own list answers [] for staff and the call-centre detail is 403 for anyone
// outside the call centre, so an advocate assigned to a group second opinion
// was invited to a meeting with no way to read what it was about. The invite
// itself still arrives as the ring card (IncomingCallWatcher); this is where
// the work behind it lives.
//
// It is a PARTICIPANT view, not an operator one. The record carries canManage
// — true for call-centre staff, false for an assigned external advocate — and
// nothing here offers an action that a read-only participant cannot take. The
// backend also withholds the client's phone from an external advocate, so no
// field assumes it is there.
const KINDS = [
  "video_consultation",
  // The two on-duty kinds (backend 2026-09-28): routed straight to whoever is
  // on duty rather than sitting in the pool.
  "express_video_consultation",
  "traffic_accident_consultation",
  "chat_consultation",
  "second_opinion_single",
  "second_opinion_group",
] as const;

// The endpoint answers in the record's own order, which buries a meeting
// twenty minutes away under a case that was completed last week. Rank by how
// much the advocate still has to do about it: a room that is open now, then a
// time somebody expects them at, then work in hand, then everything finished.
// An unrecognised status sits between the two — new backend states must not
// disappear to the bottom of the list before anyone has seen them.
const ATTENTION_RANK = new Map([
  ["meeting_active", 0],
  ["scheduled", 1],
  ["claimed", 2],
  ["in_progress", 2],
  ["open_pool", 3],
]);
const RANK_UNKNOWN = 5;
const RANK_DONE = 9;
const DONE_STATUSES = new Set(["completed", "cancelled", "expired"]);
function attentionRank(status: string): number {
  return ATTENTION_RANK.get(status) ?? (DONE_STATUSES.has(status) ? RANK_DONE : RANK_UNKNOWN);
}
// A record the advocate has to turn up to: it carries a time and has not been
// run yet. This is the only place a panel meeting they were chosen for is
// visible to them — the invite itself is a ring card that lasts seconds.
function isUpcoming(r: UrgentRequest): boolean {
  return !!r.scheduledAt && (r.status === "scheduled" || r.status === "meeting_active");
}

// LEXGO_SECOND_OPINION_GROUP_CALLCENTER_FLOW_2026-09-28.md L62-67: the chosen
// advocate must see the DIRECTIONS the client asked about. They arrive as the
// Uzbek slugs the client form sends (payload.directions — the live list has
// ["iqtisodiy","jinoiy"] on an open group request), while messages/enums.areas
// is keyed by the English practice area. So te.has("areas.iqtisodiy") was
// false for every one of them and the row printed the bare slug, which reads
// as nothing at all to a Russian- or English-language advocate.
//
// The same table and lookup already exist, module-private, in
// components/admin/UrgentAdvocateQueue.tsx:110-128, which this workpackage
// does not own and therefore cannot export from. It is repeated here rather
// than left broken; the lead has the move to lib/labels.ts in the handover.
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
// apostrophe is dropped before the lookup; a slug with no practice area of its
// own ("ytx", "avtoavariya") is humanized rather than blanked.
function directionLabel(te: Te, slug: string): string {
  const key = slug.trim().toLowerCase().replace(/[‘’'`]/g, "");
  const area = DIRECTION_AREA[key];
  if (area && te.has(`areas.${area}`)) return te(`areas.${area}`);
  if (te.has(`areas.${key}`)) return te(`areas.${key}`);
  return humanize(slug);
}

// Whether this advocate can walk into the meeting right now. Both ids are
// required: the room the meeting runs in and the call itself. CallRoom asks
// the backend for its own join token with exactly that pair
// (GET /secure-chats/{room_id}/calls/{call_id}/join-token), which is the only
// route open to a participant — POST /meeting lives under the call-center
// prefix and answers 403 for an assigned external advocate.
function joinable(r: UrgentRequest): boolean {
  return !!r.callId && !!r.secureChatRoomId;
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

type State = { status: "loading" | "ready" | "error" | "missing"; items: UrgentRequest[] };


export default function UrgentAssignedPanel() {
  const t = useTranslations("portal.seller.urgent");
  const tk = useTranslations("portal.client.urgent");
  const tcm = useTranslations("portal.common");
  const te = useTranslations("enums");
  const tq = useTranslations("admin.urgent");
  const tn = useTranslations("common.notify");
  const urg = useUrgentStatuses();
  const locale = useLocale();
  const { session } = useAuth();
  // The advocate cabinet calls it "messages", the lawyer one "chat".
  const chatHref = session?.role === "lawyer" ? "/portal/lawyer/chat" : "/portal/advocate/messages";

  const tf = useTranslations("portal.workFilters");
  const [f, setF, resetF] = useStoredFilters("urgent", { q: "", owner: "", stage: "active", kind: "", period: "", sort: "attention" });
  const [state, setState] = useState<State>({ status: "loading", items: [] });
  const [openId, setOpenId] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  // The meeting this advocate has walked into, if any. Opened from the row's
  // own join button — see the button for why it carries no LiveKit creds.
  const [meeting, setMeeting] = useState<{ roomId: string; callId: string; callType: "audio" | "video"; title: string } | null>(null);

  const load = useCallback(
    () =>
      listAssignedUrgentRequests({})
        .then((items): unknown => {
          setState({ status: "ready", items });
          return null;
        })
        .catch((e: unknown): unknown => {
          logApiError("urgent assigned", e);
          // A backend without the endpoint, and a role it does not apply to,
          // are both "nothing here" rather than a broken page.
          const denied = e instanceof ApiError && (e.status === 401 || e.status === 403);
          setState((s) => ({
            status: isMissingRoute(e) || denied ? "missing" : s.items.length ? "ready" : "error",
            items: s.items,
          }));
          return isMissingRoute(e) || denied ? null : e;
        }),
    [],
  );

  async function refresh() {
    if (refreshing) return;
    const had = state.items.length > 0;
    setRefreshing(true);
    const e = await load();
    setRefreshing(false);
    if (e && had) notify.error(tq("notify.listFailed"), { id: "urgent-assigned-refresh", error: e, action: { label: tn("retry"), onClick: () => void refresh() } });
    else if (!e) notify.dismiss("urgent-assigned-refresh");
  }
  const stLabel = (s: string) => statusSpecOf(urg, s, statusLabel(tcm, s))?.label ?? "";

  useEffect(() => {
    void load();
  }, [load]);

  // Claimed, scheduled, a meeting created, completed, cancelled — every one of
  // them can happen while this page is open and none of them originate here.
  const reload = useRef(load);
  useEffect(() => { reload.current = load; }, [load]);
  useEffect(() => {
    const off = subscribeUserEvents((e) => { if (isUrgentEvent(e.event)) void reload.current(); });
    const offSync = onUserSocketResync(() => void reload.current());
    const onVisible = () => { if (document.visibilityState === "visible") void reload.current(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { off(); offSync(); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  // Sorted here rather than asked of the backend: the endpoint takes status
  // and service_kind filters only, and a copy is made because state.items is
  // the array the fetch put in state.
  const me = session?.id ?? "";
  const ownerOf = useCallback(
    (r: UrgentRequest): "free" | "mine" | "others" => {
      const taker = r.claimedByUserId || r.assignedLawyerUserId;
      if (!taker) return "free";
      return r.claimedByUserId === me || r.assignedLawyerUserId === me ? "mine" : "others";
    },
    [me],
  );
  const base = useMemo(
    () =>
      state.items.filter((r) => {
        if (f.kind && r.serviceKind !== f.kind) return false;
        if (!inPeriod(r.createdAt, f.period as Period)) return false;
        if (f.q.trim() && !matchesSearch([r.clientName, r.workId, r.need, r.serviceTitle, tk.has(`kinds.${r.serviceKind}`) ? tk(`kinds.${r.serviceKind}`) : ""].join(" "), f.q)) return false;
        return true;
      }),
    [state.items, f.kind, f.period, f.q, tk],
  );
  const ownerCount = (o: string) => base.filter((r) => (!f.stage || urgentStage(r) === f.stage) && (!o || ownerOf(r) === o)).length;
  const stageCount = (st: string) => base.filter((r) => (!f.owner || ownerOf(r) === f.owner) && (!st || urgentStage(r) === st)).length;
  const filtered = useMemo(
    () => base.filter((r) => (!f.owner || ownerOf(r) === f.owner) && (!f.stage || urgentStage(r) === f.stage)),
    [base, f.owner, f.stage, ownerOf],
  );

  const shown = useMemo(() => {
    const when = (r: UrgentRequest) => (r.scheduledAt ? Date.parse(r.scheduledAt) : NaN);
    const made = (r: UrgentRequest) => Date.parse(r.createdAt) || 0;
    if (f.sort === "new") return [...filtered].sort((a, b) => made(b) - made(a));
    if (f.sort === "old") return [...filtered].sort((a, b) => made(a) - made(b));
    return [...filtered].sort((a, b) => {
      const ra = attentionRank(a.status);
      const rb = attentionRank(b.status);
      if (ra !== rb) return ra - rb;
      if (ra < RANK_DONE) {
        const ta = when(a);
        const tb = when(b);
        // Soonest first among the live ones — but an unscheduled record has no
        // clock of its own and must not sort as if its meeting were in 1970.
        if (Number.isNaN(ta) !== Number.isNaN(tb)) return Number.isNaN(ta) ? 1 : -1;
        if (!Number.isNaN(ta) && ta !== tb) return ta - tb;
      }
      return made(b) - made(a); // finished work, and ties: newest first
    });
  }, [filtered, f.sort]);

  useAiReveal(/^advocate\.urgent\.item\./, (id) => {
    const seg = id.split(".")[3] ?? "";
    if (!shown.some((r) => aiSeg(r.id) === seg) && state.items.some((r) => aiSeg(r.id) === seg)) setF({ q: "", owner: "", stage: "", kind: "", period: "" });
  });

  if (state.status === "missing") return null;

  return (
    <section
      className="ppanel uasg"
      data-ai-target={shown.length ? undefined : "urgent-assigned:list"}
      data-ai-id={shown.length ? undefined : "advocate.urgent.list"}
      data-ai-type={shown.length ? undefined : "list"}
      data-ai-label={shown.length ? undefined : t("title")}
    >
      <div className="ppanel__h">
        <b className="ppanel__t"><span className="pico"><IconBolt /></span>{t("title")}</b>
        <IconButton variant="line" label={tq("refresh")} icon={<IconRefresh />} busy={refreshing} onClick={() => void refresh()} tipAlign="end" />
      </div>
      <p className="advmuted uasg__lead">{t("lead")}</p>

      <WorkFilterBar
        q={f.q}
        onQ={(v) => setF({ q: v })}
        placeholder={tf("searchUrgent")}
        chips={[
          {
            key: "stage",
            label: tf("stageLabel"),
            icon: IconClipboardCheck,
            empty: "active",
            value: f.stage,
            onChange: (v) => setF({ stage: v }),
            options: ["active", "completed", "cancelled", ""].map((st) => ({ value: st, label: tf(`stage.${st || "all"}`), count: stageCount(st) })),
          },
          {
            key: "owner",
            label: tf("ownerLabel"),
            icon: IconUsers,
            value: f.owner,
            onChange: (v) => setF({ owner: v }),
            options: ["", "free", "mine", "others"].map((o) => ({ value: o, label: tf(`owner.${o || "all"}`), count: ownerCount(o) })),
          },
        ]}
        selects={[
          {
            key: "kind",
            label: t("fKind"),
            icon: IconBriefcase,
            value: f.kind,
            onChange: (v) => setF({ kind: v }),
            options: [{ value: "", label: t("allKinds") }, ...KINDS.map((k) => ({ value: k, label: tk.has(`kinds.${k}`) ? tk(`kinds.${k}`) : k }))],
          },
        ]}
        period={f.period as Period}
        onPeriod={(v) => setF({ period: v })}
        sort={f.sort}
        onSort={(v) => setF({ sort: v })}
        sortOptions={["attention", "new", "old"].map((o) => ({ value: o, label: tf(`sort.${o}`) }))}
        onReset={resetF}
        resultCount={state.status === "ready" ? filtered.length : undefined}
        aiTarget="urgent-assigned:filters"
        aiBase="advocate.urgent"
      />

      {state.status === "loading" ? (
        <Skeleton rows={3} />
      ) : state.status === "error" ? (
        <ErrorState onRetry={() => load()} />
      ) : !state.items.length ? (
        <EmptyState icon={<IconBolt />} title={t("empty")} text={t("emptyText")} />
      ) : !shown.length ? (
        <div className="wfb__empty">
          <EmptyState icon={<IconBolt />} title={tf("emptyFiltered")} text={tf("emptyFilteredText")} />
          <button type="button" className="btn btn--line btn--sm" onClick={resetF}>{tf("reset")}</button>
        </div>
      ) : (
        <ul className="uasg__list" data-ai-target="urgent-assigned:list" data-ai-label={t("title")} data-ai-id="advocate.urgent.list" data-ai-type="list">
          {shown.map((r) => {
            const Icon = KIND_ICON[r.serviceKind] ?? IconScale;
            const on = openId === r.id;
            const up = isUpcoming(r);
            // The rest of the panel, as the record carries it — minus the
            // advocate who is reading the row. group_lawyers is the only
            // place they learn who else was chosen; there is no roster
            // endpoint a participant may call.
            const peers = up ? r.groupLawyers.filter((g) => g.name && g.id !== session?.id) : [];
            const item = r.id ? aiId("advocate.urgent.item", r.id) : undefined;
            return (
              <li
                key={r.id}
                className={`uasg__row${on ? " uasg__row--on" : ""}${up ? " uasg__row--soon" : ""}`}
                data-ai-id={item}
                data-ai-type="list_item"
                data-ai-entity-type="urgent_advokat_request"
                data-ai-entity-id={r.id || undefined}
                data-ai-label={[tk.has(`kinds.${r.serviceKind}`) ? tk(`kinds.${r.serviceKind}`) : r.serviceTitle || r.serviceKind, r.workId, stLabel(r.status)].filter(Boolean).join(" · ")}
                data-ai-private
              >
                <span className={`uaq__i uaq__i--${r.channel || "video"}`}><Icon /></span>
                <div className="uasg__m">
                  <b>
                    {tk.has(`kinds.${r.serviceKind}`) ? tk(`kinds.${r.serviceKind}`) : r.serviceTitle || r.serviceKind}
                    {r.channel ? (
                      <em className="uaq__ch">{r.channel === "chat" ? <IconChat /> : <IconVideo />}{r.channel === "chat" ? tk("chChat") : tk("chVideo")}</em>
                    ) : null}
                    {r.workId ? <em className="ua__wid" title={tk("workId")}>{r.workId}</em> : null}
                    {/* A participant who is not call-centre staff can read this
                        record but not act on it; saying so beats offering
                        controls that would 403. */}
                    {!r.canManage ? <em className="uasg__ro">{t("readOnly")}</em> : null}
                  </b>
                  {r.need ? <span className="uasg__need">{r.need}</span> : null}
                  <span className="uasg__sub">
                    {[
                      r.clientName,
                      r.region ? regionLabel(te, r.region) : "",
                      // On an upcoming record the directions move into the
                      // block below, where they read as what the meeting is
                      // about instead of one more grey clause.
                      !up && r.directions.length
                        ? r.directions.map((d) => directionLabel(te, d)).join(", ")
                        : "",
                      r.createdAt ? dateTimeFull(r.createdAt, locale) : "",
                    ].filter(Boolean).join(" · ")}
                  </span>
                  {up ? (
                    <div className="uasg__up">
                      <b><IconCalendar />{t("upcoming")}</b>
                      {/* dateTimeFull renders in the viewer's own zone; the
                          advocate has to be somewhere at a local time, not at
                          the UTC string the record stores. */}
                      <span className="uasg__up__when">{dateTimeFull(r.scheduledAt, locale)}</span>
                      {r.directions.length ? (
                        <span className="uasg__tags">
                          {r.directions.map((d) => (
                            <em key={d} className="uasg__tag">{directionLabel(te, d)}</em>
                          ))}
                        </span>
                      ) : null}
                      {peers.length ? (
                        <span className="uasg__up__peers"><IconUsers />{t("panelOthers")}: {peers.map((g) => g.name).join(", ")}</span>
                      ) : null}
                    </div>
                  ) : r.scheduledAt ? (
                    <span className="uasg__when"><IconCalendar />{t("scheduledFor", { when: dateTimeFull(r.scheduledAt, locale) })}</span>
                  ) : null}
                </div>
                <div className="uasg__r">
                  <StatusBadge status={r.status} map={urg} fallback={statusLabel(tcm, r.status)} className="uaq__st" />
                  <div className="uaq__acts">
                    {/* "`Meetingga kirish` buttoni meeting yaratilgandan
                        keyin aktiv bo'ladi" — SECOND_OPINION MD L342, and the
                        advocate card it lists at L334-342. Until now the only
                        way into a panel meeting was the ring card, which
                        lasts seconds: an advocate who was away from the
                        screen had no way back in, and this list is the one
                        place the meeting is visible to them at all.

                        Rendered on every record that is scheduled or already
                        running, and DISABLED until the record carries the
                        pair of ids a join needs — that disabled state is the
                        "aktiv bo'ladi" the MD asks for, and it is what tells
                        a waiting advocate the button will light up here
                        rather than somewhere else. The operator is the one
                        who creates the meeting (POST /meeting, call-center
                        prefix), so nothing is posted from this panel; the
                        realtime subscription above refetches the record the
                        moment the meeting is made.

                        No `lk` prop: this advocate is a joiner, not the
                        caller, so CallRoom fetches its own join token from
                        the room and call ids. */}
                    {joinable(r) ? (
                      <button
                        type="button"
                        className="btn btn--grad btn--sm"
                        data-ai-id={item ? `${item}.join` : undefined}
                        data-ai-type="call_button"
                        data-ai-label={t("joinMeeting")}
                        onClick={() =>
                          setMeeting({
                            roomId: r.secureChatRoomId,
                            callId: r.callId,
                            // The express and YTX flows open an audio session
                            // even where the service is sold as video, and
                            // the record says so in payload.call_channel.
                            callType: r.callChannel === "audio" ? "audio" : "video",
                            title: [
                              tk.has(`kinds.${r.serviceKind}`) ? tk(`kinds.${r.serviceKind}`) : r.serviceTitle || r.serviceKind,
                              r.workId,
                            ].filter(Boolean).join(" · "),
                          })
                        }
                      >
                        {r.callChannel === "audio" ? <IconPhone /> : <IconVideo />}
                        {t("joinMeeting")}
                      </button>
                    ) : up ? (
                      // No meeting yet: a note, not a dead button.
                      <span className="uasg__when"><IconClock />{t("joinPending")}</span>
                    ) : null}
                    {r.secureChatRoomId ? (
                      <Link href={chatHref} className="btn btn--line btn--sm" data-ai-id={item ? `${item}.chat` : undefined} data-ai-label={t("openChat")}><IconChat />{t("openChat")}</Link>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn--soft btn--sm"
                      aria-expanded={on}
                      aria-controls={`uasg-${r.id}`}
                      onClick={() => setOpenId(on ? "" : r.id)}
                      data-ai-id={item ? `${item}.details` : undefined}
                      data-ai-label={tcm("details")}
                    >
                      {tcm("details")}<IconChevronRight />
                    </button>
                  </div>
                </div>
                <Disclosure id={`uasg-${r.id}`} open={on} className="uasg__more">
                  <AssignedDetail recordId={r.id} fallback={r} me={me} />
                </Disclosure>
              </li>
            );
          })}
        </ul>
      )}

      {/* Joining a meeting does not change the record here, but leaving one
          usually means it has moved (the operator completes it, or it ends),
          so the list is refetched on the way out. */}
      {meeting ? (
        <CallRoom
          roomId={meeting.roomId}
          callId={meeting.callId}
          callType={meeting.callType}
          isCaller={false}
          title={meeting.title}
          onEnd={() => { setMeeting(null); void load(); }}
        />
      ) : null}
    </section>
  );
}

// ── One record, read through the participant endpoint ──────────────
// The list row already carries most of it, but GET /urgent-advokat/requests/
// {id} is the authoritative read for a participant and is the only place the
// attachments and the status history arrive — so the row is shown immediately
// as a fallback and replaced when the fetch lands.
//
// Laid out on the call-center detail kit (components/ccx/panel/Detail.tsx):
// the client and the next meeting up top, then the request, the people, the
// meeting, status and deadline, and the history as a timeline.
const TONE: Record<StatusTone, DkTone> = { neutral: "mute", info: "info", ok: "ok", warn: "warn", err: "hot" };

function AssignedDetail({ recordId, fallback, me }: { recordId: string; fallback: UrgentRequest; me: string }) {
  const t = useTranslations("portal.seller.urgent");
  const tk = useTranslations("portal.client.urgent");
  const tcm = useTranslations("portal.common");
  const te = useTranslations("enums");
  const x = useTranslations("admin.ccx.detail");
  const urg = useUrgentStatuses();
  const when = useWhen();
  const [req, setReq] = useState<UrgentRequest>(fallback);
  const { session } = useAuth();
  const dutyLawyer = hasRole(session, "call_center_lawyer");
  const [err, setErr] = useState<unknown>(null);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    getUrgentRequest(recordId)
      .then((r) => { if (alive) { setReq(r); setErr(null); setLoaded(true); } })
      .catch((e) => { if (alive) { logApiError("urgent participant detail", e); setErr(e); setLoaded(true); } });
    return () => { alive = false; };
  }, [recordId, attempt]);

  // Somebody else moving the record while it is open on screen.
  useEffect(() => {
    return subscribeUserEvents((e) => {
      if (!isUrgentEvent(e.event)) return;
      const info = urgentEventInfo(e);
      if (info.recordId && info.recordId !== recordId) return;
      getUrgentRequest(recordId).then((r) => { setReq(r); setErr(null); }).catch(() => { /* the list refetch covers it */ });
    });
  }, [recordId]);

  const spec = (s: string) => statusSpecOf(urg, s, statusLabel(tcm, s));
  const st = spec(req.status);
  const stTone: DkTone = st ? TONE[st.tone] : "mute";
  const done = DONE_STATUSES.has(req.status);
  const meetAt = req.scheduledAt && !done ? when(req.scheduledAt) : null;
  const lockAi = recordId ? `${aiId("advocate.urgent.item", recordId)}.phone-locked` : undefined;
  const clientLock = !req.clientPhone && req.clientPhoneVisible === false ? <PhoneLock reason={req.clientPhoneHiddenReason} aiId={lockAi} /> : undefined;
  const dirs = req.directions.map((d) => directionLabel(te, d)).filter((d, i, all) => d && all.indexOf(d) === i);
  const kind = tk.has(`kinds.${req.serviceKind}`) ? tk(`kinds.${req.serviceKind}`) : req.serviceTitle;

  // The panel and the duty advocate, as people. The viewer is marked, not hidden.
  const panel: Person[] = req.groupLawyers
    .filter((g) => g.name)
    .map((g) => ({ key: g.id, name: g.name, avatarName: g.name, role: x("role.panel"), phone: g.phone || undefined, me: !!me && g.id === me }));
  const duty: Person[] = req.operator?.name
    ? [{ key: "operator", name: req.operator.name, avatarName: req.operator.name, role: t("operator"), phone: req.operator.phone || undefined, me: !!me && req.operator.id === me, tone: "ok" }]
    : [];

  const steps: HistoryStep[] = req.statusHistory.map((h, i) => {
    const s = spec(h.to);
    const last = i === req.statusHistory.length - 1;
    return {
      id: `${h.at}-${i}`,
      at: h.at,
      title: s?.label ?? "",
      sub: h.from ? `${spec(h.from)?.label ?? ""} → ${s?.label ?? ""}` : undefined,
      icon: statusIcon(h.to),
      tone: last ? (s ? TONE[s.tone] : "info") : "mute",
    };
  }).filter((s) => s.title);

  const terms = [req.meetingMinutes ? t("minutesN", { n: req.meetingMinutes }) : "", req.amount ? `${fmtUzs(req.amount)} ${te("currency")}` : ""].filter(Boolean);

  return (
    <Root className="uasg__detail" data-ai-private>
      <Hero
        role={t("client")}
        name={req.clientName || t("clientHidden")}
        avatarName={req.clientName}
        phone={req.clientPhone || undefined}
        locked={clientLock}
        meta={req.region ? <Chip icon={<IconMapPin {...px(13)} aria-hidden="true" />}>{regionLabel(te, req.region)}</Chip> : undefined}
        aside={
          meetAt ? (
            <NextFact icon={<IcMeeting size={22} />} label={x("nextMeeting")} tone={req.status === "meeting_active" ? "ok" : "info"}>
              <When at={req.scheduledAt} />
            </NextFact>
          ) : st ? (
            <NextFact icon={statusIcon(req.status, 22)} label={x("status")} tone={stTone}>
              <b className="opx-dk-next__v">{st.label}</b>
            </NextFact>
          ) : undefined
        }
      >
        <div className="opx-dk-chips">
          {meetAt && st ? <Chip tone={stTone} dot live={st.dot === "live"}>{st.label}</Chip> : null}
          {req.channel ? (
            <Chip tone="info" icon={req.channel === "chat" ? <IconChat {...px(13)} aria-hidden="true" /> : <IconVideo {...px(13)} aria-hidden="true" />}>
              {req.channel === "chat" ? tk("chChat") : tk("chVideo")}
            </Chip>
          ) : null}
          {kind ? <Chip icon={<KindGlyph kind={req.serviceKind} />}>{kind}</Chip> : null}
          <CodeRow code={req.workId} label={tk("workId")} />
        </div>
      </Hero>

      <Grid>
        <Group icon={<IconFileText {...px(16)} aria-hidden="true" />} title={t("need")}>
          <p className="opx-dk-text">{req.need || t("noNeed")}</p>
          {dirs.length ? (
            <div className="opx-dk-chips">
              {dirs.map((d) => (
                <Chip key={d} tone="info" icon={<IconScale {...px(13)} aria-hidden="true" />}>{d}</Chip>
              ))}
            </div>
          ) : null}
          {req.lawyerCount > 1 ? <p className="opx-dk-sub">{x("requested", { n: req.lawyerCount })}</p> : null}
        </Group>

        {/* The duty lawyer's AI draft (2026-11-13 §10): internal duty lawyers
            only, never an external marketplace advocate. */}
        {dutyLawyer ? <DutyAiDraft entity={{ type: "urgent_advokat_request", id: req.id }} context={urgentDraftContext(req)} /> : null}

        {panel.length || duty.length ? (
          <Group icon={<IconUsers {...px(16)} aria-hidden="true" />} title={panel.length ? t("panel") : t("operator")} count={panel.length + duty.length}>
            <People people={[...duty, ...panel]} />
          </Group>
        ) : null}

        {req.scheduledAt || terms.length || req.meetingNote ? (
          <Group icon={<IcMeeting size={16} />} title={x("meeting")}>
            <Facts
              items={[
                req.scheduledAt ? { key: "when", icon: <IconCalendar {...px(15)} aria-hidden="true" />, label: x("when"), value: <When at={req.scheduledAt} /> } : null,
                req.meetingMinutes ? { key: "dur", icon: <IconClock {...px(15)} aria-hidden="true" />, label: x("duration"), value: t("minutesN", { n: req.meetingMinutes }) } : null,
                req.amount ? { key: "price", icon: <IcCoins size={15} />, label: x("price"), value: <span className="opx-num">{`${fmtUzs(req.amount)} ${te("currency")}`}</span> } : null,
              ]}
            />
            {req.meetingNote ? <p className="opx-dk-quote">{req.meetingNote}</p> : null}
          </Group>
        ) : null}

        <Group icon={<IconClock {...px(16)} aria-hidden="true" />} title={x("state")}>
          <Facts
            items={[
              st ? { key: "st", icon: statusIcon(req.status, 15), label: x("status"), value: <Chip tone={stTone} dot live={st.dot === "live"}>{st.label}</Chip> } : null,
              !done ? { key: "sla", icon: <IcBolt size={15} />, label: x("sla"), value: <Chip tone={req.slaBreached ? "hot" : "ok"}>{req.slaBreached ? x("slaOver") : x("slaOk")}</Chip> } : null,
              req.createdAt ? { key: "made", icon: <IcInbox size={15} />, label: x("created"), value: <When at={req.createdAt} /> } : null,
            ]}
          />
        </Group>

        {req.files.length || req.voiceMessages.length ? (
          <Group icon={<IconFileText {...px(16)} aria-hidden="true" />} title={t("attachments")} count={req.files.length + req.voiceMessages.length}>
            <ul className="opx-dk-files">
              {req.files.map((f, i) => (
                <li key={f.id || `f${i}`}>
                  <IconFileText {...px(15)} aria-hidden="true" />
                  {f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer">{f.name}</a> : <span>{f.name}</span>}
                </li>
              ))}
              {req.voiceMessages.map((v, i) => (
                <li key={v.id || `v${i}`}>
                  <IconMic {...px(15)} aria-hidden="true" />
                  {v.url ? <audio src={v.url} controls preload="none" aria-label={v.name || x("voice")} /> : <span>{v.name || x("voice")}</span>}
                  {v.durationSeconds ? <small className="opx-num">{t("seconds", { n: v.durationSeconds })}</small> : null}
                </li>
              ))}
            </ul>
          </Group>
        ) : null}

        {req.resultSummary ? (
          <Group icon={<IconCheck {...px(16)} aria-hidden="true" />} title={t("result")} tone="ok" wide>
            <p className="opx-dk-text">{req.resultSummary}</p>
            {req.nextAction ? <p className="opx-dk-quote">{t("nextAction")}: {req.nextAction}</p> : null}
          </Group>
        ) : null}
        {req.cancelReason ? (
          <Group icon={<IconClose {...px(16)} aria-hidden="true" />} title={t("cancelled")} tone="hot" wide>
            <p className="opx-dk-text">{req.cancelReason}</p>
          </Group>
        ) : null}

        <Group icon={<IcTimeline size={16} />} title={x("history")} count={loaded ? steps.length : undefined} wide>
          {!loaded && !steps.length ? <DkSkeleton rows={3} label={x("loading")} /> : <History steps={steps} empty={x("noHistory")} newestFirst />}
        </Group>
      </Grid>

      {err ? <Failed text={x("loadFailed")} onRetry={() => setAttempt((n) => n + 1)} /> : null}
    </Root>
  );
}

function KindGlyph({ kind }: { kind: string }) {
  const Icon = KIND_ICON[kind] ?? IconScale;
  return <Icon {...px(13)} aria-hidden="true" />;
}
