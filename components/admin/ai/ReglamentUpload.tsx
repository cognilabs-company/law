"use client";

import { useEffect, useId, useRef, useState, type DragEvent, type FormEvent } from "react";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { ApiError, errDetail, isAborted, isForbidden } from "@/lib/http";
import {
  REGLAMENT_FILE_ACCEPT,
  REGLAMENT_MAX_BYTES,
  latestVersion,
  nextVersion,
  reglamentFileExt,
  reglamentFileOk,
  titleFromFile,
  uploadReglament,
  type Reglament,
} from "@/lib/services/aiReglaments";
import { CategoryField, MissingState, VersionField, catChoiceOf, catValue, useRgl, versionProblem } from "./bits";
import { IconAlert, IconClose, IconEdit, IconRefresh, IconUpload } from "@/components/icons";

export type UploadedInfo = { id: string; title: string; version: string; reglament: Reglament | null };
export type UploadSeed = { title: string; category: string; version: string };

type Field = "title" | "category" | "version";

export default function ReglamentUpload({
  open,
  missing,
  reglaments,
  onClose,
  onDone,
  onUseEditor,
}: {
  open: boolean;
  missing: boolean;
  reglaments: Reglament[];
  onClose: () => void;
  onDone: (info: UploadedInfo) => void;
  onUseEditor: (seed: UploadSeed) => void;
}) {
  const { t } = useRgl();
  return (
    <Modal open={open} onClose={onClose} title={t("upload.title")} aiId="admin.ai-reglaments.upload-modal">
      {open ? <UploadForm missing={missing} reglaments={reglaments} onDone={onDone} onUseEditor={onUseEditor} /> : null}
    </Modal>
  );
}

function UploadForm({
  missing,
  reglaments,
  onDone,
  onUseEditor,
}: {
  missing: boolean;
  reglaments: Reglament[];
  onDone: (info: UploadedInfo) => void;
  onUseEditor: (seed: UploadSeed) => void;
}) {
  const { t, num, dec } = useRgl();
  const uid = useId();
  const [file, setFile] = useState<File | null>(null);
  const [fileErr, setFileErr] = useState("");
  const [over, setOver] = useState(false);
  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [choice, setChoice] = useState("support");
  const [custom, setCustom] = useState("");
  const [version, setVersion] = useState("1.0");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    const box = ctrl;
    return () => box.current?.abort();
  }, []);

  const base = reglaments.find((r) => r.id && r.id === target) ?? null;
  const current = base ? latestVersion(base) : "";

  function problems(): Partial<Record<Field, string>> {
    const out: Partial<Record<Field, string>> = {};
    if (!title.trim()) out.title = t("editor.errTitle");
    if (!catValue(choice, custom)) out.category = t("editor.errCategory");
    const vp = versionProblem(version.trim(), current);
    if (vp === "format") out.version = t("editor.errVersion");
    else if (vp === "low") out.version = t("editor.errVersionLow", { v: current });
    return out;
  }
  const errs = tried ? problems() : {};

  function size(bytes: number): string {
    return bytes >= 1024 * 1024 ? t("upload.mb", { n: dec(bytes / (1024 * 1024)) }) : t("upload.kb", { n: num(Math.max(1, Math.round(bytes / 1024))) });
  }

  function pick(next: File | null) {
    setNote("");
    if (!next) return;
    if (!reglamentFileOk(next.name)) {
      setFileErr(t("upload.badType"));
      return;
    }
    if (next.size > REGLAMENT_MAX_BYTES) {
      setFileErr(t("upload.tooBig"));
      return;
    }
    if (next.size === 0) {
      setFileErr(t("upload.empty"));
      return;
    }
    setFileErr("");
    setFile(next);
    if (!title.trim() && !target) setTitle(titleFromFile(next.name).slice(0, 200));
  }

  function chooseTarget(id: string) {
    setTarget(id);
    const r = reglaments.find((x) => x.id && x.id === id);
    if (!r) {
      setVersion("1.0");
      return;
    }
    const c = catChoiceOf(r.category);
    setTitle(r.title);
    setChoice(c.choice);
    setCustom(c.custom);
    const latest = latestVersion(r);
    setVersion(latest ? nextVersion(latest, "minor") : "1.0");
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!busy && !over) setOver(true);
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    const to = e.relatedTarget;
    if (to instanceof Node && e.currentTarget.contains(to)) return;
    setOver(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    if (busy) return;
    pick(e.dataTransfer.files?.[0] ?? null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setTried(true);
    const p = problems();
    if (!file) setFileErr(t("upload.needFile"));
    const first = !file ? "file" : (["title", "category", "version"] as Field[]).find((k) => p[k]);
    if (first) {
      document.getElementById(`${uid}-${first}`)?.focus();
      return;
    }
    if (!file) return;
    setBusy(true);
    setNote("");
    const c = new AbortController();
    ctrl.current = c;
    const input = { title: title.trim(), category: catValue(choice, custom), version: version.trim(), file };
    try {
      const res = await uploadReglament(input, c.signal);
      if (res.kind === "missing") return;
      onDone({ id: res.data?.id || target, title: input.title, version: input.version, reglament: res.data });
    } catch (x) {
      if (isAborted(x)) return;
      const status = x instanceof ApiError ? x.status : 0;
      setNote(
        status === 413
          ? t("upload.tooBig")
          : status === 415
            ? t("upload.badType")
            : isForbidden(x)
              ? t("error.forbiddenAction")
              : errDetail(x) || (status === 409 ? t("editor.errConflict") : t("upload.err")),
      );
    } finally {
      if (ctrl.current === c) ctrl.current = null;
      setBusy(false);
    }
  }

  if (missing) {
    return (
      <div className="rgl-up">
        <MissingState text={t("missing.uploadText")} />
        <button
          type="button"
          className="btn btn--soft btn--full"
          onClick={() => onUseEditor({ title: title.trim(), category: catValue(choice, custom), version: version.trim() || "1.0" })}
        >
          <IconEdit aria-hidden />
          {t("missing.useEditor")}
        </button>
      </div>
    );
  }

  const ext = file ? reglamentFileExt(file.name).replace(".", "") : "";
  const inputId = `${uid}-file`;
  const targetOpts = [
    { value: "", label: t("editor.targetNew") },
    ...reglaments.filter((r) => r.id).map((r) => ({ value: r.id, label: r.version ? `${r.title} · v${r.version}` : r.title })),
  ];

  return (
    <form className="cform rgl-up" onSubmit={submit} noValidate>
      <p className="rgl-up__lead">{t("upload.lead")}</p>

      <div
        className={`rgl-up__zone${over ? " is-over" : ""}${busy ? " is-busy" : ""}`}
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        data-ai-id="admin.ai-reglaments.upload-modal.file"
        data-ai-type="file_dropzone"
        data-ai-label={t("upload.drop")}
      >
        <input
          id={inputId}
          className="rgl-sr"
          type="file"
          accept={REGLAMENT_FILE_ACCEPT}
          disabled={busy}
          aria-describedby={`${uid}-rules`}
          onChange={(e) => {
            pick(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        {file ? (
          <div className="rgl-file">
            <span className={`rgl-file__ext rgl-file__ext--${ext || "doc"}`} aria-hidden>
              {ext.toUpperCase()}
            </span>
            <span className="rgl-file__m">
              <b title={file.name}>{file.name}</b>
              <small>{size(file.size)}</small>
            </span>
            <span className="rgl-file__acts">
              <label htmlFor={inputId} className="aitem__act" title={t("upload.change")} aria-label={t("upload.change")} aria-disabled={busy}>
                <IconRefresh aria-hidden />
              </label>
              <button type="button" className="aitem__act aitem__act--danger" onClick={() => setFile(null)} disabled={busy} title={t("upload.remove")} aria-label={t("upload.remove")}>
                <IconClose aria-hidden />
              </button>
            </span>
          </div>
        ) : (
          <label htmlFor={inputId} className="rgl-drop">
            <span className="rgl-drop__ico" aria-hidden>
              <IconUpload />
            </span>
            <b>{over ? t("upload.dropNow") : t("upload.drop")}</b>
            <span>
              {t("upload.or")} <u>{t("upload.choose")}</u>
            </span>
            <small id={`${uid}-rules`}>{t("upload.rules")}</small>
          </label>
        )}
      </div>
      {fileErr ? (
        <p className="rgl-err" role="alert">
          {fileErr}
        </p>
      ) : null}

      {reglaments.some((r) => r.id) ? (
        <div className="rgl-fld" data-ai-id="admin.ai-reglaments.upload-modal.target" data-ai-type="select" data-ai-label={t("upload.target")}>
          <label>{t("upload.target")}</label>
          <Select value={target} onChange={chooseTarget} options={targetOpts} ariaLabel={t("upload.target")} />
          <p className="rf__hint">{target ? t("upload.targetHintOld") : t("upload.targetHintNew")}</p>
        </div>
      ) : null}

      <div className="rgl-fld">
        <label htmlFor={`${uid}-title`}>{t("editor.title")}</label>
        <input
          id={`${uid}-title`}
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 200))}
          placeholder={t("editor.titlePh")}
          autoComplete="off"
          aria-invalid={Boolean(errs.title)}
          data-ai-id="admin.ai-reglaments.upload-modal.title"
          data-ai-type="input"
          data-ai-label={t("editor.title")}
        />
        {errs.title ? (
          <p className="rgl-err" role="alert">
            {errs.title}
          </p>
        ) : null}
      </div>

      <div className="cform__row2 rgl-up__row">
        <CategoryField id={`${uid}-category`} choice={choice} custom={custom} onChoice={setChoice} onCustom={setCustom} error={errs.category} aiId="admin.ai-reglaments.upload-modal.category" />
        <VersionField id={`${uid}-version`} value={version} onChange={setVersion} current={current} error={errs.version} aiId="admin.ai-reglaments.upload-modal.version" />
      </div>

      {busy ? (
        <div className="rgl-up__busy" role="status">
          <span className="rgl-prog" aria-hidden />
          <span>{t("upload.busy")}</span>
        </div>
      ) : null}
      {note ? (
        <p className="rgl-note rgl-note--err" role="alert">
          <IconAlert aria-hidden />
          {note}
        </p>
      ) : null}

      <button type="submit" className="btn btn--pri btn--full" disabled={busy} data-ai-id="admin.ai-reglaments.upload-modal.submit">
        <IconUpload aria-hidden />
        {busy ? t("upload.sending") : t("upload.submit")}
      </button>
    </form>
  );
}
