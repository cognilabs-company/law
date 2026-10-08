"use client";

import { useId, useState } from "react";
import { humanize } from "@/lib/labels";
import type { StudioConstructor, StudioFieldErrors } from "@/lib/services/studio";
import { useStudioText } from "../bits";
import { STUDIO_ERR, errorFor, requiredErrors, type StudioEditorProps, type StudioPayload } from "./types";
import { IconAlert, IconDocLines, IconList } from "@/components/icons";

type Kind = "text" | "textarea" | "json" | "bool" | "number";

const LIST_NAMES = new Set([
  "fields",
  "clauses",
  "sections",
  "items",
  "steps",
  "channels",
  "variables",
  "audience_roles",
  "conditional_rules",
  "rules",
  "tags",
  "options",
  "questions",
  "packages",
  "tiers",
  "documents",
  "checklist",
  "faq",
  "keywords",
  "roles",
  "dependencies",
]);
const OBJECT_NAMES = new Set(["messages", "meta", "settings", "config", "pricing", "schedule", "translations", "routing", "limits"]);
const LONG_RE = /(text|description|body|content|summary|notes?|answer|instruction|prompt|html|markdown)$/;
const BOOL_RE = /^(is_|has_|allow_|enable|enabled$|active$|required$)|_required$|_enabled$|_allowed$/;
const NUM_RE = /(_count|_days|_hours|_minutes|_seconds|_price|_amount|_percent|_limit|_min|_max|^price|^amount|^order$|^priority$|^weight$)/;

export function fieldKind(name: string, value: unknown): Kind {
  if (Array.isArray(value) || (value && typeof value === "object")) return "json";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return "number";
  const n = name.toLowerCase();
  if (LIST_NAMES.has(n) || OBJECT_NAMES.has(n)) return "json";
  if (BOOL_RE.test(n)) return "bool";
  if (NUM_RE.test(n)) return "number";
  if (LONG_RE.test(n)) return "textarea";
  return "text";
}

function emptyFor(name: string): unknown {
  const kind = fieldKind(name, undefined);
  if (kind === "json") return OBJECT_NAMES.has(name.toLowerCase()) ? {} : [];
  if (kind === "bool") return false;
  return "";
}

export function genericEmptyPayload(constructor: StudioConstructor | null): StudioPayload {
  const out: StudioPayload = {};
  for (const f of constructor?.schema.fields ?? []) out[f] = emptyFor(f);
  return out;
}

export function genericValidate(payload: StudioPayload, constructor: StudioConstructor | null): StudioFieldErrors {
  return requiredErrors(payload, constructor?.schema.required ?? []);
}

const pretty = (v: unknown) => {
  try {
    return JSON.stringify(v ?? null, null, 2);
  } catch {
    return "";
  }
};

function JsonBox({
  id,
  value,
  onChange,
  readOnly,
  expect,
  invalid,
  rows = 6,
  label,
  aiId,
}: {
  id: string;
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly: boolean;
  expect: "any" | "object";
  invalid?: boolean;
  rows?: number;
  label: string;
  aiId?: string;
}) {
  const { fieldErr } = useStudioText();
  const shown = pretty(value);
  const [text, setText] = useState(shown);
  const [synced, setSynced] = useState(shown);
  const [bad, setBad] = useState("");
  if (shown !== synced) {
    setSynced(shown);
    setText(shown);
    setBad("");
  }
  function edit(next: string) {
    setText(next);
    if (!next.trim()) {
      const blank = expect === "object" ? {} : null;
      setBad("");
      setSynced(pretty(blank));
      onChange(blank);
      return;
    }
    try {
      const parsed: unknown = JSON.parse(next);
      if (expect === "object" && (!parsed || typeof parsed !== "object" || Array.isArray(parsed))) {
        setBad(STUDIO_ERR.object);
        return;
      }
      setBad("");
      setSynced(pretty(parsed));
      onChange(parsed);
    } catch {
      setBad(STUDIO_ERR.json);
    }
  }
  return (
    <>
      <textarea
        id={id}
        className="stu-json"
        value={text}
        onChange={(e) => edit(e.target.value)}
        readOnly={readOnly}
        rows={rows}
        spellCheck={false}
        aria-invalid={Boolean(bad) || invalid}
        aria-label={label}
        data-ai-id={aiId}
        data-ai-type={aiId ? "textarea" : undefined}
        data-ai-label={label}
      />
      {bad ? (
        <p className="stu-ferr" role="alert">
          {fieldErr(bad)}
        </p>
      ) : null}
    </>
  );
}

function Field({
  name,
  value,
  required,
  error,
  readOnly,
  onChange,
}: {
  name: string;
  value: unknown;
  required: boolean;
  error: string;
  readOnly: boolean;
  onChange: (v: unknown) => void;
}) {
  const { t, fieldErr } = useStudioText();
  const uid = useId();
  const id = `${uid}-${name}`;
  const kind = fieldKind(name, value);
  const label = t.has(`field.${name}`) ? t(`field.${name}`) : humanize(name);
  const aiId = `admin.studio.editor.field.${name.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
  const bad = Boolean(error);
  return (
    <div className={`stu-fld stu-fld--${kind}`}>
      {kind === "bool" ? (
        <label className="stu-check" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            disabled={readOnly}
            data-ai-id={aiId}
            data-ai-type="input"
            data-ai-label={label}
          />
          <span>
            {label}
            {required ? <i className="stu-req" aria-hidden>*</i> : null}
          </span>
          <code>{name}</code>
        </label>
      ) : (
        <>
          <label className="stu-fld__l" htmlFor={id}>
            <span>
              {label}
              {required ? <i className="stu-req" aria-hidden>*</i> : null}
            </span>
            <code>{name}</code>
          </label>
          {kind === "json" ? (
            <JsonBox id={id} value={value ?? emptyFor(name)} onChange={onChange} readOnly={readOnly} expect="any" invalid={bad} label={label} aiId={aiId} />
          ) : kind === "textarea" ? (
            <textarea
              id={id}
              value={typeof value === "string" ? value : value == null ? "" : String(value)}
              onChange={(e) => onChange(e.target.value)}
              readOnly={readOnly}
              rows={5}
              aria-invalid={bad}
              aria-required={required}
              data-ai-id={aiId}
              data-ai-type="textarea"
              data-ai-label={label}
            />
          ) : (
            <input
              id={id}
              type={kind === "number" ? "number" : "text"}
              inputMode={kind === "number" ? "decimal" : undefined}
              value={value == null ? "" : String(value)}
              onChange={(e) => {
                const v = e.target.value;
                if (kind !== "number") return onChange(v);
                const n = parseFloat(v);
                onChange(v === "" ? "" : Number.isFinite(n) ? n : v);
              }}
              readOnly={readOnly}
              autoComplete="off"
              aria-invalid={bad}
              aria-required={required}
              data-ai-id={aiId}
              data-ai-type="input"
              data-ai-label={label}
            />
          )}
        </>
      )}
      {error ? (
        <p className="stu-ferr" role="alert">
          {fieldErr(error)}
        </p>
      ) : null}
    </div>
  );
}

export default function GenericEditor({ constructor, payload, onChange, errors, readOnly }: StudioEditorProps) {
  const { t, fieldErr } = useStudioText();
  const uid = useId();
  const schemaFields = constructor?.schema.fields ?? [];
  const required = new Set(constructor?.schema.required ?? []);
  const extra = Object.keys(payload).filter((k) => !schemaFields.includes(k));
  const noSchema = schemaFields.length === 0;
  const [mode, setMode] = useState<"form" | "json">(noSchema && extra.length === 0 ? "json" : "form");
  const known = new Set([...schemaFields, ...extra]);
  const orphan = Object.entries(errors).filter(([k]) => {
    const root = k.split(/[.[]/)[0];
    return !known.has(root);
  });
  const set = (name: string, v: unknown) => onChange({ ...payload, [name]: v });

  return (
    <div className="stu-gen" data-ai-id="admin.studio.editor.generic" data-ai-type="editor" data-ai-label={t("generic.title")}>
      <div className="stu-gen__bar">
        <div className="stu-seg" role="tablist" aria-label={t("generic.view")}>
          <button type="button" role="tab" aria-selected={mode === "form"} className="stu-seg__b" onClick={() => setMode("form")} data-ai-id="admin.studio.editor.view.form" data-ai-type="tab" data-ai-label={t("actions.formView")}>
            <IconList aria-hidden />
            {t("actions.formView")}
          </button>
          <button type="button" role="tab" aria-selected={mode === "json"} className="stu-seg__b" onClick={() => setMode("json")} data-ai-id="admin.studio.editor.view.json" data-ai-type="tab" data-ai-label={t("actions.jsonView")}>
            <IconDocLines aria-hidden />
            {t("actions.jsonView")}
          </button>
        </div>
        {required.size ? (
          <small className="stu-gen__req">
            <i className="stu-req" aria-hidden>*</i> {t("generic.requiredHint")}
          </small>
        ) : null}
      </div>

      {orphan.length ? (
        <ul className="stu-gen__errs" role="alert">
          {orphan.map(([k, v]) => (
            <li key={k}>
              <IconAlert aria-hidden />
              <span>
                {k !== "_" ? <code>{k}</code> : null}
                {fieldErr(v)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {mode === "json" ? (
        <div className="stu-fld">
          <label className="stu-fld__l" htmlFor={`${uid}-all`}>
            <span>{t("generic.wholePayload")}</span>
          </label>
          <JsonBox id={`${uid}-all`} value={payload} onChange={(v) => onChange((v && typeof v === "object" && !Array.isArray(v) ? v : {}) as StudioPayload)} readOnly={readOnly} expect="object" rows={18} label={t("generic.wholePayload")} aiId="admin.studio.editor.json" />
          <p className="stu-hint">{noSchema ? t("generic.noSchema") : t("generic.jsonHint")}</p>
        </div>
      ) : (
        <>
          {schemaFields.length ? (
            <div className="stu-gen__grid">
              {schemaFields.map((f) => (
                <Field key={f} name={f} value={payload[f]} required={required.has(f)} error={errorFor(errors, f)} readOnly={readOnly} onChange={(v) => set(f, v)} />
              ))}
            </div>
          ) : null}
          {extra.length ? (
            <section className="stu-gen__extra">
              <h4>{t("generic.extra")}</h4>
              <div className="stu-gen__grid">
                {extra.map((f) => (
                  <Field key={f} name={f} value={payload[f]} required={false} error={errorFor(errors, f)} readOnly={readOnly} onChange={(v) => set(f, v)} />
                ))}
              </div>
            </section>
          ) : null}
          {!schemaFields.length && !extra.length ? <p className="stu-hint">{t("generic.noSchema")}</p> : null}
        </>
      )}
    </div>
  );
}
