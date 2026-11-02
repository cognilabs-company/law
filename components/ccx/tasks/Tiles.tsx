"use client";

import type { ReactNode } from "react";
import type { TaskCounts, TaskPeriodField, TaskStats } from "@/lib/services/taskManagement";
import { IcClock, IcTasks } from "../icons";
import { IcCheckCircle, IcHourglass } from "./icons";
import { useCount } from "./kit";
import { useTx } from "./text";

type Tone = "ice" | "aqua" | "ok" | "hot";

function Tile({ icon, tone, value, label, hint, onClick, pressed, meter, meterLabel, i }: { icon: ReactNode; tone: Tone; value: number; label: string; hint?: string; onClick?: () => void; pressed?: boolean; meter?: number; meterLabel?: string; i: number }) {
  const n = useCount(value);
  const body = (
    <>
      <span className="opx-tk-tile__ic" aria-hidden="true">
        {icon}
      </span>
      <span className="opx-tk-tile__txt">
        <span className="opx-tk-tile__l">{label}</span>
        <b className="opx-tk-tile__v opx-num">{n}</b>
        {hint ? <small>{hint}</small> : null}
      </span>
      {meter != null ? (
        <span className="opx-tk-tile__meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={meter} aria-label={meterLabel}>
          <i style={{ width: `${meter}%` }} />
        </span>
      ) : null}
    </>
  );
  const style = { animationDelay: `${i * 50}ms` };
  return onClick ? (
    <button type="button" className="opx-tk-tile is-tap" data-tone={tone} aria-pressed={pressed} onClick={onClick} style={style}>
      {body}
    </button>
  ) : (
    <div className="opx-tk-tile" data-tone={tone} style={style}>
      {body}
    </div>
  );
}

type Props = {
  stats: TaskStats | null;
  hidden: boolean;
  stale: boolean;
  scoped: TaskCounts | null;
  periodField: TaskPeriodField;
  lateOnly: boolean;
  onCreated?: () => void;
  onDone: () => void;
  onLate: () => void;
};

export default function Tiles({ stats: s, hidden, stale, scoped, periodField, lateOnly, onCreated, onDone, onLate }: Props) {
  const { t, x } = useTx();
  if (hidden) return null;
  if (!s) {
    return (
      <div className="opx-tk-tiles" aria-busy="true">
        {[0, 1, 2, 3].map((k) => (
          <i key={k} className="opx-shim opx-tk-tile--sk" />
        ))}
      </div>
    );
  }
  const scopedTotal = scoped ? scoped.new + scoped.in_progress + scoped.testing + scoped.ready : 0;
  const total = scoped ? scopedTotal : s.total;
  const done = scoped ? scoped.ready : s.readyTotal;
  const rate = total ? Math.round((done / total) * 100) : 0;
  const foot = scoped ? t(`progress.footBy.${periodField}`, { done, total }) : t("progress.foot", { done, total });
  return (
    <div className={`opx-tk-tiles${stale ? " is-stale" : ""}`}>
      {scoped ? (
        <Tile icon={<IcHourglass size={22} />} tone="ice" value={scoped.new + scoped.in_progress + scoped.testing} label={t(`kpi.openBy.${periodField}`)} hint={t(`kpi.openHintBy.${periodField}`)} i={0} />
      ) : (
        <Tile icon={<IcHourglass size={22} />} tone="ice" value={s.active} label={t("kpi.open")} hint={s.overdue ? t("kpi.openLate", { n: s.overdue }) : t("kpi.openHint")} i={0} />
      )}
      <Tile icon={<IcTasks size={22} />} tone="aqua" value={s.created} label={t(scoped ? "kpi.createdP" : "kpi.created")} hint={t(scoped ? "kpi.createdHintP" : "kpi.createdHint")} onClick={onCreated} i={1} />
      <Tile icon={<IcCheckCircle size={22} />} tone="ok" value={s.readyInPeriod} label={t(scoped ? "kpi.doneP" : "kpi.done")} hint={foot} onClick={onDone} meter={rate} meterLabel={`${t("progress.title")}: ${rate}%`} i={2} />
      <Tile icon={<IcClock size={22} />} tone={s.overdue ? "hot" : "ice"} value={s.overdue} label={x("overdue")} hint={lateOnly ? x("lateOn") : x("lateTap")} onClick={onLate} pressed={lateOnly} i={3} />
    </div>
  );
}
