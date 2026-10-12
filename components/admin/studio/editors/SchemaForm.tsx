"use client";

import { useEffect, useId, useMemo, useState, type DragEvent, type KeyboardEvent } from "react";
import { getStudioConstructorDetail, studioSectionsOf, type StudioConstructor, type StudioFieldErrors, type StudioSchemaField } from "@/lib/services/studio";
import { emptyItem, joinPath, normErrorPaths } from "@/lib/studioSchema";
import DatePicker from "@/components/DatePicker";
import { zonedIso } from "@/components/internal/live/bits";
import { IconAlert, IconClose, IconEye, IconEdit, IconMenu, IconPlus } from "@/components/icons";
import { PayloadSummary } from "../PayloadSummary";
import { useStudioText } from "../bits";
import GenericEditor from "./GenericEditor";
import RefSelect from "./parts/RefSelect";
import { ChipPick, RowTools, SelectIn, edAi, useEd } from "./parts/kit";
import type { StudioEditorProps, StudioPayload } from "./types";

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

// A constructor drawn from its typed schema (definition version 3): fields
// grouped by section and ordered by ui.order; every list a repeater whose
// items are forms of their own and can be dragged into order; every object a
// nested form, with a key/value editor where the schema admits other keys;
// every reference a search select. Errors — the form's own and the
// backend's — sit next to the nested field they are about.
export default function SchemaEditor(props: StudioEditorProps) {
  const { code, constructor } = props;
  const ctorCode = constructor?.code || code;
  const [detail, setDetail] = useState<{ code: string; ctor: StudioConstructor | null } | null>(null);
  useEffect(() => {
    let alive = true;
    void getStudioConstructorDetail(ctorCode).then((d) => {
      if (alive) setDetail({ code: ctorCode, ctor: d });
    });
    return () => {
      alive = false;
    };
  }, [ctorCode]);
  const ctor = detail?.code === ctorCode ? detail.ctor : null;
  if (!detail || detail.code !== ctorCode) return <SchemaSkeleton />;
  // No typed schema (an older constructor): the field list it does have.
  if (!ctor || !ctor.typed.length) return <GenericEditor {...props} />;
  return <TypedForm {...props} ctor={ctor} />;
}

function SchemaSkeleton() {
  return (
    <div className="stu-sf" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="stu-sf__sk" />
      ))}
    </div>
  );
}

function useLabels() {
  const st = useStudioText();
  // The backend names fields in Uzbek; other languages use our dictionary
  // where it has the key and the backend's words otherwise.
  // The backend's label, help and example are the field's words (spec 10-12
  // §6); a key is never shown in a label's place.
  const label = (f: StudioSchemaField) => f.label && f.label !== f.key ? f.label : st.field(f.key);
  const help = (f: StudioSchemaField) => f.help || st.fieldHelp(f.key);
  const optionLabel = (f: StudioSchemaField, v: string) => f.optionLabels[v] || st.option(v);
  return { ...st, label, help, optionLabel };
}

function TypedForm({ ctor, payload, onChange, errors, readOnly }: StudioEditorProps & { ctor: StudioConstructor }) {
  const { t, label } = useLabels();
  const uid = useId();
  const groups = useMemo(() => studioSectionsOf(ctor), [ctor]);
  const errs = useMemo(() => normErrorPaths(errors), [errors]);
  const known = new Set(ctor.typed.map((f) => f.key));
  const extra = Object.keys(payload).filter((k) => !known.has(k) && payload[k] !== undefined);
  const required = new Set(ctor.schema.required);
  // Errors about nothing on the form (a field the schema does not have, or
  // the payload as a whole) are listed on top.
  const orphan = Object.entries(errs).filter(([k]) => !known.has(k.split(".")[0]));
  const badIn = (fields: StudioSchemaField[]) => Object.keys(errs).filter((k) => fields.some((f) => k === f.key || k.startsWith(`${f.key}.`))).length;
  const set = (key: string, v: unknown) => {
    const next: StudioPayload = { ...payload };
    if (v === undefined) delete next[key];
    else next[key] = v;
    onChange(next);
  };

  return (
    <div className="stu-sf" data-ai-id={edAi(ctor.code)} data-ai-type="editor" data-ai-label={ctor.title}>
      {groups.length > 1 ? (
        <nav className="stu-sf__nav" aria-label={t("schema.sections")}>
          {groups.map((g) => {
            const bad = badIn(g.fields);
            return (
              <a key={g.section.key} href={`#${uid}-${g.section.key}`} className={bad ? "is-bad" : undefined}>
                {g.section.title}
                <span>{bad ? bad : g.fields.length}</span>
              </a>
            );
          })}
        </nav>
      ) : null}
      {orphan.length ? (
        <ul className="stu-gen__errs" role="alert">
          {orphan.map(([k, v]) => (
            <li key={k}>
              <IconAlert aria-hidden />
              <ErrText path={k} msg={v} />
            </li>
          ))}
        </ul>
      ) : null}
      {groups.map((g) => (
        <section key={g.section.key} id={`${uid}-${g.section.key}`} className="stu-sf__sec" aria-label={g.section.title}>
          <header className="stu-sf__sech">
            <h4>{g.section.title}</h4>
            <small>{t("schema.fieldCount", { n: g.fields.filter((f) => !f.hidden).length })}</small>
          </header>
          <div className="stu-sf__grid">
            {g.fields.filter((f) => !f.hidden).map((f) => (
              <FieldBlock key={f.key} f={f} value={payload[f.key]} onChange={(v) => set(f.key, v)} path={f.key} errs={errs} ro={readOnly} required={f.required || required.has(f.key)} code={ctor.code} />
            ))}
          </div>
        </section>
      ))}
      {extra.length ? (
        <section className="stu-sf__sec stu-sf__sec--extra">
          <header className="stu-sf__sech">
            <h4>{t("generic.extra")}</h4>
            <small>{t("schema.extraHint")}</small>
          </header>
          <ul className="stu-sf__extra">
            {extra.map((k) => (
              <li key={k}>
                <b>{label({ key: k, label: k } as StudioSchemaField)}</b>
                {isDict(payload[k]) || Array.isArray(payload[k]) ? <PayloadSummary payload={isDict(payload[k]) ? (payload[k] as Dict) : { [k]: payload[k] }} compact /> : <span>{text(payload[k]) || String(payload[k])}</span>}
                {readOnly ? null : (
                  <button type="button" className="stu-fe-ib stu-fe-ib--x" onClick={() => set(k, undefined)} aria-label={t("schema.removeKey", { key: k })} title={t("schema.removeKey", { key: k })}>
                    <IconClose aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ErrText({ path, msg }: { path: string; msg: string }) {
  const { ferr } = useEd();
  return (
    <span>
      {path && path !== "_" ? <code className="stu-sf__path">{path}</code> : null}
      {ferr(msg)}
    </span>
  );
}

function ErrLineAt({ msg }: { msg: string }) {
  const { ferr } = useEd();
  if (!msg) return null;
  return (
    <p className="stu-ferr" role="alert">
      {ferr(msg)}
    </p>
  );
}

type BlockProps = {
  f: StudioSchemaField;
  value: unknown;
  onChange: (v: unknown) => void;
  path: string;
  errs: StudioFieldErrors;
  ro: boolean;
  required: boolean;
  code: string;
  bare?: boolean;
};

// A field with its label, help, control and error.
// The example as the person reads it: a short value goes into the empty
// input; a list or an object is written out under it.
export function exampleText(v: unknown): string {
  if (v === undefined || v === null || v === "") return "";
  if (typeof v === "string") return /^<.+>$/.test(v.trim()) ? "" : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object" && !Object.keys(v).length) return "";
  const s = JSON.stringify(v);
  return s.length > 140 ? `${s.slice(0, 139)}…` : s;
}
const inlineExample = (f: StudioSchemaField) => ["text", "textarea", "number", "money", "url", "email", "code", "richtext"].includes(f.type) && typeof f.example !== "object";

function FieldBlock(raw: BlockProps) {
  // A field the backend marks read-only stays on screen but cannot change.
  const props = raw.f.readOnly ? { ...raw, ro: true } : raw;
  const { f, path, errs, required, bare } = props;
  const { label, help, t } = useLabels();
  const uid = useId();
  const id = `${uid}-f`;
  const own = errs[path] ?? "";
  const wide = f.type === "object" || f.type === "list" || f.type === "textarea" || f.type === "richtext" || f.type === "code" || f.type === "multiselect";
  const h = help(f);
  const range = f.min !== null || f.max !== null ? rangeHint(f) : "";
  const ex = exampleText(f.example);
  const exLine = ex && !inlineExample(f) && f.type !== "boolean" && !bare ? (
    <small className="stu-sf__ex">
      <b>{t("ux.example")}</b> <code>{ex}</code>
    </small>
  ) : null;
  if (f.type === "boolean") {
    return (
      <div className={`stu-sf__f stu-sf__f--bool${own ? " is-bad" : ""}`}>
        <Switch id={id} on={props.value === true} onChange={props.onChange} ro={props.ro} label={label(f)} ai={edAi(props.code, "field", path)} />
        {h ? <small className="stu-fld__help">{h}</small> : null}
        <ErrLineAt msg={own} />
      </div>
    );
  }
  const placeholder = ex && inlineExample(f) ? ex : undefined;
  return (
    <div className={`stu-sf__f${wide ? " stu-sf__f--wide" : ""}${own ? " is-bad" : ""}${bare ? " is-bare" : ""}`} data-path={path}>
      {bare ? null : (
        <label className="stu-fld__l" htmlFor={id}>
          <span>
            {label(f)}
            {required ? (
              <i className="stu-req" aria-hidden>
                *
              </i>
            ) : null}
          </span>
          {range ? <small className="stu-sf__range">{range}</small> : null}
          {f.readOnly ? <small className="stu-sf__range">{t("ux.readOnly")}</small> : null}
        </label>
      )}
      {h && !bare ? <small className="stu-fld__help stu-sf__help">{h}</small> : null}
      <Control {...props} id={id} invalid={Boolean(own)} placeholder={placeholder} />
      {exLine}
      <ErrLineAt msg={own} />
    </div>
  );
}

function rangeHint(f: StudioSchemaField): string {
  const unit = f.type === "text" || f.type === "textarea" ? "…" : "";
  if (f.min !== null && f.max !== null) return `${f.min}–${f.max}${unit}`;
  if (f.min !== null) return `≥ ${f.min}${unit}`;
  return `≤ ${f.max}${unit}`;
}

function Control({ f, value, onChange, path, errs, ro, code, id, invalid, placeholder }: BlockProps & { id: string; invalid: boolean; placeholder?: string }) {
  const { label, optionLabel, t } = useLabels();
  const name = label(f);
  const ai = edAi(code, "field", path);
  const options = f.options.map((v) => ({ value: v, label: optionLabel(f, v) }));
  switch (f.type) {
    case "object":
      return <ObjectField f={f} value={value} onChange={onChange} path={path} errs={errs} ro={ro} code={code} />;
    case "list":
      if (f.source || f.item?.source) {
        const ids = Array.isArray(value) ? value.map((x) => text(x)).filter(Boolean) : [];
        return <RefSelect multiple source={f.source || f.item!.source} value={ids} onChange={onChange} readOnly={ro} label={name} />;
      }
      if (f.item && f.item.type === "select" && f.item.options.length) {
        return <ChipPick options={f.item.options.map((v) => ({ value: v, label: optionLabel(f.item!, v) }))} value={Array.isArray(value) ? value.map(text) : []} onChange={onChange} readOnly={ro} label={name} ai={ai} invalid={invalid} />;
      }
      return <ListField f={f} value={value} onChange={onChange} path={path} errs={errs} ro={ro} code={code} />;
    case "multiselect":
      if (f.source) return <RefSelect multiple source={f.source} value={Array.isArray(value) ? value.map(text) : []} onChange={onChange} readOnly={ro} label={name} />;
      return <ChipPick options={options} value={Array.isArray(value) ? value.map(text) : []} onChange={onChange} readOnly={ro} label={name} ai={ai} invalid={invalid} />;
    case "select":
      if (f.source) return <RefSelect source={f.source} value={text(value)} onChange={onChange} readOnly={ro} label={name} />;
      return <SelectIn value={text(value)} onChange={(v) => onChange(v || undefined)} options={[...(f.required ? [] : [{ value: "", label: "—" }]), ...options]} readOnly={ro} label={name} ai={ai} invalid={invalid} placeholder={t("generic.referencePick")} />;
    case "boolean":
      return <Switch id={id} on={value === true} onChange={onChange} ro={ro} label={name} ai={ai} />;
    case "number":
    case "money":
      return <NumberIn id={id} f={f} value={value} onChange={onChange} ro={ro} invalid={invalid} ai={ai} label={name} placeholder={placeholder} />;
    case "date":
      return ro ? <span className="stu-fe-sel is-ro">{text(value) || "—"}</span> : <DatePicker value={text(value).slice(0, 10)} onChange={(v) => onChange(v || undefined)} placeholder={name} ariaLabel={name} clearLabel={t("schema.clear")} />;
    case "datetime":
      return <DateTimeIn value={text(value)} onChange={onChange} ro={ro} label={name} />;
    case "textarea":
      return <textarea id={id} value={text(value)} onChange={(e) => onChange(e.target.value)} readOnly={ro} rows={4} placeholder={placeholder} aria-invalid={invalid || undefined} data-ai-id={ai} data-ai-type="textarea" data-ai-label={name} />;
    case "richtext":
      return <RichText id={id} value={text(value)} onChange={onChange} ro={ro} label={name} invalid={invalid} ai={ai} />;
    case "code":
      return <CodeBox id={id} value={text(value)} onChange={onChange} ro={ro} label={name} invalid={invalid} ai={ai} />;
    default:
      if (f.source) return <RefSelect source={f.source} value={text(value)} onChange={onChange} readOnly={ro} label={name} />;
      return (
        <input
          id={id}
          type={f.type === "url" ? "url" : f.type === "email" ? "email" : "text"}
          value={text(value)}
          onChange={(e) => onChange(e.target.value)}
          readOnly={ro}
          placeholder={placeholder}
          autoComplete="off"
          aria-invalid={invalid || undefined}
          data-ai-id={ai}
          data-ai-type="input"
          data-ai-label={name}
        />
      );
  }
}

function Switch({ id, on, onChange, ro, label, ai }: { id: string; on: boolean; onChange: (v: boolean) => void; ro: boolean; label: string; ai: string }) {
  return (
    <button id={id} type="button" role="switch" aria-checked={on} className={`stu-sw${on ? " on" : ""}`} disabled={ro} onClick={() => onChange(!on)} data-ai-id={ai} data-ai-type="switch" data-ai-label={label}>
      <i aria-hidden />
      <span>{label}</span>
    </button>
  );
}

function NumberIn({ id, f, value, onChange, ro, invalid, ai, label, placeholder }: { id: string; f: StudioSchemaField; value: unknown; onChange: (v: unknown) => void; ro: boolean; invalid: boolean; ai: string; label: string; placeholder?: string }) {
  const { t, num } = useLabels();
  const money = f.type === "money";
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (typeof value === "number" ? (money ? num(value) : String(value)) : text(value));
  return (
    <span className={`stu-sf__num${money ? " is-money" : ""}`}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={shown}
        onFocus={() => setDraft(typeof value === "number" ? String(value) : text(value))}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.,-]/g, "").replace(",", ".");
          setDraft(raw);
          if (raw === "" || raw === "-") return onChange(undefined);
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : raw);
        }}
        onBlur={() => setDraft(null)}
        readOnly={ro}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        data-ai-id={ai}
        data-ai-type="input"
        data-ai-label={label}
      />
      {money ? <small>{t("schema.currency")}</small> : null}
    </span>
  );
}

function DateTimeIn({ value, onChange, ro, label }: { value: string; onChange: (v: unknown) => void; ro: boolean; label: string }) {
  const { t, when } = useLabels();
  const d = value ? new Date(value) : null;
  const ok = d && Number.isFinite(d.getTime());
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = ok ? `${d!.getFullYear()}-${pad(d!.getMonth() + 1)}-${pad(d!.getDate())}` : "";
  const time = ok ? `${pad(d!.getHours())}:${pad(d!.getMinutes())}` : "";
  if (ro) return <span className="stu-fe-sel is-ro">{value ? when(value) : "—"}</span>;
  return (
    <span className="stu-sf__dt">
      <DatePicker value={date} onChange={(v) => onChange(v ? zonedIso(v, time || "09:00") : undefined)} placeholder={label} ariaLabel={label} clearLabel={t("schema.clear")} />
      <input type="time" value={time} onChange={(e) => date && onChange(zonedIso(date, e.target.value || "00:00"))} disabled={!date} aria-label={t("schema.time")} />
    </span>
  );
}

// Rich text is kept as HTML; the preview shows only harmless tags.
const SAFE_TAGS = new Set(["P", "BR", "B", "STRONG", "I", "EM", "U", "UL", "OL", "LI", "H3", "H4", "A", "BLOCKQUOTE"]);
function sanitize(html: string): string {
  if (typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const walk = (node: Element) => {
    for (const child of [...node.children]) {
      if (!SAFE_TAGS.has(child.tagName)) {
        child.replaceWith(...[...child.childNodes]);
        continue;
      }
      for (const a of [...child.attributes]) {
        const keep = child.tagName === "A" && a.name === "href" && /^(https?:|mailto:)/i.test(a.value);
        if (!keep) child.removeAttribute(a.name);
      }
      if (child.tagName === "A") child.setAttribute("rel", "noopener noreferrer");
      walk(child);
    }
  };
  const root = doc.body.firstElementChild;
  if (!root) return "";
  walk(root);
  return root.innerHTML;
}

function RichText({ id, value, onChange, ro, label, invalid, ai }: { id: string; value: string; onChange: (v: string) => void; ro: boolean; label: string; invalid: boolean; ai: string }) {
  const { t } = useLabels();
  const [preview, setPreview] = useState(ro);
  const wrap = (open: string, close: string) => {
    const el = document.getElementById(id) as HTMLTextAreaElement | null;
    const s = el?.selectionStart ?? value.length;
    const e = el?.selectionEnd ?? value.length;
    const next = `${value.slice(0, s)}${open}${value.slice(s, e)}${close}${value.slice(e)}`;
    onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(s + open.length, e + open.length);
    });
  };
  const tools: [string, string, string][] = [
    ["B", "<b>", "</b>"],
    ["I", "<i>", "</i>"],
    ["U", "<u>", "</u>"],
    ["•", "<ul>\n<li>", "</li>\n</ul>"],
    ["H", "<h4>", "</h4>"],
    ["↗", '<a href="https://">', "</a>"],
  ];
  return (
    <div className={`stu-sf__rt${invalid ? " is-bad" : ""}`}>
      <div className="stu-sf__rtbar" role="toolbar" aria-label={label}>
        {ro
          ? null
          : tools.map(([g, o, c], i) => (
              <button key={i} type="button" onClick={() => wrap(o, c)} disabled={preview} aria-label={t(`schema.rt.${i}`)} title={t(`schema.rt.${i}`)}>
                {g}
              </button>
            ))}
        <span className="stu-sf__rtsp" />
        {ro ? null : (
          <button type="button" className={preview ? "on" : ""} onClick={() => setPreview(!preview)} aria-pressed={preview}>
            {preview ? <IconEdit aria-hidden /> : <IconEye aria-hidden />}
            {preview ? t("schema.edit") : t("schema.preview")}
          </button>
        )}
      </div>
      {preview ? (
        // Sanitized above to a short tag allow-list.
        <div className="stu-sf__rtview" dangerouslySetInnerHTML={{ __html: sanitize(value) || "—" }} />
      ) : (
        <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={7} aria-invalid={invalid || undefined} data-ai-id={ai} data-ai-type="textarea" data-ai-label={label} />
      )}
    </div>
  );
}

function CodeBox({ id, value, onChange, ro, label, invalid, ai }: { id: string; value: string; onChange: (v: string) => void; ro: boolean; label: string; invalid: boolean; ai: string }) {
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab" || e.shiftKey) return;
    e.preventDefault();
    const el = e.currentTarget;
    const s = el.selectionStart;
    onChange(`${value.slice(0, s)}  ${value.slice(el.selectionEnd)}`);
    requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
  };
  const lines = Math.max(1, value.split("\n").length);
  return (
    <div className={`stu-sf__code${invalid ? " is-bad" : ""}`}>
      <pre aria-hidden>{Array.from({ length: lines }, (_, i) => i + 1).join("\n")}</pre>
      <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} readOnly={ro} rows={Math.min(18, Math.max(6, lines))} spellCheck={false} aria-invalid={invalid || undefined} data-ai-id={ai} data-ai-type="textarea" data-ai-label={label} />
    </div>
  );
}

// ── Object ──────────────────────────────────────────────────────────────────

function ObjectField({ f, value, onChange, path, errs, ro, code }: Omit<BlockProps, "required">) {
  const { t } = useLabels();
  const obj = isDict(value) ? value : {};
  const need = new Set(f.requiredFields);
  const known = new Set(f.properties.map((p) => p.key));
  const set = (k: string, v: unknown) => {
    const next = { ...obj };
    if (v === undefined) delete next[k];
    else next[k] = v;
    onChange(next);
  };
  const extraKeys = Object.keys(obj).filter((k) => !known.has(k));
  return (
    <div className={`stu-sf__obj${errs[path] ? " is-bad" : ""}`}>
      {f.properties.length ? (
        <div className="stu-sf__grid">
          {f.properties.filter((p) => !p.hidden).map((p) => (
            <FieldBlock key={p.key} f={p} value={obj[p.key]} onChange={(v) => set(p.key, v)} path={joinPath(path, p.key)} errs={errs} ro={ro} required={p.required || need.has(p.key)} code={code} />
          ))}
        </div>
      ) : null}
      {f.additional ? (
        <KeyValue
          entries={extraKeys.map((k) => [k, obj[k]])}
          onChange={(rows) => {
            const next: Dict = {};
            for (const [k, v] of Object.entries(obj)) if (known.has(k)) next[k] = v;
            for (const [k, v] of rows) if (k) next[k] = v;
            onChange(next);
          }}
          ro={ro}
          path={path}
          errs={errs}
          title={f.properties.length ? t("schema.extraKeys") : ""}
        />
      ) : extraKeys.length ? (
        <p className="stu-hint">{t("schema.droppedKeys", { keys: extraKeys.join(", ") })}</p>
      ) : null}
    </div>
  );
}

// Keys the schema does not name: a row per key, the value a number when it
// reads as one, true/false as a switch, anything else text.
function KeyValue({ entries, onChange, ro, path, errs, title }: { entries: [string, unknown][]; onChange: (rows: [string, unknown][]) => void; ro: boolean; path: string; errs: StudioFieldErrors; title: string }) {
  const { t } = useLabels();
  const [rows, setRows] = useState<[string, string][]>(() => entries.map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  const parse = (v: string): unknown => {
    const s = v.trim();
    if (s === "true" || s === "false") return s === "true";
    if (s !== "" && Number.isFinite(Number(s))) return Number(s);
    if (/^[[{]/.test(s)) {
      try {
        return JSON.parse(s);
      } catch {
        return v;
      }
    }
    return v;
  };
  const push = (next: [string, string][]) => {
    setRows(next);
    onChange(next.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), parse(v)]));
  };
  const dup = (k: string, i: number) => !!k.trim() && rows.some(([x], j) => j !== i && x.trim() === k.trim());
  return (
    <div className="stu-sf__kv">
      {title ? <b className="stu-sf__kvh">{title}</b> : null}
      {rows.length ? (
        <ul>
          {rows.map(([k, v], i) => (
            <li key={i} className={dup(k, i) || errs[joinPath(path, k)] ? "is-bad" : undefined}>
              <input value={k} onChange={(e) => push(rows.map((r, j) => (j === i ? [e.target.value.replace(/\s+/g, "_"), r[1]] : r)))} readOnly={ro} placeholder={t("schema.keyPh")} aria-label={t("schema.keyPh")} spellCheck={false} />
              <input value={v} onChange={(e) => push(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} readOnly={ro} placeholder={t("schema.valuePh")} aria-label={t("schema.valuePh")} />
              {ro ? null : (
                <button type="button" className="stu-fe-ib stu-fe-ib--x" onClick={() => push(rows.filter((_, j) => j !== i))} aria-label={t("schema.removeKey", { key: k || "—" })}>
                  <IconClose aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="stu-sf__none">{t("schema.noKeys")}</p>
      )}
      {rows.some(([k], i) => dup(k, i)) ? <p className="stu-ferr">{t("schema.dupKey")}</p> : null}
      {ro ? null : (
        <button type="button" className="stu-fe-add" onClick={() => push([...rows, ["", ""]])}>
          <IconPlus aria-hidden />
          {t("schema.addKey")}
        </button>
      )}
    </div>
  );
}

// ── List ────────────────────────────────────────────────────────────────────

function ListField({ f, value, onChange, path, errs, ro, code }: Omit<BlockProps, "required">) {
  const { t, label, e } = { ...useLabels(), ...useEd() };
  const items = Array.isArray(value) ? value : [];
  const item = f.item;
  const objectItems = item?.type === "object";
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const commit = (next: unknown[]) => onChange(next);
  const move = (i: number, to: number) => {
    if (to < 0 || to >= items.length || to === i) return;
    const reorder = <T,>(list: T[]) => {
      const out = [...list];
      const [x] = out.splice(i, 1);
      out.splice(to, 0, x);
      return out;
    };
    commit(reorder(items));
  };
  const remove = (i: number) => commit(items.filter((_, j) => j !== i));
  const add = () => commit([...items, emptyItem(item)]);
  const setAt = (i: number, v: unknown) => commit(items.map((x, j) => (j === i ? v : x)));
  const what = item && item.label && item.label !== "value" ? label(item) : t("schema.item");
  const summary = (v: unknown, i: number) => {
    if (!isDict(v) || !item) return t("generic.item", { n: i + 1 });
    const firstText = item.properties.find((p) => ["text", "select"].includes(p.type) && text(v[p.key]));
    return firstText ? text(v[firstText.key]) : t("generic.item", { n: i + 1 });
  };
  const onDrop = (ev: DragEvent, to: number) => {
    ev.preventDefault();
    if (drag) move(drag.from, to);
    setDrag(null);
  };

  return (
    <div className={`stu-sf__list${errs[path] ? " is-bad" : ""}`}>
      {item && (item.help || exampleText(item.example)) ? (
        <p className="stu-sf__itemhelp">
          {item.help ? <span>{item.help}</span> : null}
          {exampleText(item.example) ? (
            <small>
              <b>{t("ux.itemExample")}</b> <code>{exampleText(item.example)}</code>
            </small>
          ) : null}
        </p>
      ) : null}
      {items.length ? (
        <ol className={objectItems ? "is-cards" : "is-rows"}>
          {items.map((v, i) => {
            const rowPath = joinPath(path, i);
            const bad = Object.keys(errs).some((k) => k === rowPath || k.startsWith(`${rowPath}.`));
            return (
              <li
                key={i}
                className={`${bad ? "is-bad" : ""}${drag?.over === i && drag.from !== i ? " is-over" : ""}${drag?.from === i ? " is-drag" : ""}`}
                onDragOver={(ev) => {
                  if (!drag) return;
                  ev.preventDefault();
                  if (drag.over !== i) setDrag({ ...drag, over: i });
                }}
                onDrop={(ev) => onDrop(ev, i)}
              >
                <div className="stu-sf__lh">
                  {ro ? null : (
                    <span
                      className="stu-sf__grip"
                      draggable
                      onDragStart={(ev) => {
                        ev.dataTransfer.effectAllowed = "move";
                        ev.dataTransfer.setData("text/plain", String(i));
                        setDrag({ from: i, over: i });
                      }}
                      onDragEnd={() => setDrag(null)}
                      title={t("schema.drag")}
                      aria-hidden
                    >
                      <IconMenu />
                    </span>
                  )}
                  <span className="stu-sf__ln">{i + 1}</span>
                  {objectItems ? <b className="stu-sf__lt">{summary(v, i)}</b> : null}
                  {objectItems || !item ? null : (
                    <div className="stu-sf__lv">
                      <FieldBlock f={item} value={v} onChange={(x) => setAt(i, x)} path={rowPath} errs={errs} ro={ro} required code={code} bare />
                    </div>
                  )}
                  {ro ? null : <RowTools index={i} count={items.length} onMove={(d) => move(i, i + d)} onRemove={() => remove(i)} ai={edAi(code, "field", rowPath)} what={what || e("what")} />}
                </div>
                {objectItems && item ? <ObjectField f={item} value={v} onChange={(x) => setAt(i, x)} path={rowPath} errs={errs} ro={ro} code={code} /> : null}
                {!item ? <input value={text(v)} onChange={(ev) => setAt(i, ev.target.value)} readOnly={ro} aria-label={t("generic.item", { n: i + 1 })} /> : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="stu-sf__none">{t("generic.noItems")}</p>
      )}
      <div className="stu-sf__lf">
        {ro ? null : (
          <button type="button" className="stu-fe-add" onClick={add} data-ai-id={edAi(code, "field", path, "add")} data-ai-type="button" data-ai-label={t("schema.add", { what })}>
            <IconPlus aria-hidden />
            {t("schema.add", { what })}
          </button>
        )}
        <small>
          {[f.minItems ? t("schema.minItems", { n: f.minItems }) : "", f.uniqueBy ? t("schema.uniqueBy", { key: f.uniqueBy }) : "", t("schema.count", { n: items.length })].filter(Boolean).join(" · ")}
        </small>
      </div>
    </div>
  );
}
