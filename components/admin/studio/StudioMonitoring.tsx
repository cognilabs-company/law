"use client";

import { useCallback, useEffect, useRef, useState, type SVGProps } from "react";
import { Link } from "@/i18n/navigation";
import FilterBar from "@/components/filters/FilterBar";
import { aiId } from "@/lib/ai/ids";
import { asDict, parseServerTime } from "@/lib/http";
import type { UserEvent } from "@/lib/userSocket";
import { getStudioMonitoring, normStudioActivity, type StudioActivity } from "@/lib/services/studio";
import { ctorOrder } from "@/lib/studio/constructors";
import StudioShell from "./StudioShell";
import { ConstructorIcon, StudioCodeChip, StudioEmpty, StudioLoading, useNow, useStudioLive, useStudioText } from "./bits";
import { StudioKpi, LoadProblem, initialsOf, matchesTerms, type Phase } from "./settings/ui";
import { IconChartBar, IconClock, IconEdit, IconRefresh, IconUsers } from "@/components/icons";

const IconPulse = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

type Row = { a: StudioActivity; at: number };
type State = { phase: Phase; rows: Row[]; serverOnline: number; error: unknown };

const AI = "admin.studio.monitoring";

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

function sameDay(iso: string, now: number): boolean {
  const at = parseServerTime(iso);
  if (!Number.isFinite(at) || !now) return false;
  return new Date(at).toDateString() === new Date(now).toDateString();
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
  const now = useNow(30_000);
  const [st, setSt] = useState<State>({ phase: "loading", rows: [], serverOnline: 0, error: null });
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState("");
  const seq = useRef(0);
  const liveRows = useRef<Row[]>([]);
  const soon = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const m = await getStudioMonitoring();
      if (my !== seq.current) return;
      const at = Date.now();
      setSt({ phase: "ready", rows: sortRows(m.items.map((a) => ({ a, at }))), serverOnline: m.online, error: null });
    } catch (e) {
      if (my !== seq.current) return;
      setSt((cur) => (cur.phase === "ready" ? { ...cur, error: e } : { phase: "error", rows: [], serverOnline: 0, error: e }));
    }
  }, []);

  useEffect(() => {
    void load();
    return () => clearTimeout(soon.current);
  }, [load]);

  useEffect(() => {
    liveRows.current = st.phase === "ready" ? st.rows : [];
  });

  const refetchSoon = useCallback(() => {
    clearTimeout(soon.current);
    soon.current = setTimeout(() => void load(), 400);
  }, [load]);

  useStudioLive((e) => {
    if (e.event === "studio.resync") {
      refetchSoon();
      return;
    }
    if (e.event !== "studio.activity" && e.event !== "studio.activity_ended") return;
    const raw = eventRaw(e);
    const key = sessionKey(raw);
    const ended = e.event === "studio.activity_ended";
    if (!key || !liveRows.current.some((r) => r.a.sessionId === key)) {
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
      return { ...cur, rows: sortRows(next) };
    });
  });

  async function refresh() {
    setBusy(true);
    await load();
    setBusy(false);
  }

  const rows = st.rows;
  const online = rows.length ? rows.filter((r) => r.a.online).length : st.serverOnline;
  const today = rows.filter((r) => sameDay(r.a.startedAt || r.a.lastSeenAt, now));
  const todaySaves = today.reduce((n, r) => n + r.a.saveCount, 0);
  const todayTime = today.reduce((n, r) => n + liveSeconds(r, now), 0);

  const codes = [...new Set(rows.map((r) => r.a.constructorCode).filter(Boolean))].sort((x, y) => ctorOrder(x) - ctorOrder(y));
  if (code && !codes.includes(code)) codes.push(code);
  const codeOpts = [
    { value: "", label: t("common.all") },
    ...codes.map((c) => ({ value: c, label: `${c} · ${ctorName(c)} (${num(rows.filter((r) => r.a.constructorCode === c).length)})` })),
  ];
  const stateOpts = [
    { value: "", label: t("common.all") },
    { value: "online", label: `${t("monitoring.online")} (${num(online)})` },
    { value: "offline", label: `${t("monitoring.offline")} (${num(rows.length - online)})` },
  ];
  const shown = rows.filter((r) => {
    if (code && r.a.constructorCode !== code) return false;
    if (state === "online" && !r.a.online) return false;
    if (state === "offline" && r.a.online) return false;
    return matchesTerms([r.a.userName, r.a.role, role(r.a.role), r.a.constructorCode, ctorName(r.a.constructorCode), r.a.objectName], q);
  });

  const kpis = (
    <div className="stu-mkpis" data-ai-id={`${AI}.summary`} data-ai-type="section" data-ai-label={t("monitoring.summary")}>
      <StudioKpi icon={IconPulse} value={st.phase === "ready" ? num(online) : "—"} label={t("monitoring.kpi.online")} tone={online > 0 ? "ok" : undefined} />
      <StudioKpi icon={IconUsers} value={st.phase === "ready" && now ? num(today.length) : "—"} label={t("monitoring.kpi.sessions")} />
      <StudioKpi
        icon={IconEdit}
        value={st.phase === "ready" && now ? num(todaySaves) : "—"}
        label={t("monitoring.kpi.saves")}
        hint={st.phase === "ready" && now && todayTime > 0 ? t("monitoring.kpi.time", { v: duration(todayTime) }) : undefined}
      />
    </div>
  );

  if (st.phase === "loading") {
    return (
      <>
        {kpis}
        <StudioLoading rows={4} />
      </>
    );
  }
  if (st.phase === "error") {
    return (
      <>
        {kpis}
        <LoadProblem error={st.error} onRetry={() => void refresh()} busy={busy} missingText={t("monitoring.missing")} />
      </>
    );
  }

  return (
    <>
      {kpis}
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

        {rows.length ? (
          <FilterBar
            search={{ value: q, onChange: setQ, placeholder: t("monitoring.searchPh"), aiId: `${AI}.search.input`, aiLabel: t("monitoring.searchPh") }}
            fields={[
              { key: "code", label: t("monitoring.filterCtor"), value: code, onChange: setCode, options: codeOpts, aiId: `${AI}.filter.constructor` },
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
                  data-ai-label={`${name} · ${a.constructorCode} · ${objName}`}
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
                        {a.role ? ` · ${role(a.role)}` : ""}
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
                        <StudioCodeChip code={a.constructorCode} />
                        {a.constructorCode ? ctorName(a.constructorCode) : ""}
                      </small>
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
