"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  listCcUrgentRequests,
  claimUrgentRequest,
  assignUrgentGroup,
  createUrgentMeeting,
  isMissingRoute,
  listLawyers,
  type UrgentRequest,
  type CallSession,
  type BackendLawyer,
} from "@/lib/services/backend";
import { ApiError, errDetail, logApiError } from "@/lib/http";
import { dateTimeFull } from "@/lib/date";
import { statusLabel, regionLabel } from "@/lib/labels";
import Select from "@/components/Select";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import DatePicker from "@/components/DatePicker";
import TimePicker from "@/components/TimePicker";
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
} from "@/components/icons";

// LEXGO_URGENT_ADVOCATE_FRONTEND_UPDATE.md — the call-center side of "Tezkor
// Advokat". One board with its own filters (source, service kind, channel,
// status): claim a request (which opens the private secure chat and notifies
// the client), schedule the advocate panel for a group second opinion, and
// start the 30-minute LiveKit meeting.

const REFRESH_MS = 60_000;
const KINDS = ["video_consultation", "chat_consultation", "second_opinion_single", "second_opinion_group"] as const;
const STATUSES = ["open_pool", "claimed"] as const;
const GROUP = "second_opinion_group";

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
  const [group, setGroup] = useState<UrgentRequest | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);

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
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

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

  async function meet(r: UrgentRequest) {
    if (busyId) return;
    setBusyId(r.id);
    setNote(null);
    try {
      const call: CallSession = await createUrgentMeeting(r.id);
      setMeeting({
        roomId: call.roomId || r.secureChatRoomId,
        callId: call.id,
        title: tk.has(`kinds.${r.serviceKind}`) ? tk(`kinds.${r.serviceKind}`) : r.serviceTitle || r.serviceKind,
        lk: call.livekitToken ? { url: call.livekitUrl, room: call.livekitRoom, token: call.livekitToken } : null,
      });
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
    <section className="ppanel uaq">
      <div className="ppanel__h">
        <b className="ppanel__t"><span className="pico"><IconBolt /></span>{t("title")}</b>
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
            return (
              <li key={r.id} className={`uaq__row${open ? " uaq__row--open" : ""}`}>
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
                </div>
                <div className="uaq__r">
                  <em className={`creq__badge uaq__st uaq__st--${r.status || "open_pool"}`}>{statusLabel(tcm, r.status || "open_pool")}</em>
                  <div className="uaq__acts">
                    {open ? (
                      <button type="button" className="btn btn--pri btn--sm" disabled={busyId === r.id} onClick={() => void claim(r)}>
                        <IconCheck />{busyId === r.id ? t("claiming") : t("claim")}
                      </button>
                    ) : null}
                    {!open && isGroup ? (
                      <button type="button" className="btn btn--line btn--sm" onClick={() => { setGroup(r); setNote(null); }}>
                        <IconUsers />{r.groupLawyerUserIds.length ? t("regroup") : t("assignGroup")}
                      </button>
                    ) : null}
                    {!open && r.channel !== "chat" ? (
                      <button type="button" className="btn btn--line btn--sm" disabled={busyId === r.id} onClick={() => void meet(r)}>
                        <IconVideo />{t("startMeeting")}
                      </button>
                    ) : null}
                  </div>
                  {!open && r.channel !== "chat" ? <span className="uaq__hint"><IconClock />{t("meetingHint")}</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AssignGroupModal
        req={group}
        onClose={() => setGroup(null)}
        onDone={(msg) => { setGroup(null); setNote({ ok: true, msg }); void load(); }}
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

// ── Advocate panel for a group second opinion ──────────────────────
// At least two advocates plus the agreed time; the client then sees both the
// time and how many advocates will be there.
function AssignGroupModal({ req, onClose, onDone }: { req: UrgentRequest | null; onClose: () => void; onDone: (msg: string) => void }) {
  const t = useTranslations("admin.urgent");
  const [ids, setIds] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("16:00");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [prev, setPrev] = useState(req?.id ?? "");
  if ((req?.id ?? "") !== prev) {
    setPrev(req?.id ?? "");
    setIds(req?.groupLawyerUserIds ?? []);
    setDate("");
    setTime("16:00");
    setNote("");
    setErr("");
  }

  // The directory of advocates, searched by name/phone/LexGo id. Fetched once
  // and filtered in place: the search is client-side anyway, so refetching it
  // per keystroke was pure waste.
  const dirRef = useRef<Promise<BackendLawyer[]> | null>(null);
  const search = useMemo(
    () => async (q: string): Promise<SearchOption[]> => {
      const needle = q.trim().toLowerCase();
      if (!dirRef.current) dirRef.current = listLawyers({ includeUnverified: true }).catch(() => []);
      const list = await dirRef.current;
      return list
        .filter((l) => !needle || [l.name, l.phone, l.publicId].some((v) => (v || "").toLowerCase().includes(needle)))
        .slice(0, 30)
        .map((l) => ({ value: l.userId, label: l.name || l.phone, sub: [l.sellerType, l.region].filter(Boolean).join(" · ") }));
    },
    [],
  );

  const min = req ? Math.max(2, req.lawyerCount || 2) : 2;
  const ready = ids.length >= 2 && !!date && !!time;

  async function submit() {
    if (!req || !ready || busy) return;
    setBusy(true);
    setErr("");
    try {
      // The backend takes an ISO instant; the operator picks a local wall
      // clock, so the offset has to come from the browser rather than a
      // hardcoded +05:00 — a staff account abroad would otherwise schedule
      // the panel five hours out.
      await assignUrgentGroup(req.id, { lawyerUserIds: ids, scheduledAt: new Date(`${date}T${time}:00`).toISOString(), note: note.trim() });
      onDone(t("groupAssigned", { n: ids.length }));
    } catch (e) {
      logApiError("urgent assign-group", e);
      setErr(errDetail(e) || t("groupError"));
    } finally {
      setBusy(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Modal open={!!req} onClose={onClose} title={t("assignGroup")}>
      <div className="cform" style={{ maxWidth: "none" }}>
        <p className="advmuted" style={{ margin: 0 }}>{t("assignLead", { n: min })}</p>
        <div>
          <label>{t("advocates")}</label>
          <SearchSelect
            value={ids}
            onChange={setIds}
            onSearch={search}
            placeholder={t("pickAdvocates")}
            searchPlaceholder={t("searchAdvocates")}
            emptyText={t("noAdvocates")}
            ariaLabel={t("advocates")}
          />
          <span className="rf__hint">{t("pickedN", { n: ids.length })}</span>
        </div>
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
        <div>
          <label htmlFor="uaq-note">{t("note")}</label>
          <textarea id="uaq-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePh")} />
        </div>
        {err ? <Notice ok={false} msg={err} /> : null}
        <button type="button" className="btn btn--grad btn--full" disabled={!ready || busy} onClick={() => void submit()}>
          {busy ? t("assigning") : t("assignSubmit")}
        </button>
      </div>
    </Modal>
  );
}
