"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth, canMakeCalls } from "@/lib/auth";
import { createSecureChat, startCall } from "@/lib/services/backend";
import { http, asArr, asDict, asStr, ApiError } from "@/lib/http";
import { shortDateTime } from "@/lib/date";
import { makeInviteSearch } from "@/lib/inviteSearch";
import SearchSelect from "@/components/SearchSelect";
import CallRoom from "@/components/chat/CallRoom";
import { Notice } from "@/components/admin/AdminBits";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { IconVideo, IconClock, IconRefresh, IconUsers } from "@/components/icons";

type Active = { roomId: string; callId: string; isCaller: boolean; title?: string; lk: { url: string; room: string; token: string } | null };

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
};
const LIVE = new Set(["active", "scheduled"]);
const OUT = new Set(["removed", "declined"]);

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
      };
    })
    .filter((c) => c.roomId && c.callId);
}

// Meeting launcher shared by /admin/meetings (call-center, managers) and the
// seller portals: name the meeting, pick invitees, start → the LiveKit room
// opens inline. Below it, the meetings this account hosted or was invited to,
// active ones first with a re-join button.
export default function MeetingLauncher() {
  const t = useTranslations("admin.meetings");
  const tc = useTranslations("call");
  const locale = useLocale();
  const { session } = useAuth();
  const seller = session?.role === "advocate" || session?.role === "lawyer";
  const [title, setTitle] = useState("");
  const [picks, setPicks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [histErr, setHistErr] = useState<"" | "error" | "missing">("");
  const [histTick, setHistTick] = useState(0);
  const searchRef = useRef<ReturnType<typeof makeInviteSearch> | null>(null);
  const clientLabel = tc("inviteClient");

  const refreshHistory = useCallback(() => setHistTick((n) => n + 1), []);

  // History: reloaded on mount, after every meeting and on demand. A backend
  // without /calls/invited (404/405/501) gets an honest notice, not an error.
  // The first load also resumes a meeting I host after a reload (the call
  // itself is only in memory); a meeting I merely joined is offered again by
  // IncomingCallWatcher's resume card instead.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (!session || active) return;
    let alive = true;
    const me = session.id;
    loadHistory()
      .then((list) => {
        if (!alive) return;
        setHistory(list);
        setHistErr("");
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
        if (c.callerUserId === me) setActive({ roomId: stored.roomId, callId: stored.callId, isCaller: true, title: c.title || undefined, lk: null });
      })
      .catch((e) => {
        if (!alive) return;
        setHistory([]);
        setHistErr(e instanceof ApiError && [404, 405, 501].includes(e.status) ? "missing" : "error");
      });
    return () => { alive = false; };
  }, [session, active, histTick]);

  // Staff search any platform user; sellers (no /users/search) get lawyers +
  // their own clients — see lib/inviteSearch.
  function searchOptions(q: string) {
    if (!searchRef.current) searchRef.current = makeInviteSearch({ clientLabel, exclude: () => (session?.id ? [session.id] : []) });
    return searchRef.current(q);
  }

  async function start() {
    if (busy || !session) return;
    // Backend allows a meeting with any count (even host-only); require at least
    // one invitee so the room has a counterpart.
    if (picks.length < 1) {
      setErr(t("needParticipants"));
      return;
    }
    setErr(null);
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
      const call = await startCall(room.id, "video", title.trim() || t("title"), {
        participantUserIds: picks,
        maxDurationMinutes: 60,
      });
      setActive({
        roomId: room.id,
        callId: call.id,
        isCaller: true,
        title: title.trim() || undefined,
        lk: call.livekitToken ? { url: call.livekitUrl, room: call.livekitRoom, token: call.livekitToken } : null,
      });
    } catch (e) {
      const s = e instanceof ApiError ? e.status : 0;
      setErr(s === 402 || s === 403 ? t("noPermission") : s === 404 || s === 405 || s === 501 ? t("backendMissing") : t("error"));
    } finally {
      setBusy(false);
    }
  }

  function rejoin(c: HistoryItem) {
    setActive({ roomId: c.roomId, callId: c.callId, isCaller: c.callerUserId === session?.id, title: c.title || undefined, lk: null });
  }

  if (active) {
    return (
      <CallRoom
        roomId={active.roomId}
        callId={active.callId}
        callType="video"
        isCaller={active.isCaller}
        title={active.title}
        lk={active.lk}
        onEnd={() => {
          // Leaving `active` reloads the history (effect above).
          setActive(null);
          setPicks([]);
          setTitle("");
        }}
      />
    );
  }

  const canHost = canMakeCalls(session);
  const live = (history ?? []).filter((c) => LIVE.has(c.callStatus));
  const ended = (history ?? []).filter((c) => !LIVE.has(c.callStatus));
  const statusOf = (s: string) => (t.has(`callStatus.${s}`) ? t(`callStatus.${s}`) : s);
  const mineOf = (s: string) => (tc.has(`pstatus.${s}`) ? tc(`pstatus.${s}`) : s);

  const row = (c: HistoryItem) => {
    const isLive = LIVE.has(c.callStatus);
    const mine = c.callerUserId === session?.id;
    const canJoin = isLive && !OUT.has(c.status);
    return (
      <div className={`aitem mlist__row${isLive ? " mlist__row--live" : ""}`} key={c.callId}>
        <span className={`mlist__ic${isLive ? " on" : ""}`}><IconVideo /></span>
        <div className="mlist__m">
          <b>{c.title || t("untitled")}</b>
          <span>
            {mine ? t("hostedByYou") : t("hostedBy", { name: c.callerName || tc("someone") })}
            {c.startedAt ? ` · ${shortDateTime(c.startedAt, locale)}` : ""}
            {!mine && c.status && !isLive ? ` · ${mineOf(c.status)}` : ""}
          </span>
        </div>
        <em className={`atag${isLive ? " atag--ok" : " atag--muted"}`}>{statusOf(c.callStatus)}</em>
        {canJoin ? (
          <button type="button" className="btn btn--pri btn--sm" onClick={() => rejoin(c)}>
            <IconVideo />{c.status === "joined" || mine ? t("rejoin") : t("join")}
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="mlaunch">
      <div className="ppanel">
        <div className="ppanel__h">
          <b className="ppanel__t"><span className="pico"><IconVideo /></span>{t("title")}</b>
        </div>
        <p className="advmuted" style={{ marginBottom: 16 }}>{t("subtitle")}</p>

        {!canHost ? <Notice ok={false} msg={t("noPermission")} /> : null}
        <div className="cform" style={{ maxWidth: 560 }}>
          <div>
            <label>{t("titleLabel")}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePh")} />
          </div>
          <div>
            <label>{t("participants")}</label>
            <SearchSelect
              value={picks}
              onChange={setPicks}
              onSearch={searchOptions}
              placeholder={t("participantsPh")}
              searchPlaceholder={t("participantsSearch")}
              emptyText={t("participantsEmpty")}
              ariaLabel={t("participants")}
            />
          </div>
          <p className="advmuted" style={{ fontSize: ".82rem", margin: 0 }}>{seller ? t("sellerHint") : t("hint")}</p>
          {err ? <Notice ok={false} msg={err} /> : null}
          <button className="btn btn--pri" type="button" onClick={start} disabled={busy || !canHost}>
            <IconVideo />
            {busy ? t("starting") : t("start")}
          </button>
        </div>
      </div>

      <div className="ppanel">
        <div className="ppanel__h">
          <b className="ppanel__t"><span className="pico"><IconClock /></span>{t("history")}</b>
          <button type="button" className="btn btn--line btn--sm" onClick={refreshHistory} disabled={history === null}>
            <IconRefresh />{t("refresh")}
          </button>
        </div>
        {history === null ? (
          <Skeleton rows={3} />
        ) : histErr === "missing" ? (
          <Notice ok={false} msg={t("backendMissing")} />
        ) : histErr === "error" ? (
          <Notice ok={false} msg={t("historyError")} />
        ) : history.length === 0 ? (
          <EmptyState icon={<IconUsers />} title={t("historyEmpty")} text={t("historyEmptyText")} />
        ) : (
          <div className="mlist">
            {live.length ? (
              <div className="mlist__grp">
                <span className="mlist__gl"><i className="mlist__dot" />{t("activeGroup")} · {live.length}</span>
                {live.map(row)}
              </div>
            ) : null}
            {ended.length ? (
              <div className="mlist__grp">
                <span className="mlist__gl">{t("endedGroup")} · {ended.length}</span>
                {ended.slice(0, 30).map(row)}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
