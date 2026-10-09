"use client";

import { useId } from "react";
import type { StudioFieldErrors } from "@/lib/services/studio";
import { STUDIO_ERR, type StudioEditorProps, type StudioPayload } from "./types";
import { AddBtn, ED_ERR, EdSection, EdShell, ErrLine, Fld, RowTools, SNAKE_RE, SelectIn, TextIn, edAi, moveItem, normErrors, recList, slugify, str, useEd, type Dict } from "./parts/kit";
import { IconBolt, IconFolder, IconList } from "@/components/icons";

const CODE = "K16";
export const K16_LANGS = ["uz", "uz-cyrl", "ru", "en"] as const;

function itemsOf(v: unknown): Dict[] {
  return recList(v).map((o) => ({ ...o, label: str(o.label ?? o.title ?? o.name), value: str(o.value ?? o.code ?? o.key) }));
}

export function emptyPayload(): StudioPayload {
  return { directory_key: "", language: "uz", items: [{ label: "", value: "" }] };
}

export function validate(payload: StudioPayload): StudioFieldErrors {
  const out: StudioFieldErrors = {};
  const key = str(payload.directory_key).trim();
  if (!key) out.directory_key = STUDIO_ERR.required;
  else if (!SNAKE_RE.test(key)) out.directory_key = ED_ERR.snake;
  const items = itemsOf(payload.items);
  if (!items.length) out.items = ED_ERR.minOne;
  const seen = new Map<string, number>();
  items.forEach((it, i) => {
    if (!str(it.label).trim()) out[`items.${i}.label`] = STUDIO_ERR.required;
    const v = str(it.value).trim();
    if (!v) out[`items.${i}.value`] = STUDIO_ERR.required;
    else if (seen.has(v)) {
      out[`items.${i}.value`] = STUDIO_ERR.duplicate;
      out[`items.${seen.get(v)}.value`] = STUDIO_ERR.duplicate;
    } else seen.set(v, i);
  });
  return out;
}

export default function K16Editor({ payload, onChange, errors, readOnly }: StudioEditorProps) {
  const { e, ctorName } = useEd();
  const uid = useId();
  const errs = normErrors(errors);
  const items = itemsOf(payload.items);
  const set = (k: string, v: unknown) => onChange({ ...payload, [k]: v });
  const setItems = (next: Dict[]) => set("items", next);
  const patch = (i: number, p: Dict) => setItems(items.map((it, j) => (j === i ? { ...it, ...p } : it)));
  const counts = new Map<string, number>();
  for (const it of items) {
    const v = str(it.value).trim();
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const langOpts = K16_LANGS.map((l) => ({ value: l, label: e(`lang.${l}`) }));

  function setLabel(i: number, label: string) {
    const it = items[i];
    const value = str(it.value);
    const auto = !value || value === slugify(str(it.label));
    patch(i, auto ? { label, value: slugify(label) } : { label });
  }

  return (
    <EdShell
      code={CODE}
      icon={IconFolder}
      title={ctorName(CODE)}
      lead={e("k16.lead")}
      errors={errs}
      known={["directory_key", "language", "items"]}
      note={
        <p className="stu-fe-note" role="note">
          <IconBolt aria-hidden />
          <span>{e("k16.note")}</span>
        </p>
      }
    >
      <div className="stu-fe-grid">
        <Fld id={`${uid}-key`} label={e("k16.key")} required error={errs.directory_key} hint={e("k16.keyHint")}>
          <TextIn id={`${uid}-key`} value={str(payload.directory_key)} onChange={(v) => set("directory_key", v)} onBlur={() => {
            const k = str(payload.directory_key);
            if (k && !SNAKE_RE.test(k) && slugify(k)) set("directory_key", slugify(k));
          }} readOnly={readOnly} invalid={Boolean(errs.directory_key)} placeholder="regions" label={e("k16.key")} ai={edAi(CODE, "directory_key")} mono />
        </Fld>
        <Fld label={e("common.language")} error={errs.language}>
          <SelectIn value={str(payload.language)} onChange={(v) => set("language", v)} options={langOpts} readOnly={readOnly} label={e("common.language")} ai={edAi(CODE, "language")} invalid={Boolean(errs.language)} />
        </Fld>
      </div>

      <EdSection icon={IconList} title={e("k16.items")} hint={e("k16.itemsHint")} count={items.length} error={errs.items}>
        <div className="stu-fe-table" role="table" aria-label={e("k16.items")}>
          <div className="stu-fe-table__h" role="row">
            <span role="columnheader">#</span>
            <span role="columnheader">{e("k16.label")}</span>
            <span role="columnheader">{e("k16.value")}</span>
            <span role="columnheader" aria-hidden />
          </div>
          {items.length === 0 ? <p className="stu-fe-none">{e("k16.none")}</p> : null}
          {items.map((it, i) => {
            const ai = edAi(CODE, "item", i);
            const lErr = errs[`items.${i}.label`] ?? "";
            const v = str(it.value).trim();
            const vErr = errs[`items.${i}.value`] || (v && (counts.get(v) ?? 0) > 1 ? STUDIO_ERR.duplicate : "");
            return (
              <div key={i} className={`stu-fe-table__r${lErr || vErr ? " is-bad" : ""}`} role="row">
                <span className="stu-fe-table__n" role="cell">
                  {i + 1}
                </span>
                <div className="stu-fe-cell" role="cell">
                  <TextIn value={str(it.label)} onChange={(x) => setLabel(i, x)} readOnly={readOnly} invalid={Boolean(lErr)} placeholder={e("k16.labelPh")} label={e("k16.label")} ai={`${ai}.label`} />
                  <ErrLine msg={lErr} />
                </div>
                <div className="stu-fe-cell" role="cell">
                  <TextIn value={str(it.value)} onChange={(x) => patch(i, { value: x })} readOnly={readOnly} invalid={Boolean(vErr)} placeholder="toshkent" label={e("k16.value")} ai={`${ai}.value`} mono />
                  <ErrLine msg={vErr} />
                </div>
                <div role="cell">{readOnly ? null : <RowTools index={i} count={items.length} onMove={(d) => setItems(moveItem(items, i, d))} onRemove={() => setItems(items.filter((_, j) => j !== i))} ai={ai} what={e("what.item")} />}</div>
              </div>
            );
          })}
        </div>
        {readOnly ? null : <AddBtn label={e("k16.add")} onClick={() => setItems([...items, { label: "", value: "" }])} ai={edAi(CODE, "item", "add")} />}
        <p className="stu-hint">{e("k16.slugHint")}</p>
      </EdSection>
    </EdShell>
  );
}
