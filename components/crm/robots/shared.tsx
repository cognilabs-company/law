"use client";

import "./robots.css";
import { useEffect, useState, useSyncExternalStore, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Hash, Plus, ShieldAlert, X } from "lucide-react";
import CheckBox from "@/components/CheckBox";
import { isAborted, logApiError } from "@/lib/http";
import { fmtDateTime } from "@/lib/date";
import { listCrmLeads, listCrmOperators, listCrmTemplates, type CrmLead, type CrmMeta, type CrmOperator, type CrmTemplate } from "@/lib/services/crm";
import { getAutomationCatalog, humanKey, readableRows, type AutomationCatalog, type CatalogAction, type CatalogField, type Dict } from "@/lib/services/crmAutomation";
import { LookupPicker } from "../LookupPicker";
import { CrmDateTime, CrmSelect } from "../fields";
import { useStatusLabel } from "../bits";

// Shared pieces of the robot pages: the catalog store, readable labels,
// the catalog-driven field renderer and the lead picker for dry runs.

// ── Catalog (one request per visit, shared by every robot page) ──
type CatState = { data: AutomationCatalog | null; error: unknown };
let cat: CatState = { data: null, error: null };
let catReq: Promise<void> | null = null;
const catSubs = new Set<() => void>();
export function loadCatalog(force = false): Promise<void> {
  if (catReq && !force) return catReq;
  catReq = getAutomationCatalog()
    .then((d) => {
      cat = { data: d, error: null };
    })
    .catch((e) => {
      if (!isAborted(e)) logApiError("crm.automation.catalog", e);
      cat = { data: cat.data, error: e };
      catReq = null;
    })
    .finally(() => catSubs.forEach((f) => f()));
  return catReq;
}
export function useCatalog(): CatState {
  const s = useSyncExternalStore(
    (f) => {
      catSubs.add(f);
      return () => catSubs.delete(f);
    },
    () => cat,
    () => cat,
  );
  useEffect(() => {
    if (!s.data && !s.error) void loadCatalog();
  }, [s.data, s.error]);
  return s;
}

// ── Labels: the backend's own words first, a readable form of the key after ──
export const triggerLabel = (c: AutomationCatalog | null, key: string): string => c?.triggers.find((x) => x.key === key)?.label || humanKey(key);
export const actionOf = (c: AutomationCatalog | null, key: string): CatalogAction | undefined => c?.actions.find((x) => x.key === key);
export const actionLabel = (c: AutomationCatalog | null, key: string): string => actionOf(c, key)?.label || humanKey(key);
export const optLabel = (o: { value: string; label: string }): string => o.label || humanKey(o.value);

export function useRuleStatus(): (s: string) => string {
  const t = useTranslations("rop.robots.status");
  return (s) => (t.has(s) ? t(s) : humanKey(s));
}
export function useRunStatus(): (s: string) => string {
  const t = useTranslations("rop.runs.status");
  return (s) => (t.has(s) ? t(s) : humanKey(s));
}
export const statusTone = (s: string): "ok" | "warn" | "bad" | "blue" | "" =>
  /^(active|completed|succeeded|success|approved|sent|delivered)$/.test(s) ? "ok" : /^(failed|partially_failed|error|rejected)$/.test(s) ? "bad" : /^(paused|pending_approval|waiting|scheduled|queued|draft|waiting_approval)$/.test(s) ? "warn" : /^(running|retrying)$/.test(s) ? "blue" : "";

export function ApprovalBadge({ action }: { action: CatalogAction | undefined }): ReactElement | null {
  const t = useTranslations("rop.robots");
  if (!action || (!action.approvalRequired && !action.clientFacing && action.risk !== "high")) return null;
  return (
    <span className={`rop-pill ${action.approvalRequired ? "rop-pill--warn" : "rop-pill--bad"}`} title={action.approvalRequired ? t("approvalHint") : t("riskHint")}>
      <ShieldAlert aria-hidden="true" />
      {action.approvalRequired ? t("approval") : t("highRisk")}
    </span>
  );
}

// A step's input/output or a draft payload as label · value lines.
// A payload or step field by its own name: the known ones translated, any
// other as readable words (never a raw key).
export function usePayloadLabel(): (k: string) => string {
  const t = useTranslations("rop.payload");
  return (k) => (t.has(k) ? t(k) : humanKey(k));
}
export function Readable({ data }: { data: Dict }): ReactElement {
  const t = useTranslations("rop");
  const locale = useLocale();
  const label = usePayloadLabel();
  const rows = readableRows(data, "", label);
  if (!rows.length) return <p className="rop-muted">{t("nothing")}</p>;
  return (
    <dl className="rop-kv">
      {rows.map((r, i) => (
        <div key={`${r.label}${i}`} style={{ display: "contents" }}>
          <dt>{r.label}</dt>
          <dd>{r.value === "✓" ? t("yes") : r.value === "—" ? t("no") : /^\d{4}-\d{2}-\d{2}T/.test(r.value) ? fmtDateTime(r.value, locale) : r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── The lead picker for previews and dry runs (searchable, never an id input) ──
export function LeadPicker({ value, onChange, labelId }: { value: CrmLead | null; onChange: (l: CrmLead | null) => void; labelId?: string }): ReactElement {
  const t = useTranslations("rop.robots");
  const ts = useStatusLabel();
  return (
    <LookupPicker<CrmLead>
      value={value}
      onChange={onChange}
      labelId={labelId}
      load={async (q, offset, signal) => {
        const p = await listCrmLeads({ q, offset, limit: 20 }, signal);
        return { items: p.items, hasMore: offset + p.items.length < p.total };
      }}
      title={(l) => l.title || l.workId}
      sub={(l) => [l.workId, l.customer?.name, ts(l.status)].filter(Boolean).join(" · ")}
      text={{ placeholder: t("pickLead"), search: t("searchLead"), searchPh: t("searchLeadPh"), empty: t("noLeads") }}
      action={value ? { label: t("clearLead"), icon: <X />, run: () => onChange(null) } : undefined}
    />
  );
}

// ── Catalog-driven fields (§16: nothing hard-coded) ──
type Lookups = { ops: CrmOperator[]; templates: CrmTemplate[] };
let lookups: Lookups | null = null;
let lookReq: Promise<Lookups> | null = null;
function useLookups(need: boolean): Lookups {
  const [v, setV] = useState<Lookups>(lookups ?? { ops: [], templates: [] });
  useEffect(() => {
    if (!need || lookups) return;
    lookReq ??= Promise.allSettled([listCrmOperators(""), listCrmTemplates({})]).then(([o, tp]) => {
      lookups = { ops: o.status === "fulfilled" ? o.value : [], templates: tp.status === "fulfilled" ? tp.value : [] };
      return lookups;
    });
    let live = true;
    void lookReq.then((x) => live && setV(x));
    return () => {
      live = false;
    };
  }, [need]);
  return v;
}

const TEXTY = /^(text|string|str|url)$/;
export function FieldInput({ field, value, onChange, meta, idBase }: { field: CatalogField; value: unknown; onChange: (v: unknown) => void; meta: CrmMeta; idBase: string }): ReactElement {
  const t = useTranslations("rop.robots");
  const ts = useStatusLabel();
  const tl = useTranslations("crm.lang");
  const type = field.type;
  const isPerson = /operator|user|owner|assignee/.test(type);
  const isTemplate = /template/.test(type);
  const look = useLookups(isPerson || isTemplate);
  const id = `${idBase}-${field.key}`;
  const label = field.label || humanKey(field.key);
  const str = value === undefined || value === null ? "" : String(value);
  let control: ReactElement;
  if (type === "boolean" || type === "bool" || type === "checkbox") {
    control = <CheckBox checked={value === true} onChange={(v) => onChange(v)}>{label}</CheckBox>;
    return (
      <div className="rb-field rb-field--check">
        {control}
        {field.description ? <small>{field.description}</small> : null}
      </div>
    );
  }
  if (field.options.length && !field.multiple) {
    control = <CrmSelect value={str} onChange={(v) => onChange(v)} label={label} options={field.options.map((o) => ({ value: o.value, label: optLabel(o), hint: o.description || undefined }))} />;
  } else if (field.multiple) {
    control = <TagsInput value={Array.isArray(value) ? value.map(String) : str ? str.split(",").map((x) => x.trim()).filter(Boolean) : []} onChange={onChange} options={field.options} placeholder={field.placeholder || t("addValue")} label={label} />;
  } else if (isPerson) {
    control = <CrmSelect value={str} onChange={onChange} label={label} options={[{ value: "", label: t("none") }, ...look.ops.map((o) => ({ value: o.id, label: o.name, hint: t("activeN", { n: o.activeLeads }) }))]} />;
  } else if (isTemplate) {
    control = <CrmSelect value={str} onChange={onChange} label={label} options={[{ value: "", label: t("none") }, ...look.templates.map((x) => ({ value: x.id, label: x.title }))]} />;
  } else if (/status/.test(type)) {
    control = <CrmSelect value={str} onChange={onChange} label={label} options={meta.statuses.map((s) => ({ value: s, label: ts(s) }))} />;
  } else if (/language|lang/.test(type)) {
    control = <CrmSelect value={str} onChange={onChange} label={label} options={meta.languages.map((s) => ({ value: s, label: tl.has(s) ? tl(s) : humanKey(s) }))} />;
  } else if (/datetime|date_time|timestamp/.test(type)) {
    control = <CrmDateTime value={str.slice(0, 16)} onChange={(v) => onChange(v ? new Date(v).toISOString() : "")} label={label} />;
  } else if (/number|integer|int|float|duration|minutes|seconds/.test(type)) {
    control = (
      <input
        id={id}
        className="rop-input"
        inputMode="numeric"
        value={str}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.-]/g, "");
          onChange(raw === "" ? "" : Number(raw));
        }}
        placeholder={field.placeholder}
        aria-describedby={field.description ? `${id}-d` : undefined}
      />
    );
  } else if (/textarea|longtext|body|message|markdown/.test(type) || /body|message|text|content/.test(field.key)) {
    control = <textarea id={id} className="rop-input" value={str} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} aria-describedby={field.description ? `${id}-d` : undefined} />;
  } else {
    control = <input id={id} className="rop-input" value={str} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} aria-describedby={field.description ? `${id}-d` : undefined} data-texty={TEXTY.test(type) || undefined} />;
  }
  return (
    <div className="rb-field">
      <label className="rop-label" htmlFor={id}>
        <span>
          {label}
          {field.required ? <em className="rb-req" aria-label={t("required")}>*</em> : null}
        </span>
      </label>
      {control}
      {field.description ? <small id={`${id}-d`}>{field.description}</small> : null}
      {field.min !== null || field.max !== null ? <small>{t("range", { min: field.min ?? "—", max: field.max ?? "—" })}</small> : null}
    </div>
  );
}

// Free values (tags, an `in` list): chips with a typing field; with
// options, a pick list instead.
export function TagsInput({ value, onChange, options, placeholder, label }: { value: string[]; onChange: (v: string[]) => void; options: { value: string; label: string }[]; placeholder: string; label: string }): ReactElement {
  const t = useTranslations("rop.robots");
  const [draft, setDraft] = useState("");
  const add = (v: string) => {
    const x = v.trim();
    if (x && !value.includes(x)) onChange([...value, x]);
    setDraft("");
  };
  return (
    <div className="rb-tags" role="group" aria-label={label}>
      {value.map((v) => (
        <span key={v} className="rb-tag">
          <Hash aria-hidden="true" />
          {options.find((o) => o.value === v)?.label || v}
          <button type="button" aria-label={t("removeValue", { v })} onClick={() => onChange(value.filter((x) => x !== v))}>
            <X />
          </button>
        </span>
      ))}
      {options.length ? (
        <CrmSelect value="" onChange={(v) => v && add(v)} label={placeholder} options={options.filter((o) => !value.includes(o.value)).map((o) => ({ value: o.value, label: optLabel(o) }))} />
      ) : (
        <span className="rb-tags__in">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add(draft);
              }
            }}
            placeholder={placeholder}
            aria-label={placeholder}
          />
          <button type="button" className="crm-btn crm-btn--sm" onClick={() => add(draft)} disabled={!draft.trim()} aria-label={t("addValue")}>
            <Plus aria-hidden="true" />
          </button>
        </span>
      )}
    </div>
  );
}
