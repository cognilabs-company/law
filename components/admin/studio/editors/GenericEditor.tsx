"use client";

import { useEffect, useId, useState } from "react";
import { humanize } from "@/lib/labels";
import { getStudioReference, type StudioConstructor, type StudioFieldErrors, type StudioReferenceItem } from "@/lib/services/studio";
import { useStudioText } from "../bits";
import { errorFor, requiredErrors, type StudioEditorProps, type StudioPayload } from "./types";
import { IconAlert } from "@/components/icons";
import { PayloadSummary } from "../PayloadSummary";

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

function referenceKey(name: string): string {
  const map: Record<string, string> = { service_id: "services", category_id: "service-categories", template_id: "document-templates", package_id: "promotion-packages", user_id: "users", constructor_code: "studio-constructors" };
  return map[name.toLowerCase()] ?? "";
}

function ReferenceSelect({ value, source, onChange, readOnly, label, required, bad, aiId }: { value: unknown; source: string; onChange: (v: unknown) => void; readOnly: boolean; label: string; required: boolean; bad: boolean; aiId: string }) {
  const { t } = useStudioText();
  const [state, setState] = useState<{ phase: "loading" | "ready" | "error"; items: StudioReferenceItem[] }>({ phase: "loading", items: [] });
  useEffect(() => {
    const controller = new AbortController();
    getStudioReference(source, "", 50, controller.signal).then((items) => setState({ phase: "ready", items })).catch(() => {
      if (!controller.signal.aborted) setState({ phase: "error", items: [] });
    });
    return () => controller.abort();
  }, [source]);
  const current = value == null ? "" : String(value);
  const hasCurrent = state.items.some((item) => item.value === current);
  return (
    <select value={current} onChange={(event) => onChange(event.target.value)} disabled={readOnly || state.phase !== "ready"} aria-invalid={bad} aria-required={required} data-ai-id={aiId} data-ai-type="select" data-ai-label={label}>
      <option value="">{state.phase === "loading" ? t("generic.referenceLoading") : state.phase === "error" ? t("generic.referenceError") : t("generic.referencePick")}</option>
      {current && !hasCurrent ? <option value={current}>{t("generic.referenceSelected")}</option> : null}
      {state.items.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select>
  );
}

export function genericEmptyPayload(constructor: StudioConstructor | null): StudioPayload {
  const out: StudioPayload = {};
  for (const f of constructor?.schema.fields ?? []) out[f] = emptyFor(f);
  return out;
}

export function genericValidate(payload: StudioPayload, constructor: StudioConstructor | null): StudioFieldErrors {
  return requiredErrors(payload, constructor?.schema.required ?? []);
}

function JsonBox({
  id,
  value,
  onChange,
  readOnly,
  label,
  aiId,
}: {
  id: string;
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly: boolean;
  label: string;
  aiId?: string;
}) {
  const { t } = useStudioText();
  const object = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  const list = Array.isArray(value) ? value : null;
  const scalar = (item: unknown) => item === null || item === undefined ? "" : typeof item === "string" || typeof item === "number" ? String(item) : "";
  const updateObject = (key: string, next: string) => onChange({ ...(object || {}), [key]: next });
  const updateList = (index: number, next: string) => onChange((list || []).map((item, itemIndex) => itemIndex === index ? next : item));
  return (
    <div id={id} className="stu-structured" aria-label={label} data-ai-id={aiId} data-ai-type="group" data-ai-label={label}>
      {object ? Object.entries(object).map(([key, item]) => (
        <label className="stu-structured__row" key={key}>
          <span>{t.has(`field.${key}`) ? t(`field.${key}`) : humanize(key)}</span>
          {item && typeof item === "object" ? <PayloadSummary payload={item as Record<string, unknown>} compact /> : <input value={scalar(item)} onChange={(event) => updateObject(key, event.target.value)} readOnly={readOnly} />}
        </label>
      )) : list ? list.map((item, index) => (
        <label className="stu-structured__row" key={index}>
          <span>{t("generic.item", { n: index + 1 })}</span>
          {item && typeof item === "object" ? <PayloadSummary payload={item as Record<string, unknown>} compact /> : <input value={scalar(item)} onChange={(event) => updateList(index, event.target.value)} readOnly={readOnly} />}
        </label>
      )) : <p className="stu-hint">{t("generic.noData")}</p>}
    </div>
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
  const reference = referenceKey(name);
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
        </label>
      ) : (
        <>
          <label className="stu-fld__l" htmlFor={id}>
            <span>
              {label}
              {required ? <i className="stu-req" aria-hidden>*</i> : null}
            </span>
          </label>
          {reference ? (
            <ReferenceSelect value={value} source={reference} onChange={onChange} readOnly={readOnly} label={label} required={required} bad={bad} aiId={aiId} />
          ) : kind === "json" ? (
            <JsonBox id={id} value={value ?? emptyFor(name)} onChange={onChange} readOnly={readOnly} label={label} aiId={aiId} />
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
  const schemaFields = constructor?.schema.fields ?? [];
  const noSchema = schemaFields.length === 0;
  const required = new Set(constructor?.schema.required ?? []);
  const extra = Object.keys(payload).filter((k) => !schemaFields.includes(k));
  const known = new Set([...schemaFields, ...extra]);
  const orphan = Object.entries(errors).filter(([k]) => {
    const root = k.split(/[.[]/)[0];
    return !known.has(root);
  });
  const set = (name: string, v: unknown) => onChange({ ...payload, [name]: v });

  return (
    <div className="stu-gen" data-ai-id="admin.studio.editor.generic" data-ai-type="editor" data-ai-label={t("generic.title")}>
      <div className="stu-gen__bar">
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
                {k !== "_" ? <span>{t.has(`field.${k}`) ? t(`field.${k}`) : humanize(k)}</span> : null}
                {fieldErr(v)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

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
          {noSchema && !extra.length ? <><p className="stu-hint">{t("generic.noSchema")}</p><PayloadSummary payload={payload} /></> : null}
        </>
    </div>
  );
}
