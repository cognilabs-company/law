"use client";

import { useEffect, useId, useMemo, useState, type DragEvent, type KeyboardEvent } from "react";
import { getStudioConstructorDetail, studioSectionsOf, type StudioConstructor, type StudioFieldErrors, type StudioSchemaField } from "@/lib/services/studio";
import { emptyItem, joinPath, normErrorPaths } from "@/lib/studioSchema";
import DatePicker from "@/components/DatePicker";
import TimePicker from "@/components/TimePicker";
import { zonedIso } from "@/components/internal/live/bits";
import { IconAlert, IconCheck, IconClose, IconEye, IconEdit, IconInbox, IconMenu, IconPlus } from "@/components/icons";
import { PayloadSummary } from "../PayloadSummary";
import { useStudioHuman } from "../human";
import GenericEditor from "./GenericEditor";
import RefSelect from "./parts/RefSelect";
import { fieldGlyph, sectionGlyph } from "./parts/fieldIcon";
import { ChipPick, RowTools, SelectIn, edAi, useEd } from "./parts/kit";
import type { StudioEditorProps, StudioPayload } from "./types";

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const WIDE = new Set(["object", "list", "textarea", "richtext", "code", "multiselect", "datetime"]);
const filledValue = (v: unknown) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length) && !(isDict(v) && !Object.keys(v).length);
function spans(fields: StudioSchemaField[]): Set<string> {
  const out = new Set<string>();
  let pending = "";
  for (const f of fields) {
    if (WIDE.has(f.type)) {
      if (pending) out.add(pending);
      pending = "";
      out.add(f.key);
    } else if (pending) pending = "";
    else pending = f.key;
  }
  if (pending) out.add(pending);
  return out;
}

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

// Every word of the form is said in the reader's language (../human): a
// field by its name from the dictionary, help as a short instruction, an
// option by its name — never the backend's key, code or sample value.
function useLabels() {
  const hm = useStudioHuman();
  const label = (f: StudioSchemaField) => hm.label(f);
  const help = (f: StudioSchemaField) => hm.help(f);
  const optionLabel = (f: StudioSchemaField, v: string) => {
    if (hm.t.has(`option.${v}`)) return hm.t(`option.${v}`);
    const own = f.optionLabels[v];
    return own && own !== v ? own : hm.option(v);
  };
  return { ...hm, label, help, optionLabel };
}

function TypedForm({ ctor, payload, onChange, errors, readOnly }: StudioEditorProps & { ctor: StudioConstructor }) {
  const { t, label, section, value } = useLabels();
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
            const shown = g.fields.filter((f) => !f.hidden);
            const filled = shown.filter((f) => filledValue(payload[f.key])).length;
            const done = !bad && filled > 0 && shown.every((f) => !(f.required || required.has(f.key)) || filledValue(payload[f.key]));
            return (
              <a key={g.section.key} href={`#${uid}-${g.section.key}`} className={bad ? "is-bad" : done ? "is-done" : undefined}>
                {sectionGlyph(g.section.title, g.section.key)}
                {section(g.section.title)}
                <span>{bad ? bad : done ? <IconCheck aria-hidden /> : `${filled}/${shown.length}`}</span>
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
      {groups.map((g) => {
        const shown = g.fields.filter((f) => !f.hidden);
        const wide = spans(shown);
        return (
          <section key={g.section.key} id={`${uid}-${g.section.key}`} className="stu-sf__sec" aria-label={section(g.section.title)}>
            <header className="stu-sf__sech">
              <h4>
                <span className="stu-sf__secico" aria-hidden>
                  {sectionGlyph(g.section.title, g.section.key)}
                </span>
                {section(g.section.title)}
              </h4>
              <small>{t("schema.fieldCount", { n: shown.length })}</small>
            </header>
            <div className="stu-sf__grid">
              {shown.map((f) => (
                <FieldBlock key={f.key} f={f} value={payload[f.key]} onChange={(v) => set(f.key, v)} path={f.key} errs={errs} ro={readOnly} required={f.required || required.has(f.key)} code={ctor.code} span={wide.has(f.key)} />
              ))}
            </div>
          </section>
        );
      })}
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
                {isDict(payload[k]) || Array.isArray(payload[k]) ? <PayloadSummary payload={isDict(payload[k]) ? (payload[k] as Dict) : { [k]: payload[k] }} compact /> : <span>{value(payload[k], k)}</span>}
                {readOnly ? null : (
                  <button type="button" className="stu-fe-ib stu-fe-ib--x" onClick={() => set(k, undefined)} aria-label={t("schema.removeKey", { key: label({ key: k, label: k } as StudioSchemaField) })} title={t("schema.removeKey", { key: label({ key: k, label: k } as StudioSchemaField) })}>
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
  const { fieldLabel } = useLabels();
  // The field by its name, not its path: "limits.per_day" reads "Limits → Per day".
  const parts = path.replace(/\[\d+\]/g, "").split(".").filter((k) => k && k !== "_");
  return (
    <span>
      {parts.length ? <b className="stu-sf__path">{parts.map((k) => fieldLabel(k)).join(" → ")}</b> : null}
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
  span?: boolean;
};

// A field with its label, help, control and error.
function FieldBlock(raw: BlockProps) {
  // A field the backend marks read-only stays on screen but cannot change.
  const props = raw.f.readOnly ? { ...raw, ro: true } : raw;
  const { f, path, errs, required, bare, span } = props;
  const { label, help, t, example } = useLabels();
  const uid = useId();
  const id = `${uid}-f`;
  const own = errs[path] ?? "";
  const wide = span || WIDE.has(f.type);
  const h = help(f);
  const range = f.min !== null || f.max !== null ? rangeHint(f) : "";
  // A sample inside the empty field, where there is a readable one.
  const ex = ["text", "textarea", "number", "money", "url", "email"].includes(f.type) ? example(f) : "";
  if (f.type === "boolean") {
    return (
      <div className={`stu-sf__f stu-sf__f--bool${wide ? " stu-sf__f--wide" : ""}${own ? " is-bad" : ""}`}>
        <Switch id={id} on={props.value === true} onChange={props.onChange} ro={props.ro} label={label(f)} ai={edAi(props.code, "field", path)} />
        {h ? <small className="stu-fld__help">{h}</small> : null}
        <ErrLineAt msg={own} />
      </div>
    );
  }
  const placeholder = ex || undefined;
  return (
    <div className={`stu-sf__f${wide ? " stu-sf__f--wide" : ""}${own ? " is-bad" : ""}${bare ? " is-bare" : ""}`} data-path={path}>
      {bare ? null : (
        <label className="stu-fld__l" htmlFor={id}>
          <span>
            <span className="stu-sf__fi" aria-hidden>
              {fieldGlyph(f)}
            </span>
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
      <Control {...props} id={id} invalid={Boolean(own)} placeholder={placeholder} />
      {h && !bare ? <small className="stu-fld__help stu-sf__help">{h}</small> : null}
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
  const { label, optionLabel, t, day } = useLabels();
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
      return ro ? <span className="stu-fe-sel is-ro">{text(value) ? day(text(value)) : "—"}</span> : <DatePicker value={text(value).slice(0, 10)} onChange={(v) => onChange(v || undefined)} placeholder={name} ariaLabel={name} clearLabel={t("schema.clear")} />;
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
      // A moment kept as text ("starts_at") is still picked on a calendar.
      if (/(_at|_until)$/.test(f.key) || /^\d{4}-\d{2}-\d{2}T\d{2}:/.test(text(value))) return <DateTimeIn value={text(value)} onChange={onChange} ro={ro} label={name} />;
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
      <DatePicker value={date} onChange={(v) => onChange(v ? zonedIso(v, time || "09:00") : undefined)} placeholder={t("schema.pickDate")} ariaLabel={label} clearLabel={t("schema.clear")} />
      <TimePicker value={time} onChange={(v) => date && onChange(zonedIso(date, v || "00:00"))} placeholder="09:00" ariaLabel={t("schema.time")} disabled={!date} clearLabel={t("schema.clear")} step={15} />
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
  const { t, fieldLabel } = useLabels();
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
  const shownProps = f.properties.filter((p) => !p.hidden);
  const wideProps = spans(shownProps);
  return (
    <div className={`stu-sf__obj${errs[path] ? " is-bad" : ""}`}>
      {f.properties.length ? (
        <div className="stu-sf__grid">
          {shownProps.map((p) => (
            <FieldBlock key={p.key} f={p} value={obj[p.key]} onChange={(v) => set(p.key, v)} path={joinPath(path, p.key)} errs={errs} ro={ro} required={p.required || need.has(p.key)} code={code} span={wideProps.has(p.key)} />
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
        <p className="stu-hint">{t("schema.droppedKeys", { keys: extraKeys.map((k) => fieldLabel(k)).join(", ") })}</p>
      ) : null}
    </div>
  );
}

// Keys the schema does not name: a row per key, the value a number when it
// reads as one, true/false as a switch, anything else text.
function KeyValue({ entries, onChange, ro, path, errs, title }: { entries: [string, unknown][]; onChange: (rows: [string, unknown][]) => void; ro: boolean; path: string; errs: StudioFieldErrors; title: string }) {
  const { t, h, value: say } = useLabels();
  // Yes and no are said in words; anything nested is kept as it came and
  // shown as a count, never as braces.
  const yes = h("yes");
  const no = h("no");
  const [init] = useState(() => {
    const nested = new Map<string, unknown>();
    const rows = entries.map(([k, v]): [string, string] => {
      if (typeof v === "boolean") return [k, v ? yes : no];
      if (v && typeof v === "object") {
        const shown = say(v, k);
        nested.set(`${k}|${shown}`, v);
        return [k, shown];
      }
      return [k, v === null || v === undefined ? "" : String(v)];
    });
    return { rows, nested };
  });
  const [rows, setRows] = useState<[string, string][]>(init.rows);
  const parse = (v: string, k = ""): unknown => {
    const s = v.trim();
    if (init.nested.has(`${k}|${v}`)) return init.nested.get(`${k}|${v}`);
    if ([yes.toLowerCase(), "true"].includes(s.toLowerCase())) return true;
    if ([no.toLowerCase(), "false"].includes(s.toLowerCase())) return false;
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
    onChange(next.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), parse(v, k.trim())]));
  };
  const dup = (k: string, i: number) => !!k.trim() && rows.some(([x], j) => j !== i && x.trim() === k.trim());
  return (
    <div className="stu-sf__kv">
      {title ? <b className="stu-sf__kvh">{title}</b> : null}
      {rows.length ? (
        <ul>
          {rows.map(([k, v], i) => (
            <li key={i} className={dup(k, i) || errs[joinPath(path, k)] ? "is-bad" : undefined}>
              {k && t.has(`field.${k}`) ? (
                <b className="stu-sf__kvk">{t(`field.${k}`)}</b>
              ) : (
                <input value={k} onChange={(e) => push(rows.map((r, j) => (j === i ? [e.target.value.replace(/\s+/g, "_"), r[1]] : r)))} readOnly={ro} placeholder={t("schema.keyPh")} aria-label={t("schema.keyPh")} spellCheck={false} />
              )}
              <input value={v} onChange={(e) => push(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} readOnly={ro} placeholder={t("schema.valuePh")} aria-label={t("schema.valuePh")} />
              {ro ? null : (
                <button type="button" className="stu-fe-ib stu-fe-ib--x" onClick={() => push(rows.filter((_, j) => j !== i))} aria-label={t("schema.removeKey", { key: k && t.has(`field.${k}`) ? t(`field.${k}`) : k || "—" })}>
                  <IconClose aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="stu-sf__none">
          <IconInbox aria-hidden />
          <span>{t("schema.noKeys")}</span>
        </p>
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
  const { t, label, e, help, fieldLabel, value: say } = { ...useLabels(), ...useEd() };
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
  const own = item && item.label && item.label !== item.key && item.label !== "value" ? label(item) : "";
  const what = own || t("schema.item");
  const summary = (v: unknown, i: number) => {
    if (!isDict(v) || !item) return t("generic.item", { n: i + 1 });
    // A row is named by what a person called it; a code or an id says
    // nothing, so such a row keeps its number.
    const named = ["title", "name", "label", "question", "text"].map((k) => text(v[k])).find(Boolean);
    const firstText = item.properties.find((p) => ["text", "select"].includes(p.type) && text(v[p.key]));
    const raw = named || (firstText ? text(v[firstText.key]) : "");
    const name = /^[a-z0-9]+([_.:-][a-z0-9]+)+$/i.test(raw) && !t.has(`option.${raw}`) ? "" : say(raw, firstText?.key);
    return name && name !== "—" ? name : t("generic.item", { n: i + 1 });
  };
  const onDrop = (ev: DragEvent, to: number) => {
    ev.preventDefault();
    if (drag) move(drag.from, to);
    setDrag(null);
  };

  return (
    <div className={`stu-sf__list${errs[path] ? " is-bad" : ""}`}>
      {item && help(item) ? <p className="stu-sf__itemhelp"><span>{help(item)}</span></p> : null}
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
        <p className="stu-sf__none">
          <IconInbox aria-hidden />
          <span>{t("schema.emptyList")}</span>
        </p>
      )}
      <div className="stu-sf__lf">
        {ro ? null : (
          <button type="button" className="stu-fe-add" onClick={add} data-ai-id={edAi(code, "field", path, "add")} data-ai-type="button" data-ai-label={own ? t("schema.add", { what: own }) : t("schema.addKey")}>
            <IconPlus aria-hidden />
            {own ? t("schema.add", { what: own }) : t("schema.addKey")}
          </button>
        )}
        <small>
          {[f.minItems ? t("schema.minItems", { n: f.minItems }) : "", f.uniqueBy ? t("schema.uniqueBy", { key: fieldLabel(f.uniqueBy) }) : "", t("schema.count", { n: items.length })].filter(Boolean).join(" · ")}
        </small>
      </div>
    </div>
  );
}
