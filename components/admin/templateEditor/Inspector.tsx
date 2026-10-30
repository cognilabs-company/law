"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import Select, { type Option } from "@/components/Select";
import CheckBox from "@/components/CheckBox";
import DatePicker from "@/components/DatePicker";
import FieldError from "@/components/ui/FieldError";
import {
  KEY_RE,
  TEMPLATE_CATEGORIES,
  TEMPLATE_LANGUAGES,
  TEMPLATE_VISIBILITIES,
  type EditorField,
  type EditorIssue,
  type EditorMeta,
  type EditorOption,
  type EditorSection,
} from "@/lib/services/templateEditor";
import { humanize } from "@/lib/labels";
import { cleanKeyInput, cleanSlugInput, fieldsOf, toKey } from "./model";
import { IconCheck, IconFileText, IconPlus, IconTrash } from "@/components/icons";

type IssueText = (x: EditorIssue) => string;

function withCurrent(list: string[], current: string): string[] {
  return current && !list.includes(current) ? [...list, current] : list;
}

function numInput(v: unknown): string {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : typeof v === "string" ? v : "";
}

function parseNum(raw: string): number | null {
  const s = raw.replace(",", ".").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function MetaInspector({ meta, onChange }: { meta: EditorMeta; onChange: (patch: Partial<EditorMeta>) => void }) {
  const t = useTranslations("admin.templateEditor");
  const ti = useTranslations("admin.templates.import");
  const id = useId();
  const cats: Option[] = withCurrent(TEMPLATE_CATEGORIES, meta.category).map((c) => ({ value: c, label: ti.has(`cats.${c}`) ? ti(`cats.${c}`) : c }));
  const langs: Option[] = withCurrent(TEMPLATE_LANGUAGES, meta.language).map((c) => ({ value: c, label: ti.has(`langs.${c}`) ? ti(`langs.${c}`) : c }));
  const vis: Option[] = withCurrent(TEMPLATE_VISIBILITIES, meta.visibility).map((c) => ({ value: c, label: t.has(`vis.${c}`) ? t(`vis.${c}`) : c }));
  const slugBad = !meta.slug.trim();
  const titleBad = !meta.title.trim();
  return (
    <div className="tpe-form">
      <p className="tpe-form__lead">{t("meta.lead")}</p>
      <div className="tpe-fld">
        <label htmlFor={`${id}t`}>{t("meta.title")}</label>
        <input id={`${id}t`} value={meta.title} onChange={(e) => onChange({ title: e.target.value })} aria-invalid={titleBad || undefined} aria-describedby={titleBad ? `${id}te` : undefined} />
        <FieldError id={`${id}te`} msg={titleBad ? t("meta.titleRequired") : null} />
      </div>
      <div className="tpe-fld">
        <label htmlFor={`${id}s`}>{t("meta.slug")}</label>
        <input id={`${id}s`} value={meta.slug} onChange={(e) => onChange({ slug: cleanSlugInput(e.target.value) })} aria-invalid={slugBad || undefined} aria-describedby={`${id}sh`} spellCheck={false} />
        <p className="tpe-hint" id={`${id}sh`}>{slugBad ? t("meta.slugRequired") : t("meta.slugHint")}</p>
      </div>
      <div className="tpe-row2">
        <div className="tpe-fld">
          <label id={`${id}cl`}>{t("meta.category")}</label>
          <Select value={meta.category} onChange={(v) => onChange({ category: v })} options={cats} labelId={`${id}cl`} placeholder={t("meta.pick")} />
        </div>
        <div className="tpe-fld">
          <label id={`${id}ll`}>{t("meta.language")}</label>
          <Select value={meta.language} onChange={(v) => onChange({ language: v })} options={langs} labelId={`${id}ll`} placeholder={t("meta.pick")} />
        </div>
      </div>
      <div className="tpe-row2">
        <div className="tpe-fld">
          <label htmlFor={`${id}p`}>{t("meta.price")}</label>
          <input id={`${id}p`} inputMode="numeric" value={meta.price ? String(meta.price) : ""} placeholder="0" onChange={(e) => onChange({ price: parseInt(e.target.value.replace(/\D/g, "") || "0", 10) || 0 })} />
        </div>
        <div className="tpe-fld">
          <label id={`${id}vl`}>{t("meta.visibility")}</label>
          <Select value={meta.visibility} onChange={(v) => onChange({ visibility: v })} options={vis} labelId={`${id}vl`} />
        </div>
      </div>
      <div className="tpe-fld">
        <label htmlFor={`${id}d`}>{t("meta.description")}</label>
        <textarea id={`${id}d`} rows={3} value={meta.description} onChange={(e) => onChange({ description: e.target.value })} />
      </div>
    </div>
  );
}

export function SectionInspector({
  section,
  fields,
  issues,
  issueText,
  onChange,
  onDelete,
  onAddField,
}: {
  section: EditorSection;
  fields: EditorField[];
  issues: EditorIssue[];
  issueText: IssueText;
  onChange: (patch: Partial<EditorSection>) => void;
  onDelete: () => void;
  onAddField: () => void;
}) {
  const t = useTranslations("admin.templateEditor");
  const id = useId();
  const count = fieldsOf(fields, section.id).length;
  return (
    <div className="tpe-form">
      <div className="tpe-fld">
        <label htmlFor={`${id}t`}>{t("section.title")}</label>
        <input id={`${id}t`} value={section.title} onChange={(e) => onChange({ title: e.target.value })} />
      </div>
      <div className="tpe-fld">
        <label htmlFor={`${id}d`}>{t("section.description")}</label>
        <textarea id={`${id}d`} rows={3} value={section.description} onChange={(e) => onChange({ description: e.target.value })} />
      </div>
      <dl className="tpe-facts">
        <div>
          <dt>{t("section.id")}</dt>
          <dd>
            <code>{section.id}</code>
          </dd>
        </div>
        <div>
          <dt>{t("section.fields")}</dt>
          <dd>{count}</dd>
        </div>
      </dl>
      <p className="tpe-hint">{t("section.idHint")}</p>
      {issues.length ? (
        <ul className="tpe-issues">
          {issues.map((x, i) => (
            <li key={i} className={`tpe-issue tpe-issue--${x.level}`}>
              {issueText(x)}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="tpe-form__acts">
        <button type="button" className="btn btn--soft btn--sm" onClick={onAddField}>
          <IconPlus />
          {t("nav.addField")}
        </button>
        <button type="button" className="btn btn--line btn--sm tpe-danger" onClick={onDelete}>
          <IconTrash />
          {t("section.delete")}
        </button>
      </div>
    </div>
  );
}

export function FieldInspector({
  field,
  fields,
  sections,
  fieldTypes,
  issues,
  issueText,
  canInsert,
  onChange,
  onMoveTo,
  onDelete,
  onInsert,
}: {
  field: EditorField;
  fields: EditorField[];
  sections: EditorSection[];
  fieldTypes: string[];
  issues: EditorIssue[];
  issueText: IssueText;
  canInsert: boolean;
  onChange: (patch: Partial<EditorField>) => void;
  onMoveTo: (sectionId: string) => void;
  onDelete: () => void;
  onInsert: () => void;
}) {
  const t = useTranslations("admin.templateEditor");
  const tc = useTranslations("common");
  const id = useId();
  const typeOpts: Option[] = withCurrent(fieldTypes, field.type).map((x) => ({ value: x, label: t.has(`types.${x}`) ? t(`types.${x}`) : humanize(x) }));
  const secOpts: Option[] = sections.map((s) => ({ value: s.id, label: s.title || t("nav.unnamedSection") }));
  const dup = Boolean(field.key) && fields.some((f) => f.uid !== field.uid && f.key === field.key);
  const keyErr = !field.key ? t("field.keyRequired") : !KEY_RE.test(field.key) ? t("field.keyInvalid") : dup ? t("field.keyDuplicate") : "";
  const labelErr = field.label.trim() ? "" : t("field.labelRequired");
  const placeable = Boolean(field.insertText) && field.savedKey === field.key;
  const keyChanged = Boolean(field.insertText) && Boolean(field.savedKey) && field.savedKey !== field.key;
  const v = field.validation;
  const setV = (k: string, raw: string) => {
    const n = parseNum(raw);
    const next = { ...v };
    if (n === null) delete next[k];
    else next[k] = n;
    onChange({ validation: next });
  };
  const textual = field.type === "text" || field.type === "textarea" || field.type === "phone" || field.type === "email";
  const opts = field.options;
  const setOpt = (i: number, patch: Partial<EditorOption>) => onChange({ options: opts.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  const optsEmpty = field.type === "select" && !opts.some((o) => o.value.trim());
  const dv = field.defaultValue;

  function onLabel(label: string) {
    onChange(field.autoKey ? { label, key: toKey(label) } : { label });
  }

  return (
    <div className="tpe-form">
      <div className="tpe-fld">
        <label htmlFor={`${id}l`}>{t("field.label")}</label>
        <input id={`${id}l`} value={field.label} onChange={(e) => onLabel(e.target.value)} aria-invalid={Boolean(labelErr) || undefined} aria-describedby={labelErr ? `${id}le` : undefined} />
        <FieldError id={`${id}le`} msg={labelErr || null} />
      </div>
      <div className="tpe-fld">
        <label htmlFor={`${id}k`}>{t("field.key")}</label>
        <input
          id={`${id}k`}
          className="tpe-mono"
          value={field.key}
          spellCheck={false}
          autoCapitalize="off"
          onChange={(e) => onChange({ key: cleanKeyInput(e.target.value), autoKey: false })}
          aria-invalid={Boolean(keyErr) || undefined}
          aria-describedby={`${id}kh${keyErr ? ` ${id}ke` : ""}`}
        />
        <p className="tpe-hint" id={`${id}kh`}>{t("field.keyHint")}</p>
        <FieldError id={`${id}ke`} msg={keyErr || null} />
        {keyChanged ? <p className="tpe-warn">{t("field.keyChanged", { old: field.insertText })}</p> : null}
      </div>
      <div className="tpe-row2">
        <div className="tpe-fld">
          <label id={`${id}tl`}>{t("field.type")}</label>
          <Select value={field.type} onChange={(x) => onChange({ type: x, defaultValue: null })} options={typeOpts} labelId={`${id}tl`} />
        </div>
        <div className="tpe-fld">
          <label id={`${id}sl`}>{t("field.section")}</label>
          <Select value={sections.some((s) => s.id === field.sectionId) ? field.sectionId : ""} onChange={onMoveTo} options={secOpts} labelId={`${id}sl`} placeholder={t("field.pickSection")} />
        </div>
      </div>
      <CheckBox checked={field.required} onChange={(on) => onChange({ required: on })}>
        {t("field.required")}
      </CheckBox>
      <div className="tpe-fld">
        <label htmlFor={`${id}h`}>{t("field.help")}</label>
        <textarea id={`${id}h`} rows={2} value={field.helpText} onChange={(e) => onChange({ helpText: e.target.value })} />
      </div>

      {field.type === "select" ? (
        <fieldset className="tpe-opts">
          <legend>{t("field.options")}</legend>
          {opts.map((o, i) => (
            <div className="tpe-opt" key={i}>
              <input value={o.value} placeholder={t("field.optValue")} aria-label={`${t("field.optValue")} ${i + 1}`} onChange={(e) => setOpt(i, { value: e.target.value })} />
              <input value={o.label} placeholder={t("field.optLabel")} aria-label={`${t("field.optLabel")} ${i + 1}`} onChange={(e) => setOpt(i, { label: e.target.value })} />
              <button type="button" className="tpe-ib tpe-ib--danger" onClick={() => onChange({ options: opts.filter((_, j) => j !== i) })} aria-label={t("field.optRemove")} title={t("field.optRemove")}>
                <IconTrash />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn--line btn--sm" onClick={() => onChange({ options: [...opts, { value: "", label: "" }] })}>
            <IconPlus />
            {t("field.optAdd")}
          </button>
          {optsEmpty ? <p className="tpe-warn" role="alert">{t("field.optsRequired")}</p> : null}
        </fieldset>
      ) : null}

      <div className="tpe-fld">
        <span className="tpe-lbl" id={`${id}dl`}>{t("field.default")}</span>
        {field.type === "checkbox" ? (
          <CheckBox checked={dv === true || dv === "true"} onChange={(on) => onChange({ defaultValue: on ? true : null })}>
            {t("field.defaultChecked")}
          </CheckBox>
        ) : field.type === "select" ? (
          <Select
            value={dv == null ? "" : String(dv)}
            onChange={(x) => onChange({ defaultValue: x || null })}
            options={[{ value: "", label: t("field.noDefault") }, ...opts.filter((o) => o.value.trim()).map((o) => ({ value: o.value, label: o.label || o.value }))]}
            labelId={`${id}dl`}
          />
        ) : field.type === "date" ? (
          <DatePicker
            value={dv == null || typeof dv === "boolean" ? "" : String(dv)}
            onChange={(x) => onChange({ defaultValue: x === "" ? null : x })}
            placeholder={tc("pickDate")}
            ariaLabel={t("field.default")}
          />
        ) : (
          <input
            type="text"
            inputMode={field.type === "number" ? "decimal" : undefined}
            value={dv == null || typeof dv === "boolean" ? "" : String(dv)}
            onChange={(e) => onChange({ defaultValue: e.target.value === "" ? null : e.target.value })}
            aria-labelledby={`${id}dl`}
          />
        )}
      </div>

      {textual || field.type === "number" ? (
        <div className="tpe-row2">
          <div className="tpe-fld">
            <label htmlFor={`${id}v1`}>{textual ? t("field.minLength") : t("field.min")}</label>
            <input id={`${id}v1`} inputMode="decimal" value={numInput(textual ? v.min_length : v.min)} onChange={(e) => setV(textual ? "min_length" : "min", e.target.value)} />
          </div>
          <div className="tpe-fld">
            <label htmlFor={`${id}v2`}>{textual ? t("field.maxLength") : t("field.max")}</label>
            <input id={`${id}v2`} inputMode="decimal" value={numInput(textual ? v.max_length : v.max)} onChange={(e) => setV(textual ? "max_length" : "max", e.target.value)} />
          </div>
        </div>
      ) : null}

      <div className="tpe-ph">
        <span className="tpe-lbl">{t("field.placeholder")}</span>
        {placeable ? (
          <div className="tpe-ph__row">
            <code className="tpe-ph__code">{field.insertText}</code>
            <button type="button" className="btn btn--pri btn--sm" onClick={onInsert} disabled={!canInsert}>
              <IconFileText />
              {t("nav.insert")}
            </button>
          </div>
        ) : (
          <p className="tpe-hint">{t("field.placeholderWait")}</p>
        )}
      </div>

      {issues.length ? (
        <ul className="tpe-issues">
          {issues.map((x, i) => (
            <li key={i} className={`tpe-issue tpe-issue--${x.level}`}>
              {issueText(x)}
            </li>
          ))}
        </ul>
      ) : field.key && placeable ? (
        <p className="tpe-ok">
          <IconCheck />
          {t("field.ready")}
        </p>
      ) : null}

      <div className="tpe-form__acts">
        <button type="button" className="btn btn--line btn--sm tpe-danger" onClick={onDelete}>
          <IconTrash />
          {t("field.delete")}
        </button>
      </div>
    </div>
  );
}
