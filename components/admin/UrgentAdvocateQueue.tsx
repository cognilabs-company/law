"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  listUrgentCandidates,
  searchUrgentCandidates,
  urgentAssignRefusal,
  isUrgentEvent,
  urgentEventInfo,
  isMissingRoute,
  type UrgentRequest,
  type UrgentCandidate,
  type CallSession,
} from "@/lib/services/backend";
import { subscribeUserEvents, subscribeUserSocketState, onUserSocketResync } from "@/lib/userSocket";
import { ApiError, errDetail, logApiError } from "@/lib/http";
import { dateTimeFull } from "@/lib/date";
import { statusLabel, regionLabel } from "@/lib/labels";
import { fmtUzs } from "@/lib/money";
import Select from "@/components/Select";
import DatePicker from "@/components/DatePicker";
import TimePicker from "@/components/TimePicker";
import CheckBox from "@/components/CheckBox";
import Modal from "@/components/admin/Modal";
import { Notice } from "@/components/admin/AdminBits";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
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
  IconList,
  IconStar,
  IconShieldCheck,
  IconHeadset,
  IconClose,
  IconChevronRight,
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
const KINDS = ["video_consultation", "chat_consultation", "second_opinion_single", "second_opinion_group"] as const;
// The lifecycle's own vocabulary (lifecycle.active_statuses +
// final_statuses), so the filter offers exactly the states a record can be in.
const STATUSES = ["open_pool", "claimed", "scheduled", "in_progress", "meeting_active", "completed", "cancelled", "expired"] as const;
const GROUP = "second_opinion_group";
// The practice-area slugs the client form sends (see UrgentAdvocatePanel) —
// what GET /call-center/urgent-advokat/candidates?directions= expects.
const DIRECTION_SLUGS = ["jinoiy", "fuqarolik", "oila", "mehnat", "mamuriy", "iqtisodiy", "soliq", "shartnoma"];

const KIND_ICON: Record<string, typeof IconVideo> = {
  video_consultation: IconVideo,
  chat_consultation: IconChat,
  second_opinion_single: IconScale,
  second_opinion_group: IconUsers,
};

type State = { status: "loading" | "ready" | "error" | "forbidden" | "missing"; items: UrgentRequest[] };
type Meeting = { roomId: string; callId: string; title: string; lk: { url: string; room: string; token: string } | null };

export default function UrgentAdvocateQueue() {
  const t = useTranslations("admin.urgent");
  const tk = useTranslations("portal.client.urgent");
  const tcm = useTranslations("portal.common");
  const te = useTranslations("enums");
  const locale = useLocale();

  const [kind, setKind] = useState("");
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("open_pool");
  const [state, setState] = useState<State>({ status: "loading", items: [] });
  const [busyId, setBusyId] = useState("");
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [openId, setOpenId] = useState("");
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [live, setLive] = useState(true);

  const load = useCallback(
    () =>
      listCcUrgentRequests({ status: status || undefined, serviceKind: kind || undefined, channel: channel || undefined })
        .then((items) => setState({ status: "ready", items }))
        .catch((e) => {
          // A module the backend has not enabled yet, and a role without
          // call-center access, are both "nothing to show here" rather than
          // an error banner on an otherwise working console.
          const forbidden = e instanceof ApiError && (e.status === 401 || e.status === 403);
          logApiError("urgent queue", e);
          setState((s) => ({
            status: isMissingRoute(e) ? "missing" : forbidden ? "forbidden" : s.items.length ? "ready" : "error",
            items: s.items,
          }));
        }),
    [status, kind, channel],
  );

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

  async function claim(r: UrgentRequest) {
    if (busyId) return;
    setBusyId(r.id);
    setNote(null);
    try {
      const out = await claimUrgentRequest(r.id);
      setNote({ ok: true, msg: out.secureChatRoomId ? t("claimedWithChat") : t("claimed") });
      void load();
    } catch (e) {
      logApiError("urgent claim", e);
      setNote({ ok: false, msg: errDetail(e) || (e instanceof ApiError && e.status === 409 ? t("alreadyTaken") : t("claimError")) });
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
        lk: call.livekitToken ? { url: call.livekitUrl, room: call.livekitRoom, token: call.livekitToken } : null,
      });
    },
    [tk],
  );

  async function meet(r: UrgentRequest) {
    if (busyId) return;
    setBusyId(r.id);
    setNote(null);
    try {
      openMeeting(await createUrgentMeeting(r.id), r);
      void load();
    } catch (e) {
      logApiError("urgent meeting", e);
      setNote({ ok: false, msg: errDetail(e) || t("meetingError") });
    } finally {
      setBusyId("");
    }
  }

  if (state.status === "forbidden" || state.status === "missing") return null;

  return (
    <section className="ppanel uaq" id="cc-urgent">
      <div className="ppanel__h">
        <b className="ppanel__t"><span className="pico"><IconBolt /></span>{t("title")}</b>
        <span className={`uaq__live${live ? " on" : ""}`} title={live ? t("liveOn") : t("liveOff")}>
          <i aria-hidden />{live ? t("liveOn") : t("liveOff")}
        </span>
        <button type="button" className="btn btn--line btn--sm" onClick={() => void load()} aria-label={t("refresh")} title={t("refresh")}>
          <IconRefresh />
        </button>
      </div>
      <p className="advmuted uaq__lead">{t("lead")}</p>

      {/* Source is fixed — this board IS the Tezkor Advokat source — so it is
          shown as a standing chip rather than a filter that can be turned off. */}
      <div className="uaq__filters">
        <span className="uaq__src"><IconBolt />{t("sourceTezkor")}</span>
        <Select
          value={status}
          onChange={setStatus}
          ariaLabel={t("fStatus")}
          options={[{ value: "", label: t("allStatuses") }, ...STATUSES.map((s) => ({ value: s, label: statusLabel(tcm, s) }))]}
        />
        <Select
          value={kind}
          onChange={setKind}
          ariaLabel={t("fKind")}
          options={[{ value: "", label: t("allKinds") }, ...KINDS.map((k) => ({ value: k, label: tk.has(`kinds.${k}`) ? tk(`kinds.${k}`) : k }))]}
        />
        <Select
          value={channel}
          onChange={setChannel}
          ariaLabel={t("fChannel")}
          options={[
            { value: "", label: t("allChannels") },
            { value: "video", label: tk("chVideo") },
            { value: "chat", label: tk("chChat") },
          ]}
        />
      </div>

      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}

      {state.status === "loading" ? (
        <Skeleton rows={3} />
      ) : state.status === "error" ? (
        <EmptyState icon={<IconAlert />} title={tcm("loadError")} text={tcm("loadErrorText")} />
      ) : !state.items.length ? (
        <EmptyState icon={<IconBolt />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <ul className="uaq__list">
          {state.items.map((r) => {
            const Icon = KIND_ICON[r.serviceKind] ?? IconScale;
            const open = (r.status || "open_pool") === "open_pool";
            const isGroup = r.serviceKind === GROUP;
            const final = r.nextStatuses.length === 0 && !open;
            return (
              <li key={r.id} className={`uaq__row${open ? " uaq__row--open" : ""}${r.slaBreached ? " uaq__row--sla" : ""}`}>
                <span className={`uaq__i uaq__i--${r.channel || "video"}`}><Icon /></span>
                <div className="uaq__m">
                  <b>
                    {tk.has(`kinds.${r.serviceKind}`) ? tk(`kinds.${r.serviceKind}`) : r.serviceTitle || r.serviceKind}
                    {r.channel ? <em className="uaq__ch">{r.channel === "chat" ? <IconChat /> : <IconVideo />}{r.channel === "chat" ? tk("chChat") : tk("chVideo")}</em> : null}
                  </b>
                  {r.need ? <span className="uaq__need">{r.need}</span> : null}
                  <span className="uaq__sub">
                    {[
                      r.clientName || r.clientPhone,
                      r.region ? regionLabel(te, r.region) : "",
                      r.directions.length ? r.directions.join(", ") : "",
                      isGroup && r.lawyerCount ? t("lawyersN", { n: r.lawyerCount }) : "",
                      r.createdAt ? dateTimeFull(r.createdAt, locale) : "",
                    ].filter(Boolean).join(" · ")}
                  </span>
                  {r.scheduledAt ? (
                    <span className="uaq__when"><IconCalendar />{t("scheduledFor", { when: dateTimeFull(r.scheduledAt, locale) })}</span>
                  ) : null}
                  {r.groupLawyers.length ? (
                    <span className="uaq__when"><IconUsers />{r.groupLawyers.map((g) => g.name).join(", ")}</span>
                  ) : null}
                </div>
                <div className="uaq__r">
                  <em className={`creq__badge uaq__st uaq__st--${r.status || "open_pool"}`}>{statusLabel(tcm, r.status || "open_pool")}</em>
                  <div className="uaq__acts">
                    {open ? (
                      <button type="button" className="btn btn--pri btn--sm" disabled={busyId === r.id} onClick={() => void claim(r)}>
                        <IconCheck />{busyId === r.id ? t("claiming") : t("claim")}
                      </button>
                    ) : null}
                    {!open && !final && r.channel !== "chat" ? (
                      <button type="button" className="btn btn--line btn--sm" disabled={busyId === r.id} onClick={() => void meet(r)}>
                        <IconVideo />{t("startMeeting")}
                      </button>
                    ) : null}
                    <button type="button" className="btn btn--soft btn--sm" onClick={() => { setOpenId(r.id); setNote(null); }}>
                      <IconList />{t("openDetail")}<IconChevronRight />
                    </button>
                  </div>
                  {!open && !final && r.channel !== "chat" ? <span className="uaq__hint"><IconClock />{t("meetingHint")}</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <UrgentDetailDrawer
        id={openId}
        onClose={() => setOpenId("")}
        onChanged={(msg) => { setNote({ ok: true, msg }); void load(); }}
        onMeeting={openMeeting}
      />

      {meeting ? (
        <CallRoom
          roomId={meeting.roomId}
          callId={meeting.callId}
          callType="video"
          isCaller
          title={meeting.title}
          lk={meeting.lk}
          onEnd={() => setMeeting(null)}
        />
      ) : null}
    </section>
  );
}

// ── One request, in full ───────────────────────────────────────────
// Everything the operator needs to work the record without leaving it: who
// asked, what for, what they attached, who is on it, where it has been, and
// every action the record's own lifecycle still allows.
function UrgentDetailDrawer({
  id,
  onClose,
  onChanged,
  onMeeting,
}: {
  id: string;
  onClose: () => void;
  onChanged: (msg: string) => void;
  onMeeting: (call: CallSession, r: UrgentRequest) => void;
}) {
  const t = useTranslations("admin.urgent");
  const tk = useTranslations("portal.client.urgent");
  const tcm = useTranslations("portal.common");
  const te = useTranslations("enums");
  const locale = useLocale();

  const [req, setReq] = useState<UrgentRequest | null>(null);
  const [load2, setLoad2] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [panel, setPanel] = useState<"" | "candidates" | "complete" | "cancel">("");

  const fetchOne = useCallback(() => {
    if (!id) return Promise.resolve();
    return getCcUrgentRequest(id)
      .then((r) => { setReq(r); setLoad2("ready"); })
      .catch((e) => { logApiError("urgent detail", e); setLoad2("error"); });
  }, [id]);

  // Opening a different record (or closing the drawer) resets the view during
  // render rather than in an effect: an effect would paint the previous
  // record's detail for one frame under the new title.
  const [prevId, setPrevId] = useState(id);
  if (id !== prevId) {
    setPrevId(id);
    setReq(null);
    setLoad2("loading");
    setPanel("");
    setErr("");
  }

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
  async function run(key: string, fn: () => Promise<UrgentRequest>, msg: string): Promise<boolean> {
    if (busy) return false;
    setBusy(key);
    setErr("");
    try {
      setReq(await fn());
      onChanged(msg);
      return true;
    } catch (e) {
      logApiError("urgent " + key, e);
      setErr(errDetail(e) || t("actionError"));
      return false;
    } finally {
      setBusy("");
    }
  }

  async function meet() {
    if (!req || busy) return;
    setBusy("meeting");
    setErr("");
    try {
      const call = await createUrgentMeeting(req.id);
      onMeeting(call, req);
      await fetchOne();
      onChanged(t("meetingStarted"));
    } catch (e) {
      logApiError("urgent meeting", e);
      setErr(errDetail(e) || t("meetingError"));
    } finally {
      setBusy("");
    }
  }

  const kindLabel = req ? (tk.has(`kinds.${req.serviceKind}`) ? tk(`kinds.${req.serviceKind}`) : req.serviceTitle || req.serviceKind) : "";
  const isGroup = req?.serviceKind === GROUP;
  const isSecond = !!req && (req.serviceKind === GROUP || req.serviceKind === "second_opinion_single");
  const finished = !!req && req.nextStatuses.length === 0;

  return (
    <Modal open={!!id} onClose={onClose} title={kindLabel || t("openDetail")} wide>
      {load2 === "loading" ? (
        <Skeleton rows={5} />
      ) : load2 === "error" || !req ? (
        <EmptyState icon={<IconAlert />} title={tcm("loadError")} text={tcm("loadErrorText")} />
      ) : (
        <div className="uad">
          {/* ── Header line: status, channel, price, SLA ───────────── */}
          <div className="uad__top">
            <em className={`creq__badge uaq__st uaq__st--${req.status}`}>{statusLabel(tcm, req.status)}</em>
            {req.channel ? (
              <span className="uad__chip">{req.channel === "chat" ? <IconChat /> : <IconVideo />}{req.channel === "chat" ? tk("chChat") : tk("chVideo")}</span>
            ) : null}
            {req.meetingMinutes ? <span className="uad__chip"><IconClock />{tk("minutesN", { n: req.meetingMinutes })}</span> : null}
            {req.amount ? <span className="uad__chip"><IconCheck />{fmtUzs(req.amount)} {te("currency")}</span> : null}
            {req.slaBreached ? <span className="uad__chip uad__chip--warn"><IconAlert />{t("slaBreached")}</span> : null}
          </div>

          <div className="uad__cols">
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
                  <div className="chiprow" style={{ margin: "8px 0 0" }}>
                    {req.directions.map((d) => (
                      <span key={d} className="fchip" aria-hidden={false}>{te.has(`areas.${d}`) ? te(`areas.${d}`) : d}</span>
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
                        {v.url ? <audio src={v.url} controls preload="none" /> : <span>{v.name}</span>}
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
                  {!finished ? (
                    <button type="button" className="btn btn--line btn--sm" onClick={() => setPanel(panel === "candidates" ? "" : "candidates")}>
                      <IconUsers />{req.groupLawyers.length ? t("regroup") : t("assignGroup")}
                    </button>
                  ) : null}
                </section>
              ) : null}

              {panel === "candidates" ? (
                <CandidatePanel
                  req={req}
                  onClose={() => setPanel("")}
                  onDone={(r, msg) => { setReq(r); setPanel(""); onChanged(msg); }}
                />
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
              {isSecond && req.eligibleSources.length ? (
                <section className="uad__sec">
                  <h4><IconShieldCheck />{t("eligibleSources")}</h4>
                  <p className="advmuted uad__note">{t("eligibleSourcesLead")}</p>
                  <ul className="uad__sources">
                    {req.eligibleSources.map((s) => (
                      <li key={`${s.type}-${s.id}`}>
                        <b>{s.title || s.serviceKind || s.type}</b>
                        <span className="advmuted">{[statusLabel(tcm, s.status), s.createdAt ? dateTimeFull(s.createdAt, locale) : ""].filter(Boolean).join(" · ")}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {/* ── Where it has been ───────────────────────────────── */}
              {req.statusHistory.length ? (
                <section className="uad__sec">
                  <h4><IconClock />{t("history")}</h4>
                  <ol className="uad__hist">
                    {req.statusHistory.map((h, i) => (
                      <li key={i}>
                        <b>{statusLabel(tcm, h.to)}</b>
                        <span className="advmuted">{h.at ? dateTimeFull(h.at, locale) : ""}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
            </div>
          </div>

          {err ? <Notice ok={false} msg={err} /> : null}

          {/* ── Everything the lifecycle still allows ───────────────── */}
          <div className="uad__acts">
            {req.status === "open_pool" ? (
              <button type="button" className="btn btn--pri" disabled={!!busy} onClick={() => void run("claim", () => claimUrgentRequest(req.id), t("claimed"))}>
                <IconCheck />{busy === "claim" ? t("claiming") : t("claim")}
              </button>
            ) : null}
            {!finished && req.status !== "open_pool" && req.channel !== "chat" ? (
              <button type="button" className="btn btn--line" disabled={!!busy} onClick={() => void meet()}>
                <IconVideo />{busy === "meeting" ? t("starting") : t("startMeeting")}
              </button>
            ) : null}
            {!finished && req.status !== "open_pool" ? (
              <button type="button" className="btn btn--line" disabled={!!busy} onClick={() => setPanel(panel === "complete" ? "" : "complete")}>
                <IconCheck />{t("complete")}
              </button>
            ) : null}
            {!finished ? (
              <button type="button" className="btn btn--soft" disabled={!!busy} onClick={() => setPanel(panel === "cancel" ? "" : "cancel")}>
                <IconClose />{t("cancel")}
              </button>
            ) : null}
            <StatusMover req={req} busy={!!busy} onMove={(s, n) => void run("status", () => setUrgentStatus(req.id, s, n), t("statusMoved", { status: statusLabel(tcm, s) }))} />
          </div>

          {panel === "complete" ? (
            <CompleteForm
              busy={!!busy}
              onCancel={() => setPanel("")}
              onSubmit={(summary, nextAction) => {
                void run("complete", () => completeUrgentRequest(req.id, { summary, nextAction }), t("completed")).then((ok) => { if (ok) setPanel(""); });
              }}
            />
          ) : null}
          {panel === "cancel" ? (
            <CancelForm
              busy={!!busy}
              onCancel={() => setPanel("")}
              onSubmit={(reason) => {
                void run("cancel", () => cancelUrgentRequest(req.id, reason), t("cancelDone")).then((ok) => { if (ok) setPanel(""); });
              }}
            />
          ) : null}
        </div>
      )}
    </Modal>
  );
}


// ── Status, by the record's own rules ──────────────────────────────
// lifecycle.next_statuses is the whole permitted set — a status outside it is
// answered 409 ("in_progress holatidan open_pool holatiga o'tkazib
// bo'lmaydi") — so the control offers exactly that and disappears on a final
// status, where the list is empty.
function StatusMover({ req, busy, onMove }: { req: UrgentRequest; busy: boolean; onMove: (status: string, note: string) => void }) {
  const t = useTranslations("admin.urgent");
  const tcm = useTranslations("portal.common");
  const [next, setNext] = useState("");
  const [note, setNote] = useState("");

  // completed / cancelled have their own dedicated buttons above, with the
  // summary and the reason those endpoints require.
  const choices = req.nextStatuses.filter((s) => s !== "completed" && s !== "cancelled");
  if (!choices.length) return null;

  return (
    <div className="uad__move">
      <Select
        value={next}
        onChange={setNext}
        ariaLabel={t("moveTo")}
        options={[{ value: "", label: t("moveTo") }, ...choices.map((s) => ({ value: s, label: statusLabel(tcm, s) }))]}
      />
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("statusNotePh")}
        aria-label={t("statusNotePh")}
      />
      <button type="button" className="btn btn--line btn--sm" disabled={!next || busy} onClick={() => onMove(next, note.trim())}>
        {t("move")}
      </button>
    </div>
  );
}

function CompleteForm({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (summary: string, nextAction: string) => void }) {
  const t = useTranslations("admin.urgent");
  const [summary, setSummary] = useState("");
  const [next, setNext] = useState("");
  return (
    <div className="uad__form">
      <p className="advmuted" style={{ margin: 0 }}>{t("completeLead")}</p>
      <div>
        <label htmlFor="uad-sum">{t("summary")}</label>
        <textarea id="uad-sum" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder={t("summaryPh")} />
      </div>
      <div>
        <label htmlFor="uad-next">{t("nextAction")}</label>
        <input id="uad-next" type="text" value={next} onChange={(e) => setNext(e.target.value)} placeholder={t("nextActionPh")} />
      </div>
      <div className="uad__formacts">
        <button type="button" className="btn btn--soft btn--sm" onClick={onCancel}>{t("back")}</button>
        <button type="button" className="btn btn--grad btn--sm" disabled={summary.trim().length < 5 || busy} onClick={() => onSubmit(summary.trim(), next.trim())}>
          <IconCheck />{t("completeSubmit")}
        </button>
      </div>
    </div>
  );
}

function CancelForm({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (reason: string) => void }) {
  const t = useTranslations("admin.urgent");
  const [reason, setReason] = useState("");
  return (
    <div className="uad__form">
      <p className="advmuted" style={{ margin: 0 }}>{t("cancelLead")}</p>
      <div>
        <label htmlFor="uad-reason">{t("reason")}</label>
        <input id="uad-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPh")} />
      </div>
      <div className="uad__formacts">
        <button type="button" className="btn btn--soft btn--sm" onClick={onCancel}>{t("back")}</button>
        <button type="button" className="btn btn--danger btn--sm" disabled={reason.trim().length < 3 || busy} onClick={() => onSubmit(reason.trim())}>
          <IconClose />{t("cancelSubmit")}
        </button>
      </div>
    </div>
  );
}

// ── Picking the panel ──────────────────────────────────────────────
// The backend ranks the candidates and says why (`score`, `reasons`); this
// shows them in that order and puts anyone who does not cover the request's
// practice area last, behind a warning, because assigning one is refused
// unless the operator says so on purpose.
function CandidatePanel({
  req,
  onClose,
  onDone,
}: {
  req: UrgentRequest;
  onClose: () => void;
  onDone: (r: UrgentRequest, msg: string) => void;
}) {
  const t = useTranslations("admin.urgent");
  const te = useTranslations("enums");
  const [list, setList] = useState<UrgentCandidate[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [ids, setIds] = useState<string[]>(req.groupLawyerUserIds);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("16:00");
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

  // Back to the skeleton the moment the source changes, during render — doing
  // it in the effect would leave the previous list on screen for a frame while
  // already claiming to be loading something else.
  const fetchKey = `${req.id}|${external}|${callcenter}|${wide}|${applied}`;
  const [prevKey, setPrevKey] = useState(fetchKey);
  if (fetchKey !== prevKey) {
    setPrevKey(fetchKey);
    setState("loading");
  }

  useEffect(() => {
    let alive = true;
    const load = wide
      ? searchUrgentCandidates({ directions: wideDirs, region: wideRegion, limit: 50 })
      : listUrgentCandidates(req.id, { includeExternal: external, includeCallcenter: callcenter, limit: 50 });
    load
      .then((c) => { if (alive) { setList(c); setState("ready"); } })
      .catch((e) => { if (alive) { logApiError("urgent candidates", e); setState("error"); } });
    return () => { alive = false; };
    // wideDirs / wideRegion are read on apply, not per keystroke — `applied`
    // is what re-runs the wide search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req.id, external, callcenter, wide, applied]);

  const [matched, mismatched] = useMemo(() => {
    const sorted = [...list].sort((a, b) => b.score - a.score);
    return [sorted.filter((c) => c.directionMatch), sorted.filter((c) => !c.directionMatch)];
  }, [list]);

  const want = req.lawyerCount || 2;
  const toggle = (uid: string) => setIds((cur) => (cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid]));

  async function submit() {
    if (!ids.length || busy) return;
    setBusy(true);
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
      onDone(out, t("groupAssigned", { n: ids.length }));
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
        setErr(errDetail(e) || t("groupError"));
      }
    } finally {
      setBusy(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const row = (c: UrgentCandidate) => (
    <li key={c.userId}>
      <button type="button" className={`ucand${ids.includes(c.userId) ? " on" : ""}`} aria-pressed={ids.includes(c.userId)} onClick={() => toggle(c.userId)}>
        <span className="ucand__score" aria-hidden>{c.score}</span>
        <span className="ucand__m">
          <b>{c.name}</b>
          <span className="ucand__meta">
            {[
              c.sellerType || c.role,
              c.region,
              c.rating ? `${c.rating.toFixed(1)}★ (${c.reviewsCount})` : "",
              c.successRate ? t("successRate", { n: Math.round(c.successRate) }) : "",
              t("workloadN", { n: c.workload }),
            ].filter(Boolean).join(" · ")}
          </span>
          {c.specializations.length ? (
            <span className="ucand__spec">{c.specializations.map((s) => (te.has(`areas.${s}`) ? te(`areas.${s}`) : s)).join(", ")}</span>
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
    <section className="uad__sec ucand__wrap">
      <h4><IconStar />{t("candidates")}</h4>
      <p className="advmuted uad__note">{t("candidatesLead", { n: want })}</p>

      <div className="ucand__filters">
        <CheckBox id="ucand-ext" checked={external} onChange={setExternal} disabled={wide}>{t("includeExternal")}</CheckBox>
        <CheckBox id="ucand-cc" checked={callcenter} onChange={setCallcenter} disabled={wide}>{t("includeCallcenter")}</CheckBox>
        <button type="button" className="btn btn--soft btn--sm" aria-pressed={wide} onClick={() => setWide((v) => !v)}>
          <IconStar />{wide ? t("searchNarrow") : t("searchWide")}
        </button>
      </div>

      {wide ? (
        <div className="ucand__wide">
          <p className="advmuted uad__note">{t("searchWideLead")}</p>
          <div className="chiprow" style={{ margin: 0 }}>
            {DIRECTION_SLUGS.map((d) => (
              <button
                key={d}
                type="button"
                className="fchip"
                aria-pressed={wideDirs.includes(d)}
                onClick={() => setWideDirs((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))}
              >
                {te.has(`areas.${d}`) ? te(`areas.${d}`) : d}
              </button>
            ))}
          </div>
          <div className="ucand__widerow">
            <input
              type="text"
              value={wideRegion}
              onChange={(e) => setWideRegion(e.target.value)}
              placeholder={t("regionPh")}
              aria-label={t("regionPh")}
            />
            <button type="button" className="btn btn--line btn--sm" onClick={() => setApplied((n) => n + 1)}>
              {t("searchApply")}
            </button>
          </div>
        </div>
      ) : null}

      {state === "loading" ? (
        <Skeleton rows={3} />
      ) : state === "error" ? (
        <Notice ok={false} msg={t("candidatesError")} />
      ) : !list.length ? (
        <p className="advmuted">{t("noAdvocates")}</p>
      ) : (
        <>
          <ul className="ucand__list">{matched.map(row)}</ul>
          {mismatched.length ? (
            <>
              <p className="ucand__warn"><IconAlert />{t("offDirectionLead")}</p>
              <ul className="ucand__list ucand__list--off">{mismatched.map(row)}</ul>
            </>
          ) : null}
        </>
      )}

      <p className={`ucand__count${ids.length === want ? " ok" : ""}`}>
        {t("pickedOf", { n: ids.length, want })}
      </p>

      <div className="uaq__when2">
        <div>
          <label>{t("date")}</label>
          <DatePicker value={date} onChange={setDate} placeholder={t("datePh")} ariaLabel={t("date")} min={today} />
        </div>
        <div>
          <label>{t("time")}</label>
          <TimePicker value={time} onChange={setTime} placeholder={t("timePh")} ariaLabel={t("time")} />
        </div>
      </div>
      <p className="advmuted uad__note">{t("timeOptional")}</p>

      <div>
        <label htmlFor="uaq-note">{t("note")}</label>
        <textarea id="uaq-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePh")} />
      </div>

      {err ? <Notice ok={false} msg={err} /> : null}
      {offer === "count" ? (
        <CheckBox id="uad-ovc" checked={okCount} onChange={setOkCount} hint={t("overrideCountHint")}>{t("overrideCount")}</CheckBox>
      ) : null}
      {offer === "direction" ? (
        <CheckBox id="uad-ovd" checked={okDirection} onChange={setOkDirection} hint={t("overrideDirectionHint")}>{t("overrideDirection")}</CheckBox>
      ) : null}

      <div className="uad__formacts">
        <button type="button" className="btn btn--soft btn--sm" onClick={onClose}>{t("back")}</button>
        <button type="button" className="btn btn--grad btn--sm" disabled={!ids.length || busy} onClick={() => void submit()}>
          <IconUsers />{busy ? t("assigning") : t("assignSubmit")}
        </button>
      </div>
    </section>
  );
}
