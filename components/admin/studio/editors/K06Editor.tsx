"use client";

import { useId, useRef } from "react";
import type { StudioFieldErrors } from "@/lib/services/studio";
import { STUDIO_ERR, type StudioEditorProps, type StudioPayload } from "./types";
import FieldRows, { fieldNames, fieldRowsOf, validateFieldRows } from "./parts/FieldRows";
import { AddBtn, ED_ERR, EdSection, EdShell, ErrLine, FileBox, Fld, RowTools, SelectIn, TextIn, edAi, insertAt, moveItem, normErrors, placeCaret, recList, str, useEd, type Dict } from "./parts/kit";
import { IconAlert, IconBriefcase, IconDocLines, IconEdit, IconFileText, IconLayers, IconList, IconUpload } from "@/components/icons";

const CODE = "K06";
export const K06_LANGS = ["uz-latn", "uz-cyrl", "ru", "en"] as const;
const PH_RE = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;

type FileState = { hasFile: boolean } | null | undefined;

function modeOf(p: StudioPayload): "editor" | "upload" {
  return str(p.mode).toLowerCase() === "upload" ? "upload" : "editor";
}

function clausesOf(v: unknown): Dict[] {
  return recList(v).map((c) => ({ ...c, title: str(c.title ?? c.name), text: str(c.text ?? c.body ?? c.content) }));
}

function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(PH_RE)].map((m) => m[1]))];
}

function fileFromPayload(p: StudioPayload): boolean | null {
  if (p.has_file === true || str(p.file_name) || str(p.file_url) || str(p.source_file_name)) return true;
  return null;
}

export function emptyPayload(): StudioPayload {
  return { mode: "editor", title: "", language: "uz-latn", template_id: "", service_id: "", fields: [], template_text: "", clauses: [], source_file_required: false };
}

export function validate(payload: StudioPayload, file?: FileState): StudioFieldErrors {
  const out: StudioFieldErrors = {};
  if (!str(payload.title).trim()) out.title = STUDIO_ERR.required;
  const mode = modeOf(payload);
  const clauses = clausesOf(payload.clauses);
  if (mode === "editor") {
    if (!str(payload.template_text).trim() && !clauses.length) out.template_text = STUDIO_ERR.required;
  } else {
    const has = file === undefined ? fileFromPayload(payload) : Boolean(file?.hasFile);
    if (has === false) out.file = ED_ERR.fileMode;
  }
  validateFieldRows(recList(payload.fields), "fields", new Map(), out);
  clauses.forEach((c, i) => {
    if (!str(c.title).trim()) out[`clauses.${i}.title`] = STUDIO_ERR.required;
    if (!str(c.text).trim()) out[`clauses.${i}.text`] = STUDIO_ERR.required;
  });
  return out;
}

export default function K06Editor({ payload, onChange, errors, readOnly, file, onUploadFile }: StudioEditorProps) {
  const { e, ctorName } = useEd();
  const uid = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const errs = normErrors(errors);
  const mode = modeOf(payload);
  const fields = fieldRowsOf(payload.fields);
  const names = fieldNames(fields);
  const clauses = clausesOf(payload.clauses);
  const text = str(payload.template_text);
  const unknown = mode === "editor" ? placeholders(text).filter((n) => !names.includes(n)) : [];
  const set = (k: string, v: unknown) => onChange({ ...payload, [k]: v });
  const setClauses = (next: Dict[]) => set("clauses", next);
  const patchClause = (i: number, p: Dict) => setClauses(clauses.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const langOpts = K06_LANGS.map((l) => ({ value: l, label: e(`lang.${l}`) }));
  const fileErr = errs.file || errs.source_file || errs.source_file_required || "";
  const fileMissing = mode === "upload" && !file?.hasFile;

  function setMode(next: "editor" | "upload") {
    if (next === mode) return;
    onChange({ ...payload, mode: next, source_file_required: next === "upload" });
  }

  function insert(name: string) {
    const token = `{{${name}}}`;
    const r = insertAt(area.current, text, token);
    set("template_text", r.text);
    placeCaret(area.current, r.caret);
  }

  return (
    <EdShell
      code={CODE}
      icon={IconFileText}
      title={ctorName(CODE)}
      lead={e("k06.lead")}
      errors={errs}
      known={["mode", "title", "language", "template_id", "service_id", "fields", "template_text", "clauses", "source_file_required", "file", "source_file"]}
    >
      <div className="stu-fe-mode">
        <span className="stu-fe-cell__l">{e("k06.mode")}</span>
        <div className="stu-seg stu-fe-mode__seg" role="tablist" aria-label={e("k06.mode")}>
          <button type="button" role="tab" aria-selected={mode === "editor"} className="stu-seg__b" disabled={readOnly && mode !== "editor"} onClick={() => !readOnly && setMode("editor")} data-ai-id={edAi(CODE, "mode", "editor")} data-ai-type="tab" data-ai-label={e("k06.modeEditor")}>
            <IconEdit aria-hidden />
            {e("k06.modeEditor")}
          </button>
          <button type="button" role="tab" aria-selected={mode === "upload"} className="stu-seg__b" disabled={readOnly && mode !== "upload"} onClick={() => !readOnly && setMode("upload")} data-ai-id={edAi(CODE, "mode", "upload")} data-ai-type="tab" data-ai-label={e("k06.modeUpload")}>
            <IconUpload aria-hidden />
            {e("k06.modeUpload")}
          </button>
        </div>
        <p className="stu-hint">{mode === "editor" ? e("k06.modeEditorHint") : e("k06.modeUploadHint")}</p>
      </div>

      <div className="stu-fe-grid">
        <Fld id={`${uid}-title`} label={e("k06.docTitle")} required error={errs.title} wide>
          <TextIn id={`${uid}-title`} value={str(payload.title)} onChange={(v) => set("title", v)} readOnly={readOnly} invalid={Boolean(errs.title)} placeholder={e("k06.docTitlePh")} label={e("k06.docTitle")} ai={edAi(CODE, "title")} />
        </Fld>
        <Fld label={e("common.language")} error={errs.language}>
          <SelectIn value={str(payload.language)} onChange={(v) => set("language", v)} options={langOpts} readOnly={readOnly} label={e("common.language")} ai={edAi(CODE, "language")} invalid={Boolean(errs.language)} />
        </Fld>
        <Fld id={`${uid}-tpl`} label={e("k06.templateId")} error={errs.template_id} hint={e("common.optional")}>
          <TextIn id={`${uid}-tpl`} value={str(payload.template_id)} onChange={(v) => set("template_id", v)} readOnly={readOnly} invalid={Boolean(errs.template_id)} placeholder="template-id" label={e("k06.templateId")} ai={edAi(CODE, "template_id")} mono />
        </Fld>
        <Fld id={`${uid}-svc`} label={e("common.serviceId")} error={errs.service_id} hint={e("common.optional")}>
          <TextIn id={`${uid}-svc`} value={str(payload.service_id)} onChange={(v) => set("service_id", v)} readOnly={readOnly} invalid={Boolean(errs.service_id)} placeholder={e("common.serviceIdPh")} label={e("common.serviceId")} ai={edAi(CODE, "service_id")} mono />
        </Fld>
      </div>

      {mode === "upload" ? (
        <EdSection icon={IconUpload} title={e("k06.file")} hint={e("k06.fileHint")}>
          <FileBox code={CODE} file={file} onUploadFile={onUploadFile} readOnly={readOnly} error={fileErr || (fileMissing ? ED_ERR.fileMode : "")} />
        </EdSection>
      ) : (
        <EdSection icon={IconDocLines} title={e("k06.template")} hint={e("k06.templateHint")} error={errs.template_text}>
          {names.length && !readOnly ? (
            <div className="stu-fe-ins" role="group" aria-label={e("k06.insert")}>
              <span className="stu-fe-ins__l">{e("k06.insert")}</span>
              {names.map((n) => (
                <button key={n} type="button" className="stu-fe-ins__b" onClick={() => insert(n)} data-ai-id={edAi(CODE, "insert", n)} data-ai-type="button" data-ai-label={`{{${n}}}`}>
                  {`{{${n}}}`}
                </button>
              ))}
            </div>
          ) : !readOnly ? (
            <p className="stu-hint">{e("k06.insertNone")}</p>
          ) : null}
          <textarea
            ref={area}
            className="stu-fe-doc"
            value={text}
            onChange={(ev) => set("template_text", ev.target.value)}
            readOnly={readOnly}
            rows={16}
            placeholder={e("k06.templatePh")}
            aria-label={e("k06.template")}
            aria-invalid={Boolean(errs.template_text) || undefined}
            data-ai-id={edAi(CODE, "template_text")}
            data-ai-type="textarea"
            data-ai-label={e("k06.template")}
          />
          <div className="stu-fe-doc__meta">
            <span>{e("k06.chars", { n: text.length })}</span>
            <span>{e("k06.vars", { n: placeholders(text).length })}</span>
          </div>
          {unknown.length ? (
            <p className="stu-fe-warn" role="status">
              <IconAlert aria-hidden />
              <span>
                {e("k06.unknownVars")} {unknown.map((n) => `{{${n}}}`).join(", ")}
              </span>
            </p>
          ) : null}
        </EdSection>
      )}

      <EdSection icon={IconList} title={e("k06.fields")} hint={mode === "editor" ? e("k06.fieldsHint") : e("k06.fieldsHintUpload")} count={fields.length} error={errs.fields}>
        <FieldRows code={CODE} rows={fields} onChange={(rows) => set("fields", rows)} readOnly={readOnly} errors={errs} prefix="fields" aiBase={[]} />
      </EdSection>

      <EdSection icon={IconLayers} title={e("k06.clauses")} hint={e("k06.clausesHint")} count={clauses.length} error={errs.clauses}>
        <div className="stu-fe-stack">
          {clauses.length === 0 ? <p className="stu-fe-none">{e("k06.clausesNone")}</p> : null}
          {clauses.map((c, i) => {
            const p = `clauses.${i}`;
            const ai = edAi(CODE, "clause", i);
            const tErr = errs[`${p}.title`] ?? "";
            const xErr = errs[`${p}.text`] ?? "";
            return (
              <article key={i} className={`stu-fe-card${tErr || xErr ? " is-bad" : ""}`}>
                <header className="stu-fe-card__h">
                  <span className="stu-fe-card__n">
                    <IconBriefcase aria-hidden />
                  </span>
                  <div className="stu-fe-card__t">
                    <TextIn value={str(c.title)} onChange={(v) => patchClause(i, { title: v })} readOnly={readOnly} invalid={Boolean(tErr)} placeholder={e("k06.clauseTitlePh")} label={e("k06.clauseTitle")} ai={`${ai}.title`} />
                    <ErrLine msg={tErr} />
                  </div>
                  {readOnly ? null : <RowTools index={i} count={clauses.length} onMove={(d) => setClauses(moveItem(clauses, i, d))} onRemove={() => setClauses(clauses.filter((_, j) => j !== i))} ai={ai} what={e("what.clause")} />}
                </header>
                <div className="stu-fld">
                  <textarea
                    value={str(c.text)}
                    onChange={(ev) => patchClause(i, { text: ev.target.value })}
                    readOnly={readOnly}
                    rows={4}
                    placeholder={e("k06.clauseTextPh")}
                    aria-label={e("k06.clauseText")}
                    aria-invalid={Boolean(xErr) || undefined}
                    data-ai-id={`${ai}.text`}
                    data-ai-type="textarea"
                    data-ai-label={e("k06.clauseText")}
                  />
                  <ErrLine msg={xErr} />
                </div>
              </article>
            );
          })}
          {readOnly ? null : <AddBtn label={e("k06.addClause")} onClick={() => setClauses([...clauses, { title: "", text: "" }])} ai={edAi(CODE, "clause", "add")} />}
        </div>
      </EdSection>
    </EdShell>
  );
}
