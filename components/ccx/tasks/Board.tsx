"use client";

import { useRef, useState, type DragEvent, type RefObject } from "react";
import { TASK_STATUSES, type Task, type TaskCounts, type TaskStatus } from "@/lib/services/taskManagement";
import { IcRefresh } from "../icons";
import { StatusIcon } from "./kit";
import { isLate, type Cols } from "./model";
import TaskCard from "./TaskCard";
import { useTx } from "./text";

type Props = {
  cols: Cols;
  counts: TaskCounts;
  ready: boolean;
  loading: boolean;
  error: string;
  openId: string;
  busyId: string;
  now: number;
  simple: boolean;
  lateOnly: boolean;
  flash: TaskStatus | "";
  boxRef: RefObject<HTMLDivElement | null>;
  onRetry: () => void;
  onOpen: (task: Task) => void;
  onMove: (task: Task, to: TaskStatus) => void;
  onApprove: (task: Task) => void;
  onMore: (st: TaskStatus) => void;
};

const canDrop = (task: Task | null, st: TaskStatus) => !!task && task.status !== st && task.actions.canChangeStatus && task.actions.nextStatuses.includes(st);

export default function Board({ cols, counts, ready, loading, error, openId, busyId, now, simple, lateOnly, flash, boxRef, onRetry, onOpen, onMove, onApprove, onMore }: Props) {
  const { t, x, status } = useTx();
  const [drag, setDragState] = useState<Task | null>(null);
  const [over, setOver] = useState<TaskStatus | "">("");
  const dragRef = useRef<Task | null>(null);

  const setDrag = (task: Task | null) => {
    dragRef.current = task;
    setDragState(task);
  };
  const onDragStart = (task: Task, e: DragEvent) => {
    setDrag(task);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", task.id);
  };
  const onDragEnd = () => {
    setDrag(null);
    setOver("");
  };

  if (!ready) {
    return (
      <div className="opx-tk-board" role="group" aria-busy="true" aria-label={t("title")}>
        {TASK_STATUSES.map((st) => (
          <section key={st} className="opx-tk-col is-sk">
            <i className="opx-shim opx-tk-sk-h" />
            <i className="opx-shim opx-tk-sk-c" />
            <i className="opx-shim opx-tk-sk-c" />
            <i className="opx-shim opx-tk-sk-c" />
          </section>
        ))}
      </div>
    );
  }

  const any = TASK_STATUSES.some((st) => cols[st].items.length > 0);
  if (error && !any) {
    return (
      <div className="opx-tk-fail" role="alert">
        <span className="opx-tk-fail__orb" aria-hidden="true">
          <IcRefresh size={28} />
        </span>
        <p>{error}</p>
        <button type="button" className="opx-pbtn" onClick={onRetry}>
          <IcRefresh size={16} />
          {t("retry")}
        </button>
      </div>
    );
  }

  return (
    <>
      {error ? (
        <p className="opx-tk-warn" role="alert">
          {error}
          <button type="button" onClick={onRetry}>
            <IcRefresh size={15} />
            {t("retry")}
          </button>
        </p>
      ) : null}
      <div
        ref={boxRef}
        className={`opx-tk-board${loading ? " is-dim" : ""}`}
        role="group"
        data-dragging={drag ? "" : undefined}
        aria-label={t("title")}
        aria-busy={loading || undefined}
        onDragOver={(e) => {
          const el = boxRef.current;
          if (!dragRef.current || !el) return;
          const r = el.getBoundingClientRect();
          if (e.clientX > r.right - 70) el.scrollBy({ left: 24 });
          else if (e.clientX < r.left + 70) el.scrollBy({ left: -24 });
        }}
      >
        {TASK_STATUSES.map((st, ci) => {
          const c = cols[st];
          const items = lateOnly ? c.items.filter(isLate) : c.items;
          const ok = drag ? canDrop(drag, st) : false;
          const n = lateOnly ? items.length : counts[st];
          return (
            <section
              key={st}
              className="opx-tk-col"
              data-col={st}
              data-drop={drag && drag.status !== st ? (ok ? "ok" : "no") : undefined}
              data-over={over === st || undefined}
              data-flash={flash === st || undefined}
              aria-label={`${status(st)}: ${n}`}
              style={{ animationDelay: `${ci * 60}ms` }}
              onDragOver={(e) => {
                if (!canDrop(dragRef.current, st)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== st) setOver(st);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === st ? "" : o));
              }}
              onDrop={(e) => {
                e.preventDefault();
                const d = dragRef.current;
                setDrag(null);
                setOver("");
                if (d && canDrop(d, st)) onMove(d, st);
              }}
            >
              <header className="opx-tk-col__head">
                <span className="opx-tk-col__ic" aria-hidden="true">
                  <StatusIcon status={st} size={19} />
                </span>
                <h3>{status(st)}</h3>
                <b className="opx-tk-col__n opx-num">{n}</b>
              </header>
              {ok ? (
                <p className="opx-tk-col__drop" aria-hidden="true">
                  {x("dropHere")}
                </p>
              ) : null}
              <div className="opx-tk-col__list">
                {items.length ? (
                  items.map((task, i) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      now={now}
                      index={i}
                      open={openId === task.id}
                      busy={busyId === task.id}
                      simple={simple}
                      dragging={drag?.id === task.id}
                      onOpen={onOpen}
                      onMove={onMove}
                      onApprove={onApprove}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                    />
                  ))
                ) : (
                  <p className="opx-tk-col__empty">{x("colEmpty")}</p>
                )}
              </div>
              {c.hasMore ? (
                <button type="button" className="opx-tk-col__more" onClick={() => onMore(st)} disabled={c.busy || loading} aria-busy={c.busy || undefined}>
                  {c.busy ? t("loading") : x("more", { n: Math.max(0, c.total - c.items.length) })}
                </button>
              ) : null}
            </section>
          );
        })}
      </div>
    </>
  );
}
