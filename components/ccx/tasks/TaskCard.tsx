"use client";

import type { DragEvent } from "react";
import { isReturn, type Task, type TaskStatus } from "@/lib/services/taskManagement";
import { IcArchive, IcClip } from "./icons";
import { ActionIcon, DueChip, Face, Faces } from "./kit";
import { isLate } from "./model";
import { useTx } from "./text";

type Props = {
  task: Task;
  now: number;
  open: boolean;
  busy: boolean;
  simple: boolean;
  dragging: boolean;
  index: number;
  onOpen: (task: Task) => void;
  onMove: (task: Task, to: TaskStatus) => void;
  onApprove: (task: Task) => void;
  onDragStart: (task: Task, e: DragEvent) => void;
  onDragEnd: () => void;
};

export default function TaskCard({ task, now, open, busy, simple, dragging, index, onOpen, onMove, onApprove, onDragStart, onDragEnd }: Props) {
  const { t, act } = useTx();
  const late = isLate(task);
  const moves: TaskStatus[] = !simple && task.actions.canChangeStatus ? task.actions.nextStatuses : [];
  const canDrag = task.actions.canChangeStatus && task.actions.nextStatuses.length > 0 && !busy && !task.deletedAt;
  const approve = simple && task.actions.canDelete && !task.deletedAt;
  return (
    <article
      className="opx-tk-card"
      data-task={task.id}
      data-st={task.status}
      data-late={late || undefined}
      data-open={open || undefined}
      data-drag={dragging || undefined}
      data-busy={busy || undefined}
      draggable={canDrag}
      onDragStart={(e) => onDragStart(task, e)}
      onDragEnd={onDragEnd}
      style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
    >
      <button type="button" className="opx-tk-card__hit" onClick={() => onOpen(task)} aria-label={t("openTask", { code: task.code, title: task.title })} aria-current={open ? "true" : undefined} />
      <div className="opx-tk-card__top">
        <span className="opx-tk-card__code opx-num">{task.code}</span>
        {task.attachmentCount ? (
          <span className="opx-tk-card__att opx-num" title={t("attachments.title")}>
            <IcClip size={14} />
            {task.attachmentCount}
          </span>
        ) : null}
      </div>
      <h4 className="opx-tk-card__title">{task.title}</h4>
      {task.description ? <p className="opx-tk-card__desc">{task.description}</p> : null}
      <div className="opx-tk-card__chips">
        <DueChip task={task} now={now} />
      </div>
      <div className="opx-tk-card__foot">
        <Faces people={task.assignees} />
        {task.creator ? (
          <span className="opx-tk-card__from" title={t("card.from", { name: task.creator.name })}>
            <span className="opx-sr">{t("card.from", { name: task.creator.name })}</span>
            <Face id={task.creator.id} name={task.creator.name} size={20} />
          </span>
        ) : null}
      </div>
      {moves.length || approve ? (
        <div className="opx-tk-card__acts">
          {moves.map((to) => (
            <button key={to} type="button" className="opx-tk-mini" data-kind={isReturn(task.status, to) ? "back" : to === "ready" ? "done" : "go"} disabled={busy} onClick={() => onMove(task, to)}>
              <ActionIcon from={task.status} to={to} size={14} />
              {act(task.status, to)}
            </button>
          ))}
          {approve ? (
            <button type="button" className="opx-tk-mini" data-kind="done" disabled={busy} onClick={() => onApprove(task)}>
              <IcArchive size={14} />
              {t("approveArchive")}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
