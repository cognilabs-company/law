"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { HrmTask } from "@/lib/services/internalHrm";
import HrmCalendar, { monthOf, type CalDay } from "@/components/internal/HrmCalendar";
import { HrmBar, HrmEmpty, HrmPanel, HrmPerson, HrmPriority, HrmStatus, isOverdue, useHrmFormat } from "@/components/internal/HrmUi";
import { IconBriefcase, IconChevronLeft, IconChevronRight, IconFolder, IconUsers } from "@/components/icons";

// The work-item views of MedControl HR (/workitems: calendar, Gantt, team
// load, projects), drawn from the execution tasks already on the page —
// their deadlines, creation dates, people and projects.

const DONE = ["done", "cancelled"];
const day = (iso: string) => (iso ? iso.slice(0, 10) : "");
const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function TaskCalendar({ items, now, onOpen }: { items: HrmTask[]; now: number; onOpen: (t: HrmTask) => void }) {
  const t = useTranslations("internal.work");
  const today = isoOf(new Date(now));
  const [month, setMonth] = useState(() => monthOf(new Date(now)));
  const days = useMemo(() => {
    const out: Record<string, CalDay> = {};
    const by = new Map<string, HrmTask[]>();
    for (const x of items) {
      const d = day(x.deadline);
      if (!d || !d.startsWith(month)) continue;
      by.set(d, [...(by.get(d) ?? []), x]);
    }
    for (const [d, list] of by) {
      const late = list.some((x) => isOverdue(x.deadline, x.status, now));
      const allDone = list.every((x) => DONE.includes(x.status));
      out[d] = {
        tone: late ? "err" : allDone ? "ok" : "info",
        items: (
          <span className="hrm-wk-cal">
            {list.slice(0, 3).map((x) => (
              <button key={x.id} type="button" className={`hrm-wk-cal__i${DONE.includes(x.status) ? " is-done" : isOverdue(x.deadline, x.status, now) ? " is-late" : ""}`} onClick={(e) => { e.stopPropagation(); onOpen(x); }} title={x.title}>
                {x.title}
              </button>
            ))}
            {list.length > 3 ? <small>{t("more", { n: list.length - 3 })}</small> : null}
          </span>
        ),
      };
    }
    return out;
  }, [items, month, now, onOpen, t]);
  return (
    <HrmPanel>
      <HrmCalendar month={month} onMonth={setMonth} days={days} today={today} legend={(["info", "err", "ok"] as const).map((k) => <span key={k}><i className={`hrm-cal__cell--${k}`} />{t(`legend.${k === "info" ? "open" : k === "err" ? "late" : "done"}`)}</span>)} />
    </HrmPanel>
  );
}

// Each task is a bar from when it was set to its deadline, over a window of
// weeks the user moves through.
export function TaskGantt({ items, now, onOpen }: { items: HrmTask[]; now: number; onOpen: (t: HrmTask) => void }) {
  const t = useTranslations("internal.work");
  const f = useHrmFormat();
  const base = now;
  const [shift, setShift] = useState(0);
  const span = 28;
  const start = useMemo(() => {
    const d = new Date(base);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 + shift * 7);
    return d.getTime();
  }, [base, shift]);
  const end = start + span * DAY_MS;
  const rows = items
    .filter((x) => x.deadline || x.createdAt)
    .map((x) => {
      const to = Date.parse(x.deadline || x.createdAt);
      const from = Math.min(Date.parse(x.createdAt || x.deadline) || to, to);
      return { x, from, to };
    })
    .filter((r) => Number.isFinite(r.from) && r.to >= start && r.from < end)
    .sort((a, b) => a.to - b.to);
  const pct = (ms: number) => Math.max(0, Math.min(100, ((ms - start) / (end - start)) * 100));
  const weeks = [0, 1, 2, 3].map((w) => start + w * 7 * DAY_MS);
  const nowPct = pct(base);
  return (
    <HrmPanel
      title={t("gantt.title")}
      icon={IconBriefcase}
      actions={
        <span className="hrm-wk-nav">
          <button type="button" className="btn btn--line btn--sm" onClick={() => setShift((n) => n - 1)} aria-label={t("gantt.prev")}><IconChevronLeft /></button>
          <button type="button" className="btn btn--line btn--sm" onClick={() => setShift(0)} disabled={shift === 0}>{t("gantt.now")}</button>
          <button type="button" className="btn btn--line btn--sm" onClick={() => setShift((n) => n + 1)} aria-label={t("gantt.next")}><IconChevronRight /></button>
        </span>
      }
    >
      {!rows.length ? (
        <HrmEmpty icon={IconBriefcase} title={t("gantt.empty")} text={t("gantt.emptyText")} />
      ) : (
        <div className="hrm-gantt" role="table" aria-label={t("gantt.title")}>
          <div className="hrm-gantt__head" role="row">
            <span role="columnheader">{t("gantt.task")}</span>
            <span className="hrm-gantt__scale" role="columnheader">
              {weeks.map((w) => <i key={w} style={{ left: `${pct(w)}%` }}>{f.date(new Date(w).toISOString())}</i>)}
            </span>
          </div>
          {rows.map(({ x, from, to }) => {
            const late = isOverdue(x.deadline, x.status, now);
            const left = pct(from);
            const width = Math.max(1.5, pct(to) - left);
            return (
              <div key={x.id} className="hrm-gantt__row" role="row">
                <button type="button" className="hrm-gantt__name" onClick={() => onOpen(x)} role="cell">
                  <b>{x.title}</b>
                  <small>{x.responsibleName || "—"}</small>
                </button>
                <span className="hrm-gantt__track" role="cell">
                  {weeks.map((w) => <i key={w} className="hrm-gantt__grid" style={{ left: `${pct(w)}%` }} aria-hidden />)}
                  {nowPct > 0 && nowPct < 100 ? <i className="hrm-gantt__now" style={{ left: `${nowPct}%` }} aria-hidden /> : null}
                  <button
                    type="button"
                    className={`hrm-gantt__bar${DONE.includes(x.status) ? " is-done" : late ? " is-late" : ""}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    onClick={() => onOpen(x)}
                    title={`${x.title} · ${f.date(new Date(from).toISOString())} — ${x.deadline ? f.date(x.deadline) : "—"}`}
                  >
                    <span>{x.title}</span>
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </HrmPanel>
  );
}

// How much each person carries: open, overdue and done tasks, side by side.
export function TeamLoad({ items, now }: { items: HrmTask[]; now: number }) {
  const t = useTranslations("internal.work");
  const rows = useMemo(() => {
    const by = new Map<string, { name: string; code: string; open: number; late: number; done: number }>();
    for (const x of items) {
      const k = x.responsibleId || "-";
      const r = by.get(k) ?? { name: x.responsibleName, code: x.responsibleCode, open: 0, late: 0, done: 0 };
      if (DONE.includes(x.status)) r.done += 1;
      else {
        r.open += 1;
        if (isOverdue(x.deadline, x.status, now)) r.late += 1;
      }
      by.set(k, r);
    }
    return [...by.entries()].map(([id, r]) => ({ id, ...r })).sort((a, b) => b.open - a.open || b.late - a.late);
  }, [items, now]);
  const max = Math.max(1, ...rows.map((r) => r.open));
  return (
    <HrmPanel title={t("load.title")} icon={IconUsers} flush>
      {!rows.length ? (
        <HrmEmpty icon={IconUsers} title={t("load.empty")} />
      ) : (
        <div className="hrm-table-wrap">
          <table className="hrm-table">
            <thead><tr><th>{t("load.person")}</th><th>{t("load.open")}</th><th>{t("load.late")}</th><th>{t("load.done")}</th><th>{t("load.bar")}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.id === "-" ? <span className="hrm-muted">{t("load.unassigned")}</span> : <HrmPerson name={r.name || r.code} sub={r.code} size="sm" />}</td>
                  <td className="hrm-num"><b>{r.open}</b></td>
                  <td className="hrm-num">{r.late ? <span className="hrm-late">{r.late}</span> : 0}</td>
                  <td className="hrm-num">{r.done}</td>
                  <td style={{ minWidth: 160 }}><HrmBar value={(r.open / max) * 100} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </HrmPanel>
  );
}

// The tasks gathered by project, each with its progress.
export function ProjectsView({ items, now, onOpen }: { items: HrmTask[]; now: number; onOpen: (t: HrmTask) => void }) {
  const t = useTranslations("internal.work");
  const groups = useMemo(() => {
    const by = new Map<string, HrmTask[]>();
    for (const x of items) by.set(x.project || "", [...(by.get(x.project || "") ?? []), x]);
    return [...by.entries()].sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || b[1].length - a[1].length);
  }, [items]);
  if (!groups.length) return <HrmPanel><HrmEmpty icon={IconFolder} title={t("projects.empty")} /></HrmPanel>;
  return (
    <div className="hrm-projects">
      {groups.map(([name, list]) => {
        const done = list.filter((x) => x.status === "done").length;
        const late = list.filter((x) => isOverdue(x.deadline, x.status, now)).length;
        return (
          <HrmPanel key={name || "-"} title={name || t("projects.none")} icon={IconFolder} count={list.length}>
            <div className="hrm-projects__prog">
              <HrmBar value={(done / list.length) * 100} />
              <small>{t("projects.done", { done, all: list.length })}{late ? ` · ${t("projects.late", { n: late })}` : ""}</small>
            </div>
            <ul className="hrm-list">
              {list.slice(0, 6).map((x) => (
                <li key={x.id}>
                  <button type="button" className="hrm-projects__i" onClick={() => onOpen(x)}>
                    <span className="hrm-list__t"><b>{x.title}</b><small>{x.responsibleName || "—"}</small></span>
                    <span className="hrm-list__a"><HrmPriority value={x.priority} /><HrmStatus value={x.status} /></span>
                  </button>
                </li>
              ))}
            </ul>
            {list.length > 6 ? <small className="hrm-muted">{t("more", { n: list.length - 6 })}</small> : null}
          </HrmPanel>
        );
      })}
    </div>
  );
}
