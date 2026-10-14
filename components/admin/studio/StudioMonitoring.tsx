"use client";

import { useCallback, useEffect, useRef, useState, type SVGProps } from "react";
import { Link } from "@/i18n/navigation";
import DatePicker from "@/components/DatePicker";
import FilterBar from "@/components/filters/FilterBar";
import { aiId } from "@/lib/ai/ids";
import { asDict, parseServerTime } from "@/lib/http";
import type { UserEvent } from "@/lib/userSocket";
import { subscribeInternalEvents, type InternalEvent } from "@/lib/internalSocket";
import { getStudioMonitoring, isStudioEvent, normStudioActivity, type StudioActivity, type StudioMonitoringUser } from "@/lib/services/studio";
import { ctorOrder } from "@/lib/studio/constructors";
import StudioShell from "./StudioShell";
import { ConstructorIcon, StudioEmpty, StudioLoading, useNow, useStudioLive, useStudioText } from "./bits";
import { StudioKpi, LoadProblem, initialsOf, matchesTerms, type Phase } from "./settings/ui";
import { IconChartBar, IconClock, IconEdit, IconPlus, IconRefresh, IconSend, IconUsers } from "@/components/icons";

const IconPulse = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

type Row = { a: StudioActivity; at: number };
type State = { phase: Phase; rows: Row[]; serverOnline: number; summary: { online: number; sessions: number; users: number; objectsCreated: number; submittedForApproval: number; saveCount: number; durationSeconds: number }; users: StudioMonitoringUser[]; error: unknown };
// The period the numbers cover (10-09 §9: date, or date_from / date_to).
type Period = "today" | "yesterday" | "week" | "month" | "all" | "custom";
const PERIODS: Period[] = ["today", "yesterday", "week", "month", "all"];

const AI = "admin.studio.monitoring";
const FALLBACK_MS = 60_000;

// YYYY-MM-DD in the viewer's own calendar, `back` days ago.
function dayIso(back = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - back);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function rangeOf(period: Period, from: string, to: string): { date?: string; dateFrom?: string; dateTo?: string } {
  if (period === "today") return { date: dayIso(0) };
  if (period === "yesterday") return { date: dayIso(1) };
  if (period === "week") return { dateFrom: dayIso(6), dateTo: dayIso(0) };
  if (period === "month") return { dateFrom: dayIso(29), dateTo: dayIso(0) };
  if (period === "custom") return { dateFrom: from || undefined, dateTo: to || undefined };
  return {};
}

// Whether new activity can still land in the period: a past day or range
// is closed, so live events for it are not ours to refetch.
function periodIsOpen(period: Period, to: string): boolean {
  if (period === "yesterday") return false;
  if (period === "custom" && to) return to >= dayIso(0);
  return true;
}

function eventRaw(e: UserEvent): Record<string, unknown> {
  const d = asDict(e.data ?? e.payload ?? e.activity ?? e.session);
  const base = Object.keys(d).length ? d : (e as Record<string, unknown>);
  const inner = asDict(base.activity ?? base.session);
  return Object.keys(inner).length ? { ...base, ...inner } : base;
}

function sessionKey(raw: Record<string, unknown>): string {
  const v = raw.session_id ?? raw.sessionId ?? raw.id;
  return typeof v === "string" || typeof v === "number" ? String(v) : "";
}

// The studio:activity channel on the internal hub carries the same activity
// payload as the user socket; its event names may come without the "studio."
// prefix. Frames without a session are not activity and are dropped.
function channelEvent(e: InternalEvent): UserEvent | null {
  if (isStudioEvent(e.event)) return e;
  if (!sessionKey(eventRaw(e))) return null;
  return { ...e, event: /end|close|stop|offline/i.test(e.event) ? "studio.activity_ended" : "studio.activity" };
}

function sortRows(rows: Row[]): Row[] {
  return [...rows].sort((x, y) => {
    if (x.a.online !== y.a.online) return x.a.online ? -1 : 1;
    const tx = parseServerTime(x.a.lastSeenAt || x.a.endedAt || x.a.startedAt);
    const ty = parseServerTime(y.a.lastSeenAt || y.a.endedAt || y.a.startedAt);
    return (Number.isFinite(ty) ? ty : 0) - (Number.isFinite(tx) ? tx : 0);
  });
}

function liveSeconds(r: Row, now: number): number {
  if (!r.a.online || !now || !r.at) return r.a.durationSec;
  return r.a.durationSec + Math.max(0, (now - r.at) / 1000);
}

function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
}

function LiveClock({ row }: { row: Row }) {
  const now = useNow(1000);
  return (
    <span className="stu-mon__clock" aria-live="off">
      {clock(liveSeconds(row, now))}
    </span>
  );
}

export default function StudioMonitoring() {
  const { t } = useStudioText();
  return (
    <StudioShell title={t("screens.monitoring.title")} lead={t("screens.monitoring.lead")} icon={<IconChartBar aria-hidden />} need="admin">
      <MonitoringBody />
    </StudioShell>
  );
}

function MonitoringBody() {
  const { t, ctorName, role, duration, ago, num } = useStudioText();
  // "k02-editor" → "Tahrirlash"; "save" → "Saqlash". Unknown words stay as sent.
  const screenName = (v: string) => {
    const k = v.trim().toLowerCase();
    if (!k) return "";
    if (/-editor$|^editor$/.test(k)) return t("monitoring.screen.editor");
    return t.has(`monitoring.screen.${k}`) ? t(`monitoring.screen.${k}`) : "";
  };
  const actionName = (v: string) => {
    const k = v.trim().toLowerCase();
    if (!k || /-editor$/.test(k)) return "";
    return t.has(`monitoring.action.${k}`) ? t(`monitoring.action.${k}`) : "";
  };
  const now = useNow(30_000);
  const [st, setSt] = useState<State>({ phase: "loading", rows: [], serverOnline: 0, summary: { online: 0, sessions: 0, users: 0, objectsCreated: 0, submittedForApproval: 0, saveCount: 0, durationSeconds: 0 }, users: [], error: null });
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [code, setCode] = useState("");
  const [userId, setUserId] = useState("");
  const [period, setPeriod] = useState<Period>("today");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [state, setState] = useState("");
  // Everyone and every constructor seen in any answer: a filtered answer
  // holds only the filtered user, and the filter must not shrink to it.
  const [seen, setSeen] = useState<{ users: StudioMonitoringUser[]; codes: string[] }>({ users: [], codes: [] });
  const seq = useRef(0);
  const liveRows = useRef<Row[]>([]);
  const soon = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const m = await getStudioMonitoring({ constructorCode: code, userId, ...rangeOf(period, dateFrom, dateTo) });
      if (my !== seq.current) return;
      const at = Date.now();
      setSt({ phase: "ready", rows: sortRows(m.items.map((a) => ({ a, at }))), serverOnline: m.online, summary: m.summary, users: m.users, error: null });
      setSeen((cur) => {
        const users = new Map(cur.users.map((u) => [u.id, u]));
        for (const u of m.users) if (u.id) users.set(u.id, u);
        const codes = new Set([...cur.codes, ...m.items.map((a) => a.constructorCode).filter(Boolean)]);
        return { users: [...users.values()], codes: [...codes] };
      });
    } catch (e) {
      if (my !== seq.current) return;
      setSt((cur) => (cur.phase === "ready" ? { ...cur, error: e } : { phase: "error", rows: [], serverOnline: 0, summary: cur.summary, users: cur.users, error: e }));
    }
  }, [code, userId, period, dateFrom, dateTo]);

  useEffect(() => {
    void load();
    return () => clearTimeout(soon.current);
  }, [load]);

  // The live channel is the main signal; a quiet re-read once a minute (only
  // while the tab is visible and the period can still change) covers a
  // missed frame or a channel that is not open for this account.
  const open = periodIsOpen(period, dateTo);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, FALLBACK_MS);
    return () => clearInterval(id);
  }, [load, open]);

  useEffect(() => {
    liveRows.current = st.phase === "ready" ? st.rows : [];
  });

  const refetchSoon = useCallback(() => {
    clearTimeout(soon.current);
    soon.current = setTimeout(() => void load(), 400);
  }, [load]);

  const onLive = (e: UserEvent) => {
    if (e.event === "studio.resync") {
      refetchSoon();
      return;
    }
    if (e.event !== "studio.activity" && e.event !== "studio.activity_ended") return;
    const raw = eventRaw(e);
    const key = sessionKey(raw);
    const ended = e.event === "studio.activity_ended";
    if (!key || !liveRows.current.some((r) => r.a.sessionId === key)) {
      // A session we do not show yet: re-read only if it can belong to the
      // current view — the period is still open and it passes the filters.
      const who = String(raw.user_id ?? raw.userId ?? "");
      const ctor = String(raw.constructor_code ?? raw.constructorCode ?? "");
      if (!open || (userId && who && who !== userId) || (code && ctor && ctor !== code)) return;
      refetchSoon();
      return;
    }
    const at = Date.now();
    setSt((cur) => {
      const idx = cur.rows.findIndex((r) => r.a.sessionId === key);
      if (cur.phase !== "ready" || idx < 0) return cur;
      const prev = cur.rows[idx].a;
      const merged: Record<string, unknown> = { ...prev.raw, ...raw };
      if (ended) {
        merged.online = false;
        merged.status = "ended";
        if (!merged.ended_at && !merged.endedAt) merged.ended_at = new Date(at).toISOString();
        if (merged.duration_seconds == null && merged.worked_seconds == null && merged.active_seconds == null && merged.duration == null) {
          merged.duration_seconds = Math.round(liveSeconds(cur.rows[idx], at));
        }
      }
      const next = [...cur.rows];
      next[idx] = { a: normStudioActivity(merged, at), at };
      // Who is online follows the sessions: the per-user rows and the
      // summary card change with the event, not with the next read.
      const liveUsers = new Set(next.filter((r) => r.a.online).map((r) => r.a.userId));
      const users = cur.users.map((u) => (u.online === liveUsers.has(u.id) ? u : { ...u, online: liveUsers.has(u.id) }));
      return { ...cur, rows: sortRows(next), users, summary: { ...cur.summary, online: liveUsers.size } };
    });
  };
  useStudioLive(onLive);

  const liveRef = useRef(onLive);
  useEffect(() => {
    liveRef.current = onLive;
  });
  useEffect(
    () =>
      subscribeInternalEvents("studio:activity", (e) => {
        const ev = channelEvent(e);
        if (ev) liveRef.current(ev);
      }),
    [],
  );

  async function refresh() {
    setBusy(true);
    await load();
    setBusy(false);
  }

  const rows = st.rows;
  const online = st.summary.online;
  // Time worked in the period, with the open sessions still counting.
  const liveExtra = rows.reduce((n, r) => n + (r.a.online ? liveSeconds(r, now) - r.a.durationSec : 0), 0);

  const codes = [...new Set([...seen.codes, ...rows.map((r) => r.a.constructorCode).filter(Boolean)])].sort((x, y) => ctorOrder(x) - ctorOrder(y));
  if (code && !codes.includes(code)) codes.push(code);
  const codeOpts = [
    { value: "", label: t("common.all") },
    ...codes.map((c) => ({ value: c, label: `${ctorName(c)} (${num(rows.filter((r) => r.a.constructorCode === c).length)})` })),
  ];
  const stateOpts = [
    { value: "", label: t("common.all") },
    { value: "online", label: `${t("monitoring.online")} (${num(online)})` },
    { value: "offline", label: `${t("monitoring.offline")} (${num(rows.length - online)})` },
  ];
  const userOpts = [
    { value: "", label: t("common.all") },
    ...[...seen.users].sort((x, y) => (x.name || "").localeCompare(y.name || "")).map((user) => ({ value: user.id, label: user.name || t("monitoring.unknownUser") })),
  ];
  // The base role of a staff account is often "client": not worth saying.
  const roleNote = (r: string) => (r && r !== "client" ? ` · ${role(r)}` : "");
  const whatOf = (a: StudioActivity) => [screenName(a.screen), actionName(a.lastAction)].filter((x, i, all) => x && all.indexOf(x) === i).join(" · ");
  const shown = rows.filter((r) => {
    if (code && r.a.constructorCode !== code) return false;
    if (state === "online" && !r.a.online) return false;
    if (state === "offline" && r.a.online) return false;
    return matchesTerms([r.a.userName, r.a.role, role(r.a.role), r.a.constructorCode, ctorName(r.a.constructorCode), r.a.objectName], q);
  });

  const ready = st.phase === "ready";
  const periodBar = (
    <div className="stu-mon__period" role="group" aria-label={t("monitoring.periodTitle")} data-ai-id={`${AI}.period`} data-ai-type="group" data-ai-label={t("monitoring.periodTitle")}>
      {PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          className={period === p ? "on" : undefined}
          aria-pressed={period === p}
          onClick={() => {
            setPeriod(p);
            setDateFrom("");
            setDateTo("");
          }}
        >
          {t(`monitoring.period.${p}`)}
        </button>
      ))}
      <div className="stu-mon__dates">
        <div className="stu-mon__date">
          <span>{t("monitoring.dateFrom")}</span>
          <DatePicker
            value={dateFrom}
            onChange={(v) => {
              setDateFrom(v);
              setPeriod(v || dateTo ? "custom" : "all");
            }}
            placeholder={t("monitoring.dateFrom")}
            ariaLabel={t("monitoring.dateFrom")}
            max={dateTo || undefined}
            clearLabel={t("common.clear")}
          />
        </div>
        <div className="stu-mon__date">
          <span>{t("monitoring.dateTo")}</span>
          <DatePicker
            value={dateTo}
            onChange={(v) => {
              setDateTo(v);
              setPeriod(v || dateFrom ? "custom" : "all");
            }}
            placeholder={t("monitoring.dateTo")}
            ariaLabel={t("monitoring.dateTo")}
            min={dateFrom || undefined}
            clearLabel={t("common.clear")}
          />
        </div>
      </div>
    </div>
  );
  const kpis = (
    <div className="stu-mkpis stu-mkpis--mon" data-ai-id={`${AI}.summary`} data-ai-type="section" data-ai-label={t("monitoring.summary")}>
      <StudioKpi icon={IconPulse} value={ready ? num(online) : "—"} label={t("monitoring.kpi.online")} hint={ready ? t("monitoring.kpi.onlineHint") : undefined} tone={online > 0 ? "ok" : undefined} />
      <StudioKpi icon={IconUsers} value={ready ? num(st.summary.users) : "—"} label={t("monitoring.kpi.users")} />
      <StudioKpi icon={IconChartBar} value={ready ? num(st.summary.sessions) : "—"} label={t("monitoring.kpi.sessions")} />
      <StudioKpi icon={IconClock} value={ready ? duration(st.summary.durationSeconds + liveExtra) || "0" : "—"} label={t("monitoring.kpi.duration")} />
      <StudioKpi icon={IconEdit} value={ready ? num(st.summary.saveCount) : "—"} label={t("monitoring.kpi.saves")} />
      <StudioKpi icon={IconPlus} value={ready ? num(st.summary.objectsCreated) : "—"} label={t("monitoring.kpi.objects")} />
      <StudioKpi icon={IconSend} value={ready ? num(st.summary.submittedForApproval) : "—"} label={t("monitoring.kpi.submitted")} />
    </div>
  );

  if (st.phase === "loading") {
    return (
      <>
        {periodBar}
        {kpis}
        <StudioLoading rows={4} />
      </>
    );
  }
  if (st.phase === "error") {
    return (
      <>
        {periodBar}
        {kpis}
        <LoadProblem error={st.error} onRetry={() => void refresh()} busy={busy} missingText={t("monitoring.missing")} />
      </>
    );
  }

  // The per-user totals the backend already worked out for the period.
  const people = [...st.users].sort((x, y) => Number(y.online) - Number(x.online) || y.durationSeconds - x.durationSeconds);

  return (
    <>
      {periodBar}
      {kpis}
      {people.length ? (
        <section className="stu-card stu-mon" data-ai-id={`${AI}.users`} data-ai-type="section" data-ai-label={t("monitoring.usersTitle")}>
          <div className="stu-card__h">
            <h3>{t("monitoring.usersTitle")}</h3>
          </div>
          <div className="stu-mon__table stu-mon__table--users">
            <div className="stu-mon__row stu-mon__row--head" aria-hidden="true">
              <span>{t("monitoring.col.user")}</span>
              <span>{t("monitoring.col.sessions")}</span>
              <span>{t("monitoring.col.time")}</span>
              <span>{t("monitoring.col.saves")}</span>
              <span>{t("monitoring.col.objects")}</span>
              <span>{t("monitoring.col.submitted")}</span>
              <span>{t("monitoring.col.seen")}</span>
            </div>
            {people.map((u) => {
              const name = u.name || t("monitoring.unknownUser");
              return (
                <button
                  type="button"
                  key={u.id || name}
                  className={`stu-mon__row stu-mon__row--user${u.online ? " is-on" : ""}${userId && userId === u.id ? " is-sel" : ""}`}
                  onClick={() => setUserId(userId === u.id ? "" : u.id)}
                  aria-pressed={userId === u.id}
                  title={t("monitoring.filterUser")}
                >
                  <span className="stu-mon__who">
                    <span className="stu-sava" aria-hidden>
                      {initialsOf(name)}
                      <span className={`stu-mdot stu-mdot--abs${u.online ? " stu-mdot--on" : ""}`} />
                    </span>
                    <span className="stu-mon__wt">
                      <b>{name}</b>
                      <small>
                        <span className={`stu-mon__state${u.online ? " is-on" : ""}`}>{u.online ? t("monitoring.online") : t("monitoring.offline")}</span>
                        {roleNote(u.role)}
                      </small>
                    </span>
                  </span>
                  <span className="stu-mon__num"><em className="stu-mon__lbl">{t("monitoring.col.sessions")}</em>{num(u.sessions)}</span>
                  <span className="stu-mon__num"><em className="stu-mon__lbl">{t("monitoring.col.time")}</em><IconClock aria-hidden />{duration(u.durationSeconds)}</span>
                  <span className="stu-mon__num"><em className="stu-mon__lbl">{t("monitoring.col.saves")}</em><IconEdit aria-hidden />{num(u.saveCount)}</span>
                  <span className="stu-mon__num"><em className="stu-mon__lbl">{t("monitoring.col.objects")}</em>{num(u.objects)}</span>
                  <span className="stu-mon__num"><em className="stu-mon__lbl">{t("monitoring.col.submitted")}</em>{num(u.submitted)}</span>
                  <span className="stu-mon__seen"><em className="stu-mon__lbl">{t("monitoring.col.seen")}</em>{u.online ? t("monitoring.now") : ago(u.lastSeenAt, now) || "—"}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
      <section className="stu-card stu-mon" data-ai-id={`${AI}.list`} data-ai-type="section" data-ai-label={t("monitoring.listTitle")}>
        <div className="stu-card__h">
          <h3>{t("monitoring.listTitle")}</h3>
          <div className="stu-mon__h">
            <small className="stu-mon__live">
              <span className="stu-mdot stu-mdot--on" aria-hidden />
              {t("monitoring.liveHint")}
            </small>
            <button type="button" className="btn btn--line btn--sm" onClick={() => void refresh()} disabled={busy} data-ai-id={`${AI}.refresh`} data-ai-type="button" data-ai-label={t("monitoring.refresh")}>
              <IconRefresh className={busy ? "stu-spinning" : undefined} aria-hidden />
              {t("monitoring.refresh")}
            </button>
          </div>
        </div>
        <p className="stu-hint">{t("monitoring.privacy")}</p>
        {st.error ? <LoadProblem error={st.error} onRetry={() => void refresh()} busy={busy} /> : null}

        {rows.length || st.users.length ? (
          <FilterBar
            search={{ value: q, onChange: setQ, placeholder: t("monitoring.searchPh"), aiId: `${AI}.search.input`, aiLabel: t("monitoring.searchPh") }}
            fields={[
              { key: "code", label: t("monitoring.filterCtor"), value: code, onChange: setCode, options: codeOpts, aiId: `${AI}.filter.constructor` },
              { key: "user", label: t("monitoring.filterUser"), value: userId, onChange: setUserId, options: userOpts, aiId: `${AI}.filter.user` },
              { key: "state", label: t("monitoring.filterState"), value: state, onChange: setState, options: stateOpts, aiId: `${AI}.filter.state` },
            ]}
            count={shown.length}
            aiId={`${AI}.filters`}
            aiLabel={t("monitoring.filterTitle")}
          />
        ) : null}

        {!rows.length ? (
          <StudioEmpty icon={IconChartBar} title={t("screens.monitoring.emptyTitle")} text={t("screens.monitoring.emptyText")} />
        ) : !shown.length ? (
          <StudioEmpty icon={IconChartBar} title={t("monitoring.noMatch")} text={t("monitoring.noMatchText")} />
        ) : (
          <div className="stu-mon__table" role="table" aria-label={t("monitoring.listTitle")}>
            <div className="stu-mon__row stu-mon__row--head" role="row">
              <span role="columnheader">{t("monitoring.col.user")}</span>
              <span role="columnheader">{t("monitoring.col.work")}</span>
              <span role="columnheader">{t("monitoring.col.time")}</span>
              <span role="columnheader">{t("monitoring.col.saves")}</span>
              <span role="columnheader">{t("monitoring.col.seen")}</span>
            </div>
            {shown.map((r) => {
              const a = r.a;
              const name = a.userName || t("monitoring.unknownUser");
              const objName = a.objectName || t("monitoring.noObject");
              return (
                <div
                  key={a.sessionId || `${a.userId}-${a.startedAt}`}
                  className={`stu-mon__row${a.online ? " is-on" : ""}`}
                  role="row"
                  data-ai-id={aiId(`${AI}.row`, a.sessionId || a.userId)}
                  data-ai-type="row"
                  data-ai-label={`${name} · ${objName}`}
                >
                  <span className="stu-mon__who" role="cell">
                    <span className="stu-sava" aria-hidden>
                      {initialsOf(name)}
                      <span className={`stu-mdot stu-mdot--abs${a.online ? " stu-mdot--on" : ""}`} />
                    </span>
                    <span className="stu-mon__wt">
                      <b>{name}</b>
                      <small>
                        <span className={`stu-mon__state${a.online ? " is-on" : ""}`}>{a.online ? t("monitoring.online") : t("monitoring.offline")}</span>
                        {roleNote(a.role)}
                      </small>
                    </span>
                  </span>
                  <span className="stu-mon__obj" role="cell">
                    <ConstructorIcon code={a.constructorCode} size="sm" />
                    <span className="stu-mon__ot">
                      {a.objectId ? (
                        <Link href={`/admin/studio/o/${encodeURIComponent(a.objectId)}`} className="stu-mon__olink" data-ai-id={aiId(`${AI}.row`, a.sessionId || a.userId, "open")} data-ai-type="link" data-ai-label={objName}>
                          {objName}
                        </Link>
                      ) : (
                        <b>{objName}</b>
                      )}
                      <small>
                        {a.constructorCode ? ctorName(a.constructorCode) : ""}
                      </small>
                      {whatOf(a) ? <small className="stu-mon__act">{whatOf(a)}</small> : null}
                    </span>
                  </span>
                  <span className="stu-mon__num" role="cell">
                    <em className="stu-mon__lbl">{t("monitoring.col.time")}</em>
                    <IconClock aria-hidden />
                    {a.online ? <LiveClock row={r} /> : duration(a.durationSec)}
                  </span>
                  <span className="stu-mon__num" role="cell">
                    <em className="stu-mon__lbl">{t("monitoring.col.saves")}</em>
                    <IconEdit aria-hidden />
                    {num(a.saveCount)}
                  </span>
                  <span className="stu-mon__seen" role="cell">
                    <em className="stu-mon__lbl">{t("monitoring.col.seen")}</em>
                    {a.online ? t("monitoring.now") : ago(a.endedAt || a.lastSeenAt, now) || "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
