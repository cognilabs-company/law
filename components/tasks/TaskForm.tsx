"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import Modal from "@/components/admin/Modal";
import DatePicker from "@/components/DatePicker";
import TimePicker from "@/components/TimePicker";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import { CalendarClock, FileText, Pencil, Plus, Type, Users } from "lucide-react";
import { STROKE } from "./parts";
import { TASK_UPLOAD_DEFAULTS, createTask, searchTaskUsers, setTaskAssignees, taskErrorOf, updateTask, uploadTaskAttachments, type Task, type TaskError, type TaskUploadLimits } from "@/lib/services/taskManagement";
import TaskFilePicker, { usePickedFiles } from "./TaskFilePicker";
import { useTaskText } from "./parts";

const pad = (n: number) => String(n).padStart(2, "0");

function splitLocal(iso: string): { date: string; time: string } {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return { date: "", time: "" };
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

function joinLocal(date: string, time: string): string {
  if (!date) return "";
  const d = new Date(`${date}T${time || "18:00"}:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

const PRESETS = [
  { key: "today", days: 0, time: "18:00" },
  { key: "tomorrow", days: 1, time: "10:00" },
  { key: "days3", days: 3, time: "18:00" },
  { key: "week", days: 7, time: "18:00" },
] as const;

function presetOf(days: number, time: string): { date: string; time: string } {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time };
}

const optionOf = (p: { id: string; name: string; lexgoId: string }): SearchOption => ({ value: p.id, label: p.name || p.lexgoId || p.id, sub: p.lexgoId || undefined });

export type TaskFormMode = { kind: "create" } | { kind: "edit"; task: Task } | { kind: "assign"; task: Task };

export default function TaskForm({
  mode,
  limits = TASK_UPLOAD_DEFAULTS,
  onClose,
  onSaved,
  onError,
}: {
  mode: TaskFormMode;
  limits?: TaskUploadLimits;
  onClose: () => void;
  onSaved: (task: Task | null) => void;
  onError: (e: TaskError, task: Task | null) => boolean;
}) {
  const { t } = useTaskText();
  const uid = useId();
  const task = mode.kind === "create" ? null : mode.task;
  const start = splitLocal(task?.deadlineAt ?? "");
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time || "18:00");
  const [people, setPeople] = useState<string[]>(() => task?.assignees.map((a) => a.id) ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const [tried, setTried] = useState(false);
  const [pastFor, setPastFor] = useState("");
  // Files go up after the task itself is saved. When that upload fails the
  // saved task is kept here, the fields lock, and the next press only retries
  // the files — never a second task.
  const picked = usePickedFiles(limits);
  const [savedTask, setSavedTask] = useState<Task | null>(null);
  const [upErr, setUpErr] = useState("");
  const [phase, setPhase] = useState<"" | "save" | "upload">("");
  const known = task?.assignees.map(optionOf) ?? [];

  const search = useCallback(async (q: string) => (await searchTaskUsers(q)).map(optionOf), []);

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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
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
      if (!onError(te, task)) setErr({ message: te.kind === "unavailable" ? t("err.unavailable") : te.kind === "network" ? t("err.network") : te.message || t("err.save"), fields: te.fields });
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

  return (
    <Modal
      open
      onClose={onClose}
      title={heading}
      icon={mode.kind === "create" ? <Plus aria-hidden strokeWidth={STROKE} /> : mode.kind === "edit" ? <Pencil aria-hidden strokeWidth={STROKE} /> : <Users aria-hidden strokeWidth={STROKE} />}
      busy={busy}
      dirty={dirtyAll && !locked}
      size="md"
      footer={
        <>
          {locked ? (
            <button type="button" className="btn btn--line" onClick={() => onSaved(savedTask)} disabled={busy}>
              {t("upload.skip")}
            </button>
          ) : (
            <button type="button" className="btn btn--line" onClick={onClose} disabled={busy}>
              {t("cancel")}
            </button>
          )}
          <button type="submit" form={`${uid}-f`} className="btn btn--pri" disabled={busy}>
            {phase === "upload"
              ? t("upload.uploading", { n: picked.items.length })
              : busy
                ? t("saving")
                : locked
                  ? t("upload.retry")
                  : mode.kind === "create"
                    ? t("form.create")
                    : t("form.save")}
          </button>
        </>
      }
    >
      <form
        id={`${uid}-f`}
        className="cform ttk-form ttk-scope"
        onSubmit={submit}
        noValidate
        onPaste={(e) => {
          // A screenshot pasted anywhere in the form joins the files.
          const files = Array.from(e.clipboardData.files);
          if (!showUpload || locked || busy || !files.length) return;
          e.preventDefault();
          picked.add(files);
        }}
      >
        {err?.message || upErr ? (
          <p className="cform__bad" role="alert">
            {err?.message || upErr}
          </p>
        ) : null}
        {showFields ? (
          <fieldset className="ttk-form__set" disabled={locked}>
            <div>
              <label htmlFor={`${uid}-t`} className="ttk-lbl">
                <Type aria-hidden strokeWidth={STROKE} />
                {t("form.title")} <span aria-hidden>*</span>
              </label>
              <input id={`${uid}-t`} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!titleMsg} aria-describedby={titleMsg ? `${uid}-te` : undefined} />
              {titleMsg ? (
                <p id={`${uid}-te`} className="cform__bad">
                  {titleMsg}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor={`${uid}-d`} className="ttk-lbl">
                <FileText aria-hidden strokeWidth={STROKE} />
                {t("form.description")}
              </label>
              <textarea id={`${uid}-d`} rows={4} value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <span className="ttk-form__lbl ttk-lbl" id={`${uid}-dl`}>
                <CalendarClock aria-hidden strokeWidth={STROKE} />
                {t("form.deadline")} <span aria-hidden>*</span>
              </span>
              <span className="ttk-presets" role="group" aria-label={t("form.quick")}>
                {PRESETS.map((pr) => {
                  const v = presetOf(pr.days, pr.time);
                  const on = date === v.date && time === v.time;
                  return (
                    <button
                      key={pr.key}
                      type="button"
                      className={on ? "ttk-preset is-on" : "ttk-preset"}
                      onClick={() => {
                        setDate(v.date);
                        setTime(v.time);
                      }}
                    >
                      {t(`form.preset.${pr.key}`)}
                    </button>
                  );
                })}
              </span>
              <div className="cform__row2" role="group" aria-labelledby={`${uid}-dl`}>
                <DatePicker value={date} onChange={setDate} placeholder={t("form.datePh")} ariaLabel={t("form.date")} min={mode.kind === "create" ? splitLocal(new Date().toISOString()).date : undefined} />
                <TimePicker value={time} onChange={setTime} placeholder={t("form.timePh")} ariaLabel={t("form.time")} step={15} />
              </div>
              {deadlineMsg ? <p className="cform__bad">{deadlineMsg}</p> : null}
            </div>
          </fieldset>
        ) : null}
        {showPeople ? (
          <fieldset className="ttk-form__set" disabled={locked}>
            <span className="ttk-form__lbl ttk-lbl" id={`${uid}-pl`}>
              <Users aria-hidden strokeWidth={STROKE} />
              {t("form.assignees")}
            </span>
            <SearchSelect
              value={people}
              onChange={setPeople}
              options={known}
              onSearch={search}
              placeholder={t("form.assigneesPh")}
              searchPlaceholder={t("form.assigneesSearch")}
              emptyText={t("form.assigneesEmpty")}
              ariaLabel={t("form.assignees")}
              hint={people.length ? undefined : t("form.unassignedHint")}
            />
            {err?.fields.assignee_user_ids || err?.fields.user_ids ? <p className="cform__bad">{err.fields.assignee_user_ids || err.fields.user_ids}</p> : null}
          </fieldset>
        ) : null}
        {showUpload ? <TaskFilePicker picked={picked} limits={limits} disabled={busy} error={err?.fields.files} /> : null}
      </form>
    </Modal>
  );
}
