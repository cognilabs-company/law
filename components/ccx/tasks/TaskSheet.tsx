"use client";

import { useId, useState } from "react";
import { usePickedFiles } from "@/components/tasks/TaskFilePicker";
import { TASK_UPLOAD_DEFAULTS, createTask, setTaskAssignees, taskErrorOf, updateTask, uploadTaskAttachments, type Task, type TaskError, type TaskUploadLimits } from "@/lib/services/taskManagement";
import Sheet from "../panel/Sheet";
import { Field, Note, PanelFoot } from "../panel/bits";
import FilePick from "./FilePick";
import { IcPencil, IcPlus, IcUsers } from "./icons";
import { deadlinePresets, errText, joinLocal, splitLocal } from "./model";
import PeoplePick, { personOpt } from "./PeoplePick";
import PickField from "./PickField";
import { useTx } from "./text";

export type FormMode = { kind: "create" } | { kind: "edit"; task: Task } | { kind: "assign"; task: Task };

type Props = {
  mode: FormMode;
  limits?: TaskUploadLimits;
  onClose: () => void;
  onSaved: (task: Task | null) => void;
  onError: (e: TaskError, task: Task | null) => boolean;
};

export default function TaskSheet({ mode, limits = TASK_UPLOAD_DEFAULTS, onClose, onSaved, onError }: Props) {
  const { t } = useTx();
  const uid = useId();
  const task = mode.kind === "create" ? null : mode.task;
  const start = splitLocal(task?.deadlineAt ?? "");
  const [quick] = useState(deadlinePresets);
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time || "18:00");
  const [people, setPeople] = useState<string[]>(() => task?.assignees.map((a) => a.id) ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const [tried, setTried] = useState(false);
  const [pastFor, setPastFor] = useState("");
  const picked = usePickedFiles(limits);
  const [savedTask, setSavedTask] = useState<Task | null>(null);
  const [upErr, setUpErr] = useState("");
  const [phase, setPhase] = useState<"" | "save" | "upload">("");
  const known = (task?.assignees ?? []).map(personOpt);

  const deadline = joinLocal(date, time);
  const showFields = mode.kind !== "assign";
  const showPeople = mode.kind !== "edit";
  const showUpload = mode.kind !== "assign";
  const locked = savedTask !== null;
  const titleBad = showFields && !title.trim();
  const deadlineBad = showFields && (!deadline || pastFor === deadline);
  const dirty =
    mode.kind === "create"
      ? Boolean(title.trim() || description.trim() || date || people.length || picked.items.length)
      : mode.kind === "edit"
        ? title !== mode.task.title || description !== mode.task.description || deadline !== joinLocal(start.date, start.time)
        : people.join(",") !== mode.task.assignees.map((a) => a.id).join(",");
  const dirtyAll = dirty || picked.items.length > 0;

  const submit = async () => {
    setTried(true);
    const past = showFields && !!deadline && mode.kind === "create" && new Date(deadline).getTime() <= Date.now();
    setPastFor(past ? deadline : "");
    if (!locked && (titleBad || deadlineBad || past)) return;
    if (busy) return;
    setBusy(true);
    setErr(null);
    setUpErr("");
    let saved: Task | null = savedTask;
    try {
      if (!saved) {
        setPhase("save");
        if (mode.kind === "create") saved = await createTask({ title, description, deadlineAt: deadline, assigneeIds: people });
        else if (mode.kind === "assign") saved = await setTaskAssignees(mode.task, people);
        else {
          const edit: { title?: string; description?: string; deadlineAt?: string } = {};
          if (title !== mode.task.title) edit.title = title;
          if (description !== mode.task.description) edit.description = description;
          if (deadline !== joinLocal(start.date, start.time)) edit.deadlineAt = deadline;
          saved = Object.keys(edit).length ? await updateTask(mode.task, edit) : null;
        }
      }
    } catch (x) {
      const te = taskErrorOf(x);
      if (!onError(te, task)) setErr({ message: errText(t, te), fields: te.fields });
      setBusy(false);
      setPhase("");
      return;
    }
    const files = showUpload ? picked.items.map((p) => p.file) : [];
    const base = saved ?? (mode.kind === "edit" ? mode.task : null);
    if (files.length && base) {
      setPhase("upload");
      try {
        saved = await uploadTaskAttachments(base, files);
      } catch (x) {
        const te = taskErrorOf(x);
        setSavedTask(base);
        setUpErr(t("upload.failed", { reason: te.kind === "network" ? t("err.network") : te.message || t("err.save") }));
        setBusy(false);
        setPhase("");
        return;
      }
    }
    setBusy(false);
    setPhase("");
    onSaved(saved);
  };

  const fieldErr = (key: string, local: boolean, text: string) => (err?.fields[key] ? err.fields[key] : tried && local ? text : "");
  const titleMsg = fieldErr("title", titleBad, t("form.titleNeeded"));
  const deadlineMsg = fieldErr("deadline_at", deadlineBad, date ? t("form.deadlineFuture") : t("form.deadlineNeeded"));
  const heading = mode.kind === "create" ? t("form.createTitle") : mode.kind === "edit" ? t("form.editTitle", { code: mode.task.code }) : t("form.assignTitle", { code: mode.task.code });
  const primaryLabel = phase === "upload" ? t("upload.uploading", { n: picked.items.length }) : locked ? t("upload.retry") : mode.kind === "create" ? t("form.create") : t("form.save");
  const peopleErr = err?.fields.assignee_user_ids || err?.fields.user_ids || undefined;

  return (
    <Sheet
      label={heading}
      onClose={() => {
        if (!busy) onClose();
      }}
      dirty={dirtyAll && !locked}
      head={
        <div className="opx-tk-shead">
          <span className="opx-tk-shead__ic" aria-hidden="true">
            {mode.kind === "create" ? <IcPlus size={20} /> : mode.kind === "edit" ? <IcPencil size={20} /> : <IcUsers size={20} />}
          </span>
          <span className="opx-tk-shead__t">
            <b>{heading}</b>
            {task ? <small>{task.title}</small> : null}
          </span>
        </div>
      }
    >
      <div
        className="opx-pscroll opx-tk-form"
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files);
          if (!showUpload || locked || busy || !files.length) return;
          e.preventDefault();
          picked.add(files);
        }}
      >
        {err?.message || upErr ? <Note tone="bad">{err?.message || upErr}</Note> : null}
        {showFields ? (
          <fieldset className="opx-tk-set" disabled={locked || busy}>
            <Field label={t("form.title")} value={title} onChange={setTitle} max={200} required error={titleMsg || undefined} />
            <Field label={t("form.description")} value={description} onChange={setDescription} max={5000} multiline rows={4} />
            <div className={`opx-field${deadlineMsg ? " has-error" : ""}`}>
              <span className="opx-tk-lbl" id={`${uid}-dl`}>
                {t("form.deadline")}
                <i aria-hidden="true">*</i>
              </span>
              <span className="opx-tk-presets" role="group" aria-label={t("form.quick")}>
                {quick.presets.map((p) => {
                  const on = date === p.date && time === p.time;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      className="opx-tk-fchip"
                      aria-pressed={on}
                      onClick={() => {
                        setDate(p.date);
                        setTime(p.time);
                      }}
                    >
                      {t(`form.preset.${p.key}`)}
                    </button>
                  );
                })}
              </span>
              <div className="opx-tk-dt" role="group" aria-labelledby={`${uid}-dl`}>
                <PickField big value={date} min={mode.kind === "create" ? quick.today : undefined} onChange={setDate} label={t("form.date")} placeholder={t("form.datePh")} invalid={Boolean(deadlineMsg)} />
                <PickField big kind="time" value={time} step={900} onChange={setTime} label={t("form.time")} placeholder={t("form.timePh")} />
              </div>
              {deadlineMsg ? (
                <p className="opx-ferr" role="alert">
                  {deadlineMsg}
                </p>
              ) : null}
            </div>
          </fieldset>
        ) : null}
        {showPeople ? <PeoplePick value={people} onChange={setPeople} known={known} disabled={locked || busy} error={peopleErr} /> : null}
        {showUpload ? <FilePick picked={picked} limits={limits} disabled={busy} error={err?.fields.files} /> : null}
      </div>
      <PanelFoot
        extra={
          locked ? (
            <button type="button" className="opx-pbtn" onClick={() => onSaved(savedTask)} disabled={busy}>
              {t("upload.skip")}
            </button>
          ) : (
            <button type="button" className="opx-pbtn" onClick={onClose} disabled={busy}>
              {t("cancel")}
            </button>
          )
        }
        primary={() => void submit()}
        primaryLabel={primaryLabel}
        busy={busy && phase !== "upload"}
        disabled={busy}
      />
    </Sheet>
  );
}
