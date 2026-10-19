"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { canMakeCalls, useAuth } from "@/lib/auth";
import { ApiError, asArr, asDict, asNum, asStr, http, parseServerTime } from "@/lib/http";
import { createSecureChat, startCall, type LiveKitJoin } from "@/lib/services/backend";
import { dateOnly, fmtDuration, localDay, shortDateTime, timeOnly } from "@/lib/date";
import { makeInviteSearch } from "@/lib/inviteSearch";
import { regionLabel } from "@/lib/labels";
import { subscribeUserEvents } from "@/lib/userSocket";
import CallRoom from "@/components/chat/CallRoom";
import DeskCall from "./call/DeskCall";
import { IconAlert, IconCalendar, IconClock, IconClose, IconPhone, IconPlus, IconRefresh, IconSearch, IconVideo } from "@/components/icons";
import { App, Avatar, Banner, Btn, Dialog, Empty, Field, Input, Loading, Sidebar, Spinner, Table, Tag, Tool, Toolbar, useOs, useToast, type Col, type NavSection, type Tone } from "../kit/kit";
import type { NativeProps } from "../native";
import "./meetings.css";

// Meetings as a desktop program — FaceTime on the Mac, Teams' Meet on
// Windows: what is live, what is coming and what is over on the side; the
// meetings themselves with their host, time, length and a Join while one
// can still be joined; "New meeting" to invite people and start at once.
// A meeting fills the window, which can then float as picture-in-picture.

type Item = { roomId: string; callId: string; callType: "audio" | "video"; title: string; callerName: string; callerUserId: string; status: string; callStatus: string; startedAt: string; endedAt: string; durationSeconds: number; participantCount: number; canStartNow: boolean | null };
type Active = { roomId: string; callId: string; callType: "audio" | "video"; isCaller: boolean; title?: string; lk: LiveKitJoin | null };
type View = "live" | "upcoming" | "past";
const LIVE = new Set(["active", "scheduled"]);
const OUT = new Set(["removed", "kicked", "declined"]);
const TONE: Record<string, Tone> = { active: "ok", scheduled: "info", ended: "neutral", expired: "warn", cancelled: "err" };

async function loadMeetings(): Promise<Item[]> {
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
        endedAt: asStr(d.ended_at),
        durationSeconds: asNum(d.duration_seconds),
        participantCount: asNum(d.participant_count) || asArr(d.participants).length,
        canStartNow: typeof d.can_start_now === "boolean" ? d.can_start_now : null,
      };
    })
    .filter((c) => c.roomId && c.callId);
}
const at = (c: Item) => {
  const v = parseServerTime(c.startedAt);
  return Number.isFinite(v) ? v : Number.POSITIVE_INFINITY;
};
const seconds = (c: Item) => {
  if (c.durationSeconds > 0) return c.durationSeconds;
  const a = parseServerTime(c.startedAt);
  const b = parseServerTime(c.endedAt);
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? (b - a) / 1000 : 0;
};

export default function MeetingsApp({ tell, pip }: NativeProps) {
  const t = useTranslations("admin.meetings");
  const d = useTranslations("portal.desk.meets");
  const locale = useLocale();
  const os = useOs();
  const { session } = useAuth();
  const me = session?.id ?? "";
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState<"" | "missing" | "error">("");
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<View>("upcoming");
  const [sel, setSel] = useState("");
  const [active, setActive] = useState<Active | null>(null);
  const [create, setCreate] = useState(false);
  const [minute, setMinute] = useState(0);
  const [toast, say] = useToast();
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (active) return;
    let alive = true;
    loadMeetings()
      .then((l) => {
        if (!alive) return;
        setItems(l);
        setFailed("");
      })
      .catch((e) => alive && setFailed(e instanceof ApiError && [404, 405, 501].includes(e.status) ? "missing" : "error"));
    return () => {
      alive = false;
    };
  }, [tick, active]);
  useEffect(() => {
    let h: ReturnType<typeof setTimeout> | undefined;
    const off = subscribeUserEvents((e) => {
      if (!e.event.startsWith("call.")) return;
      clearTimeout(h);
      h = setTimeout(reload, 400);
    });
    return () => {
      clearTimeout(h);
      off();
    };
  }, [reload]);
  // The minute: "opens at", "in 5 min" and what counts as today follow it.
  useEffect(() => {
    const tickMin = () => setMinute(Math.floor(Date.now() / 60000));
    const first = setTimeout(tickMin, 0);
    const h = setInterval(tickMin, 15000);
    return () => {
      clearTimeout(first);
      clearInterval(h);
    };
  }, []);
  useEffect(() => {
    if (!active) return;
    tell({ type: "lexgo-desk:call", on: true, video: active.callType === "video" });
    return () => tell({ type: "lexgo-desk:call", on: false, video: false });
  }, [active, tell]);

  const all = useMemo(() => items ?? [], [items]);
  const live = all.filter((c) => c.callStatus === "active");
  const upcoming = all.filter((c) => c.callStatus === "scheduled").sort((a, b) => at(a) - at(b));
  const past = all.filter((c) => !LIVE.has(c.callStatus)).sort((a, b) => at(b) - at(a));
  const rows = view === "live" ? live : view === "upcoming" ? [...live, ...upcoming] : past;
  const current = rows.find((c) => c.callId === sel) ?? null;
  const today = minute ? localDay(minute * 60000) : "";
  const isToday = (iso: string) => !!today && localDay(iso) === today;
  const when = (iso: string) => (!iso ? "—" : isToday(iso) ? `${d("today")}, ${timeOnly(iso, locale)}` : shortDateTime(iso, locale));
  const host = (c: Item) => (c.callerUserId === me ? t("hostedByYou") : t("hostedBy", { name: c.callerName || "—" }));
  const status = (s: string) => (t.has(`callStatus.${s}`) ? t(`callStatus.${s}`) : s);
  const startsIn = (iso: string) => {
    const v = parseServerTime(iso);
    if (!minute || !Number.isFinite(v) || Math.floor(v / 60000) <= minute) return "";
    const mins = Math.ceil((v - minute * 60000) / 60000);
    return mins < 60 ? t("startsInMin", { n: mins }) : mins < 48 * 60 ? t("startsInHour", { n: Math.floor(mins / 60) }) : t("startsInDay", { n: Math.floor(mins / 1440) });
  };
  const joinable = (c: Item): { show: boolean; ok: boolean; why: string } => {
    if (!LIVE.has(c.callStatus) || OUT.has(c.status)) return { show: false, ok: false, why: "" };
    const v = parseServerTime(c.startedAt);
    if (c.callStatus === "scheduled" && Number.isFinite(v) && Math.floor(v / 60000) > minute) return { show: true, ok: false, why: isToday(c.startedAt) ? t("opensAt", { time: timeOnly(c.startedAt, locale) }) : t("opensOn", { date: shortDateTime(c.startedAt, locale) }) };
    if (c.canStartNow === false) return { show: true, ok: false, why: t("joinClosed") };
    return { show: true, ok: true, why: "" };
  };
  const join = (c: Item) => setActive({ roomId: c.roomId, callId: c.callId, callType: c.callType, isCaller: c.callerUserId === me, title: c.title || undefined, lk: null });
  const canHost = canMakeCalls(session);

  if (active && session)
    return (
      <div className={`dx dx--${os} dx-app--meets dxk-incall${pip ? " is-pip" : ""}`} data-os={os}>
        <div className="dxk-call">
          <CallRoom roomId={active.roomId} callId={active.callId} callType={active.callType} isCaller={active.isCaller} title={active.title} lk={active.lk} skin={DeskCall} onEnd={() => setActive(null)} />
        </div>
      </div>
    );

  const joinBtn = (c: Item, small = true) => {
    const j = joinable(c);
    if (!j.show) return null;
    return (
      <Btn kind={j.ok ? "primary" : "default"} small={small} icon={c.callType === "audio" ? <IconPhone /> : <IconVideo />} disabled={!j.ok} title={j.why || undefined} onClick={() => join(c)}>
        {c.status === "joined" || c.callerUserId === me ? t("rejoin") : t("join")}
      </Btn>
    );
  };
  const sections: NavSection[] = [
    {
      id: "m",
      title: os === "mac" ? t("title") : undefined,
      items: [
        { id: "upcoming", label: d("upcoming"), icon: <IconCalendar />, count: live.length + upcoming.length || undefined },
        { id: "live", label: t("activeGroup"), icon: <IconVideo />, count: live.length || undefined, dot: live.length ? "#34c759" : undefined },
        { id: "past", label: t("endedGroup"), icon: <IconClock />, count: past.length || undefined },
      ],
    },
  ];
  const newBtn = canHost ? (
    <Btn kind="primary" icon={<IconVideo />} onClick={() => setCreate(true)} className="dxk-new">
      {t("newMeeting")}
    </Btn>
  ) : null;

  const cols: Col<Item>[] = [
    {
      id: "name",
      label: t("col.name"),
      width: "minmax(220px,1fr)",
      sort: (a, b) => (a.title || "").localeCompare(b.title || ""),
      cell: (c) => (
        <span className="dxk-cell">
          <span className={`dxk-ic dxk-ic--${c.callStatus}`}>{c.callType === "audio" ? <IconPhone /> : <IconVideo />}</span>
          <span>
            <b>{c.title || t("untitled")}</b>
            <small>
              {host(c)}
              {c.participantCount ? ` · ${d("people", { n: c.participantCount })}` : ""}
            </small>
          </span>
        </span>
      ),
    },
    { id: "date", label: t("col.date"), width: "150px", sort: (a, b) => at(a) - at(b), cell: (c) => when(c.startedAt) },
    { id: "dur", label: t("col.duration"), width: "90px", sort: (a, b) => seconds(a) - seconds(b), cell: (c) => fmtDuration(seconds(c), locale) || "—" },
    { id: "st", label: t("col.status"), width: "120px", cell: (c) => <Tag tone={TONE[c.callStatus] ?? "neutral"}>{status(c.callStatus)}</Tag> },
    { id: "act", label: "", width: "136px", align: "end", cell: (c) => joinBtn(c) },
  ];

  const empty =
    view === "live" ? (
      <Empty icon={<IconVideo />} title={t("liveEmpty")} action={newBtn} />
    ) : view === "upcoming" ? (
      <Empty icon={<IconCalendar />} title={d("upcomingEmpty")} text={t("subtitle")} action={newBtn} />
    ) : (
      <Empty icon={<IconClock />} title={t("historyEmpty")} text={t("pastEmpty")} />
    );

  // The Mac: FaceTime's list — the day as a heading, a row per meeting.
  const groups = (() => {
    const out: { day: string; list: Item[] }[] = [];
    for (const c of rows) {
      const k = c.startedAt ? localDay(c.startedAt) : "";
      const g = out.find((x) => x.day === k);
      if (g) g.list.push(c);
      else out.push({ day: k, list: [c] });
    }
    return out;
  })();
  const dayTitle = (k: string, iso: string) => (!k ? "—" : k === today ? d("today") : dateOnly(iso, locale));

  return (
    <App
      name="meets"
      sidebar={<Sidebar label={t("title")} sections={sections} value={view} onChange={(v) => (setView(v as View), setSel(""))} header={os === "mac" ? newBtn : undefined} />}
      inspector={
        current && os === "mac" ? (
          <aside className="dxk-insp" aria-label={current.title || t("untitled")}>
            <span className={`dxk-ic dxk-ic--big dxk-ic--${current.callStatus}`}>{current.callType === "audio" ? <IconPhone /> : <IconVideo />}</span>
            <h2>{current.title || t("untitled")}</h2>
            <Tag tone={TONE[current.callStatus] ?? "neutral"}>{status(current.callStatus)}</Tag>
            <dl>
              <dt>{t("col.date")}</dt>
              <dd>
                {when(current.startedAt)} {current.callStatus === "scheduled" ? startsIn(current.startedAt) : ""}
              </dd>
              <dt>{t("col.duration")}</dt>
              <dd>{fmtDuration(seconds(current), locale) || "—"}</dd>
              <dt>{t("col.participants")}</dt>
              <dd>{current.participantCount || "—"}</dd>
              <dt>{t("col.format")}</dt>
              <dd>{t(`formatLabel.${current.callType}`)}</dd>
            </dl>
            <p className="dxk-host">
              <Avatar name={current.callerUserId === me ? session?.name || "?" : current.callerName || "?"} size={24} />
              {host(current)}
            </p>
            {joinBtn(current, false)}
            {joinable(current).why ? <small className="dxk-why">{joinable(current).why}</small> : null}
          </aside>
        ) : undefined
      }
    >
      <Toolbar title={view === "live" ? t("activeGroup") : view === "upcoming" ? d("upcoming") : t("endedGroup")} subtitle={d("count", { n: rows.length })}>
        {os === "win" && canHost ? <Tool icon={<IconVideo />} label={t("newMeeting")} primary onClick={() => setCreate(true)} /> : null}
        <Tool icon={<IconRefresh />} label={t("refresh")} onClick={reload} />
        {os === "mac" && canHost ? <Tool icon={<IconPlus />} label={t("newMeeting")} onClick={() => setCreate(true)} /> : null}
      </Toolbar>
      {!canHost && session ? (
        <div className="dxk-ban">
          <Banner tone="warn">{t("noPermission")}</Banner>
        </div>
      ) : null}
      <div className="dxk-body">
        {items === null ? (
          failed ? (
            <Empty icon={<IconAlert />} title={failed === "missing" ? t("historyUnavailable") : t("historyLoadFailed")} text={failed === "missing" ? t("historyUnavailableText") : undefined} action={<Btn onClick={reload}>{t("refresh")}</Btn>} />
          ) : (
            <Loading label={d("loading")} />
          )
        ) : !rows.length ? (
          empty
        ) : os === "win" ? (
          <>
            {view === "upcoming" && live.length ? (
              <div className="dxk-now">
                {live.map((c) => (
                  <div key={c.callId} className="dxk-now__card">
                    <span className="dxk-ic dxk-ic--active">{c.callType === "audio" ? <IconPhone /> : <IconVideo />}</span>
                    <span className="dxk-now__t">
                      <b>{c.title || t("untitled")}</b>
                      <small>
                        {host(c)} · {t("since", { time: timeOnly(c.startedAt, locale) })}
                      </small>
                    </span>
                    {joinBtn(c, false)}
                  </div>
                ))}
              </div>
            ) : null}
            <Table label={t("history")} cols={cols} rows={view === "upcoming" ? upcoming : rows} rowKey={(c) => c.callId} selected={sel} onSelect={(c) => setSel(c.callId)} onOpen={(c) => joinable(c).ok && join(c)} empty={<Empty icon={<IconCalendar />} title={d("upcomingEmpty")} />} />
          </>
        ) : (
          <div className="dxk-list" role="listbox" aria-label={t("history")}>
            {groups.map((g) => (
              <section key={g.day} className="dxk-group">
                <h3>{dayTitle(g.day, g.list[0].startedAt)}</h3>
                {g.list.map((c) => (
                  <div key={c.callId} role="option" tabIndex={0} aria-selected={sel === c.callId} className={`dxk-row${sel === c.callId ? " is-on" : ""}`} onClick={() => setSel(c.callId)} onDoubleClick={() => joinable(c).ok && join(c)}>
                    <span className={`dxk-ic dxk-ic--${c.callStatus}`}>{c.callType === "audio" ? <IconPhone /> : <IconVideo />}</span>
                    <span className="dxk-row__t">
                      <b>{c.title || t("untitled")}</b>
                      <small>
                        {host(c)}
                        {c.participantCount ? ` · ${d("people", { n: c.participantCount })}` : ""}
                      </small>
                    </span>
                    <span className="dxk-row__when">
                      <time>{c.startedAt ? timeOnly(c.startedAt, locale) : "—"}</time>
                      <small>{c.callStatus === "scheduled" ? startsIn(c.startedAt) : fmtDuration(seconds(c), locale) || status(c.callStatus)}</small>
                    </span>
                    {joinBtn(c)}
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
      {create ? (
        <NewMeeting
          onClose={() => setCreate(false)}
          onStarted={(a) => {
            setCreate(false);
            setActive(a);
          }}
          onError={(m) => say(m, "err")}
        />
      ) : null}
      {toast}
    </App>
  );
}

type Pick = { id: string; label: string; sub?: string; tag?: string };

// The invitation: a title and the people, found by name, phone or LexGo ID
// as one types; the meeting starts at once and they are called.
function NewMeeting({ onClose, onStarted, onError }: { onClose: () => void; onStarted: (a: Active) => void; onError: (m: string) => void }) {
  const t = useTranslations("admin.meetings");
  const tc = useTranslations("call");
  const te = useTranslations("enums");
  const d = useTranslations("portal.desk.meets");
  const { session } = useAuth();
  const [title, setTitle] = useState("");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Pick[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const search = useRef<ReturnType<typeof makeInviteSearch> | null>(null);
  const seller = session?.role === "advocate" || session?.role === "lawyer";

  useEffect(() => {
    const needle = q.trim();
    if (!needle) {
      const h = setTimeout(() => setFound(null), 0);
      return () => clearTimeout(h);
    }
    let alive = true;
    const h = setTimeout(() => {
      if (!search.current) search.current = makeInviteSearch({ clientLabel: tc("inviteClient"), regionLabel: (v) => regionLabel(te, v), exclude: () => (session?.id ? [session.id] : []), roleLabel: (r) => t(`role.${r}`) });
      setSearching(true);
      search
        .current(needle)
        .then((l) => alive && setFound(l.map((o) => ({ id: o.value, label: o.label === "—" ? "" : o.label, sub: o.sub, tag: o.tag }))))
        .catch(() => alive && setFound([]))
        .finally(() => alive && setSearching(false));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [q, session?.id, t, tc, te]);

  const first = picks[0]?.label.trim() ?? "";
  const auto = first ? (picks.length > 1 ? t("defaultTitleMore", { name: first, n: picks.length - 1 }) : t("defaultTitle", { name: first })) : t("defaultTitleNoName");
  const add = (p: Pick) => {
    if (!picks.some((x) => x.id === p.id)) setPicks((l) => [...l, p]);
    setQ("");
    setErr("");
  };

  async function start() {
    if (busy || !session) return;
    if (!picks.length) return setErr(t("needParticipants"));
    setBusy(true);
    try {
      const ids = picks.map((p) => p.id);
      const room = await createSecureChat(seller ? { client_user_id: ids[0], seller_user_id: session.id } : { client_user_id: session.id || ids[0], seller_user_id: ids[0] });
      const name = title.trim() || auto;
      const call = await startCall(room.id, "video", name, { participantUserIds: ids, maxDurationMinutes: 60 });
      onStarted({ roomId: room.id, callId: call.id, callType: "video", isCaller: true, title: name, lk: call.livekitToken ? { url: call.livekitUrl, room: call.livekitRoom, token: call.livekitToken, hints: call.hints, quality: call.quality } : null });
    } catch (e) {
      const s = e instanceof ApiError ? e.status : 0;
      onError(s === 402 ? t("planLimit") : s === 403 ? t("noPermission") : s === 405 || s === 501 ? t("backendMissing") : t("startFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={t("newMeeting")}
      width={520}
      onClose={onClose}
      onSubmit={() => void start()}
      actions={
        <>
          <Btn onClick={onClose}>{d("cancel")}</Btn>
          <Btn kind="primary" type="submit" icon={<IconVideo />} busy={busy} disabled={busy}>
            {busy ? t("starting") : t("start")}
          </Btn>
        </>
      }
    >
      <Field label={t("titleLabel")}>
        <Input value={title} onChange={setTitle} placeholder={picks.length ? auto : t("titlePh")} ariaLabel={t("titleLabel")} maxLength={120} />
      </Field>
      <Field label={t("participants")} hint={seller ? t("sellerHint") : t("hint")} error={err || undefined}>
        <div className="dxk-pick">
          {picks.length ? (
            <div className="dxk-chips">
              {picks.map((p) => (
                <span key={p.id} className="dxk-chip">
                  <Avatar name={p.label || "?"} size={20} />
                  {p.label || p.sub || "—"}
                  <button type="button" onClick={() => setPicks((l) => l.filter((x) => x.id !== p.id))} aria-label={d("remove", { name: p.label })}>
                    <IconClose />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="dx-search dx-search--wide dxk-q">
            <IconSearch aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (found?.[0]) add(found[0]);
                }
              }}
              placeholder={t("participantsHint")}
              aria-label={t("participantsSearch")}
            />
            {searching ? <Spinner small /> : null}
          </div>
          {found !== null && q.trim() ? (
            <div className="dxk-found" role="listbox" aria-label={t("participants")}>
              {!found.length ? (
                <p className="dxk-found__none">{searching ? d("searching") : t("participantsEmpty")}</p>
              ) : (
                found.map((o) => {
                  const on = picks.some((x) => x.id === o.id);
                  return (
                    <button key={o.id} type="button" role="option" aria-selected={on} className={on ? "is-on" : ""} onClick={() => add(o)}>
                      <Avatar name={o.label || "?"} size={28} />
                      <span>
                        <b>{o.label || "—"}</b>
                        {o.sub ? <small>{o.sub}</small> : null}
                      </span>
                      {o.tag ? <Tag>{o.tag}</Tag> : null}
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
      </Field>
    </Dialog>
  );
}
