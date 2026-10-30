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
import { SxSegmented } from "../../shared/Segmented";
import { TextInput } from "../../form/TextInput";
import { BriefcaseBusinessIcon, CheckIcon, CircleAlertIcon, CoinsIcon, FlagIcon, ImageIcon, ListChecksIcon, LockIcon, MessageSquareTextIcon, PaperclipIcon, glyph } from "../../icons";
import { UserRound as UserRoundIcon } from "lucide-react";
import { AudienceNote } from "../AudienceNote";
import type { SxErrors, SxIcon } from "../../types";
import {
  EVIDENCE_METHODS,
  PROOF_METHODS,
  REQUIRED_KEY,
  SHOW_KEY,
  checklistValueAfter,
  errorsUnder,
  executorTitleOf,
  hasMethod,
  isMustHave,
  isShownToClient,
  newCheckRow,
  setMustHave,
  setShownToClient,
  toggleMethod,
  withCheckText,
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

// Payout stages (backend item field payout_stage, required): the items the
// advocate completes for the second 30%, and the final ones for the 40%
// paid once the service is done and the 15-minute window closes.
export type PayoutStage = "first_checklist" | "final_completion";
export const PAYOUT_STAGES: readonly PayoutStage[] = ["first_checklist", "final_completion"];
export const stageOf = (row: Dict): PayoutStage => (row.payout_stage === "first_checklist" ? "first_checklist" : "final_completion");
// The first-stage items first, then the final ones; each keeps its order.
export const byStage = (rows: readonly Dict[]): Dict[] => [...rows.filter((r) => stageOf(r) === "first_checklist"), ...rows.filter((r) => stageOf(r) === "final_completion")];

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
  const shown = !locked && isShownToClient(row, m as EvidenceMethod);
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
        <div className="sx-k2m__switches">
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
          <div className="sx-k2m__show" data-path={`${base}.${SHOW_KEY[m as EvidenceMethod]}`} data-on={shown ? "" : undefined} title={on ? undefined : t("sx.k02.cl.mustOff")}>
            <Switch
              checked={shown}
              onChange={(v) => set(setShownToClient(row, m as EvidenceMethod, v))}
              disabled={!on}
              readOnly={readOnly}
              label={t("sx.k02.cl.showToClient")}
              aria-label={t("sx.k02.cl.showOf", { method: name })}
              aiId={makeAiId(ai, m, "show_to_client")}
            />
          </div>
        </div>
      )}
    </li>
  );
}

function CheckRow({ row, base, idBase, ai, readOnly, errors, policy, set, errorText }: RowProps): ReactElement {
  const ts = useTranslations("studio");
  const stageSwitch = (
    <div className="sx-k2cl__stage" data-path={`${base}.payout_stage`}>
      <span className="sx-field__label">{ts("sx.k02.cl.stage")}</span>
      <SxSegmented<PayoutStage>
        label={ts("sx.k02.cl.stage")}
        value={stageOf(row)}
        onChange={(v) => (readOnly ? undefined : set({ ...row, payout_stage: v }))}
        items={PAYOUT_STAGES.map((s) => ({ value: s, label: ts(`sx.k02.cl.stageOpt.${s}`), icon: s === "first_checklist" ? CoinsIcon : FlagIcon, disabled: readOnly }))}
        size="sm"
        aiId={makeAiId(ai, "payout_stage")}
      />
    </div>
  );
  const t = useTranslations("studio");
  const shownAt = (p: string, type: string): string => {
    const tok = policy.visible(p, errors);
    return tok ? errorText(tok, p, type) : "";
  };
  // An item is named, nothing more (owner, 2026-10-30): the performer's
  // name and the client's. An older item's description / client_description
  // stays in the row untouched and is saved back as it was.
  const titlePath = `${base}.executor_title`;
  const clientTitlePath = `${base}.client_title`;
  const reqPath = `${base}.required`;
  const methodsPath = `${base}.verification_methods`;
  const methodKeys = new Set([methodsPath, `${base}.checkbox`, ...EVIDENCE_METHODS.flatMap((m) => [`${base}.${REQUIRED_KEY[m]}`, `${base}.${SHOW_KEY[m]}`])]);
  const methodErrs = errorsUnder(errors, base).filter(([k]) => methodKeys.has(k) || k.startsWith(`${methodsPath}.`)).filter(([k]) => !!policy.visible(k, errors));
  const handled = new Set([titlePath, `${base}.title`, clientTitlePath, reqPath, ...methodKeys]);
  const restErrs = errorsUnder(errors, base).filter(([k]) => !handled.has(k) && !k.startsWith(`${methodsPath}.`) && !!policy.visible(k, errors));
  const helpId = `${idBase}-methods-help`;
  const errId = `${idBase}-methods-err`;
  const required = row.required !== false;
  return (
    <div className="sx-k2cl">
      {stageSwitch}
      <div className="sx-k2cl__voices">
        <section className="sx-k2cl__voice" data-who="performer" aria-labelledby={`${idBase}-v-perf`}>
          <h4 className="sx-k2cl__voice-h" id={`${idBase}-v-perf`}>
            {glyph(BriefcaseBusinessIcon, { size: 15 })}
            {t("sx.k02.cl.voicePerformer")}
          </h4>
          <FormGrid>
            <div className="sx-sf__f" data-path={titlePath} data-span={2}>
              <Field id={`${idBase}-title`} label={t("sx.k02.cl.execTitle")} required error={shownAt(titlePath, "text")} note={<AudienceNote aud={{ who: "performer", use: "checkExec" }} />}>
                {(a) => (
                  <TextInput
                    {...a}
                    value={executorTitleOf(row)}
                    onChange={(v) => set(withCheckText(row, "executor_title", v))}
                    onBlur={() => policy.touch(titlePath)}
                    readOnly={readOnly}
                    placeholder={t("sx.k02.cl.execTitlePh")}
                    aiId={makeAiId(ai, "executor_title")}
                    aiLabel={t("sx.k02.cl.execTitle")}
                  />
                )}
              </Field>
            </div>
          </FormGrid>
        </section>
        <section className="sx-k2cl__voice" data-who="client" aria-labelledby={`${idBase}-v-client`}>
          <h4 className="sx-k2cl__voice-h" id={`${idBase}-v-client`}>
            {glyph(UserRoundIcon, { size: 15 })}
            {t("sx.k02.cl.voiceClient")}
          </h4>
          <FormGrid>
            <div className="sx-sf__f" data-path={clientTitlePath} data-span={2}>
              <Field
                id={`${idBase}-ctitle`}
                label={t("sx.k02.cl.clientTitle")}
                help={t("sx.k02.cl.clientTitleHelp")}
                error={shownAt(clientTitlePath, "text")}
                note={<AudienceNote aud={{ who: "client", use: "checkClient" }} />}
              >
                {(a) => (
                  <TextInput
                    {...a}
                    value={str(row.client_title)}
                    onChange={(v) => set(withCheckText(row, "client_title", v))}
                    onBlur={() => policy.touch(clientTitlePath)}
                    readOnly={readOnly}
                    placeholder={t("sx.k02.cl.clientTitlePh")}
                    aiId={makeAiId(ai, "client_title")}
                    aiLabel={t("sx.k02.cl.clientTitle")}
                  />
                )}
              </Field>
            </div>
          </FormGrid>
        </section>
      </div>
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
  // Shown and saved as two lists — the 30% items, then the final 40% ones.
  const items: Dict[] = byStage(Array.isArray(value) ? value.map((x) => (isDict(x) ? x : {})) : []);
  const summary = (row: Dict) => executorTitleOf(row).trim();
  const meta = (row: Dict): string => {
    const parts = [t(row.required === false ? "sx.k02.cl.metaOptional" : "sx.k02.cl.metaRequired")];
    const extra = EVIDENCE_METHODS.filter((m) => hasMethod(row, m)).map((m) => (isMustHave(row, m) ? t("sx.k02.cl.metaMust", { method: t(`sx.k02.cl.m.${m}`) }) : t(`sx.k02.cl.m.${m}`)));
    if (extra.length) parts.push(extra.join(", "));
    return parts.join(" · ");
  };
  return (
    <div className="sx-k2cl-wrap" data-ai-id={makeAiId(ai, "list")} data-ai-type="section" data-ai-label={label}>
      {PAYOUT_STAGES.map((stage) => {
        const offset = stage === "first_checklist" ? 0 : items.filter((r) => stageOf(r) === "first_checklist").length;
        const group = items.filter((r) => stageOf(r) === stage);
        const other = items.filter((r) => stageOf(r) !== stage);
        return (
          <section key={stage} className="sx-k2stage" data-stage={stage} aria-labelledby={`${id}-${stage}-h`}>
            <header className="sx-k2stage__h">
              <span className="sx-k2stage__ic" aria-hidden="true">
                {glyph(stage === "first_checklist" ? CoinsIcon : FlagIcon, { size: 17 })}
              </span>
              <span>
                <b id={`${id}-${stage}-h`}>{t(`sx.k02.cl.group.${stage}`)}</b>
                <small>{t(`sx.k02.cl.groupHelp.${stage}`)}</small>
              </span>
              <em>{group.length}</em>
            </header>
            <Repeater<Dict>
              id={`${id}-${stage}`}
              label={t(`sx.k02.cl.group.${stage}`)}
              itemName={t("sx.k02.cl.rowName")}
              items={group}
              // A row whose stage was switched moves to the other list.
              onChange={(next) => onChange(checklistValueAfter(byStage(stage === "first_checklist" ? [...next, ...other] : [...other, ...next]), absent))}
              newItem={() => ({ ...newCheckRow(emptyItem(item)), payout_stage: stage })}
              summary={summary}
              meta={meta}
              renderItem={(row, i, set) => <CheckRow row={row} base={`${path}.${offset + i}`} idBase={`${id}-${stage}-${i}`} ai={makeAiId(ai, stage, i)} readOnly={readOnly} errors={errors} policy={policy} set={set} errorText={errorText} />}
              rowErrors={(i) => policy.visibleCount(`${path}.${offset + i}`, errors)}
              addLabel={t(`sx.k02.cl.addTo.${stage}`)}
              emptyText={t(`sx.k02.cl.emptyGroup.${stage}`)}
              readOnly={readOnly}
              onTouched={() => policy.touch(path)}
              aiId={makeAiId(ai, stage)}
            />
          </section>
        );
      })}
    </div>
  );
}
