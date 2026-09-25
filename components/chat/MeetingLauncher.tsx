"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth, canMakeCalls, sessionRoles } from "@/lib/auth";
import { createSecureChat, startCall, listAdminCalls, getAdminCallDetail, type AdminCallDetail } from "@/lib/services/backend";
import { http, asArr, asDict, asStr, ApiError } from "@/lib/http";
import { useResource } from "@/lib/useResource";
import { shortDateTime } from "@/lib/date";
import { makeInviteSearch } from "@/lib/inviteSearch";
import SearchSelect from "@/components/SearchSelect";
import CallRoom from "@/components/chat/CallRoom";
import { Notice, AdminItem } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import DatePicker from "@/components/DatePicker";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import MiniCalendar, { type MiniCalEvent } from "@/components/portal/MiniCalendar";
import { IconVideo, IconClock, IconRefresh, IconUsers, IconCalendar, IconPlus, IconMoreHorizontal, IconPhone, IconEye } from "@/components/icons";
import { regionLabel, humanize } from "@/lib/labels";
import { subscribeUserEvents } from "@/lib/userSocket";

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Platform-wide meeting detail (superadmin/leads.manage tab only) — any
// user's meeting, not just this account's own. GET /admin/calls/:id.
function CallDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useTranslations("admin.callHistory");
  const locale = useLocale();
  const [d, setD] = useState<AdminCallDetail | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const h = setTimeout(() => { setD(null); setErr(false); }, 0);
    getAdminCallDetail(id).then((x) => alive && setD(x)).catch(() => alive && setErr(true));
    return () => { alive = false; clearTimeout(h); };
  }, [id]);
  const row = (k: string, v?: string | number | null) => (v === undefined || v === null || v === "" ? null : (
    <div className="dkv__row" key={k}><span>{k}</span><b>{String(v)}</b></div>
  ));

  return (
    <Modal open={!!id} onClose={onClose} title={d?.call.title || t("detailTitle")}>
      {err ? <Notice ok={false} msg={t("detailError")} /> : !d ? <Skeleton rows={3} /> : (
        <div className="dkv">
          <div className="dkv__sect">
            <b>{t("detail.meeting")}</b>
            {row(t("detail.status"), t.has(`status.${d.call.status}`) ? t(`status.${d.call.status}`) : d.call.status)}
            {row(t("detail.type"), t(`formatLabel.${d.call.callType}`))}
            {row(t("detail.room"), d.room?.title || d.call.roomId)}
            {row(t("detail.started"), shortDateTime(d.call.startedAt, locale))}
            {row(t("detail.ended"), shortDateTime(d.call.endedAt, locale))}
            {row(t("detail.duration"), d.durationMinutes ? t("detail.minutes", { n: d.durationMinutes }) : mmss(d.durationSeconds))}
          </div>
          <div className="dkv__sect">
            <b>{t("detail.creator")}</b>
            {row(t("detail.name"), d.creator?.name || d.call.creatorName)}
            {row(t("detail.phone"), d.creator?.phone)}
          </div>
          <div className="dkv__sect">
            <b>{t("detail.participants")} ({d.participants.length})</b>
            {d.participants.length ? (
              <ul className="dkv__list">
                {d.participants.map((p) => (
                  <li key={p.userId}><b>{p.name || p.userId}</b><span>{[p.role, p.status].filter(Boolean).join(" · ")}</span></li>
                ))}
              </ul>
            ) : <p className="advmuted">{t("detail.noParticipants")}</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

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
// `rich`: the fuller portal layout (hero, stat tiles, today's agenda, mini
// calendar, history as a table) — opt-in so the shared admin/call-center
// usage of this same launcher keeps its plain, compact layout unchanged.
export default function MeetingLauncher({ rich = false }: { rich?: boolean }) {
  const t = useTranslations("admin.meetings");
  const tch = useTranslations("admin.callHistory");
  const tc = useTranslations("call");
  const te = useTranslations("enums");
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

  // The former standalone /admin/call-history page — every meeting on the
  // platform, not just this account's own — folded in as a second tab here
  // instead of a separate nav entry, gated the same way that page's nav link
  // used to be (superadmin, or the leads.manage permission).
  const canSeeAllHistory = !rich && (sessionRoles(session).includes("superadmin") || (session?.permissions ?? []).includes("leads.manage"));
  const [histTab, setHistTab] = useState<"mine" | "all">("mine");
  const [platFrom, setPlatFrom] = useState("");
  const [platTo, setPlatTo] = useState("");
  const platRes = useResource(() => listAdminCalls({ from: platFrom || undefined, to: platTo || undefined }), [platFrom, platTo]);
  const [platDetail, setPlatDetail] = useState<string | null>(null);
  const searchRef = useRef<ReturnType<typeof makeInviteSearch> | null>(null);
  const clientLabel = tc("inviteClient");

  const refreshHistory = useCallback(() => setHistTick((n) => n + 1), []);
  useEffect(() => {
    return subscribeUserEvents((e) => {
      if (!e.event.startsWith("call.")) return;
      refreshHistory();
    });
  }, [refreshHistory]);

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
    if (!searchRef.current) searchRef.current = makeInviteSearch({ clientLabel, regionLabel: (v) => regionLabel(te, v), exclude: () => (session?.id ? [session.id] : []) });
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
  // No real history yet: fall back to a handful of past, already-ended sample
  // meetings so the stat tiles, agenda, calendar and table agree with each
  // other instead of showing a populated-looking list next to "0" everywhere
  // else. Always callStatus "ended" — never joinable, so the (very real)
  // Join/Rejoin button never appears on a sample row.
  const sampleHistory: HistoryItem[] =
    history && history.length === 0
      ? (t.raw("sample") as { title: string; callerName?: string; mine: boolean; daysAgo: number; minutes: number; callType: "audio" | "video" }[]).map(
          (s, i) => {
            const started = new Date(new Date().getTime() - s.daysAgo * 86_400_000);
            const ended = new Date(started.getTime() + s.minutes * 60_000);
            return {
              roomId: `sample-${i}`,
              callId: `sample-${i}`,
              callType: s.callType,
              title: s.title,
              callerName: s.mine ? session?.name || "" : s.callerName || "",
              callerUserId: s.mine ? session?.id || `sample-me` : `sample-caller-${i}`,
              status: "left",
              callStatus: "ended",
              startedAt: started.toISOString(),
              autoEndAt: ended.toISOString(),
            };
          },
        )
      : [];
  const effectiveHistory = sampleHistory.length ? sampleHistory : history ?? [];
  const live = effectiveHistory.filter((c) => LIVE.has(c.callStatus));
  const ended = effectiveHistory.filter((c) => !LIVE.has(c.callStatus));
  const statusOf = (s: string) => (t.has(`callStatus.${s}`) ? t(`callStatus.${s}`) : humanize(s));
  const mineOf = (s: string) => (tc.has(`pstatus.${s}`) ? tc(`pstatus.${s}`) : humanize(s));

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
  const durationOf = (c: HistoryItem) => {
    if (!c.startedAt || !c.autoEndAt) return "";
    const ms = new Date(c.autoEndAt).getTime() - new Date(c.startedAt).getTime();
    if (!Number.isFinite(ms) || ms <= 0) return "";
    const mins = Math.round(ms / 60000);
    return mins >= 60 ? t("durationHour", { n: (mins / 60).toFixed(1) }) : t("durationMin", { n: mins });
  };

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

  const createForm = (
    <div className="ppanel">
      <div className="ppanel__h">
        <b className="ppanel__t"><span className="pico">{rich ? <IconPlus /> : <IconVideo />}</span>{rich ? t("createTitle") : t("title")}</b>
      </div>
      <p className="advmuted" style={{ marginBottom: 16 }}>{t("subtitle")}</p>

      {!canHost ? <Notice ok={false} msg={t("noPermission")} /> : null}
      <div className="cform" style={{ maxWidth: rich ? "none" : 560 }}>
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
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn--pri" type="button" onClick={start} disabled={busy || !canHost}>
            <IconVideo />
            {busy ? t("starting") : t("start")}
          </button>
          {rich && (title || picks.length) ? (
            <button className="btn btn--line" type="button" onClick={() => { setTitle(""); setPicks([]); }}>
              <IconRefresh />
              {t("clear")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );

  const historyBody =
    history === null ? (
      <Skeleton rows={3} />
    ) : histErr === "missing" ? (
      <Notice ok={false} msg={t("backendMissing")} />
    ) : histErr === "error" ? (
      <Notice ok={false} msg={t("historyError")} />
    ) : null;

  if (!rich) {
    const showMine = !canSeeAllHistory || histTab === "mine";
    return (
      <div className="mlaunch">
        {createForm}
        <div className="ppanel">
          <div className="ppanel__h">
            <b className="ppanel__t"><span className="pico"><IconClock /></span>{canSeeAllHistory ? tch("title") : t("history")}</b>
            {showMine ? (
              <button type="button" className="btn btn--line btn--sm" onClick={refreshHistory} disabled={history === null}>
                <IconRefresh />{t("refresh")}
              </button>
            ) : null}
          </div>
          {canSeeAllHistory ? (
            <div className="segs segs--sm" role="tablist" style={{ marginBottom: 14 }}>
              <button type="button" role="tab" aria-selected={histTab === "mine"} className={`seg${histTab === "mine" ? " on" : ""}`} onClick={() => setHistTab("mine")}>
                {t("history")}
              </button>
              <button type="button" role="tab" aria-selected={histTab === "all"} className={`seg${histTab === "all" ? " on" : ""}`} onClick={() => setHistTab("all")}>
                {tch("title")}
              </button>
            </div>
          ) : null}
          {showMine ? (
            historyBody ?? (
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
            )
          ) : (
            <>
              <p className="advmuted" style={{ marginBottom: 16 }}>{tch("lead")}</p>
              <div className="lfilters" style={{ marginBottom: 16 }}>
                <DatePicker value={platFrom} onChange={setPlatFrom} placeholder={tch("from")} ariaLabel={tch("from")} max={platTo || undefined} clearLabel={tch("clearDates")} />
                <DatePicker value={platTo} onChange={setPlatTo} placeholder={tch("to")} ariaLabel={tch("to")} min={platFrom || undefined} clearLabel={tch("clearDates")} />
              </div>
              {platRes.status === "loading" ? (
                <Skeleton rows={4} />
              ) : !platRes.data.length ? (
                <EmptyState icon={<IconVideo />} title={tch("empty")} text={tch("emptyText")} />
              ) : (
                <div className="alist">
                  {platRes.data.map((c, i) => (
                    <AdminItem
                      key={c.id || i}
                      index={i + 1}
                      title={c.title || tch("untitled")}
                      meta={[c.creatorName, shortDateTime(c.startedAt, locale), c.durationSeconds ? mmss(c.durationSeconds) : ""].filter(Boolean).join(" · ")}
                      right={<span className="atag atag--muted"><IconUsers style={{ width: 13, height: 13 }} />{c.participantCount}</span>}
                      tags={[{ label: tch.has(`status.${c.status}`) ? tch(`status.${c.status}`) : c.status, tone: c.status === "ended" ? undefined : "ok" }]}
                      actions={<button type="button" className="aitem__act" aria-label={tch("detailTitle")} title={tch("detailTitle")} onClick={() => setPlatDetail(c.id)}><IconEye /></button>}
                    />
                  ))}
                </div>
              )}
              <CallDetailModal id={platDetail} onClose={() => setPlatDetail(null)} />
            </>
          )}
        </div>
      </div>
    );
  }

  const tableRow = (c: HistoryItem, i: number) => {
    const isLive = LIVE.has(c.callStatus);
    const mine = c.callerUserId === session?.id;
    const canJoin = isLive && !OUT.has(c.status);
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
        <td>{c.startedAt ? shortDateTime(c.startedAt, locale) : "—"}</td>
        <td>{durationOf(c) || "—"}</td>
        <td>
          <span className="fmticon">
            {c.callType === "audio" ? <IconPhone /> : <IconVideo />}
            {t(`formatLabel.${c.callType}`)}
          </span>
        </td>
        <td><em className={`atag${isLive ? " atag--ok" : " atag--muted"}`}>{statusOf(c.callStatus)}</em></td>
        <td>
          {canJoin ? (
            <button type="button" className="btn btn--pri btn--sm" onClick={() => rejoin(c)}>
              <IconVideo />{c.status === "joined" || mine ? t("rejoin") : t("join")}
            </button>
          ) : (
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

        <div className="ppanel">
          <div className="ppanel__h">
            <b className="ppanel__t"><span className="pico"><IconCalendar /></span>{t("todayAgenda")}</b>
          </div>
          {history === null ? (
            <Skeleton rows={2} />
          ) : !todayItems.length ? (
            <p className="advmuted">{t("todayEmpty")}</p>
          ) : (
            <div className="magenda">
              {todayItems.map((c) => (
                <div className="magenda__row" key={c.callId}>
                  <span className="magenda__t">{c.startedAt ? new Date(c.startedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : ""}</span>
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
          <MiniCalendar events={calEvents} />
        </div>
      </div>

      <div className="ppanel">
        <div className="ppanel__h">
          <b className="ppanel__t"><span className="pico"><IconClock /></span>{t("history")}</b>
          <button type="button" className="btn btn--line btn--sm" onClick={refreshHistory} disabled={history === null}>
            <IconRefresh />{t("refresh")}
          </button>
        </div>
        {historyBody ?? (
          <div className="ptable__wrap">
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
                {[...live, ...ended.slice(0, 30)].map((c, i) => tableRow(c, i))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
