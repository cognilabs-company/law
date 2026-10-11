"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { uploadWorkspaceFile } from "@/lib/services/backend";
import { FEEDBACK_SEVERITIES, FEEDBACK_TYPES, createFeedback } from "@/lib/services/internalLive";
import { areaOf, contextOf } from "@/lib/liveOfficeContext";
import { IconCheck, IconClose, IconPaperclip, IconPlus, IconSend } from "@/components/icons";
import { HrmError } from "@/components/internal/HrmUi";
import { apiMessage } from "@/components/internal/live/bits";

export type PageContext = { path: string; search: string };

// A bug or a suggestion from an internal employee (guide §15), sent with the
// place it is about: the page, its module and the object open on it are
// filled in from where the form was opened, so a developer lands right on it.
export default function FeedbackDialog({ open, onClose, context, onSent }: { open: boolean; onClose: () => void; context: PageContext; onSent?: () => void }) {
  const t = useTranslations("internal.feedback");
  const area = areaOf(context.path);
  const ctx = contextOf(context.path, context.search, area);
  const [type, setType] = useState("bug");
  const [severity, setSeverity] = useState("normal");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [steps, setSteps] = useState<string[]>([""]);
  const [keepContext, setKeepContext] = useState(true);
  const [files, setFiles] = useState<{ file_id: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const bug = type === "bug" || type === "data_issue";

  const reset = () => {
    setType("bug");
    setSeverity("normal");
    setTitle("");
    setDescription("");
    setExpected("");
    setActual("");
    setSteps([""]);
    setFiles([]);
    setErr("");
    setDone(false);
  };
  const close = () => {
    if (busy || uploading) return;
    reset();
    onClose();
  };

  async function attach(file: File | undefined) {
    if (!file || uploading) return;
    if (file.size > 10 * 1024 * 1024) {
      setErr(t("fileTooBig"));
      return;
    }
    setUploading(true);
    setErr("");
    try {
      const f = await uploadWorkspaceFile(file);
      setFiles((cur) => [...cur, { file_id: f.id, name: f.fileName || file.name }]);
    } catch {
      setErr(t("fileError"));
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !title.trim() || !description.trim()) return;
    setBusy(true);
    setErr("");
    try {
      await createFeedback({
        feedback_type: type,
        severity,
        module: area,
        page_url: keepContext ? ctx.detail_url : null,
        entity_type: keepContext ? ctx.entity_type : null,
        entity_id: keepContext ? ctx.entity_id : null,
        title: title.trim(),
        description: description.trim(),
        expected_result: bug ? expected.trim() || null : null,
        actual_result: bug ? actual.trim() || null : null,
        steps: bug ? steps.map((s) => s.trim()).filter(Boolean) : [],
        attachments: files,
      });
      setDone(true);
      onSent?.();
    } catch (cause) {
      setErr(apiMessage(cause, t("error")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title={t("newTitle")}>
      {done ? (
        <div className="lv-done" role="status">
          <IconCheck />
          <b>{t("sent")}</b>
          <p>{t("sentText")}</p>
          <button type="button" className="btn btn--pri btn--sm" onClick={close}>
            {t("close")}
          </button>
        </div>
      ) : (
        <form className="hrm-form fb-form" onSubmit={submit}>
          <div className="fb-types" role="radiogroup" aria-label={t("type")}>
            {FEEDBACK_TYPES.map((x) => (
              <button key={x} type="button" role="radio" aria-checked={type === x} className={`fb-type fb-type--${x}${type === x ? " on" : ""}`} onClick={() => setType(x)}>
                {t(`types.${x}`)}
              </button>
            ))}
          </div>
          <div className="fb-row">
            <label className="lv-field">
              <span>
                {t("titleLabel")} <i className="lv-req">*</i>
              </span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder={t(bug ? "titlePhBug" : "titlePh")} autoFocus />
            </label>
            <label className="lv-field fb-sev">
              <span>{t("severity")}</span>
              <Select value={severity} onChange={setSeverity} options={FEEDBACK_SEVERITIES.map((x) => ({ value: x, label: t(`severities.${x}`) }))} ariaLabel={t("severity")} />
            </label>
          </div>
          <label className="lv-field">
            <span>
              {t("description")} <i className="lv-req">*</i>
            </span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={4000} required placeholder={t(bug ? "descriptionPhBug" : "descriptionPh")} />
          </label>
          {bug ? (
            <>
              <div className="fb-row fb-row--2">
                <label className="lv-field">
                  <span>{t("expected")}</span>
                  <textarea value={expected} onChange={(e) => setExpected(e.target.value)} rows={2} maxLength={1000} placeholder={t("expectedPh")} />
                </label>
                <label className="lv-field">
                  <span>{t("actual")}</span>
                  <textarea value={actual} onChange={(e) => setActual(e.target.value)} rows={2} maxLength={1000} placeholder={t("actualPh")} />
                </label>
              </div>
              <div className="lv-field">
                <span>{t("steps")}</span>
                <ol className="fb-steps">
                  {steps.map((s, i) => (
                    <li key={i}>
                      <input value={s} onChange={(e) => setSteps((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))} maxLength={300} placeholder={t("stepPh", { n: i + 1 })} aria-label={t("stepPh", { n: i + 1 })} />
                      {steps.length > 1 ? (
                        <button type="button" className="fb-x" onClick={() => setSteps((cur) => cur.filter((_, j) => j !== i))} aria-label={t("removeStep")}>
                          <IconClose />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ol>
                {steps.length < 12 ? (
                  <button type="button" className="btn btn--line btn--sm fb-add" onClick={() => setSteps((cur) => [...cur, ""])}>
                    <IconPlus />
                    {t("addStep")}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
          <div className="fb-ctx">
            <label className="stu-check">
              <input type="checkbox" checked={keepContext} onChange={(e) => setKeepContext(e.target.checked)} />
              <span>{t("attachContext")}</span>
            </label>
            {keepContext ? (
              <dl>
                <div>
                  <dt>{t("page")}</dt>
                  <dd>
                    <code>{ctx.detail_url}</code>
                  </dd>
                </div>
                <div>
                  <dt>{t("module")}</dt>
                  <dd>{area}</dd>
                </div>
                {ctx.entity_id ? (
                  <div>
                    <dt>{t("object")}</dt>
                    <dd>
                      <code>
                        {ctx.entity_type} · {ctx.entity_id.slice(0, 8)}
                      </code>
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </div>
          <div className="fb-files">
            {files.map((f) => (
              <span key={f.file_id} className="fb-file">
                <IconPaperclip />
                {f.name}
                <button type="button" onClick={() => setFiles((cur) => cur.filter((x) => x.file_id !== f.file_id))} aria-label={t("removeFile")}>
                  <IconClose />
                </button>
              </span>
            ))}
            <label className="btn btn--line btn--sm fb-attach">
              <IconPaperclip />
              {uploading ? t("uploading") : t("attach")}
              <input type="file" accept="image/*,.pdf,.txt,.log,.json" hidden onChange={(e) => void attach(e.target.files?.[0])} disabled={uploading} />
            </label>
          </div>
          {err ? <HrmError text={err} /> : null}
          <div className="hrm-form__foot">
            <button className="btn btn--pri btn--sm" type="submit" disabled={busy || uploading || !title.trim() || !description.trim()}>
              <IconSend />
              {busy ? t("sending") : t("send")}
            </button>
            <button className="btn btn--line btn--sm" type="button" onClick={close}>
              {t("cancel")}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
