"use client";

import "../panel/panel.css";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { isReturn, type Task, type TaskStatus } from "@/lib/services/taskManagement";
import { FactStrip, Note, Section, type Fact } from "../panel/bits";
import { IcClock, IcClose, IcDoc, IcRefresh, IcTimeline, IcUser } from "../icons";
import Attachments from "./Attachments";
import { IcAlert, IcArchive, IcCheckCircle, IcClip, IcPencil, IcPlus, IcTrash, IcUndo, IcUsers } from "./icons";
import { ActionIcon, DueChip, EventIcon, Face, StatusPill } from "./kit";
import Lightbox from "./Lightbox";
import { useTx } from "./text";

type Props = {
  task: Task | null;
  loading: boolean;
  failed: string;
  busy: boolean;
  notice: string;
  now: number;
  approveArchive: boolean;
  full: boolean;
  onClose: () => void;
  onRetry: () => void;
  onStatus: (task: Task, to: TaskStatus) => void;
  onEdit: (task: Task) => void;
  onAssign: (task: Task) => void;
  onDelete: (task: Task) => void;
};

const KNOWN = new Set(["created", "updated", "assignees_changed", "status_changed", "returned", "deleted"]);

export default function Drawer({ task, loading, failed, busy, notice, now, approveArchive, full, onClose, onRetry, onStatus, onEdit, onAssign, onDelete }: Props) {
  const { t, when, status, act } = useTx();
  const tp = useTranslations("admin.ccx.panel");
  const box = useRef<HTMLElement>(null);
  const [shot, setShot] = useState<number | null>(null);

  useEffect(() => {
    box.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || shot !== null) return;
      if (document.documentElement.classList.contains("opx-sheet-open")) return;
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest(".opx-top, .opx-mtabs")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shot, onClose]);

  const history = [...(task?.history ?? [])].sort((a, b) => Date.parse(a.createdAt || "0") - Date.parse(b.createdAt || "0"));
  const lastReturn = task && task.status === "in_progress" ? history.findLast((h) => h.eventType === "returned" && h.comment) : undefined;
  const live = task !== null && !task.deletedAt;
  const moves: TaskStatus[] = task && live && task.actions.canChangeStatus ? task.actions.nextStatuses : [];
  const hasActions = task !== null && live && (moves.length > 0 || task.actions.canEdit || task.actions.canAssign || task.actions.canDelete);
  const images = (task?.attachments ?? []).filter((a) => a.isImage);
  const from: TaskStatus = task?.status ?? "new";
  const forward = moves.filter((to) => !isReturn(from, to));
  const back = moves.filter((to) => isReturn(from, to));

  const facts: Fact[] = task
    ? [
        { icon: <IcClock size={17} />, label: t("detail.deadline"), value: <DueChip task={task} now={now} full /> },
        { icon: <IcUser size={17} />, label: t("detail.creator"), value: task.creator?.name || "—" },
        { icon: <IcRefresh size={17} />, label: t("detail.updated"), value: <span className="opx-num">{when(task.updatedAt) || "—"}</span> },
        ...(task.readyAt ? [{ icon: <IcCheckCircle size={17} />, label: t("detail.readyBy"), value: [task.readyBy?.name, when(task.readyAt)].filter(Boolean).join(" · ") }] : []),
      ]
    : [];

  return (
    <aside ref={box} className="opx-tk-drawer" data-full={full || undefined} role={full ? "dialog" : "region"} aria-modal={full || undefined} aria-label={task ? task.title : t("detail.title")} aria-busy={loading || undefined} tabIndex={-1}>
      <header className="opx-tk-drawer__head">
        <div className="opx-tk-drawer__tags">
          {task ? <span className="opx-tk-code opx-num">{task.code}</span> : null}
          {task ? (
            <span className="opx-tk-pop" key={task.status}>
              <StatusPill status={task.status} />
            </span>
          ) : null}
          {task?.deletedAt ? <span className="opx-pill" data-tone="hot">{t("deleted")}</span> : null}
          {loading && task ? <span className="opx-tk-drawer__sync" aria-hidden="true" /> : null}
        </div>
        <button type="button" className="opx-tk-x" onClick={onClose} aria-label={tp("close")} title={tp("close")}>
          <IcClose size={18} />
        </button>
        <h2 className="opx-tk-drawer__title">{task ? task.title : t("detail.title")}</h2>
      </header>

      <div className="opx-tk-drawer__body">
        {notice ? <Note tone="warn">{notice}</Note> : null}
        {!task && loading && !failed ? (
          <div className="opx-tk-drawer__sk" aria-hidden="true">
            <i className="opx-shim" />
            <i className="opx-shim" />
            <i className="opx-shim" />
          </div>
        ) : null}
        {!task && failed ? (
          <div className="opx-tk-fail opx-tk-fail--in" role="alert">
            <span className="opx-tk-fail__orb" aria-hidden="true">
              <IcAlert size={26} />
            </span>
            <p>{failed}</p>
            <button type="button" className="opx-pbtn" onClick={onRetry}>
              <IcRefresh size={16} />
              {t("retry")}
            </button>
          </div>
        ) : null}
        {task ? (
          <>
            {lastReturn ? (
              <div className="opx-tk-ret" role="note">
                <b>
                  <IcUndo size={16} />
                  {t("detail.returned")}
                </b>
                <p>{lastReturn.comment}</p>
                <small>{[lastReturn.actor?.name, when(lastReturn.createdAt)].filter(Boolean).join(" · ")}</small>
              </div>
            ) : null}
            <FactStrip facts={facts} />
            {task.deleteReason ? (
              <Note tone="warn">
                <b>{t("detail.deleteReason")}:</b> {task.deleteReason}
              </Note>
            ) : null}
            <Section icon={<IcUsers size={17} />} title={t("detail.assignees")} count={task.assignees.length}>
              {task.assignees.length ? (
                <ul className="opx-tk-people">
                  {task.assignees.map((p) => (
                    <li key={p.id}>
                      <Face id={p.id} name={p.name} size={26} />
                      <span>{p.name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="opx-pnone">{t("unassigned")}</p>
              )}
            </Section>
            <Section icon={<IcDoc size={17} />} title={t("form.description")}>
              {task.description ? <p className="opx-tk-desc">{task.description}</p> : <p className="opx-pnone">{t("detail.noDescription")}</p>}
            </Section>
            <Section icon={<IcClip size={17} />} title={t("attachments.title")} count={task.attachments ? task.attachments.length : task.attachmentCount || undefined}>
              <Attachments attachments={task.attachments} count={task.attachmentCount} loading={loading} onOpen={setShot} />
              {live && task.actions.canEdit ? (
                <button type="button" className="opx-tk-add" onClick={() => onEdit(task)} disabled={busy}>
                  <IcPlus size={16} />
                  {t("upload.pick")}
                </button>
              ) : null}
            </Section>
            <Section icon={<IcTimeline size={17} />} title={t("detail.history")} count={history.length || undefined}>
              {history.length ? (
                <ol className="opx-tk-thread">
                  {history.map((h, i) => {
                    const last = i === history.length - 1;
                    const what = KNOWN.has(h.eventType) ? t(`history.${h.eventType}`) : h.eventType;
                    const moved = h.fromStatus && h.toStatus ? `${status(h.fromStatus)} → ${status(h.toStatus)}` : "";
                    return (
                      <li key={h.id || `${h.eventType}${h.createdAt}`} data-kind={h.eventType === "returned" ? "ret" : undefined} data-last={last || undefined}>
                        {h.actor ? (
                          <Face id={h.actor.id} name={h.actor.name} size={30} />
                        ) : (
                          <span className="opx-tk-thread__ic" aria-hidden="true">
                            <EventIcon type={h.eventType} />
                          </span>
                        )}
                        <div className="opx-tk-thread__body">
                          <p className="opx-tk-thread__top">
                            <b>{h.actor?.name || what}</b>
                            <time className="opx-num" dateTime={h.createdAt}>
                              {when(h.createdAt)}
                            </time>
                            {last ? <span className="opx-tk-thread__new">{t("detail.latest")}</span> : null}
                          </p>
                          <p className="opx-tk-thread__what">
                            <EventIcon type={h.eventType} size={14} />
                            {h.actor ? what : null}
                            {moved ? <span className="opx-num">{moved}</span> : null}
                          </p>
                          {h.comment ? <p className="opx-tk-thread__msg">{h.comment}</p> : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="opx-pnone">{loading ? t("loading") : t("detail.noHistory")}</p>
              )}
            </Section>
          </>
        ) : null}
      </div>

      {task && hasActions ? (
        <footer className="opx-tk-drawer__foot">
          {forward.length || back.length ? (
            <div className="opx-tk-drawer__go">
              {forward.map((to, i) => (
                <button key={to} type="button" className={`opx-pbtn${i === forward.length - 1 ? " opx-pbtn--main" : ""}`} disabled={busy} aria-busy={busy || undefined} onClick={() => onStatus(task, to)}>
                  <ActionIcon from={task.status} to={to} />
                  {act(task.status, to)}
                </button>
              ))}
              {back.map((to) => (
                <button key={to} type="button" className="opx-pbtn opx-tk-back" disabled={busy} onClick={() => onStatus(task, to)}>
                  <ActionIcon from={task.status} to={to} />
                  {act(task.status, to)}
                </button>
              ))}
            </div>
          ) : null}
          <div className="opx-tk-drawer__more">
            {task.actions.canEdit ? (
              <button type="button" className="opx-pbtn opx-pbtn--ghost" onClick={() => onEdit(task)} disabled={busy}>
                <IcPencil size={16} />
                {t("edit")}
              </button>
            ) : null}
            {task.actions.canAssign ? (
              <button type="button" className="opx-pbtn opx-pbtn--ghost" onClick={() => onAssign(task)} disabled={busy}>
                <IcUsers size={16} />
                {t("assign")}
              </button>
            ) : null}
            {task.actions.canDelete ? (
              approveArchive ? (
                <button type="button" className="opx-pbtn opx-pbtn--main" onClick={() => onDelete(task)} disabled={busy}>
                  <IcArchive size={16} />
                  {t("approveArchive")}
                </button>
              ) : (
                <button type="button" className="opx-pbtn opx-pbtn--rose" onClick={() => onDelete(task)} disabled={busy}>
                  <IcTrash size={16} />
                  {t("delete")}
                </button>
              )
            ) : null}
          </div>
        </footer>
      ) : null}

      {shot !== null && images.length ? <Lightbox items={images} start={Math.min(shot, images.length - 1)} onClose={() => setShot(null)} /> : null}
    </aside>
  );
}
