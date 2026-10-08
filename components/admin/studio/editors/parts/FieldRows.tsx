"use client";

import { useId } from "react";
import type { StudioFieldErrors } from "@/lib/services/studio";
import { STUDIO_ERR } from "../types";
import { AddBtn, ED_ERR, ErrLine, RowTools, SNAKE_RE, SelectIn, TagInput, TextIn, bool, edAi, errIn, moveItem, rec, recList, slugify, str, strList, useEd, type Dict } from "./kit";

export const FIELD_TYPES = ["text", "textarea", "number", "date", "select", "checkbox", "file"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export function normFieldRow(v: unknown): Dict {
  const o = rec(v);
  const type = str(o.type).trim().toLowerCase() || "text";
  const out: Dict = { ...o, name: str(o.name ?? o.key).trim(), label: str(o.label ?? o.title), type, required: bool(o.required) };
  if (type === "select") out.options = strList(o.options);
  else delete out.options;
  return out;
}

export function fieldRowsOf(v: unknown): Dict[] {
  return recList(v).map(normFieldRow);
}

export function fieldNames(rows: Dict[]): string[] {
  return rows.map((r) => str(r.name).trim()).filter(Boolean);
}

export function validateFieldRows(rows: Dict[], prefix: string, seen: Map<string, string>, out: StudioFieldErrors): void {
  rows.forEach((r, i) => {
    const p = `${prefix}.${i}`;
    const name = str(r.name).trim();
    if (!name) out[`${p}.name`] = STUDIO_ERR.required;
    else if (!SNAKE_RE.test(name)) out[`${p}.name`] = ED_ERR.snake;
    else if (seen.has(name)) {
      out[`${p}.name`] = STUDIO_ERR.duplicate;
      const first = seen.get(name) ?? "";
      if (first && !out[`${first}.name`]) out[`${first}.name`] = STUDIO_ERR.duplicate;
    } else seen.set(name, p);
    if (!str(r.label).trim()) out[`${p}.label`] = STUDIO_ERR.required;
    if (str(r.type) === "select" && strList(r.options).length === 0) out[`${p}.options`] = ED_ERR.options;
  });
}

export default function FieldRows({
  code,
  rows,
  onChange,
  readOnly,
  errors,
  prefix,
  aiBase,
}: {
  code: string;
  rows: Dict[];
  onChange: (next: Dict[]) => void;
  readOnly: boolean;
  errors: StudioFieldErrors;
  prefix: string;
  aiBase: string[];
}) {
  const { e } = useEd();
  const uid = useId();
  const typeOpts = FIELD_TYPES.map((v) => ({ value: v, label: e(`fieldType.${v}`) }));
  const patch = (i: number, p: Dict) => onChange(rows.map((r, j) => (j === i ? normFieldRow({ ...r, ...p }) : r)));
  function setLabel(i: number, label: string) {
    const r = rows[i];
    const name = str(r.name);
    const auto = !name || name === slugify(str(r.label));
    patch(i, auto ? { label, name: slugify(label) } : { label });
  }
  function tidyName(i: number) {
    const name = str(rows[i].name);
    if (!name || SNAKE_RE.test(name)) return;
    const next = slugify(name);
    if (next) patch(i, { name: next });
  }
  const what = e("what.field");
  return (
    <div className="stu-fe-rows">
      {rows.length === 0 ? <p className="stu-fe-none">{e("fields.none")}</p> : null}
      {rows.map((r, i) => {
        const p = `${prefix}.${i}`;
        const ai = edAi(code, ...aiBase, "field", i);
        const nameErr = errors[`${p}.name`] ?? "";
        const labelErr = errors[`${p}.label`] ?? "";
        const optErr = errIn(errors, `${p}.options`);
        const rowErr = errors[p] ?? "";
        const type = str(r.type) || "text";
        return (
          <div key={i} className={`stu-fe-row${nameErr || labelErr || optErr || rowErr ? " is-bad" : ""}`}>
            <span className="stu-fe-row__n" aria-hidden>
              {i + 1}
            </span>
            <div className="stu-fe-row__g stu-fe-row__g--field">
              <div className="stu-fe-cell">
                <label className="stu-fe-cell__l" htmlFor={`${uid}-${i}-label`}>
                  {e("fields.label")}
                </label>
                <TextIn id={`${uid}-${i}-label`} value={str(r.label)} onChange={(v) => setLabel(i, v)} readOnly={readOnly} invalid={Boolean(labelErr)} placeholder={e("fields.labelPh")} label={e("fields.label")} ai={`${ai}.label`} />
                <ErrLine msg={labelErr} />
              </div>
              <div className="stu-fe-cell">
                <label className="stu-fe-cell__l" htmlFor={`${uid}-${i}-name`}>
                  {e("fields.name")}
                </label>
                <TextIn id={`${uid}-${i}-name`} value={str(r.name)} onChange={(v) => patch(i, { name: v })} onBlur={() => tidyName(i)} readOnly={readOnly} invalid={Boolean(nameErr)} placeholder="court_name" label={e("fields.name")} ai={`${ai}.name`} mono />
                <ErrLine msg={nameErr} />
              </div>
              <div className="stu-fe-cell">
                <span className="stu-fe-cell__l">{e("fields.type")}</span>
                <SelectIn value={type} onChange={(v) => patch(i, { type: v })} options={typeOpts} readOnly={readOnly} label={e("fields.type")} ai={`${ai}.type`} />
              </div>
              <label className={`stu-fe-req${bool(r.required) ? " on" : ""}`}>
                <input type="checkbox" checked={bool(r.required)} onChange={(ev) => patch(i, { required: ev.target.checked })} disabled={readOnly} data-ai-id={`${ai}.required`} data-ai-type="input" data-ai-label={e("fields.required")} />
                <span>{e("fields.required")}</span>
              </label>
              {type === "select" ? (
                <div className="stu-fe-cell stu-fe-cell--wide">
                  <span className="stu-fe-cell__l">{e("fields.options")}</span>
                  <TagInput value={strList(r.options)} onChange={(v) => patch(i, { options: v })} readOnly={readOnly} label={e("fields.options")} placeholder={e("fields.optionsPh")} ai={`${ai}.options`} invalid={Boolean(optErr)} />
                  <ErrLine msg={optErr} />
                </div>
              ) : null}
              {rowErr ? (
                <div className="stu-fe-cell stu-fe-cell--wide">
                  <ErrLine msg={rowErr} />
                </div>
              ) : null}
            </div>
            {readOnly ? null : <RowTools index={i} count={rows.length} onMove={(d) => onChange(moveItem(rows, i, d))} onRemove={() => onChange(rows.filter((_, j) => j !== i))} ai={ai} what={what} />}
          </div>
        );
      })}
      {readOnly ? null : <AddBtn label={e("fields.add")} onClick={() => onChange([...rows, { name: "", label: "", type: "text", required: false }])} ai={edAi(code, ...aiBase, "field", "add")} />}
    </div>
  );
}
