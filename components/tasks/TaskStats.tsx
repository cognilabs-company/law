"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheckBig, ClipboardList, Hourglass, Target, TriangleAlert, UserX, ChevronRight } from "lucide-react";
import { isAborted } from "@/lib/http";
import { getTaskStats, taskErrorOf, TASK_STATUSES, type TaskCounts, type TaskPeriodField, type TaskStats as Stats } from "@/lib/services/taskManagement";
import { STATUS_ICON, STROKE, useTaskText, type TaskIcon } from "./parts";

function useCount(target: number): number {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = from.current;
    if (start === target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      const id = requestAnimationFrame(() => setV(target));
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 650);
      setV(Math.round(start + (target - start) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

function Tile({ icon: I, tone, value, label, hint, onClick, delay }: { icon: TaskIcon; tone: string; value: number; label: string; hint?: string; onClick?: () => void; delay: number }) {
  const n = useCount(value);
  const body = (
    <>
      <span className="ttk-kpi__i">
        <I aria-hidden strokeWidth={STROKE} />
      </span>
      <span className="ttk-kpi__txt">
        <span className="ttk-kpi__v">{n}</span>
        <span className="ttk-kpi__l">{label}</span>
        {hint ? <span className="ttk-kpi__h">{hint}</span> : null}
      </span>
      {onClick ? <ChevronRight className="ttk-kpi__go" aria-hidden strokeWidth={STROKE} /> : null}
    </>
  );
  const style = { animationDelay: `${delay}ms` };
  return onClick ? (
    <button type="button" className={`ttk-kpi ttk-kpi--${tone} ttk-kpi--tap`} style={style} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={`ttk-kpi ttk-kpi--${tone}`} style={style}>
      {body}
    </div>
  );
}

// `period`: the page's date range as YYYY-MM-DD; the stats endpoint takes a
// closed range, so both ends arrive filled (see TeamTasksPage).
export function useTaskStats(tick: number, period: { from: string; to: string } | null = null): { stats: Stats | null; hidden: boolean } {
  const [state, setState] = useState<{ stats: Stats | null; hidden: boolean }>({ stats: null, hidden: false });
  const from = period?.from ?? "";
  const to = period?.to ?? "";
  useEffect(() => {
    const c = new AbortController();
    getTaskStats(from && to ? { dateFrom: from, dateTo: to } : {}, c.signal).then(
      (stats) => setState({ stats, hidden: false }),
      (e) => {
        if (isAborted(e)) return;
        const k = taskErrorOf(e).kind;
        if (k === "forbidden" || k === "missing") setState({ stats: null, hidden: true });
      },
    );
    return () => c.abort();
  }, [tick, from, to]);
  return state;
}

// `scoped`: the list's status counts while a period is set — scoped by the
// backend to the same period and period field as the list. The stats call
// answers "created" and "done" for the period itself (events), but its
// open/overdue side is always "now"; with a period the open card comes from
// the list's counts and says which date it is about.
export function TaskKpis({
  stats: s,
  hidden,
  onReady,
  onCreated,
  onUnassigned,
  scoped = null,
  periodField = "deadline",
}: {
  stats: Stats | null;
  hidden: boolean;
  onReady: () => void;
  onCreated?: () => void;
  onUnassigned: () => void;
  scoped?: TaskCounts | null;
  periodField?: TaskPeriodField;
}) {
  const { t } = useTaskText();
  if (hidden) return null;
  if (!s) {
    return (
      <div className="ttk-kpis" aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className="ttk-kpi ttk-kpi--sk" />
        ))}
      </div>
    );
  }
  return (
    <div className="ttk-kpis">
      <Tile icon={ClipboardList} tone="brand" value={s.created} label={t(scoped ? "kpi.createdP" : "kpi.created")} hint={t(scoped ? "kpi.createdHintP" : "kpi.createdHint")} delay={0} onClick={onCreated} />
      <Tile icon={CircleCheckBig} tone="ok" value={s.readyInPeriod} label={t(scoped ? "kpi.doneP" : "kpi.done")} hint={t(scoped ? "kpi.doneHintP" : "kpi.doneHint")} delay={60} onClick={onReady} />
      {scoped ? (
        <Tile icon={Hourglass} tone="open" value={scoped.new + scoped.in_progress + scoped.testing} label={t(`kpi.openBy.${periodField}`)} hint={t(`kpi.openHintBy.${periodField}`)} delay={120} />
      ) : (
        <Tile icon={Hourglass} tone="open" value={s.active} label={t("kpi.open")} hint={s.overdue ? t("kpi.openLate", { n: s.overdue }) : t("kpi.openHint")} delay={120} />
      )}
      {s.unassigned && !scoped ? (
        <button type="button" className="ttk-alert" onClick={onUnassigned} style={{ animationDelay: "180ms" }}>
          <UserX aria-hidden strokeWidth={STROKE} />
          <span>{t("kpi.unassigned", { n: s.unassigned })}</span>
          <ChevronRight aria-hidden strokeWidth={STROKE} />
        </button>
      ) : null}
    </div>
  );
}

export function TaskProgress({ stats: full, scoped = null, periodField = "deadline" }: { stats: Stats | null; scoped?: TaskCounts | null; periodField?: TaskPeriodField }) {
  const { t, status } = useTaskText();
  // With a period, the bar and the split are the tasks due in it.
  const scopedTotal = scoped ? TASK_STATUSES.reduce((k, x) => k + scoped[x], 0) : 0;
  const s: Stats | null = full && scoped ? { ...full, total: scopedTotal, readyTotal: scoped.ready, byStatus: scoped, overdue: 0 } : full;
  const rate = s && s.total ? Math.round((s.readyTotal / s.total) * 100) : 0;
  const n = useCount(rate);
  if (!s) return null;
  const sum = TASK_STATUSES.reduce((k, x) => k + s.byStatus[x], 0);
  return (
    <section className="ttk-prog" aria-label={t("progress.title")}>
      <p className="ttk-prog__h">
        <Target aria-hidden strokeWidth={STROKE} />
        <span>{t("progress.title")}</span>
        <b>{n}%</b>
      </p>
      <div className="ttk-prog__bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rate} aria-label={t("progress.title")}>
        <span style={{ width: `${rate}%` }} />
      </div>
      <p className="ttk-prog__f">{t(scoped ? `progress.footBy.${periodField}` : "progress.foot", { done: s.readyTotal, total: s.total })}</p>
      {sum ? (
        <>
          <div className="ttk-split" aria-hidden>
            {TASK_STATUSES.map((x) => (s.byStatus[x] ? <span key={x} className={`ttk-split__s ttk-split__s--${x}`} style={{ flexGrow: s.byStatus[x] }} /> : null))}
          </div>
          <ul className="ttk-split__lg">
            {TASK_STATUSES.map((x) => {
              const I = STATUS_ICON[x];
              return (
                <li key={x}>
                  <span className={`ttk-dot ttk-dot--${x}`} />
                  <I aria-hidden strokeWidth={STROKE} />
                  <span>{s.labels[x] || status(x)}</span>
                  <b>{s.byStatus[x]}</b>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      {s.overdue ? (
        <p className="ttk-prog__late">
          <TriangleAlert aria-hidden strokeWidth={STROKE} />
          {t("progress.late", { n: s.overdue })}
        </p>
      ) : null}
    </section>
  );
}
