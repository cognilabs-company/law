"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheckBig, ClipboardList, Hourglass, Target, TriangleAlert, UserX, ChevronRight } from "lucide-react";
import { isAborted } from "@/lib/http";
import { getTaskStats, taskErrorOf, TASK_STATUSES, type TaskStats as Stats } from "@/lib/services/taskManagement";
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

export function useTaskStats(tick: number): { stats: Stats | null; hidden: boolean } {
  const [state, setState] = useState<{ stats: Stats | null; hidden: boolean }>({ stats: null, hidden: false });
  useEffect(() => {
    const c = new AbortController();
    getTaskStats({}, c.signal).then(
      (stats) => setState({ stats, hidden: false }),
      (e) => {
        if (isAborted(e)) return;
        const k = taskErrorOf(e).kind;
        if (k === "forbidden" || k === "missing") setState({ stats: null, hidden: true });
      },
    );
    return () => c.abort();
  }, [tick]);
  return state;
}

export function TaskKpis({ stats: s, hidden, onReady, onUnassigned }: { stats: Stats | null; hidden: boolean; onReady: () => void; onUnassigned: () => void }) {
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
      <Tile icon={ClipboardList} tone="brand" value={s.created} label={t("kpi.created")} hint={t("kpi.createdHint")} delay={0} />
      <Tile icon={CircleCheckBig} tone="ok" value={s.readyInPeriod} label={t("kpi.done")} hint={t("kpi.doneHint")} delay={60} onClick={onReady} />
      <Tile icon={Hourglass} tone="open" value={s.active} label={t("kpi.open")} hint={s.overdue ? t("kpi.openLate", { n: s.overdue }) : t("kpi.openHint")} delay={120} />
      {s.unassigned ? (
        <button type="button" className="ttk-alert" onClick={onUnassigned} style={{ animationDelay: "180ms" }}>
          <UserX aria-hidden strokeWidth={STROKE} />
          <span>{t("kpi.unassigned", { n: s.unassigned })}</span>
          <ChevronRight aria-hidden strokeWidth={STROKE} />
        </button>
      ) : null}
    </div>
  );
}

export function TaskProgress({ stats: s }: { stats: Stats | null }) {
  const { t, status } = useTaskText();
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
      <p className="ttk-prog__f">{t("progress.foot", { done: s.readyTotal, total: s.total })}</p>
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
