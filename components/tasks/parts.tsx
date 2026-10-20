"use client";

import { useEffect, useState, type ComponentType } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarClock, CircleCheckBig, Clock3, FlaskConical, Play, SendHorizontal, Sparkles, TriangleAlert, Undo2, type LucideProps } from "lucide-react";
import { fmtDateTime, monthTitle } from "@/lib/date";
import { isReturn, type Task, type TaskAssignee, type TaskStatus } from "@/lib/services/taskManagement";

export type TaskIcon = ComponentType<LucideProps>;
export const STROKE = 1.75;

export const STATUS_ICON: Record<TaskStatus, TaskIcon> = { new: Sparkles, in_progress: Clock3, testing: FlaskConical, ready: CircleCheckBig };

export function useTaskText() {
  const t = useTranslations("teamTasks");
  const locale = useLocale();
  const status = (s: TaskStatus | "") => (s ? t(`status.${s}`) : "");
  const when = (iso: string) => (iso ? fmtDateTime(iso, locale) : "");
  const actionLabel = (from: TaskStatus, to: TaskStatus) => (isReturn(from, to) ? t("act.return") : t(`act.${to}`));
  const due = (iso: string) => {
    const d = iso ? new Date(iso) : null;
    if (!d || Number.isNaN(d.getTime())) return "";
    const now = new Date();
    const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(d) - day(now)) / 86400000);
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    if (diff === 0) return t("due.today", { time });
    if (diff === 1) return t("due.tomorrow", { time });
    if (diff === -1) return t("due.yesterday", { time });
    return fmtDateTime(iso, locale);
  };
  return { t, locale, status, when, due, actionLabel };
}

export function StatusPill({ status, size = "md" }: { status: TaskStatus; size?: "sm" | "md" }) {
  const { status: label } = useTaskText();
  const I = STATUS_ICON[status];
  return (
    <span className={`ttk-st ttk-st--${status}${size === "sm" ? " ttk-st--sm" : ""}`}>
      <I aria-hidden strokeWidth={STROKE} />
      {label(status)}
    </span>
  );
}

export function Deadline({ task, full }: { task: Task; full?: boolean }) {
  const { t, when, due } = useTaskText();
  if (!task.deadlineAt) return <span className="ttk-dl ttk-dl--none">{t("noDeadline")}</span>;
  const late = task.isOverdue && task.status !== "ready";
  const I = late ? TriangleAlert : CalendarClock;
  return (
    <span className={`ttk-dl${late ? " ttk-dl--late" : ""}`} title={late ? t("overdue") : when(task.deadlineAt)}>
      <I aria-hidden strokeWidth={STROKE} />
      <span>{full ? when(task.deadlineAt) : due(task.deadlineAt)}</span>
      {late ? <span className="ttk-late-tag">{t("overdue")}</span> : null}
    </span>
  );
}

const HUES = [214, 262, 158, 24, 330, 190, 44, 288];
const hueOf = (s: string) => HUES[[...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length];
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";

export function Face({ id, name, size = 26 }: { id: string; name: string; size?: number }) {
  return (
    <span className="ttk-face" style={{ width: size, height: size, fontSize: Math.round(size * 0.4), ["--h" as string]: hueOf(id || name) }} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function Assignees({ people, max = 3, names = true }: { people: TaskAssignee[]; max?: number; names?: boolean }) {
  const { t } = useTaskText();
  if (!people.length) return <span className="ttk-asg ttk-asg--none">{t("unassigned")}</span>;
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="ttk-asg" title={people.map((p) => p.name).join(", ")}>
      <span className="ttk-asg__faces">
        {shown.map((p) => (
          <Face key={p.id} id={p.id} name={p.name} />
        ))}
        {rest > 0 ? <span className="ttk-face ttk-face--more">+{rest}</span> : null}
      </span>
      {names ? <span className="ttk-asg__names">{people.length === 1 ? people[0].name : t("peopleCount", { n: people.length })}</span> : <span className="ttk-sr">{people.map((p) => p.name).join(", ")}</span>}
    </span>
  );
}

function actionIcon(from: TaskStatus, to: TaskStatus): TaskIcon {
  if (isReturn(from, to)) return Undo2;
  if (to === "in_progress") return Play;
  if (to === "testing") return SendHorizontal;
  return CircleCheckBig;
}

export function StatusActions({ task, busy, onPick, size = "sm" }: { task: Task; busy: boolean; onPick: (to: TaskStatus) => void; size?: "sm" | "md" }) {
  const { actionLabel } = useTaskText();
  if (!task.actions.canChangeStatus || !task.actions.nextStatuses.length) return null;
  return (
    <span className="ttk-acts">
      {task.actions.nextStatuses.map((to) => {
        const back = isReturn(task.status, to);
        const I = actionIcon(task.status, to);
        return (
          <button
            key={to}
            type="button"
            className={`ttk-btn ${back ? "ttk-btn--warn" : to === "ready" ? "ttk-btn--ok" : "ttk-btn--pri"}${size === "sm" ? " ttk-btn--sm" : ""}`}
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onPick(to);
            }}
          >
            <I aria-hidden strokeWidth={STROKE} />
            {actionLabel(task.status, to)}
          </button>
        );
      })}
    </span>
  );
}

const WEEK_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function TodayDate() {
  const { t, locale } = useTaskText();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  if (!now) return <span className="ttk-today ttk-today--ph" aria-hidden />;
  const weekday = t(`weekday.${WEEK_KEYS[now.getDay()]}`);
  const month = monthTitle(now.getFullYear(), now.getMonth(), locale);
  return (
    <span className="ttk-today" aria-label={t("today", { date: fmtDateTime(now.toISOString(), locale) })}>
      <span className="ttk-today__d">{now.getDate()}</span>
      <span className="ttk-today__t">
        <b>{weekday}</b>
        <span>{month}</span>
      </span>
    </span>
  );
}
