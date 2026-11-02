"use client";

import { useEffect, useRef, useState } from "react";
import { isReturn, type Task, type TaskAssignee, type TaskStatus } from "@/lib/services/taskManagement";
import { IcClock, IcFlag, IcShield } from "../icons";
import { IcAlert, IcCalendar, IcCheckCircle, IcPencil, IcPlay, IcPlayCircle, IcPlus, IcSend, IcTrash, IcUndo, IcUsers } from "./icons";
import { initials, isLate, isSoon, toneOf } from "./model";
import { useTx } from "./text";

export function StatusIcon({ status, size = 18 }: { status: TaskStatus; size?: number }) {
  switch (status) {
    case "new":
      return <IcCalendar size={size} />;
    case "in_progress":
      return <IcPlayCircle size={size} />;
    case "testing":
      return <IcShield size={size} />;
    default:
      return <IcCheckCircle size={size} />;
  }
}

export function ActionIcon({ from, to, size = 16 }: { from: TaskStatus; to: TaskStatus; size?: number }) {
  if (isReturn(from, to)) return <IcUndo size={size} />;
  if (to === "in_progress") return <IcPlay size={size} />;
  if (to === "testing") return <IcSend size={size} />;
  return <IcCheckCircle size={size} />;
}

export function EventIcon({ type, size = 15 }: { type: string; size?: number }) {
  switch (type) {
    case "created":
      return <IcPlus size={size} />;
    case "updated":
      return <IcPencil size={size} />;
    case "assignees_changed":
      return <IcUsers size={size} />;
    case "returned":
      return <IcUndo size={size} />;
    case "deleted":
      return <IcTrash size={size} />;
    default:
      return <IcFlag size={size} />;
  }
}

export function StatusPill({ status }: { status: TaskStatus }) {
  const { status: label } = useTx();
  return (
    <span className="opx-tk-st" data-st={status}>
      <StatusIcon status={status} size={14} />
      {label(status)}
    </span>
  );
}

export function Face({ id, name, size = 26 }: { id: string; name: string; size?: number }) {
  return (
    <span className="opx-tk-face" data-tone={toneOf(id || name)} style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function Faces({ people, max = 3 }: { people: TaskAssignee[]; max?: number }) {
  const { t } = useTx();
  if (!people.length) return <span className="opx-tk-faces is-none">{t("unassigned")}</span>;
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="opx-tk-faces" title={people.map((p) => p.name).join(", ")}>
      <span className="opx-tk-faces__row">
        {shown.map((p) => (
          <Face key={p.id} id={p.id} name={p.name} size={24} />
        ))}
        {rest > 0 ? <span className="opx-tk-face is-more">+{rest}</span> : null}
      </span>
      <span className="opx-tk-faces__name">{people.length === 1 ? people[0].name : t("peopleCount", { n: people.length })}</span>
    </span>
  );
}

export function DueChip({ task, now, full = false }: { task: Task; now: number; full?: boolean }) {
  const { t, due, when } = useTx();
  if (!task.deadlineAt) {
    return (
      <span className="opx-tk-due" data-tone="mute">
        {t("noDeadline")}
      </span>
    );
  }
  const late = isLate(task);
  const soon = isSoon(task, now);
  return (
    <span className="opx-tk-due" data-tone={late ? "hot" : soon ? "warn" : undefined} title={late ? t("overdue") : when(task.deadlineAt)}>
      {late ? <IcAlert size={14} /> : <IcClock size={14} />}
      <span className="opx-num">{full ? when(task.deadlineAt) : due(task.deadlineAt, now)}</span>
      {late ? <b>{t("overdue")}</b> : null}
    </span>
  );
}

const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.getAttribute("data-opx-motion") === "off";

export function useCount(target: number): number {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = from.current;
    if (start === target || calm()) {
      from.current = target;
      const id = requestAnimationFrame(() => setV(target));
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (at: number) => {
      const k = Math.min(1, (at - t0) / 650);
      setV(Math.round(start + (target - start) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}
