"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { subscribeInternalEvents } from "@/lib/internalSocket";
import { commentExecutionTask, updateExecutionTask, type HrmTask } from "@/lib/services/internalHrm";
import { HrmDrawer, HrmError, HrmKv, HrmPerson, HrmPriority, HrmSection, HrmStatus, isOverdue, useHrmFormat, useNow, useStatusLabel } from "@/components/internal/HrmUi";
import Select from "@/components/Select";
import { IconCheck, IconSend } from "@/components/icons";

export const TASK_STATUSES = ["new", "accepted", "in_progress", "in_review", "done", "returned", "paused", "cancelled"] as const;

// What the person doing the task can do next. The manager's view (Ijro) gets
// the full status list instead; either way the backend has the last word.
const NEXT: Record<string, string[]> = {
  new: ["accepted"],
  accepted: ["in_progress"],
  in_progress: ["in_review", "paused"],
  returned: ["in_progress"],
  paused: ["in_progress"],
  in_review: [],
  done: [],
  cancelled: [],
};

export default function TaskDrawer({
  task,
  onClose,
  onChanged,
  manage,
  unitName,
}: {
  task: HrmTask | null;
  onClose: () => void;
  onChanged: () => void;
  // Ijro: any status, including done/returned/cancelled.
  manage?: boolean;
  unitName?: string;
}) {
  const t = useTranslations("internal.task");
  const label = useStatusLabel();
  const f = useHrmFormat();
  const now = useNow();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState<"" | "status" | "comment">("");
  const [comment, setComment] = useState("");
  const [prevId, setPrevId] = useState("");
  const id = task?.id ?? "";

  // A different task resets the drawer during render, before it paints.
  if (id !== prevId) {
    setPrevId(id);
    setStatus(task?.status ?? "");
    setError(false);
    setSaved("");
    setComment("");
  }

  // Comments and status changes on this task arrive on its own channel
  // (10-08 guide: WS /internal/ws/task:{task_id}) while it is open.
  useEffect(() => {
    if (!id) return;
    return subscribeInternalEvents(`task:${id}`, (event) => {
      if (event.event.startsWith("internal.task")) onChanged();
    });
  }, [id, onChanged]);

  if (!task) return null;

  async function move(next: string) {
    if (!task || busy || next === status) return;
    setBusy(true);
    setError(false);
    setSaved("");
    try {
      await updateExecutionTask(task.id, { status: next, comment: "", checklist: task.checklist });
      setStatus(next);
      setSaved("status");
      onChanged();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function sendComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!task || busy || !comment.trim()) return;
    setBusy(true);
    setError(false);
    setSaved("");
    try {
      await commentExecutionTask(task.id, { body: comment.trim().slice(0, 2000) });
      setComment("");
      setSaved("comment");
      onChanged();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const overdue = isOverdue(task.deadline, status, now);
  const done = task.checklist.filter((c) => c.done).length;
  const next = NEXT[status] ?? [];

  return (
    <HrmDrawer
      open
      onClose={onClose}
      title={task.title || t("untitled")}
      sub={[task.code, task.project].filter(Boolean).join(" · ")}
      footer={
        manage ? (
          <div className="hrm-drawer__status">
            <span className="ldrw__lbl">{t("changeStatus")}</span>
            <Select value={status} onChange={(v) => void move(v)} options={TASK_STATUSES.map((s) => ({ value: s, label: label(s) }))} ariaLabel={t("changeStatus")} />
          </div>
        ) : next.length ? (
          next.map((s, i) => (
            <button key={s} type="button" className={`btn btn--sm ${i === 0 ? "btn--pri" : "btn--line"}`} onClick={() => void move(s)} disabled={busy}>
              {i === 0 ? <IconCheck /> : null}
              {t(`actions.${s}`)}
            </button>
          ))
        ) : undefined
      }
    >
      <div className="hrm-chips">
        <HrmStatus value={status} />
        <HrmPriority value={task.priority} />
        {overdue ? <span className="hrm-st hrm-st--err">{t("overdue")}</span> : null}
      </div>
      {error ? <HrmError text={t("error")} /> : null}
      {saved ? <div className="hrm-ok"><IconCheck />{saved === "status" ? t("statusSaved") : t("commentSent")}</div> : null}

      <HrmSection label={t("description")}>
        <p className="hrm-text">{task.description || t("noDescription")}</p>
      </HrmSection>

      {task.checklist.length ? (
        <HrmSection label={t("checklist")} aside={<span className="hrm-count">{done}/{task.checklist.length}</span>}>
          <ul className="hrm-check">
            {task.checklist.map((c, i) => (
              <li key={`${c.title}-${i}`} className={c.done ? "is-done" : undefined}><i>{c.done ? <IconCheck /> : null}</i>{c.title}</li>
            ))}
          </ul>
        </HrmSection>
      ) : null}

      <HrmSection label={t("details")}>
        <HrmKv
          rows={[
            { label: t("responsible"), value: task.responsibleName ? <HrmPerson name={task.responsibleName} sub={task.responsibleCode} size="sm" /> : t("unassigned") },
            { label: t("deadline"), value: task.deadline ? <span className={overdue ? "hrm-late" : undefined}>{f.dateTime(task.deadline)}</span> : "—" },
            { label: t("unit"), value: unitName || "—" },
            { label: t("creator"), value: task.creatorName || "—" },
            { label: t("created"), value: f.dateTime(task.createdAt) },
            ...(task.completedAt ? [{ label: t("completed"), value: f.dateTime(task.completedAt) }] : []),
          ]}
        />
      </HrmSection>

      <HrmSection label={t("comment")}>
        <form className="hrm-form" onSubmit={sendComment}>
          <div className="internal-field">
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("commentPlaceholder")} aria-label={t("comment")} maxLength={2000} rows={3} />
          </div>
          <div className="hrm-form__foot">
            <button className="btn btn--line btn--sm" type="submit" disabled={busy || !comment.trim()}><IconSend />{t("sendComment")}</button>
          </div>
        </form>
      </HrmSection>
    </HrmDrawer>
  );
}
