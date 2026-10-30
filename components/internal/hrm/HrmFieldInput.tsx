"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { uploadWorkspaceFile } from "@/lib/services/backend";
import { cachedHrmOption, cachedHrmOptions, preloadHrmReference, rememberHrmOptions, searchHrmReference, type HrmField, type HrmOption } from "@/lib/services/hrm";
import SearchSelect from "@/components/SearchSelect";
import Select from "@/components/Select";
import DatePicker from "@/components/DatePicker";
import TimePicker from "@/components/TimePicker";
import CheckBox from "@/components/CheckBox";
import "../handmade.css";
import { zonedIso } from "@/components/internal/live/bits";
import { useHrmDirectory, type HrmDirectory } from "@/components/internal/useHrmDirectory";
import { IconClose, IconPaperclip, IconPlus } from "@/components/icons";
import { useHrmText } from "./text";

type Dict = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const isDict = (v: unknown): v is Dict => !!v && typeof v === "object" && !Array.isArray(v);

// The directory already holds people, units, positions and logins: those
// lists answer at once; any other source (another module's records) is read
// from the backend and searched there.
function directoryOptions(dir: HrmDirectory, source: string): HrmOption[] | null {
  const path = source.split("?")[0];
  if (path === "/internal/employees") return dir.employeeOptions.length ? dir.employeeOptions : null;
  if (path === "/internal/org/units") return dir.unitOptions.length ? dir.unitOptions : null;
  if (path === "/internal/org/positions") return dir.positionOptions.length ? dir.positionOptions : null;
  if (path === "/admin/users") return dir.userOptions.length ? dir.userOptions : null;
  return null;
}

// Names for ids of any reference source, kept fresh as lists arrive.
export function useHrmRefs(sources: string[]) {
  const dir = useHrmDirectory();
  const [tick, setTick] = useState(0);
  const key = [...new Set(sources)].sort().join("|");
  useEffect(() => {
    let alive = true;
    const need = key ? key.split("|").filter((s) => !directoryOptions(dir, s)) : [];
    void Promise.all(need.map((s) => preloadHrmReference(s))).then(() => alive && setTick((n) => n + 1));
    return () => {
      alive = false;
    };
    // The directory filling in also re-runs this through `dir`.
  }, [key, dir]);
  return useMemo(() => {
    void tick;
    return (source: string, id: string): string => {
      if (!id) return "";
      const fromDir = directoryOptions(dir, source)?.find((o) => o.value === id);
      // Never the id itself: an ellipsis until the name has been read.
      return fromDir?.label || cachedHrmOption(source, id)?.label || "…";
    };
  }, [dir, tick]);
}

function RefPick({ source, value, multiple, onChange, label, invalid }: { source: string; value: string[]; multiple: boolean; onChange: (v: string[]) => void; label: string; invalid: boolean }) {
  const t = useTranslations("internal.hrmc.form");
  const tu = useTranslations("internal.ui");
  const dir = useHrmDirectory();
  const [loaded, setLoaded] = useState<HrmOption[]>([]);
  const fromDir = directoryOptions(dir, source);
  useEffect(() => {
    if (fromDir) return;
    let alive = true;
    void preloadHrmReference(source).then(() => {
      if (!alive) return;
      setLoaded(cachedHrmOptions(source));
    });
    return () => {
      alive = false;
    };
  }, [source, fromDir]);
  const options = fromDir ?? loaded;
  // Chosen ids the list does not hold yet still show a name.
  const withChosen = [...options, ...value.filter((v) => !options.some((o) => o.value === v)).map((v) => cachedHrmOption(source, v) ?? { value: v, label: "…" })];
  return (
    <SearchSelect
      single={!multiple}
      value={value}
      onChange={onChange}
      options={withChosen}
      onSearch={async (q) => {
        const found = await searchHrmReference(source, q, 30).catch(() => []);
        rememberHrmOptions(source, found);
        return found;
      }}
      placeholder={t("pick")}
      searchPlaceholder={tu("search")}
      emptyText={tu("noOptions")}
      ariaLabel={label}
      removeLabel={tu("clear")}
      invalid={invalid}
    />
  );
}

// One catalog field as a control, by its type (spec §4, §17).
export default function HrmFieldInput({ field, value, onChange, invalid }: { field: HrmField; value: unknown; onChange: (v: unknown) => void; invalid: boolean }) {
  const { field: name, option, t } = useHrmText();
  const label = name(field);
  switch (field.type) {
    case "reference":
      return <RefPick source={field.source} value={text(value) ? [text(value)] : []} multiple={false} onChange={(v) => onChange(v[v.length - 1] || undefined)} label={label} invalid={invalid} />;
    case "references":
      return <RefPick source={field.source} value={Array.isArray(value) ? value.map(text).filter(Boolean) : []} multiple onChange={(v) => onChange(v.length ? v : undefined)} label={label} invalid={invalid} />;
    case "select":
      return <Select value={text(value)} onChange={(v) => onChange(v || undefined)} options={[...(field.required ? [] : [{ value: "", label: "—" }]), ...field.options.map((o) => ({ value: o, label: option(o) }))]} ariaLabel={label} placeholder={t("form.pick")} />;
    case "multiselect": {
      const cur = Array.isArray(value) ? value.map(text) : [];
      return (
        <div className={`hrmf-chips${invalid ? " is-bad" : ""}`} role="group" aria-label={label}>
          {field.options.map((o) => {
            const on = cur.includes(o);
            return (
              <button key={o} type="button" className={on ? "on" : ""} aria-pressed={on} onClick={() => onChange(on ? cur.filter((x) => x !== o) : [...cur, o])}>
                {option(o)}
              </button>
            );
          })}
        </div>
      );
    }
    case "boolean":
      return (
        <button type="button" role="switch" aria-checked={value === true} className={`stu-sw${value === true ? " on" : ""}`} onClick={() => onChange(!(value === true))}>
          <i aria-hidden />
          <span>{value === true ? t("form.yes") : t("form.no")}</span>
        </button>
      );
    case "date":
      return <DatePicker value={text(value).slice(0, 10)} onChange={(v) => onChange(v || undefined)} placeholder={label} ariaLabel={label} clearLabel={t("form.clear")} />;
    case "datetime": {
      const v = text(value);
      const d = v ? new Date(v) : null;
      const ok = d && Number.isFinite(d.getTime());
      const pad = (n: number) => String(n).padStart(2, "0");
      const date = ok ? `${d!.getFullYear()}-${pad(d!.getMonth() + 1)}-${pad(d!.getDate())}` : "";
      const time = ok ? `${pad(d!.getHours())}:${pad(d!.getMinutes())}` : "";
      return (
        <span className="stu-sf__dt">
          <DatePicker value={date} onChange={(x) => onChange(x ? zonedIso(x, time || "09:00") : undefined)} placeholder={label} ariaLabel={label} clearLabel={t("form.clear")} />
          <TimePicker value={time} disabled={!date} onChange={(x) => date && onChange(zonedIso(date, x || "00:00"))} placeholder={t("form.time")} ariaLabel={t("form.time")} />
        </span>
      );
    }
    case "time":
      return <TimePicker value={text(value)} onChange={(x) => onChange(x || undefined)} placeholder={label} ariaLabel={label} clearLabel={t("form.clear")} />;
    case "number":
    case "money":
      return (
        <span className={`stu-sf__num${field.type === "money" ? " is-money" : ""}`}>
          <input
            type="text"
            inputMode="decimal"
            value={typeof value === "number" ? String(value) : text(value)}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^\d.,-]/g, "").replace(",", ".");
              if (raw === "" || raw === "-") return onChange(undefined);
              const n = Number(raw);
              onChange(Number.isFinite(n) ? n : raw);
            }}
            aria-invalid={invalid || undefined}
            aria-label={label}
          />
          {field.type === "money" ? <small>{field.currency || t("form.currency")}</small> : null}
        </span>
      );
    case "textarea":
    case "richtext":
      return <textarea value={text(value)} onChange={(e) => onChange(e.target.value || undefined)} rows={field.type === "richtext" ? 6 : 3} maxLength={8000} aria-invalid={invalid || undefined} aria-label={label} />;
    case "code":
      return <textarea className="hrmf-code" value={text(value)} onChange={(e) => onChange(e.target.value || undefined)} rows={5} spellCheck={false} aria-invalid={invalid || undefined} aria-label={label} />;
    case "color":
      return (
        <span className="hrmf-color">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(text(value)) ? text(value) : "#1668f0"} onChange={(e) => onChange(e.target.value)} aria-label={label} />
          <input value={text(value)} onChange={(e) => onChange(e.target.value || undefined)} placeholder="#1668F0" aria-invalid={invalid || undefined} aria-label={label} />
        </span>
      );
    case "list":
      return <ListInput value={value} onChange={onChange} label={label} />;
    case "object":
      return <ObjectInput value={value} onChange={onChange} />;
    case "file":
    case "files":
      return <FileInput value={value} onChange={onChange} multiple={field.type === "files"} label={label} />;
    default:
      return (
        <input
          type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "url" ? "url" : "text"}
          value={text(value)}
          onChange={(e) => onChange(e.target.value || undefined)}
          maxLength={500}
          placeholder={field.type === "phone" ? "+998" : field.type === "url" ? "https://" : undefined}
          aria-invalid={invalid || undefined}
          aria-label={label}
        />
      );
  }
}

// A list without an item schema: text rows, or for items that are objects
// (checklists: { title, done }) a row with its title and a done mark.
function ListInput({ value, onChange, label }: { value: unknown; onChange: (v: unknown) => void; label: string }) {
  const { t } = useHrmText();
  const items = Array.isArray(value) ? value : [];
  const objects = items.some(isDict);
  const set = (next: unknown[]) => onChange(next.length ? next : undefined);
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  };
  return (
    <div className="hrmf-list" aria-label={label} role="group">
      {items.length ? (
        <ol>
          {items.map((it, i) => (
            <li key={i}>
              <span className="stu-sf__ln">{i + 1}</span>
              {objects && isDict(it) ? (
                <>
                  <input value={text(it.title ?? it.name ?? it.label)} onChange={(e) => set(items.map((x, j) => (j === i ? { ...(isDict(x) ? x : {}), title: e.target.value } : x)))} aria-label={t("form.item", { n: i + 1 })} />
                  {"done" in it ? (
                    <CheckBox className="hrmf-done" checked={it.done === true} onChange={(on) => set(items.map((x, j) => (j === i ? { ...(isDict(x) ? x : {}), done: on } : x)))}>
                      {t("form.done")}
                    </CheckBox>
                  ) : null}
                </>
              ) : (
                <input value={text(it)} onChange={(e) => set(items.map((x, j) => (j === i ? e.target.value : x)))} aria-label={t("form.item", { n: i + 1 })} />
              )}
              <span className="hrmf-list__tools">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t("form.up")}>↑</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={t("form.down")}>↓</button>
                <button type="button" onClick={() => set(items.filter((_, j) => j !== i))} aria-label={t("form.remove")}>
                  <IconClose />
                </button>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      <button type="button" className="stu-fe-add" onClick={() => set([...items, objects ? { title: "", done: false } : ""])}>
        <IconPlus aria-hidden />
        {t("form.addItem")}
      </button>
    </div>
  );
}

// An object without a schema of its own: key/value rows.
function ObjectInput({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const { t } = useHrmText();
  const [rows, setRows] = useState<[string, string][]>(() => Object.entries(isDict(value) ? value : {}).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  const push = (next: [string, string][]) => {
    setRows(next);
    const out: Dict = {};
    for (const [k, v] of next) {
      if (!k.trim()) continue;
      const s = v.trim();
      out[k.trim()] = s === "true" || s === "false" ? s === "true" : s !== "" && Number.isFinite(Number(s)) ? Number(s) : v;
    }
    onChange(Object.keys(out).length ? out : undefined);
  };
  return (
    <div className="stu-sf__kv">
      {rows.length ? (
        <ul>
          {rows.map(([k, v], i) => (
            <li key={i}>
              <input value={k} onChange={(e) => push(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} placeholder={t("form.key")} aria-label={t("form.key")} />
              <input value={v} onChange={(e) => push(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} placeholder={t("form.value")} aria-label={t("form.value")} />
              <button type="button" className="stu-fe-ib stu-fe-ib--x" onClick={() => push(rows.filter((_, j) => j !== i))} aria-label={t("form.remove")}>
                <IconClose aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <button type="button" className="stu-fe-add" onClick={() => push([...rows, ["", ""]])}>
        <IconPlus aria-hidden />
        {t("form.addKey")}
      </button>
    </div>
  );
}

// Files go to the workspace store first; the record keeps the file id and
// name ({ file_id, name }), one or a list.
function FileInput({ value, onChange, multiple, label }: { value: unknown; onChange: (v: unknown) => void; multiple: boolean; label: string }) {
  const { t } = useHrmText();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const files = (multiple ? (Array.isArray(value) ? value : []) : value ? [value] : []).map((f) => (isDict(f) ? f : { name: text(f), file_id: text(f) }));
  async function add(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setErr("");
    try {
      const up = [];
      for (const file of Array.from(list).slice(0, multiple ? 10 : 1)) {
        const f = await uploadWorkspaceFile(file);
        up.push({ file_id: f.id, name: f.fileName || file.name, url: f.fileUrl || undefined });
      }
      onChange(multiple ? [...files, ...up] : up[0]);
    } catch {
      setErr(t("form.fileError"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="hrmf-files">
      {files.length ? (
        <ul>
          {files.map((f, i) => (
            <li key={`${text(f.file_id)}-${i}`}>
              <IconPaperclip aria-hidden />
              <span>{text(f.name) || text(f.file_id)}</span>
              <button type="button" onClick={() => onChange(multiple ? files.filter((_, j) => j !== i) : undefined)} aria-label={t("form.remove")}>
                <IconClose />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {multiple || !files.length ? (
        <label className={`stu-fe-add${busy ? " is-busy" : ""}`}>
          <IconPaperclip aria-hidden />
          {busy ? t("form.uploading") : t("form.attach")}
          <input type="file" hidden multiple={multiple} onChange={(e) => void add(e.target.files)} disabled={busy} aria-label={label} />
        </label>
      ) : null}
      {err ? <p className="stu-ferr">{err}</p> : null}
    </div>
  );
}
