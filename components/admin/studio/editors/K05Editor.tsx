"use client";

import { useId } from "react";
import type { StudioFieldErrors } from "@/lib/services/studio";
import { STUDIO_ERR, type StudioEditorProps, type StudioPayload } from "./types";
import FieldRows, { fieldNames, fieldRowsOf, validateFieldRows } from "./parts/FieldRows";
import RefSelect from "./parts/RefSelect";
import { AddBtn, ChipPick, ED_ERR, EdSection, EdShell, ErrLine, Fld, RowTools, SelectIn, TextIn, edAi, moveItem, normErrors, recList, str, strList, useEd, type Dict } from "./parts/kit";
import { IconClipboardList, IconFolder, IconSliders } from "@/components/icons";

const CODE = "K05";
const OPERATORS = ["not_empty", "empty", "equals", "not_equals", "contains"] as const;
const NEEDS_VALUE = new Set<string>(["equals", "not_equals", "contains"]);

function sectionsOf(v: unknown): Dict[] {
  return recList(v).map((s) => ({ ...s, title: str(s.title ?? s.name), fields: fieldRowsOf(s.fields) }));
}

function rulesOf(v: unknown): Dict[] {
  return recList(v).map((r) => {
    const operator = str(r.operator) || "not_empty";
    const out: Dict = { ...r, field: str(r.field), operator, show_fields: strList(r.show_fields) };
    if (NEEDS_VALUE.has(operator)) out.value = r.value == null ? "" : str(r.value);
    else delete out.value;
    return out;
  });
}

export function emptyPayload(): StudioPayload {
  return { service_id: "", sections: [{ title: "", fields: [] }], conditional_rules: [] };
}

export function validate(payload: StudioPayload): StudioFieldErrors {
  const out: StudioFieldErrors = {};
  const sections = sectionsOf(payload.sections);
  if (!sections.length) out.sections = ED_ERR.minOne;
  const seen = new Map<string, string>();
  sections.forEach((s, i) => {
    if (!str(s.title).trim()) out[`sections.${i}.title`] = STUDIO_ERR.required;
    const rows = recList(s.fields);
    if (!rows.length) out[`sections.${i}.fields`] = ED_ERR.minOne;
    validateFieldRows(rows, `sections.${i}.fields`, seen, out);
  });
  rulesOf(payload.conditional_rules).forEach((r, i) => {
    const p = `conditional_rules.${i}`;
    const field = str(r.field);
    if (!field) out[`${p}.field`] = STUDIO_ERR.required;
    else if (!seen.has(field)) out[`${p}.field`] = STUDIO_ERR.rule;
    if (NEEDS_VALUE.has(str(r.operator)) && !str(r.value).trim()) out[`${p}.value`] = STUDIO_ERR.required;
    const show = strList(r.show_fields);
    if (!show.length) out[`${p}.show_fields`] = STUDIO_ERR.required;
    else if (show.some((n) => !seen.has(n))) out[`${p}.show_fields`] = STUDIO_ERR.rule;
  });
  return out;
}

export default function K05Editor({ payload, onChange, errors, readOnly }: StudioEditorProps) {
  const { e, ctorName } = useEd();
  const uid = useId();
  const errs = normErrors(errors);
  const sections = sectionsOf(payload.sections);
  const rules = rulesOf(payload.conditional_rules);
  const names = sections.flatMap((s) => fieldNames(recList(s.fields)));
  const nameOpts = [...new Set(names)].map((n) => ({ value: n, label: n }));
  const set = (k: string, v: unknown) => onChange({ ...payload, [k]: v });
  const setSections = (next: Dict[]) => set("sections", next);
  const setRules = (next: Dict[]) => set("conditional_rules", next);
  const patchSection = (i: number, p: Dict) => setSections(sections.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const patchRule = (i: number, p: Dict) => setRules(rulesOf(rules.map((r, j) => (j === i ? { ...r, ...p } : r))));
  const opOpts = OPERATORS.map((o) => ({ value: o, label: e(`k05.op.${o}`) }));
  const fieldCount = names.length;

  return (
    <EdShell code={CODE} icon={IconClipboardList} title={ctorName(CODE)} lead={e("k05.lead")} errors={errs} known={["service_id", "sections", "conditional_rules"]}>
      <div className="stu-fe-grid">
        <Fld id={`${uid}-svc`} label={e("common.serviceId")} error={errs.service_id} hint={e("common.serviceIdHint")}>
          <RefSelect source="services" value={str(payload.service_id)} onChange={(v) => set("service_id", v)} readOnly={readOnly} label={e("common.serviceId")} />
        </Fld>
        <div className="stu-fe-stats" aria-live="polite">
          <span>
            <b>{sections.length}</b> {e("k05.statSections")}
          </span>
          <span>
            <b>{fieldCount}</b> {e("k05.statFields")}
          </span>
          <span>
            <b>{rules.length}</b> {e("k05.statRules")}
          </span>
        </div>
      </div>

      <EdSection icon={IconFolder} title={e("k05.sections")} hint={e("k05.sectionsHint")} count={sections.length} error={errs.sections}>
        <div className="stu-fe-stack">
          {sections.map((s, i) => {
            const p = `sections.${i}`;
            const ai = edAi(CODE, "section", i);
            const titleErr = errs[`${p}.title`] ?? "";
            return (
              <article key={i} className={`stu-fe-card${titleErr || errs[`${p}.fields`] ? " is-bad" : ""}`}>
                <header className="stu-fe-card__h">
                  <span className="stu-fe-card__n">{i + 1}</span>
                  <div className="stu-fe-card__t">
                    <TextIn value={str(s.title)} onChange={(v) => patchSection(i, { title: v })} readOnly={readOnly} invalid={Boolean(titleErr)} placeholder={e("k05.sectionTitlePh")} label={e("k05.sectionTitle")} ai={`${ai}.title`} />
                    <ErrLine msg={titleErr} />
                  </div>
                  {readOnly ? null : <RowTools index={i} count={sections.length} onMove={(d) => setSections(moveItem(sections, i, d))} onRemove={() => setSections(sections.filter((_, j) => j !== i))} ai={ai} what={e("what.section")} />}
                </header>
                <ErrLine msg={errs[`${p}.fields`] ?? ""} />
                <FieldRows code={CODE} rows={recList(s.fields)} onChange={(rows) => patchSection(i, { fields: rows })} readOnly={readOnly} errors={errs} prefix={`${p}.fields`} aiBase={["section", String(i)]} />
              </article>
            );
          })}
          {readOnly ? null : <AddBtn label={e("k05.addSection")} onClick={() => setSections([...sections, { title: "", fields: [] }])} ai={edAi(CODE, "section", "add")} />}
        </div>
      </EdSection>

      <EdSection icon={IconSliders} title={e("k05.rules")} hint={e("k05.rulesHint")} count={rules.length} error={errs.conditional_rules}>
        <div className="stu-fe-rows">
          {rules.length === 0 ? <p className="stu-fe-none">{names.length ? e("k05.rulesNone") : e("k05.rulesNeedFields")}</p> : null}
          {rules.map((r, i) => {
            const p = `conditional_rules.${i}`;
            const ai = edAi(CODE, "rule", i);
            const op = str(r.operator);
            const field = str(r.field);
            const fErr = errs[`${p}.field`] ?? "";
            const vErr = errs[`${p}.value`] ?? "";
            const sErr = errs[`${p}.show_fields`] ?? "";
            const rowErr = errs[p] ?? "";
            const showOpts = nameOpts.filter((o) => o.value !== field);
            return (
              <div key={i} className={`stu-fe-row stu-fe-rule${fErr || vErr || sErr || rowErr ? " is-bad" : ""}`}>
                <span className="stu-fe-row__n" aria-hidden>
                  {i + 1}
                </span>
                <div className="stu-fe-row__g stu-fe-row__g--rule">
                  <span className="stu-fe-rule__w">{e("k05.if")}</span>
                  <div className="stu-fe-cell">
                    <span className="stu-fe-cell__l">{e("k05.ruleField")}</span>
                    <SelectIn value={field} onChange={(v) => patchRule(i, { field: v, show_fields: strList(r.show_fields).filter((n) => n !== v) })} options={nameOpts} readOnly={readOnly} label={e("k05.ruleField")} ai={`${ai}.field`} invalid={Boolean(fErr)} placeholder={e("k05.pickField")} />
                    <ErrLine msg={fErr} />
                  </div>
                  <div className="stu-fe-cell">
                    <span className="stu-fe-cell__l">{e("k05.operator")}</span>
                    <SelectIn value={op} onChange={(v) => patchRule(i, { operator: v })} options={opOpts} readOnly={readOnly} label={e("k05.operator")} ai={`${ai}.operator`} />
                  </div>
                  {NEEDS_VALUE.has(op) ? (
                    <div className="stu-fe-cell">
                      <span className="stu-fe-cell__l">{e("k05.value")}</span>
                      <TextIn value={str(r.value)} onChange={(v) => patchRule(i, { value: v })} readOnly={readOnly} invalid={Boolean(vErr)} placeholder={e("k05.valuePh")} label={e("k05.value")} ai={`${ai}.value`} />
                      <ErrLine msg={vErr} />
                    </div>
                  ) : null}
                  <div className="stu-fe-cell stu-fe-cell--wide">
                    <span className="stu-fe-cell__l">{e("k05.show")}</span>
                    {showOpts.length ? (
                      <ChipPick options={showOpts} value={strList(r.show_fields)} onChange={(v) => patchRule(i, { show_fields: v })} readOnly={readOnly} label={e("k05.show")} ai={`${ai}.show`} invalid={Boolean(sErr)} />
                    ) : (
                      <p className="stu-hint">{e("k05.showNone")}</p>
                    )}
                    <ErrLine msg={sErr} />
                  </div>
                  {rowErr ? (
                    <div className="stu-fe-cell stu-fe-cell--wide">
                      <ErrLine msg={rowErr} />
                    </div>
                  ) : null}
                </div>
                {readOnly ? null : <RowTools index={i} count={rules.length} onMove={(d) => setRules(moveItem(rules, i, d))} onRemove={() => setRules(rules.filter((_, j) => j !== i))} ai={ai} what={e("what.rule")} />}
              </div>
            );
          })}
          {readOnly || !names.length ? null : <AddBtn label={e("k05.addRule")} onClick={() => setRules([...rules, { field: names[0] ?? "", operator: "not_empty", show_fields: [] }])} ai={edAi(CODE, "rule", "add")} />}
        </div>
      </EdSection>
    </EdShell>
  );
}

