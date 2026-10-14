"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType, type CSSProperties, type SVGProps } from "react";
import { Link } from "@/i18n/navigation";
import DatePicker from "@/components/DatePicker";
import FilterBar from "@/components/filters/FilterBar";
import { aiId } from "@/lib/ai/ids";
import { asDict, parseServerTime } from "@/lib/http";
import { timeOnly } from "@/lib/date";
import type { UserEvent } from "@/lib/userSocket";
import { subscribeInternalEvents, type InternalEvent } from "@/lib/internalSocket";
import { getStudioMonitoring, isStudioEvent, listStudioAudit, normStudioActivity, type StudioActivity, type StudioAuditEvent, type StudioMonitoringUser } from "@/lib/services/studio";
import { ctorOrder } from "@/lib/studio/constructors";
import StudioShell from "./StudioShell";
import { ConstructorIcon, StudioEmpty, StudioLoading, useNow, useStudioLive, useStudioText } from "./bits";
import { StudioKpi, LoadProblem, initialsOf, matchesTerms, type Phase } from "./settings/ui";
import { IconArrowRight, IconChartBar, IconChat, IconClock, IconEdit, IconInbox, IconMoon, IconPlus, IconRefresh, IconRocket, IconSend, IconShieldCheck, IconUsers } from "@/components/icons";

const IconPulse = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

type Row = { a: StudioActivity; at: number };
type State = { phase: Phase; rows: Row[]; serverOnline: number; summary: { online: number; sessions: number; users: number; objectsCreated: number; submittedForApproval: number; saveCount: number; durationSeconds: number }; users: StudioMonitoringUser[]; events: StudioAuditEvent[] | null; error: unknown };
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

const DAY_MS = 86_400_000;
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const midnight = (iso: string) => new Date(`${iso}T00:00:00`).getTime();
const shiftDay = (iso: string, n: number) => isoOf(new Date(midnight(iso) + n * DAY_MS + 12 * 3_600_000));

// The audit trail counts whole days on the server's calendar, which can be a
// day off the viewer's: ask one day wider on each side, then match by time.
function auditRange(period: Period, from: string, to: string): { dateFrom?: string; dateTo?: string } {
  const r = rangeOf(period, from, to);
  const a = r.date ?? r.dateFrom;
  const b = r.date ?? r.dateTo;
  return { dateFrom: a ? shiftDay(a, -1) : undefined, dateTo: b ? shiftDay(b, 1) : undefined };
}

const startOf = (a: StudioActivity) => parseServerTime(a.startedAt);
function endOf(a: StudioActivity, now: number): number {
  if (a.online) return now;
  const e = parseServerTime(a.endedAt || a.lastSeenAt);
  return Number.isFinite(e) ? e : startOf(a) + a.durationSec * 1000;
}

// What one session did: the same person's actions on the same record while
// it was open (a new record's session takes whatever it created).
function actsOf(a: StudioActivity, events: StudioAuditEvent[], now: number): StudioAuditEvent[] {
  const s = startOf(a);
  if (!Number.isFinite(s)) return [];
  const e = endOf(a, now);
  return events.filter((x) => x.userId === a.userId && x.at >= s - 1000 && x.at <= e + 5000 && (!a.objectId || x.targetId === a.objectId)).sort((x, y) => x.at - y.at);
}

// The time axis the work rhythm is drawn on: one day by the hour, a range
// day by day.
type Axis = { from: number; to: number; ticks: { at: number; label: string }[] };
function axisOf(period: Period, dateFrom: string, dateTo: string, rows: Row[], now: number): Axis | null {
  const days = rows.map((r) => startOf(r.a)).filter(Number.isFinite);
  const ends = rows.map((r) => endOf(r.a, now)).filter(Number.isFinite);
  const r = rangeOf(period, dateFrom, dateTo);
  const first = r.date ?? r.dateFrom ?? (days.length ? isoOf(new Date(Math.min(...days))) : "");
  const last = r.date ?? r.dateTo ?? (ends.length ? isoOf(new Date(Math.max(...ends))) : first);
  if (!first) return null;
  const from = midnight(first);
  const to = midnight(shiftDay(last < first ? first : last, 1));
  const span = Math.round((to - from) / DAY_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  const ticks: Axis["ticks"] = [];
  if (span <= 1) {
    for (let h = 0; h <= 24; h += 6) ticks.push({ at: from + h * 3_600_000, label: `${p(h)}:00` });
  } else {
    const step = Math.max(1, Math.ceil(span / 7));
    for (let d = 0; d <= span; d += step) {
      const at = midnight(shiftDay(first, d));
      const x = new Date(at);
      ticks.push({ at, label: `${p(x.getDate())}.${p(x.getMonth() + 1)}` });
    }
  }
  return { from, to, ticks };
}

const ACT_ICON: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  create: IconPlus,
  save: IconEdit,
  submit: IconSend,
  review: IconShieldCheck,
  publish: IconRocket,
  archive: IconInbox,
  comment: IconChat,
  rollback: IconRefresh,
  restore: IconRefresh,
};

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
  const { t, locale, ctorName, role, duration, ago, num, day } = useStudioText();
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
  const [st, setSt] = useState<State>({ phase: "loading", rows: [], serverOnline: 0, summary: { online: 0, sessions: 0, users: 0, objectsCreated: 0, submittedForApproval: 0, saveCount: 0, durationSeconds: 0 }, users: [], events: null, error: null });
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
      // What was done comes from the audit trail; without access to it the
      // sessions still show, only without their actions.
      const [m, events] = await Promise.all([
        getStudioMonitoring({ constructorCode: code, userId, ...rangeOf(period, dateFrom, dateTo) }),
        listStudioAudit({ userId, ...auditRange(period, dateFrom, dateTo) }).catch(() => null),
      ]);
      if (my !== seq.current) return;
      const at = Date.now();
      setSt({ phase: "ready", rows: sortRows(m.items.map((a) => ({ a, at }))), serverOnline: m.online, summary: m.summary, users: m.users, events, error: null });
      setSeen((cur) => {
        const users = new Map(cur.users.map((u) => [u.id, u]));
        for (const u of m.users) if (u.id) users.set(u.id, u);
        const codes = new Set([...cur.codes, ...m.items.map((a) => a.constructorCode).filter(Boolean)]);
        return { users: [...users.values()], codes: [...codes] };
      });
    } catch (e) {
      if (my !== seq.current) return;
      setSt((cur) => (cur.phase === "ready" ? { ...cur, error: e } : { phase: "error", rows: [], serverOnline: 0, summary: cur.summary, users: cur.users, events: null, error: e }));
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
  const hm = (ms: number) => (Number.isFinite(ms) ? timeOnly(new Date(ms).toISOString(), locale) : "");
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
  const events = st.events ?? [];
  const axis = axisOf(period, dateFrom, dateTo, rows, now);
  const pos = (ms: number) => (axis ? Math.min(100, Math.max(0, ((ms - axis.from) / (axis.to - axis.from)) * 100)) : 0);
  const nowAt = axis && now >= axis.from && now <= axis.to ? pos(now) : null;
  const onNow = rows.filter((r) => r.a.online);
  const lastOff = rows.find((r) => !r.a.online);

  // Who is in Studio this minute, each with a running clock.
  const liveNow = open ? (
    <section className={`stu-mlive${onNow.length ? " is-on" : ""}`} data-ai-id={`${AI}.now`} data-ai-type="section" data-ai-label={t("monitoring.liveTitle")}>
      <div className="stu-mlive__h">
        <span className="stu-mlive__beacon" aria-hidden />
        <h3>{t("monitoring.liveTitle")}</h3>
        {onNow.length ? <span className="stu-mlive__n">{num(onNow.length)}</span> : null}
        <small className="stu-mon__live">{t("monitoring.liveHint")}</small>
      </div>
      {onNow.length ? (
        <ul className="stu-mlive__list">
          {onNow.map((r) => {
            const a = r.a;
            const name = a.userName || t("monitoring.unknownUser");
            const objName = a.objectName || t("monitoring.noObject");
            return (
              <li key={a.sessionId || a.userId} className="stu-mlive__card">
                <div className="stu-mlive__who">
                  <span className="stu-sava stu-mlive__av" aria-hidden>
                    {initialsOf(name)}
                    <span className="stu-mdot stu-mdot--abs stu-mdot--on" />
                  </span>
                  <span className="stu-mon__wt">
                    <b>{name}</b>
                    <small>{t("monitoring.since", { t: hm(startOf(a)) })}{roleNote(a.role)}</small>
                  </span>
                </div>
                <div className="stu-mlive__where">
                  <ConstructorIcon code={a.constructorCode} size="sm" />
                  <span className="stu-mon__ot">
                    {a.objectId ? (
                      <Link href={`/admin/studio/o/${encodeURIComponent(a.objectId)}`} className="stu-mon__olink">
                        {objName}
                      </Link>
                    ) : (
                      <b>{objName}</b>
                    )}
                    <small>{[a.constructorCode ? ctorName(a.constructorCode) : "", whatOf(a)].filter(Boolean).join(" · ")}</small>
                  </span>
                </div>
                <div className="stu-mlive__foot">
                  <span className="stu-mlive__clock">
                    <IconClock aria-hidden />
                    <LiveClock row={r} />
                  </span>
                  {a.saveCount ? (
                    <span className="stu-mact stu-mact--save">
                      <IconEdit aria-hidden />
                      {t("monitoring.did.save")} ×{num(a.saveCount)}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="stu-mlive__none">
          <IconMoon aria-hidden />
          <span>
            <b>{t("monitoring.liveNone")}</b>
            {lastOff ? <small>{t("monitoring.liveLast", { name: lastOff.a.userName || t("monitoring.unknownUser"), ago: ago(lastOff.a.endedAt || lastOff.a.lastSeenAt, now) || "—", where: ctorName(lastOff.a.constructorCode) })}</small> : null}
          </span>
        </p>
      )}
    </section>
  ) : null;

  // Sessions by the day they started, newest first, live ones on top.
  const days: { key: string; rows: Row[] }[] = [];
  for (const r of [...shown].sort((x, y) => Number(y.a.online) - Number(x.a.online) || startOf(y.a) - startOf(x.a))) {
    const s = startOf(r.a);
    const key = Number.isFinite(s) ? isoOf(new Date(s)) : "";
    const last = days[days.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else days.push({ key, rows: [r] });
  }
  const dayName = (key: string) => (key === dayIso(0) ? t("monitoring.period.today") : key === dayIso(1) ? t("monitoring.period.yesterday") : key ? day(`${key}T12:00:00`) : "—");

  return (
    <>
      {periodBar}
      {liveNow}
      {kpis}
      {people.length ? (
        <section className="stu-card stu-mon" data-ai-id={`${AI}.users`} data-ai-type="section" data-ai-label={t("monitoring.usersTitle")}>
          <div className="stu-card__h">
            <h3>{t("monitoring.usersTitle")}</h3>
            <small className="stu-mppl__hint">{t("monitoring.rhythmHint")}</small>
          </div>
          <div className="stu-mppl">
            {axis ? (
              <div className="stu-mppl__axis" aria-hidden>
                <span />
                <span className="stu-mppl__ticks">
                  {axis.ticks.map((k) => (
                    <i key={k.at} style={{ left: `${pos(k.at)}%` }}>
                      {k.label}
                    </i>
                  ))}
                </span>
                <span />
              </div>
            ) : null}
            {people.map((u) => {
              const name = u.name || t("monitoring.unknownUser");
              const mine = rows.filter((r) => r.a.userId === u.id);
              return (
                <button
                  type="button"
                  key={u.id || name}
                  className={`stu-mppl__row${u.online ? " is-on" : ""}${userId && userId === u.id ? " is-sel" : ""}`}
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
                        {u.online ? null : <span>· {ago(u.lastSeenAt, now) || "—"}</span>}
                      </small>
                    </span>
                  </span>
                  {axis ? (
                    <span className="stu-mppl__bar" aria-hidden>
                      {axis.ticks.map((k) => (
                        <i key={k.at} className="stu-mppl__grid" style={{ left: `${pos(k.at)}%` }} />
                      ))}
                      {nowAt != null ? <i className="stu-mppl__now" style={{ left: `${nowAt}%` }} /> : null}
                      {mine.map((r) => {
                        const s = startOf(r.a);
                        if (!Number.isFinite(s)) return null;
                        const l = pos(s);
                        const w = Math.max(0.6, pos(endOf(r.a, now)) - l);
                        return (
                          <b
                            key={r.a.sessionId || s}
                            className={`stu-mppl__seg${r.a.online ? " is-on" : ""}`}
                            style={{ left: `${l}%`, width: `${w}%` } as CSSProperties}
                            title={`${hm(s)}–${r.a.online ? t("monitoring.now") : hm(endOf(r.a, now))} · ${ctorName(r.a.constructorCode)}${r.a.objectName ? ` · ${r.a.objectName}` : ""}`}
                          />
                        );
                      })}
                    </span>
                  ) : null}
                  <span className="stu-mppl__stats">
                    <span title={t("monitoring.col.time")}>
                      <IconClock aria-hidden />
                      {duration(u.durationSeconds)}
                    </span>
                    <span title={t("monitoring.col.sessions")}>
                      <IconChartBar aria-hidden />
                      {num(u.sessions)}
                    </span>
                    <span title={t("monitoring.col.saves")}>
                      <IconEdit aria-hidden />
                      {num(u.saveCount)}
                    </span>
                    <span title={t("monitoring.col.objects")}>
                      <IconPlus aria-hidden />
                      {num(u.objects)}
                    </span>
                    <span title={t("monitoring.col.submitted")}>
                      <IconSend aria-hidden />
                      {num(u.submitted)}
                    </span>
                  </span>
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
          <div className="stu-mdays">
            {days.map((g) => {
              const total = g.rows.reduce((n, r) => n + liveSeconds(r, now), 0);
              return (
                <section key={g.key || "none"} className="stu-mday" aria-label={dayName(g.key)}>
                  <h4 className="stu-mday__h">
                    <b>{dayName(g.key)}</b>
                    <small>{t("monitoring.dayMeta", { n: num(g.rows.length), time: duration(total) || "0" })}</small>
                  </h4>
                  <ol className="stu-mses">
                    {g.rows.map((r) => {
                      const a = r.a;
                      const name = a.userName || t("monitoring.unknownUser");
                      const acts = actsOf(a, events, now);
                      // A new record's session names the record it created.
                      const made = a.objectId ? undefined : acts.find((e) => e.action === "create" && e.targetId);
                      const objId = a.objectId || made?.targetId || "";
                      const objName = a.objectName || made?.title || t("monitoring.noObject");
                      const saves = Math.max(a.saveCount, acts.filter((e) => e.action === "save").length);
                      const kinds = new Map<string, { n: number; at: number }>();
                      for (const e of acts) {
                        if (e.action === "save") continue;
                        const k = kinds.get(e.action);
                        kinds.set(e.action, k ? { n: k.n + 1, at: k.at } : { n: 1, at: e.at });
                      }
                      return (
                        <li
                          key={a.sessionId || `${a.userId}-${a.startedAt}`}
                          className={`stu-mses__i${a.online ? " is-on" : ""}`}
                          data-ai-id={aiId(`${AI}.row`, a.sessionId || a.userId)}
                          data-ai-type="row"
                          data-ai-label={`${name} · ${objName}`}
                        >
                          <span className="stu-mses__time">
                            <b>{hm(startOf(a)) || "—"}</b>
                            <i aria-hidden />
                            <b className={a.online ? "is-live" : undefined}>{a.online ? t("monitoring.now") : hm(endOf(a, now)) || "—"}</b>
                          </span>
                          <div className="stu-mses__card">
                            <div className="stu-mses__top">
                              <span className="stu-mon__who">
                                <span className="stu-sava stu-sava--sm" aria-hidden>
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
                              <IconArrowRight className="stu-mses__arrow" aria-hidden />
                              <span className="stu-mon__obj">
                                <ConstructorIcon code={a.constructorCode} size="sm" />
                                <span className="stu-mon__ot">
                                  {objId ? (
                                    <Link href={`/admin/studio/o/${encodeURIComponent(objId)}`} className="stu-mon__olink" data-ai-id={aiId(`${AI}.row`, a.sessionId || a.userId, "open")} data-ai-type="link" data-ai-label={objName}>
                                      {objName}
                                    </Link>
                                  ) : (
                                    <b>{objName}</b>
                                  )}
                                  <small>{a.constructorCode ? ctorName(a.constructorCode) : ""}</small>
                                </span>
                              </span>
                              <span className={`stu-mses__dur${a.online ? " is-on" : ""}`}>
                                <IconClock aria-hidden />
                                {a.online ? <LiveClock row={r} /> : duration(a.durationSec) || "0"}
                              </span>
                            </div>
                            <div className="stu-mses__acts">
                              {[...kinds].map(([k, v]) => {
                                const Glyph = ACT_ICON[k] ?? IconPulse;
                                return (
                                  <span key={k} className={`stu-mact stu-mact--${ACT_ICON[k] ? k : "other"}`}>
                                    <Glyph aria-hidden />
                                    {t.has(`monitoring.did.${k}`) ? t(`monitoring.did.${k}`) : t("monitoring.did.other")}
                                    {v.n > 1 ? ` ×${num(v.n)}` : ""}
                                    <time>{hm(v.at)}</time>
                                  </span>
                                );
                              })}
                              {saves ? (
                                <span className="stu-mact stu-mact--save">
                                  <IconEdit aria-hidden />
                                  {t("monitoring.did.save")} ×{num(saves)}
                                </span>
                              ) : null}
                              {!kinds.size && !saves ? <span className="stu-mses__idle">{[whatOf(a), t("monitoring.did.none")].filter(Boolean).join(" · ")}</span> : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
