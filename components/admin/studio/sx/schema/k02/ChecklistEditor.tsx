"use client";

import "../../sx-core.css";
import "../../sx-form.css";
import "./sx-k02.css";
import { useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { aiId as makeAiId } from "@/lib/ai/ids";
import type { StudioSchemaField } from "@/lib/services/studio";
import { emptyItem } from "@/lib/studioSchema";
import { Field, FormGrid } from "../../form/Field";
import type { SxFormPolicy } from "../../form/formPolicy";
import { Repeater } from "../../form/Repeater";
import { Switch } from "../../form/Switch";
import { TextArea } from "../../form/TextArea";
import { TextInput } from "../../form/TextInput";
import { CheckIcon, CircleAlertIcon, ImageIcon, ListChecksIcon, LockIcon, MessageSquareTextIcon, PaperclipIcon, glyph } from "../../icons";
import type { SxErrors, SxIcon } from "../../types";
import {
  EVIDENCE_METHODS,
  PROOF_METHODS,
  REQUIRED_KEY,
  checklistValueAfter,
  errorsUnder,
  hasMethod,
  isMustHave,
  newCheckRow,
  setMustHave,
  toggleMethod,
  type EvidenceMethod,
  type ProofMethod,
} from "./model";

type Dict = Record<string, unknown>;

const METHOD_ICON: Readonly<Record<ProofMethod, SxIcon>> = { checkbox: ListChecksIcon, comment: MessageSquareTextIcon, image: ImageIcon, file: PaperclipIcon };

const isDict = (v: unknown): v is Dict => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export type ChecklistEditorProps = {
  id: string;
  path: string;
  label: string;
  ai: string;
  readOnly: boolean;
  value: unknown;
  item: StudioSchemaField | null;
  errors: SxErrors;
  policy: SxFormPolicy;
  onChange: (next: unknown[] | undefined) => void;
  errorText: (token: string, path: string, type: string) => string;
};

type RowProps = {
  row: Dict;
  base: string;
  idBase: string;
  ai: string;
  readOnly: boolean;
  errors: SxErrors;
  policy: SxFormPolicy;
  set: (next: Dict) => void;
  errorText: ChecklistEditorProps["errorText"];
};

function MethodTile({ m, row, base, idBase, ai, readOnly, set }: { m: ProofMethod; row: Dict; base: string; idBase: string; ai: string; readOnly: boolean; set: (next: Dict) => void }): ReactElement {
  const t = useTranslations("studio");
  const locked = m === "checkbox";
  const on = locked || hasMethod(row, m);
  const name = t(`sx.k02.cl.m.${m}`);
  const descId = `${idBase}-m-${m}-d`;
  const must = !locked && isMustHave(row, m as EvidenceMethod);
  const toggle = () => {
    if (locked || readOnly) return;
    set(toggleMethod(row, m as EvidenceMethod, !on));
  };
  return (
    <li className="sx-k2m" data-on={on ? "" : undefined} data-locked={locked ? "" : undefined} data-must={must ? "" : undefined}>
      <button
        type="button"
        role="checkbox"
        className="sx-k2m__toggle"
        aria-checked={on}
        aria-disabled={locked || readOnly ? true : undefined}
        aria-describedby={descId}
        onClick={toggle}
        data-ai-id={makeAiId(ai, m)}
        data-ai-type="checkbox"
        data-ai-label={name}
      >
        <span className="sx-k2m__box" aria-hidden="true">
          {locked ? glyph(LockIcon, { size: 12 }) : on ? glyph(CheckIcon, { size: 13, strokeWidth: 2.5 }) : null}
        </span>
        <span className="sx-k2m__icon" aria-hidden="true">
          {glyph(METHOD_ICON[m], { size: 18 })}
        </span>
        <span className="sx-k2m__text">
          <span className="sx-k2m__name">{name}</span>
          <span className="sx-k2m__desc" id={descId}>
            {locked ? t("sx.k02.cl.locked") : t(`sx.k02.cl.md.${m}`)}
          </span>
        </span>
      </button>
      {locked ? (
        <span className="sx-k2m__always">{t("sx.k02.cl.always")}</span>
      ) : (
        <div className="sx-k2m__must" data-path={`${base}.${REQUIRED_KEY[m as EvidenceMethod]}`} title={on ? undefined : t("sx.k02.cl.mustOff")}>
          <Switch
            checked={must}
            onChange={(v) => set(setMustHave(row, m as EvidenceMethod, v))}
            disabled={!on}
            readOnly={readOnly}
            label={t("sx.k02.cl.mustHave")}
            aria-label={t("sx.k02.cl.mustOf", { method: name })}
            aiId={makeAiId(ai, m, "required")}
          />
        </div>
      )}
    </li>
  );
}

function CheckRow({ row, base, idBase, ai, readOnly, errors, policy, set, errorText }: RowProps): ReactElement {
  const t = useTranslations("studio");
  const shownAt = (p: string, type: string): string => {
    const tok = policy.visible(p, errors);
    return tok ? errorText(tok, p, type) : "";
  };
  const titlePath = `${base}.title`;
  const descPath = `${base}.description`;
  const reqPath = `${base}.required`;
  const methodsPath = `${base}.verification_methods`;
  const methodKeys = new Set([methodsPath, `${base}.checkbox`, ...EVIDENCE_METHODS.map((m) => `${base}.${REQUIRED_KEY[m]}`)]);
  const methodErrs = errorsUnder(errors, base).filter(([k]) => methodKeys.has(k) || k.startsWith(`${methodsPath}.`)).filter(([k]) => !!policy.visible(k, errors));
  const handled = new Set([titlePath, descPath, reqPath, ...methodKeys]);
  const restErrs = errorsUnder(errors, base).filter(([k]) => !handled.has(k) && !k.startsWith(`${methodsPath}.`) && !!policy.visible(k, errors));
  const helpId = `${idBase}-methods-help`;
  const errId = `${idBase}-methods-err`;
  const required = row.required !== false;
  return (
    <div className="sx-k2cl">
      <FormGrid>
        <div className="sx-sf__f" data-path={titlePath} data-span={2}>
          <Field id={`${idBase}-title`} label={t("sx.k02.cl.title")} required error={shownAt(titlePath, "text")}>
            {(a) => (
              <TextInput
                {...a}
                value={str(row.title)}
                onChange={(v) => set({ ...row, title: v })}
                onBlur={() => policy.touch(titlePath)}
                readOnly={readOnly}
                placeholder={t("sx.k02.cl.titlePh")}
                aiId={makeAiId(ai, "title")}
                aiLabel={t("sx.k02.cl.title")}
              />
            )}
          </Field>
        </div>
        <div className="sx-sf__f" data-path={descPath} data-span={2}>
          <Field id={`${idBase}-desc`} label={t("sx.k02.cl.description")} error={shownAt(descPath, "textarea")}>
            {(a) => (
              <TextArea
                {...a}
                value={str(row.description)}
                onChange={(v) => set({ ...row, description: v })}
                onBlur={() => policy.touch(descPath)}
                readOnly={readOnly}
                placeholder={t("sx.k02.cl.descriptionPh")}
                aiId={makeAiId(ai, "description")}
                aiLabel={t("sx.k02.cl.description")}
              />
            )}
          </Field>
        </div>
      </FormGrid>
      <div className="sx-k2cl__req" data-path={reqPath} data-on={required ? "" : undefined}>
        <Field id={`${idBase}-req`} label={t("sx.k02.cl.required")} help={t("sx.k02.cl.requiredHelp")} layout="inline" error={shownAt(reqPath, "boolean")}>
          {(a) => (
            <Switch
              id={`${idBase}-req`}
              checked={required}
              onChange={(v) => set({ ...row, required: v })}
              readOnly={readOnly}
              aria-describedby={a["aria-describedby"]}
              aiId={makeAiId(ai, "required")}
              aiLabel={t("sx.k02.cl.required")}
            />
          )}
        </Field>
      </div>
      <fieldset className="sx-k2cl__methods" data-path={methodsPath} aria-describedby={[helpId, methodErrs.length ? errId : ""].filter(Boolean).join(" ")} data-invalid={methodErrs.length ? "" : undefined}>
        <legend className="sx-field__label sx-k2cl__legend">{t("sx.k02.cl.methods")}</legend>
        <ul className="sx-k2m-grid">
          {PROOF_METHODS.map((m) => (
            <MethodTile key={m} m={m} row={row} base={base} idBase={idBase} ai={makeAiId(ai, "method")} readOnly={readOnly} set={set} />
          ))}
        </ul>
        <p className="sx-field__help" id={helpId}>
          {t("sx.k02.cl.methodsHelp")}
        </p>
        {methodErrs.length ? (
          <div id={errId}>
            {methodErrs.map(([k, tok]) => (
              <p key={k} className="sx-field__err">
                {glyph(CircleAlertIcon, { size: 14 })}
                <span>{errorText(tok, k, "multiselect")}</span>
              </p>
            ))}
          </div>
        ) : null}
      </fieldset>
      {restErrs.map(([k, tok]) => (
        <p key={k} className="sx-field__err" data-path={k}>
          {glyph(CircleAlertIcon, { size: 14 })}
          <span>{errorText(tok, k, "text")}</span>
        </p>
      ))}
    </div>
  );
}

export function ChecklistEditor({ id, path, label, ai, readOnly, value, item, errors, policy, onChange, errorText }: ChecklistEditorProps): ReactElement {
  const t = useTranslations("studio");
  const [absent] = useState(() => !Array.isArray(value));
  const items: Dict[] = Array.isArray(value) ? value.map((x) => (isDict(x) ? x : {})) : [];
  const summary = (row: Dict) => str(row.title).trim();
  const meta = (row: Dict): string => {
    const parts = [t(row.required === false ? "sx.k02.cl.metaOptional" : "sx.k02.cl.metaRequired")];
    const extra = EVIDENCE_METHODS.filter((m) => hasMethod(row, m)).map((m) => (isMustHave(row, m) ? t("sx.k02.cl.metaMust", { method: t(`sx.k02.cl.m.${m}`) }) : t(`sx.k02.cl.m.${m}`)));
    if (extra.length) parts.push(extra.join(", "));
    return parts.join(" · ");
  };
  return (
    <div className="sx-k2cl-wrap" data-ai-id={makeAiId(ai, "list")} data-ai-type="section" data-ai-label={label}>
      <Repeater<Dict>
        id={id}
        label={label}
        itemName={t("sx.k02.cl.rowName")}
        items={items}
        onChange={(next) => onChange(checklistValueAfter(next, absent))}
        newItem={() => newCheckRow(emptyItem(item))}
        summary={summary}
        meta={meta}
        renderItem={(row, i, set) => <CheckRow row={row} base={`${path}.${i}`} idBase={`${id}-${i}`} ai={makeAiId(ai, i)} readOnly={readOnly} errors={errors} policy={policy} set={set} errorText={errorText} />}
        rowErrors={(i) => policy.visibleCount(`${path}.${i}`, errors)}
        addLabel={t("sx.k02.cl.add")}
        emptyText={t("sx.k02.cl.empty")}
        readOnly={readOnly}
        onTouched={() => policy.touch(path)}
        aiId={ai}
      />
    </div>
  );
}
