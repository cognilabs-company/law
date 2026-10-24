"use client";

import Modal from "@/components/admin/Modal";
import { Archive, CalendarClock, CircleCheckBig, FileText, Flag, History, Pencil, Plus, RefreshCcw, RotateCcw, Trash2, TriangleAlert, Undo2, User, Users, type LucideProps } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import type { Task, TaskHistoryItem, TaskStatus } from "@/lib/services/taskManagement";
import { Deadline, Face, STROKE, StatusActions, StatusPill, useTaskText } from "./parts";
import TaskAttachments from "./TaskAttachments";

const EVENT_ICON: Record<string, ComponentType<LucideProps>> = { created: Plus, updated: Pencil, assignees_changed: Users, status_changed: Flag, returned: Undo2, deleted: Trash2 };

function HistoryRow({ item, i, last }: { item: TaskHistoryItem; i: number; last: boolean }) {
  const { t, status, when } = useTaskText();
  const returned = item.eventType === "returned";
  const known = item.eventType in EVENT_ICON;
  const what = known ? t(`history.${item.eventType}`) : item.eventType;
  const move = item.fromStatus && item.toStatus ? `${status(item.fromStatus)} → ${status(item.toStatus)}` : "";
  const I = EVENT_ICON[item.eventType] ?? Flag;
  return (
    <li className={`ttk-h${returned ? " ttk-h--ret" : ""}${last ? " ttk-h--last" : ""}`} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
      <span className="ttk-h__dot" aria-hidden>
        <I strokeWidth={STROKE} />
      </span>
      <div className="ttk-h__body">
        <p className="ttk-h__top">
          <strong>{what}</strong>
          {move ? <span className="ttk-h__move">{move}</span> : null}
          {last ? <span className="ttk-h__latest">{t("detail.latest")}</span> : null}
        </p>
        {item.comment ? <p className={returned ? "ttk-h__why" : "ttk-h__note"}>{item.comment}</p> : null}
        <p className="ttk-h__meta">{[item.actor?.name, when(item.createdAt)].filter(Boolean).join(" · ")}</p>
      </div>
    </li>
  );
}

function Fact({ icon: I, label, children, wide }: { icon: ComponentType<LucideProps>; label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "ttk-fact ttk-fact--wide" : "ttk-fact"}>
      <dt>
        <I aria-hidden strokeWidth={STROKE} />
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function TaskDetail({
  task,
  loading,
  failed,
  busy,
  notice,
  onClose,
  onRetry,
  onStatus,
  onEdit,
  onAssign,
  onDelete,
  approveArchive = false,
}: {
  task: Task | null;
  loading: boolean;
  failed: string;
  busy: boolean;
  notice: string;
  onClose: () => void;
  onRetry: () => void;
  onStatus: (task: Task, to: TaskStatus) => void;
  onEdit: (task: Task) => void;
  onAssign: (task: Task) => void;
  onDelete: (task: Task) => void;
  // The final action is "approve and archive" instead of delete.
  approveArchive?: boolean;
}) {
  const { t, when } = useTaskText();
  // The story in the order it happened: created first, the latest step last.
  const history = [...(task?.history ?? [])].sort((a, b) => Date.parse(a.createdAt || "0") - Date.parse(b.createdAt || "0"));
  const lastReturn = task && task.status === "in_progress" ? history.findLast((h) => h.eventType === "returned" && h.comment) : undefined;
  const title = task ? task.title : t("detail.title");
  const hasActions = task && !task.deletedAt && ((task.actions.canChangeStatus && task.actions.nextStatuses.length > 0) || task.actions.canEdit || task.actions.canAssign || task.actions.canDelete);

  return (
    <Modal open onClose={onClose} title={title} variant="drawer" size="lg" busy={busy}>
      <div className="ttk-scope ttk-d">
        {notice ? (
          <p className="ttk-notice" role="status">
            <RefreshCcw aria-hidden strokeWidth={STROKE} />
            {notice}
          </p>
        ) : null}
        {!task && loading ? (
          <div className="ttk-d__sk" aria-busy>
            <span />
            <span />
            <span />
          </div>
        ) : null}
        {!task && failed ? (
          <div className="ttk-empty">
            <span className="ttk-empty__i ttk-empty__i--bad">
              <TriangleAlert aria-hidden strokeWidth={STROKE} />
            </span>
            <p>{failed}</p>
            <button type="button" className="ttk-btn ttk-btn--line" onClick={onRetry}>
              <RotateCcw aria-hidden strokeWidth={STROKE} />
              {t("retry")}
            </button>
          </div>
        ) : null}
        {task ? (
          <>
            <div className="ttk-d__head">
              <span className="ttk-d__code">{task.code}</span>
              <span className="ttk-pop" key={task.status}>
                <StatusPill status={task.status} />
              </span>
              {task.deletedAt ? <span className="ttk-st ttk-st--deleted">{t("deleted")}</span> : null}
            </div>
            {lastReturn ? (
              <div className="ttk-ret" role="note">
                <strong>
                  <Undo2 aria-hidden strokeWidth={STROKE} />
                  {t("detail.returned")}
                </strong>
                <p>{lastReturn.comment}</p>
                <span>{[lastReturn.actor?.name, when(lastReturn.createdAt)].filter(Boolean).join(" · ")}</span>
              </div>
            ) : null}
            <dl className="ttk-facts">
              <Fact icon={CalendarClock} label={t("detail.deadline")}>
                <Deadline task={task} full />
              </Fact>
              <Fact icon={User} label={t("detail.creator")}>
                {task.creator?.name || "—"}
              </Fact>
              <Fact icon={Users} label={t("detail.assignees")} wide>
                {task.assignees.length ? (
                  <span className="ttk-people">
                    {task.assignees.map((a) => (
                      <span key={a.id} className="ttk-person">
                        <Face id={a.id} name={a.name} size={24} />
                        {a.name}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="ttk-asg--none">{t("unassigned")}</span>
                )}
              </Fact>
              <Fact icon={History} label={t("detail.updated")}>
                {when(task.updatedAt) || "—"}
              </Fact>
              {task.readyAt ? (
                <Fact icon={CircleCheckBig} label={t("detail.readyBy")}>
                  {[task.readyBy?.name, when(task.readyAt)].filter(Boolean).join(" · ")}
                </Fact>
              ) : null}
              {task.deleteReason ? (
                <Fact icon={Trash2} label={t("detail.deleteReason")} wide>
                  {task.deleteReason}
                </Fact>
              ) : null}
            </dl>
            <section className="ttk-desc">
              <p className="ttk-desc__l">
                <FileText aria-hidden strokeWidth={STROKE} />
                {t("form.description")}
              </p>
              {task.description ? <p className="ttk-desc__t">{task.description}</p> : <p className="ttk-muted">{t("detail.noDescription")}</p>}
            </section>
            <TaskAttachments attachments={task.attachments} count={task.attachmentCount} loading={loading} />
            {hasActions ? (
              <div className="ttk-d__acts">
                <StatusActions task={task} busy={busy} onPick={(to) => onStatus(task, to)} size="md" />
                <span className="ttk-d__more">
                  {task.actions.canEdit ? (
                    <button type="button" className="ttk-btn ttk-btn--line" onClick={() => onEdit(task)} disabled={busy}>
                      <Pencil aria-hidden strokeWidth={STROKE} />
                      {t("edit")}
                    </button>
                  ) : null}
                  {task.actions.canAssign ? (
                    <button type="button" className="ttk-btn ttk-btn--line" onClick={() => onAssign(task)} disabled={busy}>
                      <Users aria-hidden strokeWidth={STROKE} />
                      {t("assign")}
                    </button>
                  ) : null}
                  {task.actions.canDelete ? (
                    approveArchive ? (
                      <button type="button" className="ttk-btn ttk-btn--ok" onClick={() => onDelete(task)} disabled={busy}>
                        <Archive aria-hidden strokeWidth={STROKE} />
                        {t("approveArchive")}
                      </button>
                    ) : (
                      <button type="button" className="ttk-btn ttk-btn--line ttk-btn--danger" onClick={() => onDelete(task)} disabled={busy}>
                        <Trash2 aria-hidden strokeWidth={STROKE} />
                        {t("delete")}
                      </button>
                    )
                  ) : null}
                </span>
              </div>
            ) : null}
            <section className="ttk-d__hist" aria-label={t("detail.history")}>
              <h3>
                <History aria-hidden strokeWidth={STROKE} />
                {t("detail.history")}
              </h3>
              {history.length ? (
                <ol>
                  {history.map((h, i) => (
                    <HistoryRow key={h.id || `${h.eventType}${h.createdAt}`} item={h} i={i} last={i === history.length - 1} />
                  ))}
                </ol>
              ) : (
                <p className="ttk-muted">{loading ? t("loading") : t("detail.noHistory")}</p>
              )}
            </section>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
