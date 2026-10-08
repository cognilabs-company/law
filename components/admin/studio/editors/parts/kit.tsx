"use client";

import { useRef, useState, type ChangeEvent, type ComponentType, type KeyboardEvent, type ReactNode, type SVGProps } from "react";
import { useTranslations } from "next-intl";
import Select from "@/components/Select";
import { aiId } from "@/lib/ai/ids";
import { STUDIO_FILE_ACCEPT, STUDIO_FILE_EXT, downloadStudioVersionFile, type StudioFieldErrors } from "@/lib/services/studio";
import { useStudioErrorText, useStudioText } from "../../bits";
import type { StudioEditorFile } from "../types";
import {
  IconAlert,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconDocLines,
  IconDownload,
  IconFileText,
  IconList,
  IconPlus,
  IconRefresh,
  IconUpload,
} from "@/components/icons";

export type Dict = Record<string, unknown>;
type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export const ED_ERR = { snake: "@snake", options: "@options", fileMode: "@fileMode", minOne: "@minOne", unknownVar: "@unknownVar" } as const;
const ED_TOKENS = new Set<string>(Object.values(ED_ERR));

export const SNAKE_RE = /^[a-z][a-z0-9_]*$/;

export function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

export function rec(v: unknown): Dict {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {};
}

export function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function recList(v: unknown): Dict[] {
  return list(v).map(rec);
}

export function strList(v: unknown): string[] {
  if (typeof v === "string") return v.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  return list(v)
    .map((x) => {
      if (typeof x === "string" || typeof x === "number") return str(x).trim();
      const o = rec(x);
      return str(o.value ?? o.code ?? o.name ?? o.label).trim();
    })
    .filter(Boolean);
}

export function bool(v: unknown): boolean {
  return v === true || v === "true" || v === 1;
}

export function moveItem<T>(items: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= items.length) return items;
  const next = items.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function uniq(items: string[]): string[] {
  return [...new Set(items)];
}

const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", ғ: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", қ: "q", л: "l", м: "m",
  н: "n", о: "o", ў: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ҳ: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sh",
  ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
};

export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[ʻʼ‘’'`]/g, "")
    .split("")
    .map((ch) => CYR[ch] ?? ch)
    .join("")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export function normErrors(errors: StudioFieldErrors): StudioFieldErrors {
  const out: StudioFieldErrors = {};
  for (const [k, v] of Object.entries(errors)) {
    const key = k.replace(/\[(\d+)\]/g, ".$1").replace(/^\./, "");
    if (!out[key]) out[key] = v;
  }
  return out;
}

export function errIn(errors: StudioFieldErrors, path: string): string {
  if (errors[path]) return errors[path];
  for (const [k, v] of Object.entries(errors)) if (k.startsWith(`${path}.`)) return v;
  return "";
}

export function orphanErrors(errors: StudioFieldErrors, known: string[]): [string, string][] {
  return Object.entries(errors).filter(([k]) => !known.includes(k.split(".")[0]));
}

export function fileExtOk(name: string): boolean {
  const n = name.toLowerCase();
  return STUDIO_FILE_EXT.some((e) => n.endsWith(e));
}

export function useEd() {
  const base = useStudioText();
  const e = useTranslations("studio.editors");
  const ferr = (msg: string) => {
    if (!msg) return "";
    if (ED_TOKENS.has(msg)) return e(`err.${msg.slice(1)}`);
    return base.fieldErr(msg);
  };
  return { ...base, e, ferr };
}

export function edAi(code: string, ...parts: (string | number | null | undefined)[]): string {
  return aiId(`admin.studio.editor.${code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, ...parts);
}

export function ErrLine({ msg }: { msg: string }) {
  const { ferr } = useEd();
  if (!msg) return null;
  return (
    <p className="stu-ferr" role="alert">
      {ferr(msg)}
    </p>
  );
}

export function EdShell({
  code,
  icon: Glyph,
  title,
  lead,
  payload,
  errors,
  known,
  note,
  children,
}: {
  code: string;
  icon: Icon;
  title: string;
  lead: string;
  payload: Dict;
  errors: StudioFieldErrors;
  known: string[];
  note?: ReactNode;
  children: ReactNode;
}) {
  const { t, e, ferr } = useEd();
  const [view, setView] = useState<"form" | "json">("form");
  const orphan = orphanErrors(errors, known);
  let json = "";
  try {
    json = JSON.stringify(payload, null, 2);
  } catch {
    json = "";
  }
  return (
    <div className="stu-fe" data-ai-id={edAi(code)} data-ai-type="editor" data-ai-label={title}>
      <div className="stu-fe__top">
        <span className="stu-fe__ico" aria-hidden>
          <Glyph />
        </span>
        <div className="stu-fe__tt">
          <b>{title}</b>
          <p>{lead}</p>
        </div>
        <div className="stu-seg" role="tablist" aria-label={t("generic.view")}>
          <button type="button" role="tab" aria-selected={view === "form"} className="stu-seg__b" onClick={() => setView("form")} data-ai-id={edAi(code, "view", "form")} data-ai-type="tab" data-ai-label={t("actions.formView")}>
            <IconList aria-hidden />
            {t("actions.formView")}
          </button>
          <button type="button" role="tab" aria-selected={view === "json"} className="stu-seg__b" onClick={() => setView("json")} data-ai-id={edAi(code, "view", "json")} data-ai-type="tab" data-ai-label={t("actions.jsonView")}>
            <IconDocLines aria-hidden />
            {t("actions.jsonView")}
          </button>
        </div>
      </div>
      {note}
      {orphan.length ? (
        <ul className="stu-gen__errs" role="alert">
          {orphan.map(([k, v]) => (
            <li key={k}>
              <IconAlert aria-hidden />
              <span>
                {k !== "_" ? <code>{k}</code> : null}
                {ferr(v)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {view === "json" ? (
        <div className="stu-fe__peek">
          <pre className="stu-json" tabIndex={0} aria-label={e("jsonPeek")}>
            {json}
          </pre>
          <p className="stu-hint">{e("jsonPeekHint")}</p>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export function EdSection({
  icon: Glyph,
  title,
  hint,
  count,
  actions,
  children,
  error,
}: {
  icon?: Icon;
  title: string;
  hint?: string;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
  error?: string;
}) {
  return (
    <section className={`stu-fe-sec${error ? " is-bad" : ""}`}>
      <header className="stu-fe-sec__h">
        {Glyph ? (
          <span className="stu-fe-sec__ico" aria-hidden>
            <Glyph />
          </span>
        ) : null}
        <div className="stu-fe-sec__t">
          <h4>
            {title}
            {typeof count === "number" ? <span className="stu-fe-count">{count}</span> : null}
          </h4>
          {hint ? <p>{hint}</p> : null}
        </div>
        {actions ? <div className="stu-fe-sec__acts">{actions}</div> : null}
      </header>
      {error ? <ErrLine msg={error} /> : null}
      {children}
    </section>
  );
}

export function Fld({
  id,
  label,
  required,
  error,
  hint,
  wide,
  children,
}: {
  id?: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`stu-fld stu-fe-fld${wide ? " stu-fe-fld--wide" : ""}`}>
      <label className="stu-fld__l" htmlFor={id}>
        <span>
          {label}
          {required ? (
            <i className="stu-req" aria-hidden>
              *
            </i>
          ) : null}
        </span>
      </label>
      {children}
      {error ? <ErrLine msg={error} /> : hint ? <p className="stu-hint">{hint}</p> : null}
    </div>
  );
}

export function TextIn({
  id,
  value,
  onChange,
  readOnly,
  invalid,
  placeholder,
  label,
  ai,
  mono,
  list: listId,
  onBlur,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
  invalid?: boolean;
  placeholder?: string;
  label: string;
  ai: string;
  mono?: boolean;
  list?: string;
  onBlur?: () => void;
}) {
  return (
    <input
      id={id}
      type="text"
      className={mono ? "stu-fe-mono" : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      readOnly={readOnly}
      placeholder={placeholder}
      autoComplete="off"
      spellCheck={mono ? false : undefined}
      list={listId}
      aria-invalid={invalid || undefined}
      aria-label={id ? undefined : label}
      data-ai-id={ai}
      data-ai-type="input"
      data-ai-label={label}
    />
  );
}

export function SelectIn({
  value,
  onChange,
  options,
  readOnly,
  label,
  ai,
  invalid,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  readOnly: boolean;
  label: string;
  ai: string;
  invalid?: boolean;
  placeholder?: string;
}) {
  const opts = value && !options.some((o) => o.value === value) ? [...options, { value, label: value }] : options;
  const shown = opts.find((o) => o.value === value)?.label ?? "";
  if (readOnly) {
    return (
      <span className="stu-fe-sel is-ro" aria-label={label} data-ai-id={ai} data-ai-type="select" data-ai-label={label}>
        {shown || "—"}
      </span>
    );
  }
  return (
    <div className={`stu-fe-sel${invalid ? " is-bad" : ""}`} data-ai-id={ai} data-ai-type="select" data-ai-label={label}>
      <Select value={value} onChange={onChange} options={opts} ariaLabel={label} placeholder={placeholder ?? label} />
    </div>
  );
}

export function ChipPick({
  options,
  value,
  onChange,
  readOnly,
  label,
  ai,
  invalid,
}: {
  options: { value: string; label: string; icon?: Icon }[];
  value: string[];
  onChange: (next: string[]) => void;
  readOnly: boolean;
  label: string;
  ai: string;
  invalid?: boolean;
}) {
  const extra = value.filter((v) => !options.some((o) => o.value === v)).map((v) => ({ value: v, label: v, icon: undefined }));
  const all = [...options, ...extra];
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className={`stu-fe-chips${invalid ? " is-bad" : ""}`} role="group" aria-label={label}>
      {all.map((o) => {
        const on = value.includes(o.value);
        const G = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            className={`stu-fe-chip${on ? " on" : ""}`}
            aria-pressed={on}
            disabled={readOnly}
            onClick={() => toggle(o.value)}
            data-ai-id={aiId(ai, o.value)}
            data-ai-type="button"
            data-ai-label={o.label}
          >
            {G ? <G aria-hidden /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function TagInput({
  value,
  onChange,
  readOnly,
  label,
  placeholder,
  ai,
  normalize,
  invalid,
  mono,
  onPick,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  readOnly: boolean;
  label: string;
  placeholder: string;
  ai: string;
  normalize?: (s: string) => string;
  invalid?: boolean;
  mono?: boolean;
  onPick?: (v: string) => void;
}) {
  const { e } = useEd();
  const [draft, setDraft] = useState("");
  const clean = (s: string) => (normalize ? normalize(s) : s.trim());
  function commit() {
    const parts = draft.split(/[,\n]/).map(clean).filter(Boolean);
    if (!parts.length) return;
    onChange(uniq([...value, ...parts]));
    setDraft("");
  }
  function onKey(ev: KeyboardEvent<HTMLInputElement>) {
    if (ev.key === "Enter" || ev.key === ",") {
      ev.preventDefault();
      commit();
    } else if (ev.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }
  return (
    <div className={`stu-fe-tags${invalid ? " is-bad" : ""}${readOnly ? " is-ro" : ""}`}>
      {value.map((v) => (
        <span key={v} className={`stu-fe-tag${mono ? " stu-fe-mono" : ""}`}>
          {onPick && !readOnly ? (
            <button type="button" className="stu-fe-tag__pick" onClick={() => onPick(v)} title={e("insertVar")} data-ai-id={aiId(ai, "insert", v)} data-ai-type="button" data-ai-label={v}>
              {v}
            </button>
          ) : (
            <span>{v}</span>
          )}
          {readOnly ? null : (
            <button type="button" className="stu-fe-tag__x" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={e("removeTag", { v })} data-ai-id={aiId(ai, "remove", v)} data-ai-type="button" data-ai-label={e("removeTag", { v })}>
              <IconClose aria-hidden />
            </button>
          )}
        </span>
      ))}
      {readOnly ? (
        value.length ? null : <span className="stu-fe-tags__none">—</span>
      ) : (
        <input
          type="text"
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
          placeholder={placeholder}
          aria-label={label}
          autoComplete="off"
          spellCheck={false}
          data-ai-id={ai}
          data-ai-type="input"
          data-ai-label={label}
        />
      )}
    </div>
  );
}

export function RowTools({
  index,
  count,
  onMove,
  onRemove,
  ai,
  what,
}: {
  index: number;
  count: number;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
  ai: string;
  what: string;
}) {
  const { e } = useEd();
  return (
    <div className="stu-fe-tools">
      <button type="button" className="stu-fe-ib" onClick={() => onMove(-1)} disabled={index === 0} aria-label={e("moveUp", { what })} title={e("moveUp", { what })} data-ai-id={aiId(ai, "up")} data-ai-type="button" data-ai-label={e("moveUp", { what })}>
        <IconChevronLeft className="stu-fe-up" aria-hidden />
      </button>
      <button type="button" className="stu-fe-ib" onClick={() => onMove(1)} disabled={index >= count - 1} aria-label={e("moveDown", { what })} title={e("moveDown", { what })} data-ai-id={aiId(ai, "down")} data-ai-type="button" data-ai-label={e("moveDown", { what })}>
        <IconChevronRight className="stu-fe-up" aria-hidden />
      </button>
      <button type="button" className="stu-fe-ib stu-fe-ib--x" onClick={onRemove} aria-label={e("removeRow", { what })} title={e("removeRow", { what })} data-ai-id={aiId(ai, "remove")} data-ai-type="button" data-ai-label={e("removeRow", { what })}>
        <IconClose aria-hidden />
      </button>
    </div>
  );
}

export function AddBtn({ label, onClick, ai }: { label: string; onClick: () => void; ai: string }) {
  return (
    <button type="button" className="stu-fe-add" onClick={onClick} data-ai-id={ai} data-ai-type="button" data-ai-label={label}>
      <IconPlus aria-hidden />
      {label}
    </button>
  );
}

export function insertAt(el: HTMLInputElement | HTMLTextAreaElement | null, current: string, token: string): { text: string; caret: number } {
  const start = el && typeof el.selectionStart === "number" ? el.selectionStart : current.length;
  const end = el && typeof el.selectionEnd === "number" ? el.selectionEnd : current.length;
  const text = current.slice(0, start) + token + current.slice(end);
  return { text, caret: start + token.length };
}

export function placeCaret(el: HTMLInputElement | HTMLTextAreaElement | null, caret: number) {
  if (!el) return;
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(caret, caret);
  });
}

export function FileBox({
  code,
  file,
  onUploadFile,
  readOnly,
  error,
}: {
  code: string;
  file: StudioEditorFile | null;
  onUploadFile: ((file: File) => Promise<void>) | null;
  readOnly: boolean;
  error: string;
}) {
  const { e, ferr } = useEd();
  const errText = useStudioErrorText();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dl, setDl] = useState(false);
  const [fail, setFail] = useState("");
  const has = Boolean(file?.hasFile);
  const canUpload = !readOnly && Boolean(onUploadFile);
  async function pick(ev: ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    ev.target.value = "";
    if (!f || !onUploadFile) return;
    if (!fileExtOk(f.name)) {
      setFail(e("file.badExt", { ext: STUDIO_FILE_EXT.join(", ") }));
      return;
    }
    setFail("");
    setBusy(true);
    try {
      await onUploadFile(f);
    } catch (err) {
      const m = errText(err);
      setFail(m.text || m.title);
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    if (!file?.versionId) return;
    setDl(true);
    setFail("");
    try {
      await downloadStudioVersionFile(file.versionId, file.fileName);
    } catch (err) {
      setFail(errText(err).title);
    } finally {
      setDl(false);
    }
  }
  return (
    <div className={`stu-fe-file${has ? " has" : ""}${error && !has ? " is-bad" : ""}`}>
      <span className="stu-fe-file__ico" aria-hidden>
        {has ? <IconFileText /> : <IconUpload />}
      </span>
      <div className="stu-fe-file__m">
        <b>{has ? file?.fileName || e("file.unnamed") : e("file.none")}</b>
        <p>{has ? e("file.hasHint") : canUpload ? e("file.pickHint", { ext: STUDIO_FILE_EXT.join(", ") }) : readOnly ? e("file.roHint") : e("file.saveFirst")}</p>
      </div>
      <div className="stu-fe-file__acts">
        {has && file?.versionId ? (
          <button type="button" className="btn btn--line btn--sm" onClick={download} disabled={dl} data-ai-id={edAi(code, "file", "download")} data-ai-type="button" data-ai-label={e("file.download")}>
            {dl ? <IconRefresh className="stu-spinning" aria-hidden /> : <IconDownload aria-hidden />}
            {e("file.download")}
          </button>
        ) : null}
        {canUpload ? (
          <>
            <input ref={input} type="file" accept={STUDIO_FILE_ACCEPT} hidden onChange={pick} />
            <button type="button" className={`btn ${has ? "btn--soft" : "btn--pri"} btn--sm`} onClick={() => input.current?.click()} disabled={busy} data-ai-id={edAi(code, "file", "upload")} data-ai-type="file_dropzone" data-ai-label={has ? e("file.replace") : e("file.upload")}>
              {busy ? <IconRefresh className="stu-spinning" aria-hidden /> : <IconUpload aria-hidden />}
              {busy ? e("file.uploading") : has ? e("file.replace") : e("file.upload")}
            </button>
          </>
        ) : null}
      </div>
      {fail ? (
        <p className="stu-ferr stu-fe-file__err" role="alert">
          {fail}
        </p>
      ) : error && !has ? (
        <p className="stu-ferr stu-fe-file__err" role="alert">
          {ferr(error)}
        </p>
      ) : null}
    </div>
  );
}
