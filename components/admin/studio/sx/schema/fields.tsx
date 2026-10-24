"use client";

import "../sx-core.css";
import "../sx-form.css";
import "../sx-layout.css";
import "./sx-schema.css";
import "./sx-schema-neon.css";
import { createContext, memo, useContext, useEffect, useState, type ReactElement, type ReactNode } from "react";
import { aiId, aiSeg } from "@/lib/ai/ids";
import { notify } from "@/lib/toast";
import { studioReferenceKey, type StudioSchemaField } from "@/lib/services/studio";
import { emptyItem, fieldVisible, normPath } from "@/lib/studioSchema";
import { ChoiceCards, ChoiceCardsMulti, type ChoiceCard } from "../form/ChoiceCards";
import { DateField } from "../form/DateField";
import { Field, FormGrid } from "../form/Field";
import type { SxFormPolicy } from "../form/formPolicy";
import { KeyValue } from "../form/KeyValue";
import { splitDateValue, zonedIso } from "../form/logic";
import { MoneyInput } from "../form/MoneyInput";
import { NumberInput } from "../form/NumberInput";
import { Picker } from "../form/Picker";
import { Repeater } from "../form/Repeater";
import { Switch } from "../form/Switch";
import { TextArea } from "../form/TextArea";
import { TextInput } from "../form/TextInput";
import { firstReferencePage, pendingReferenceNow, usePendingReferences } from "../form/useReferenceOptions";
import { TriangleAlertIcon, glyph } from "../icons";
import { SxSectionHeader } from "../layout/Panel";
import type { SchemaFieldModel, SchemaModel, SxControlKind, SxEditMode, SxFileSlot, SxLayoutCtx, SxLayoutField, SxValues, SxWarning } from "../contract";
import type { SxControlA11y, SxErrors, SxIcon, SxOption, SxRule } from "../types";
import type { StudioLabels } from "../useStudioLabels";
import { useStudioLabels } from "../useStudioLabels";
import { useCategoryTitle } from "./categoryOptions";
import { DiscoveryTerms } from "./DiscoveryTerms";
import { RuleTwinNote } from "./RuleTwinNote";
import { lineageOf } from "./ruleDuplicates";
import { fieldAudienceOf } from "./audience";
import { AudienceNote } from "./AudienceNote";
import { ChecklistEditor } from "./k02/ChecklistEditor";
import { FactorOverrides } from "./k02/FactorOverrides";
import { FACTOR_IDS, TEMPLATE_ID, TEMPLATE_MODE, TEMPLATE_SKIP, canSuggest, suggestBody, templateModeOf } from "./k02/model";
import { TemplateField } from "./k02/TemplateField";
import { BOARD_FIELDS, RULE_IDS, RuleAudienceBoard } from "./k02/RuleAudienceBoard";
import { RefPicker } from "./RefPicker";
import { NEON_WIDE_RO, fieldIcon, type SxLook } from "./neonLook";
import { RichText, RichTextView } from "./RichText";
import { DocEditor } from "./legal/DocEditor";
import { LegalRuBlock, LegalUzBlock } from "./legal/LegalText";
import { docFieldsOf } from "./legal/model";
import { TemplateFile } from "./legal/TemplateFile";
import {
  controlFor,
  dyn,
  effectiveSource,
  fieldLabelOf,
  getAt,
  lastKey,
  layoutCtx,
  layoutFieldFor,
  optionTextOf,
  rowSummaryText,
  schemaFieldAt,
  spanFor,
  type SchemaTr,
} from "./model";

type Dict = Record<string, unknown>;

const FACTOR_SOURCE = "/studio/reference/price-factors";

export type SfEnv = {
  model: SchemaModel;
  root: SxValues;
  errors: SxErrors;
  warnings: readonly SxWarning[];
  readOnly: boolean;
  mode: SxEditMode;
  recordId: string;
  owner?: string;
  emit: (path: string, value: unknown, clears?: readonly string[]) => void;
  onDraftError?: (path: string, invalid: boolean) => void;
  policy: SxFormPolicy;
  labels: StudioLabels;
  t: SchemaTr;
  look?: SxLook;
  file?: SxFileSlot | null;
};

export const SfContext = createContext<SfEnv | null>(null);

function useEnv(): SfEnv {
  const env = useContext(SfContext);
  if (!env) throw new Error("SchemaField outside SchemaForm");
  return env;
}

const isDict = (v: unknown): v is Dict => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "");
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : typeof v === "string" && v ? [v] : []);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_TIME = "09:00";

export function withDefaultTime(prev: string, next: string | undefined): string | undefined {
  if (!next || str(prev).trim() || DAY.test(next)) return next;
  const parts = splitDateValue(next, true);
  return parts.date && parts.time === "00:00" ? zonedIso(parts.date, DEFAULT_TIME) : next;
}

function childNodes(model: SchemaModel, parent: StudioSchemaField, pattern: string): SchemaFieldModel[] {
  const props = parent.type === "list" ? (parent.item?.properties ?? []) : parent.properties;
  const req = new Set(parent.type === "list" ? (parent.item?.requiredFields ?? []) : parent.requiredFields);
  const base = parent.type === "list" ? `${pattern}.*` : pattern;
  const out: SchemaFieldModel[] = [];
  for (const p of props) {
    if (p.hidden) continue;
    const pat = `${base}.${p.key}`;
    const lf = layoutFieldFor(model, pat);
    if (lf?.hidden) continue;
    out.push({ pattern: pat, key: p.key, field: p, layout: lf, required: p.required || req.has(p.key) });
  }
  return out;
}

function ruleOf(model: SchemaModel, node: SchemaFieldModel, path: string, source: string): SxRule {
  const f = node.field;
  const vt = node.layout?.virtual?.type;
  return {
    type: f?.type ?? (vt === "boolean" ? "boolean" : vt ?? "text"),
    key: node.key,
    ctor: model.code,
    path,
    min: f?.min ?? null,
    max: f?.max ?? null,
    minItems: f?.minItems ?? 0,
    source,
    options: f?.optionLabels,
  };
}

function warningsAt(list: readonly SxWarning[], path: string, pattern: string): SxWarning[] {
  return list.filter((w) => {
    if (!w.path) return false;
    if (w.path.includes("*")) return w.path === pattern;
    return normPath(w.path) === path;
  });
}

function optionsFor(lf: SxLayoutField | null, f: StudioSchemaField | null): string[] {
  if (lf?.options?.length) return [...lf.options];
  if (lf?.virtual?.options?.length) return [...lf.virtual.options];
  if (f?.options.length) return [...f.options];
  if (f?.item?.options.length) return [...f.item.options];
  return [];
}

type RefName = { label: string; meta: string; pending: boolean };

// Names (and a short detail line) of picked references, from the published
// list or, for one still awaiting approval, from its draft.
function useRefLabels(sources: readonly string[]): (source: string, value: string) => RefName | null {
  const labels = useStudioLabels();
  const key = [...new Set(sources.filter(Boolean))].sort().join("\n");
  const [maps, setMaps] = useState<Readonly<Record<string, Readonly<Record<string, RefName>>>>>({});
  usePendingReferences();
  useEffect(() => {
    if (!key) return;
    let live = true;
    for (const s of key.split("\n")) {
      firstReferencePage(s).then(
        (rows) => {
          if (!live) return;
          const map: Record<string, RefName> = {};
          for (const r of rows) {
            const o = labels.refOption(s, r);
            map[r.value] = { label: o.label, meta: o.description ?? "", pending: false };
          }
          setMaps((m) => ({ ...m, [s]: map }));
        },
        () => {},
      );
    }
    return () => {
      live = false;
    };
  }, [key, labels]);
  return (source, value) => {
    const hit = maps[source]?.[value];
    if (hit) return hit;
    if (!maps[source]) return null;
    const draft = pendingReferenceNow(value);
    if (!draft) return null;
    const o = labels.refOption(source, draft);
    return { label: o.label, meta: o.description ?? "", pending: true };
  };
}

export function RefNames({ source, values }: { source: string; values: readonly string[] }): ReactElement {
  const labels = useStudioLabels();
  const name = useRefLabels([source]);
  return <>{labels.list(values.map((v) => name(source, v)?.label || labels.unknownRef(v)), values.length)}</>;
}

function NeonChips({ items }: { items: readonly ReactNode[] }): ReactElement {
  return (
    <ul className="sx-nv__chips">
      {items.map((x, i) => (
        <li key={i} className="sx-nv__chip">
          {x}
        </li>
      ))}
    </ul>
  );
}

// Price factors keep their type and value beside the name, so several
// picked ones stay told apart.
const DETAILED_SOURCES = new Set(["price-factors"]);

function RefChips({ source, values }: { source: string; values: readonly string[] }): ReactElement {
  const labels = useStudioLabels();
  const name = useRefLabels([source]);
  const detailed = DETAILED_SOURCES.has(studioReferenceKey(source).key);
  return (
    <NeonChips
      items={values.map((v) => {
        const n = name(source, v);
        if (!n) return labels.unknownRef(v);
        const extra = [detailed ? n.meta : "", n.pending ? labels.pendingRef() : ""].filter(Boolean).join(" · ");
        if (!extra) return n.label;
        return (
          <>
            <span className="sx-nv__chip-name">{n.label}</span>
            <span className="sx-nv__chip-meta">{extra}</span>
          </>
        );
      })}
    />
  );
}

const TEXT_TYPES = new Set(["text", "textarea", "richtext"]);

// Text, descriptions and lists of text: the fields that get an audience note.
function isTextField(f: StudioSchemaField | null): boolean {
  if (!f) return false;
  return TEXT_TYPES.has(f.type) || (f.type === "list" && !!f.item && TEXT_TYPES.has(f.item.type) && !f.item.properties.length);
}

function blankValue(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (isDict(v)) return Object.keys(v).length === 0;
  return false;
}

export function NeonValue({ id, label, value, empty }: { id: string; label: string; value: ReactNode; empty: boolean }): ReactElement {
  const { t } = useEnv();
  return (
    <div className="sx-nv" role="group" aria-labelledby={`${id}-label`}>
      <span className="sx-nv__label" id={`${id}-label`}>
        {label}
      </span>
      <div className="sx-nv__value" id={id} data-empty={empty ? "" : undefined}>
        {empty ? (
          <>
            <span aria-hidden="true">—</span>
            <span className="sx-vh">{t("sx.ui.notSet")}</span>
          </>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

export function NeonCell({
  icon,
  path,
  span,
  ai,
  children,
}: {
  icon: SxIcon;
  path: string;
  span: 1 | 2;
  ai?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="sx-sf__f" data-neon="" data-path={path} data-span={span} data-ai-id={ai}>
      <span className="sx-nf__icon" aria-hidden="true">
        {glyph(icon, { size: 18 })}
      </span>
      <div className="sx-nf__body">{children}</div>
    </div>
  );
}

function WarnLine({ id, list }: { id: string; list: readonly SxWarning[] }): ReactElement | null {
  const { t } = useEnv();
  if (!list.length) return null;
  return (
    <div className="sx-sf__warns" id={id}>
      {list.map((w) => (
        <p key={w.key} className="sx-sf__warn" data-tone={w.tone}>
          {glyph(TriangleAlertIcon, { size: 14 })}
          <span>{t(w.key, w.values ? { ...w.values } : undefined)}</span>
        </p>
      ))}
    </div>
  );
}

function TagsField({
  id,
  a11y,
  value,
  label,
  readOnly,
  ai,
  suggest,
  service,
  onChange,
  onBlur,
}: {
  id: string;
  a11y: SxControlA11y;
  value: string[];
  label: string;
  readOnly: boolean;
  ai: string;
  suggest: { title: string; description: string; parentId: string } | null;
  service: { ready: boolean; body: Record<string, unknown> } | null;
  onChange: (v: string[]) => void;
  onBlur: () => void;
}): ReactElement {
  const parentTitle = useCategoryTitle(suggest?.parentId ?? "");
  return (
    <DiscoveryTerms
      id={id}
      value={value}
      onChange={onChange}
      label={label}
      readOnly={readOnly}
      a11y={a11y}
      aiId={ai}
      suggest={suggest ? { title: suggest.title, description: suggest.description, parentTitle } : null}
      service={service}
      onBlur={onBlur}
    />
  );
}

function RowsField({ node, path, ai, id, label, ro, f }: { node: SchemaFieldModel; path: string; ai: string; id: string; label: string; ro: boolean; f: StudioSchemaField }): ReactElement {
  const env = useEnv();
  const { model, root, labels, t, policy, errors, emit } = env;
  const items = Array.isArray(getAt(root, path)) ? (getAt(root, path) as unknown[]) : [];
  const lf = node.layout;
  const inline = f.item?.type !== "object";
  const props = f.item?.properties ?? [];
  const sources = inline ? [] : props.map((p) => effectiveSource(model.code, { pattern: `${node.pattern}.*.${p.key}`, field: p }, {}));
  const refLabel = useRefLabels(sources);
  const refName = (source: string, value: string) => refLabel(source, value)?.label ?? "";
  const scopeSource = (pattern: string, p: StudioSchemaField) => effectiveSource(model.code, { pattern, field: p }, {});
  const children = inline ? [] : childNodes(model, f, node.pattern);
  const summary = (item: unknown, i: number): string =>
    lf?.summary && isDict(item) ? lf.summary(item, i, labels) || t("sx.rep.item", { n: i + 1 }) : rowSummaryText(item, i, { field: f, code: model.code, labels, t, refName, scopeSource, pattern: node.pattern });
  const meta = lf?.meta ? (item: unknown, i: number) => (isDict(item) ? lf.meta?.(item, i, labels) : "") : undefined;
  const itemType = f.item?.type ?? "text";
  const renderInline = (item: unknown, i: number): ReactNode => {
    const p = `${path}.${i}`;
    const rowLabel = t("sx.rep.item", { n: i + 1 });
    const bad = !!policy.visible(p, errors);
    const itemKey = f.item?.key || "value";
    if (itemType === "number" || itemType === "money") {
      return (
        <NumberInput
          value={num(item)}
          onChange={(v) => emit(p, v ?? null)}
          onDraftInvalid={(b) => env.onDraftError?.(p, b)}
          onBlur={() => policy.touch(p)}
          invalid={bad}
          readOnly={ro}
          aria-label={rowLabel}
          aiId={aiId(ai, i)}
        />
      );
    }
    if (itemType === "boolean") return <Switch checked={item === true} onChange={(v) => emit(p, v)} readOnly={ro} aria-label={rowLabel} aiId={aiId(ai, i)} />;
    return (
      <TextInput
        value={str(item)}
        onChange={(v) => emit(p, v)}
        onBlur={() => policy.touch(p)}
        invalid={bad}
        readOnly={ro}
        aria-label={rowLabel}
        placeholder={labels.placeholder(itemKey, { ctor: model.code, path: `${path}.${i}.${itemKey}`, type: itemType }) || undefined}
        aiId={aiId(ai, i)}
        aiLabel={rowLabel}
      />
    );
  };
  const renderObject = (item: unknown, i: number): ReactNode => {
    const scope = isDict(item) ? item : {};
    return (
      <FormGrid>
        {children.map((c) => (
          <SchemaField key={c.pattern} node={c} path={`${path}.${i}.${c.key}`} scope={scope} />
        ))}
      </FormGrid>
    );
  };
  return (
    <Repeater<unknown>
      id={id}
      label={label}
      itemName={t("sx.form.rowName")}
      items={items}
      onChange={(next) => emit(path, next)}
      newItem={() => emptyItem(f.item)}
      summary={summary}
      meta={meta}
      renderItem={(item, i) => (inline ? renderInline(item, i) : renderObject(item, i))}
      inline={inline}
      rowErrors={(i) => policy.visibleCount(`${path}.${i}`, errors)}
      minItems={f.minItems || undefined}
      addLabel={t(lf?.addKey ?? "sx.rep.add")}
      emptyText={lf?.emptyKey && t.has(lf.emptyKey) ? t(lf.emptyKey) : undefined}
      readOnly={ro}
      onTouched={() => policy.touch(path)}
      aiId={ai}
    />
  );
}

// `inBoard`: drawn by a board that owns the field (the K02 rule panels),
// not by its section.
function SchemaFieldImpl({ node, path, scope, inBoard = false }: { node: SchemaFieldModel; path: string; scope: SxValues; inBoard?: boolean }): ReactElement | null {
  const env = useEnv();
  const { model, root, labels, t, policy, errors, emit, readOnly: formRo } = env;
  const f = node.field;
  const lf = node.layout;
  if (lf?.hidden || f?.hidden) return null;
  const k02 = model.code.toUpperCase() === "K02";
  if (k02 && !inBoard && BOARD_FIELDS.has(node.pattern)) return null;
  const ctx: SxLayoutCtx = layoutCtx(model, root, scope, env.mode, env.recordId);
  if (lf?.visible && !lf.visible(ctx)) return null;
  if (f && !fieldVisible(f, scope as Dict)) return null;

  const norm = normPath(path);
  const value = getAt(root, path);
  const legacy = !!lf?.legacyOf && model.ctor.typed.some((x) => x.key === lf.legacyOf);
  if (legacy && blankValue(value)) return null;
  const control: SxControlKind = controlFor(model.code, node, value, ctx);
  const source = effectiveSource(model.code, node, scope);
  const id = `${model.idPrefix}-f-${aiSeg(path)}`;
  const ai = aiId(model.aiBase, "field", path);
  const neon = env.look === "neon";
  const span: 1 | 2 = neon && formRo ? (lf?.span ?? (NEON_WIDE_RO.has(control) ? 2 : 1)) : spanFor(control, node.key, lf);
  const virtual = lf?.virtual;
  const lockKey = lf?.locked?.(ctx) || "";
  const fieldRo = !!f?.readOnly || !!virtual?.readOnly || !!lockKey;
  const ro = formRo || fieldRo;

  const label = legacy && lf?.legacyLabel && t.has(lf.legacyLabel) ? t(lf.legacyLabel) : fieldLabelOf(model, node.key, path, f, lf, labels, t, ctx);
  const ownHelp = legacy && lf?.legacyHelp ? lf.legacyHelp : dyn(lf?.help, ctx);
  let help = "";
  if (lockKey) help = t.has(lockKey) ? t(lockKey) : "";
  else if (ownHelp === false) help = "";
  else if (typeof ownHelp === "string") help = t.has(ownHelp) ? t(ownHelp) : "";
  else if (virtual?.helpKey) help = t.has(virtual.helpKey) ? t(virtual.helpKey) : "";
  else {
    help = labels.help(node.key, { ctor: model.code, path, backend: f?.help });
    if (!help && f?.type === "list" && f.item) help = labels.help(f.item.key || node.key, { ctor: model.code, path: `${path}.0.${f.item.key || node.key}`, backend: f.item.help });
  }
  const ownPh = dyn(lf?.placeholder, ctx);
  const isNumber = control === "number" || control === "money" || control === "percent";
  let placeholder: string | undefined;
  if (!isNumber && ownPh !== false) {
    if (typeof ownPh === "string") placeholder = t.has(ownPh) ? t(ownPh) : undefined;
    else if (virtual?.placeholderKey) placeholder = t.has(virtual.placeholderKey) ? t(virtual.placeholderKey) : undefined;
    else placeholder = labels.placeholder(node.key, { ctor: model.code, path, type: f?.type }) || undefined;
  }
  // Who reads a text field and what it is for. The backend's generic help
  // line for such a field adds nothing next to that, so it gives way.
  const aud = !ro && isTextField(f) ? fieldAudienceOf(model.code, path, scope, root) : null;
  if (aud && f?.help && help === str(f.help)) help = "";
  const note = aud ? <AudienceNote aud={aud} /> : undefined;
  const rule = ruleOf(model, node, path, source);
  const hint = f && (f.type === "number" || f.type === "money" || f.type === "text" || f.type === "textarea") ? labels.hint({ type: f.type, min: f.min, max: f.max }) : "";
  const token = policy.visible(norm, errors);
  const error = token ? labels.error(token, rule) : "";
  const warns = warningsAt(env.warnings, norm, node.pattern);
  const warnId = `${id}-warn`;
  const opt = (v: string) => optionTextOf(v, { layout: lf, field: f, code: model.code, key: node.key, labels, t });
  const shown = { required: node.required };
  const touch = () => policy.touch(norm);
  const set = (v: unknown) => emit(path, v, lf?.clears);
  const withWarn = (a: SxControlA11y): SxControlA11y => (warns.length ? { ...a, "aria-describedby": [a["aria-describedby"], warnId].filter(Boolean).join(" ") } : a);

  // A rule name already taken by another rule: the existing one, offered
  // instead. A service's own rule can be swapped for the shared one.
  const upper = model.code.toUpperCase();
  const inlineRule = upper === "K02" ? /^inline_rules\.(\d+)\.title$/.exec(norm) : null;
  const twin =
    !ro && ((upper === "K31" && norm === "title") || inlineRule) ? (
      <RuleTwinNote
        title={value}
        self={upper === "K31" ? [env.recordId] : []}
        lineage={upper === "K31" ? lineageOf(root) : null}
        aiId={aiId(ai, "twin")}
        action={
          inlineRule
            ? {
                label: t("sx.rtw.useShared"),
                run: (x) => {
                  const ids = strList(root.rule_ids);
                  const rows = Array.isArray(root.inline_rules) ? root.inline_rules : [];
                  if (!ids.includes(x.value)) emit("rule_ids", [...ids, x.value]);
                  emit("inline_rules", rows.filter((_, k) => k !== Number(inlineRule[1])));
                  notify.success(t("sx.rtw.usedShared", { name: x.title }));
                },
              }
            : undefined
        }
      />
    ) : null;

  const cell = (body: ReactNode, extra?: ReactNode) =>
    neon ? (
      <NeonCell icon={fieldIcon(node.key, f?.type ?? virtual?.type, control)} path={norm} span={span} ai={aiId(ai, "root")}>
        {body}
        <WarnLine id={warnId} list={warns} />
        {twin}
        {extra}
      </NeonCell>
    ) : (
      <div className="sx-sf__f" data-path={norm} data-span={span} data-ai-id={aiId(ai, "root")}>
        {body}
        <WarnLine id={warnId} list={warns} />
        {twin}
        {extra}
      </div>
    );

  // Rules for each side of the service in their own panel (see
  // RuleAudienceBoard): the shared rules, the service's own rules, and the
  // side's other rule setting.
  if (k02 && node.pattern === RULE_IDS && source) {
    const nodes = model.sections.flatMap((s) => s.fields);
    return cell(
      <RuleAudienceBoard
        id={id}
        ai={ai}
        root={root}
        source={source}
        readOnly={ro}
        errors={errors}
        policy={policy}
        t={t}
        errorText={(tok, p) => labels.error(tok, { type: "text", key: lastKey(p), ctor: model.code, path: p })}
        emit={(p, v) => emit(p, v)}
        renderField={(pattern) => {
          const n = nodes.find((x) => x.pattern === pattern);
          return n ? <SchemaField node={n} path={pattern} scope={root} inBoard /> : null;
        }}
        code={model.code}
        recordId={env.recordId}
        owner={env.owner ?? ""}
        categoryId={str(root.category_id).trim()}
      />,
    );
  }

  if (model.code.toUpperCase() === "K02" && node.pattern === TEMPLATE_MODE) {
    const tplField = model.ctor.typed.find((x) => x.key === TEMPLATE_ID) ?? null;
    const tplSource = tplField ? effectiveSource(model.code, { pattern: TEMPLATE_ID, field: tplField }, root) : "";
    if (tplSource) {
      const mode = templateModeOf(value);
      const picked = str(root[TEMPLATE_ID]).trim();
      if (formRo) {
        const shown: ReactNode =
          mode === TEMPLATE_SKIP ? t("sx.k02.tpl.skip") : picked ? (
            <>
              {mode ? `${opt(mode)} · ` : ""}
              <RefNames source={tplSource} values={[picked]} />
            </>
          ) : mode ? opt(mode) : "";
        const empty = shown === "";
        return neon ? cell(<NeonValue id={id} label={label} value={shown} empty={empty} />) : cell(<Field id={id} label={label} readOnly value={shown} span={span} />);
      }
      const tok = policy.visible(norm, errors) || policy.visible(TEMPLATE_ID, errors);
      const tplError = tok ? labels.error(tok, { ...rule, key: TEMPLATE_ID, path: TEMPLATE_ID }) : "";
      return cell(
        <Field id={id} label={label} help={help} error={tplError} required as="fieldset" span={2}>
          <TemplateField
            id={id}
            ai={ai}
            root={root}
            source={tplSource}
            errorId={tplError ? `${id}-err` : undefined}
            invalid={!!tplError}
            formCode={model.code}
            recordId={env.recordId}
            owner={env.owner ?? ""}
            categoryId={str(root.category_id).trim()}
            serviceId={str(root.service_id).trim() || env.recordId}
            onPatch={(patch) => {
              for (const [k, v] of Object.entries(patch)) emit(k, v);
            }}
            onTouch={() => {
              policy.touch(norm);
              policy.touch(TEMPLATE_ID);
            }}
          />
        </Field>,
      );
    }
  }

  if (control === "factorOverrides") {
    const ids = strList(scope[FACTOR_IDS]);
    if (!ids.length) return null;
    const idsPattern = node.pattern.includes(".") ? `${node.pattern.slice(0, node.pattern.lastIndexOf("."))}.${FACTOR_IDS}` : FACTOR_IDS;
    const factorField = schemaFieldAt(model.ctor.typed, idsPattern);
    const factorSource = factorField ? effectiveSource(model.code, { pattern: idsPattern, field: factorField }, scope) : "";
    return cell(
      <Field id={id} label={label} help={help} error={error} as="fieldset" span={span}>
        <FactorOverrides
          id={`${id}-list`}
          label={label}
          ai={ai}
          readOnly={ro}
          source={factorSource || FACTOR_SOURCE}
          ids={ids}
          value={value}
          path={norm}
          pattern={node.pattern}
          errors={errors}
          policy={policy}
          onChange={(next) => set(next)}
          onDraftError={env.onDraftError}
          formCode={model.code}
          owner={env.owner ?? ""}
          categoryId={str(root.category_id).trim()}
          forPackage={model.code.toUpperCase() === "K03-M"}
        />
      </Field>,
    );
  }

  if (control === "checklist") {
    return cell(
      <Field id={id} label={label} help={help} error={error} required={shown.required} as="fieldset" span={span}>
        <ChecklistEditor
          id={id}
          path={norm}
          label={label}
          ai={ai}
          readOnly={ro}
          value={value}
          item={f?.item ?? null}
          errors={errors}
          policy={policy}
          onChange={(next) => set(next)}
          errorText={(tok, p, type) => labels.error(tok, { type, key: lastKey(p), ctor: model.code, path: p })}
        />
      </Field>,
    );
  }

  if (control === "legalUz" || control === "legalRu") {
    const Block = control === "legalUz" ? LegalUzBlock : LegalRuBlock;
    const errorAt = (p: string): string => {
      const tok = policy.visible(p, errors);
      return tok ? labels.error(tok, { type: "text", key: lastKey(p), ctor: model.code, path: p }) : "";
    };
    return cell(
      <Block
        id={id}
        ai={ai}
        label={label}
        help={help}
        required={shown.required}
        readOnly={formRo}
        root={root}
        emit={(p, v) => emit(p, v)}
        errorAt={errorAt}
        touch={(p) => policy.touch(p)}
      />,
    );
  }

  if (control === "file") {
    return cell(
      <Field id={id} label={label} help={help} error={token === "@file" ? t("sx.k06.file.required") : error} required={shown.required && !formRo} span={span}>
        {(a) => <TemplateFile id={id} ai={ai} label={label} slot={env.file ?? null} readOnly={formRo} error={error} describedBy={a["aria-describedby"]} />}
      </Field>,
    );
  }

  if (control === "docText") {
    const docFields = node.pattern.includes(".") ? [] : docFieldsOf(root);
    const compact = node.pattern.includes(".");
    return cell(
      <Field id={id} label={label} help={help} error={error} required={shown.required && !formRo} span={span} note={note}>
        {(a) => (
        <DocEditor
          id={id}
          value={str(value)}
          onChange={(v) => set(v)}
          label={label}
          readOnly={formRo || ro}
          invalid={!!error}
          placeholder={placeholder ?? t("sx.doc.placeholder")}
          fields={docFields}
          compact={compact}
          onBlur={touch}
          aria-labelledby={a["aria-labelledby"]}
          aria-describedby={a["aria-describedby"]}
          aria-invalid={a["aria-invalid"]}
          aria-required={a["aria-required"]}
          aiId={ai}
        />
        )}
      </Field>,
    );
  }

  if (control === "object" && f) {
    const kids = childNodes(model, f, node.pattern);
    const obj = isDict(value) ? value : {};
    const known = new Set(f.properties.map((p) => p.key));
    const extra: Dict = {};
    for (const [k, v] of Object.entries(obj)) if (!known.has(k)) extra[k] = v;
    const showExtra = f.additional && (!formRo || Object.keys(extra).length > 0);
    return (
      <div className="sx-sf__f sx-sf__obj" data-path={norm} data-span={2} data-flat={lf?.flatten ? "" : undefined} data-ai-id={aiId(ai, "root")}>
        {lf?.flatten ? null : <SxSectionHeader as="h4" title={label} lead={help || undefined} className="sx-sf__objhead" />}
        {error ? (
          <p className="sx-field__err sx-sf__objerr" id={`${id}-err`}>
            {error}
          </p>
        ) : null}
        <FormGrid>
          {kids.map((c) => (
            <SchemaField key={c.pattern} node={c} path={`${path}.${c.key}`} scope={obj} />
          ))}
          {showExtra ? (
            <div className="sx-sf__f" data-span={2}>
              <Field id={`${id}-extra`} label={t("sx.form.extraKeys")} as="fieldset">
                <KeyValue
                  id={`${id}-extra`}
                  label={t("sx.form.extraKeys")}
                  value={extra}
                  readOnly={ro}
                  nameOf={(k) => {
                    const n = labels.field(k, { ctor: model.code, path: `${path}.${k}` });
                    return n && n !== k ? n : null;
                  }}
                  onChange={(next) => {
                    const base: Dict = {};
                    for (const [k, v] of Object.entries(obj)) if (known.has(k)) base[k] = v;
                    set({ ...base, ...next });
                  }}
                  aiId={aiId(ai, "extra")}
                />
              </Field>
            </div>
          ) : null}
        </FormGrid>
        <WarnLine id={warnId} list={warns} />
      </div>
    );
  }

  if (formRo && neon && control !== "repeater" && control !== "keyValue") {
    const vals = strList(value);
    const empty = control === "display" ? false : blankValue(value);
    let shownValue: ReactNode;
    if (control === "richtext") shownValue = <RichTextView html={str(value)} />;
    else if (control === "switch")
      shownValue =
        value === true || value === false ? (
          <span className="sx-nv__bool" data-on={value ? "" : undefined}>
            <span className="sx-nv__dot" aria-hidden="true" />
            {t(value ? "sx.ui.yes" : "sx.ui.no")}
          </span>
        ) : null;
    else if ((control === "picker" || control === "pickerMulti") && source) shownValue = control === "pickerMulti" ? <RefChips source={source} values={vals} /> : <RefNames source={source} values={vals} />;
    else if (control === "pickerMulti" || control === "tags" || control === "repeaterInline" || control === "choicesMulti" || (control === "choices" && vals.length > 1)) shownValue = <NeonChips items={control === "tags" || control === "repeaterInline" ? vals : vals.map(opt)} />;
    else if (control === "picker" || control === "choices") shownValue = labels.list(vals.map(opt), vals.length);
    else if (control === "display") shownValue = virtual?.display ? virtual.display(ctx, labels) : labels.display(value, rule);
    else if (control === "money" && num(value) !== undefined) shownValue = labels.money(num(value) as number, str(scope.currency) || str(root.currency) || "UZS");
    else if (control === "percent" && num(value) !== undefined) shownValue = `${labels.num(num(value) as number)}${t("sx.form.percentSuffix")}`;
    else shownValue = labels.display(value, rule);
    return cell(<NeonValue id={id} label={label} value={shownValue} empty={empty || shownValue === null || shownValue === ""} />);
  }

  if (formRo) {
    let text: ReactNode;
    if (control === "richtext") text = <RichTextView html={str(value)} />;
    else if ((control === "picker" || control === "pickerMulti") && source) {
      const vals = strList(value);
      text = vals.length ? <RefNames source={source} values={vals} /> : "";
    } else if (control === "picker" || control === "pickerMulti" || control === "choices" || control === "tags" || control === "repeaterInline") {
      const vals = strList(value);
      text = vals.length ? labels.list(control === "tags" || control === "repeaterInline" ? vals : vals.map(opt), vals.length) : "";
    } else if (control === "display" && virtual?.display) text = virtual.display(ctx, labels);
    else if (control === "money" && num(value) !== undefined) text = labels.money(num(value) as number, str(scope.currency) || str(root.currency) || "UZS");
    else if (control === "percent" && num(value) !== undefined) text = `${labels.num(num(value) as number)}${t("sx.form.percentSuffix")}`;
    else if (control === "repeater" && f) {
      return cell(
        <Field id={id} label={label} as="fieldset" required={false}>
          <RowsField node={node} path={path} ai={ai} id={id} label={label} ro f={f} />
        </Field>,
      );
    } else if (control === "keyValue") {
      return cell(
        <Field id={id} label={label} as="fieldset">
          <KeyValue id={id} label={label} value={isDict(value) ? value : {}} readOnly onChange={() => {}} aiId={ai} />
        </Field>,
      );
    } else text = labels.display(value, rule);
    return cell(<Field id={id} label={label} readOnly value={text} span={span} />);
  }

  if (control === "display") {
    const text = virtual?.display ? virtual.display(ctx, labels) : labels.display(value, rule);
    return cell(<Field id={id} label={label} help={help} readOnly value={text} span={span} />);
  }

  if (control === "switch") {
    return cell(
      <Field id={id} label={label} help={help} error={error} required={false} layout="inline" span={span}>
        {(a) => (
          <Switch
            id={id}
            checked={value === true}
            onChange={(v) => {
              set(v);
              touch();
            }}
            readOnly={ro}
            aria-describedby={withWarn(a)["aria-describedby"]}
            aria-invalid={a["aria-invalid"]}
            aiId={ai}
            aiLabel={label}
          />
        )}
      </Field>,
    );
  }

  if (control === "choices") {
    const opts = optionsFor(lf, f);
    const cards: ChoiceCard[] = opts.map((v) => {
      const meta = lf?.choices?.[v];
      const card: ChoiceCard = { value: v, title: opt(v) };
      const icon = meta?.icon ?? lf?.optionIcon?.(v);
      if (icon) card.icon = icon;
      if (meta?.descriptionKey && t.has(meta.descriptionKey)) card.description = t(meta.descriptionKey);
      if (meta?.metaKey && t.has(meta.metaKey)) card.meta = t(meta.metaKey);
      return card;
    });
    const cur = str(value);
    if (cur && !opts.includes(cur)) cards.push({ value: cur, title: cur });
    return cell(
      <Field id={id} label={label} help={help} hint={hint} error={error} required={shown.required} as="fieldset" span={span}>
        {(a) => (
          <ChoiceCards
            id={id}
            value={cur}
            onChange={(v) => {
              set(v);
              touch();
            }}
            options={cards}
            columns={lf?.columns}
            readOnly={ro}
            aria-labelledby={a["aria-labelledby"]}
            aria-describedby={withWarn(a)["aria-describedby"]}
            aria-invalid={a["aria-invalid"]}
            aria-required={a["aria-required"]}
            aiId={ai}
          />
        )}
      </Field>,
    );
  }

  if (control === "choicesMulti") {
    const opts = optionsFor(lf, f);
    const cards: ChoiceCard[] = opts.map((v) => {
      const meta = lf?.choices?.[v];
      const card: ChoiceCard = { value: v, title: opt(v) };
      const icon = meta?.icon ?? lf?.optionIcon?.(v);
      if (icon) card.icon = icon;
      if (meta?.descriptionKey && t.has(meta.descriptionKey)) card.description = t(meta.descriptionKey);
      return card;
    });
    const cur = strList(value);
    for (const v of cur) if (!opts.includes(v)) cards.push({ value: v, title: opt(v) });
    return cell(
      <Field id={id} label={label} help={help} hint={hint} error={error} required={shown.required} as="fieldset" span={span}>
        {(a) => (
          <ChoiceCardsMulti
            id={id}
            value={cur}
            onChange={(v) => {
              set(v.length ? v : []);
              touch();
            }}
            options={cards}
            columns={lf?.columns}
            readOnly={ro}
            aria-labelledby={a["aria-labelledby"]}
            aria-describedby={withWarn(a)["aria-describedby"]}
            aria-invalid={a["aria-invalid"]}
            aria-required={a["aria-required"]}
            countLabel={(n) => t("sx.form.pickedN", { n })}
            aiId={ai}
          />
        )}
      </Field>,
    );
  }

  if (control === "repeater" || control === "repeaterInline") {
    if (!f) return null;
    return cell(
      <Field id={id} label={label} help={help} error={error} required={shown.required} as="fieldset" span={span} note={note}>
        <RowsField node={node} path={path} ai={ai} id={id} label={label} ro={ro} f={f} />
      </Field>,
    );
  }

  if (control === "keyValue") {
    return cell(
      <Field id={id} label={label} help={help} error={error} required={shown.required} as="fieldset" span={span}>
        <KeyValue
          id={id}
          label={label}
          value={isDict(value) ? value : {}}
          readOnly={ro}
          nameOf={(k) => {
            const n = labels.field(k, { ctor: model.code, path: `${path}.${k}` });
            return n && n !== k ? n : null;
          }}
          onChange={(next) => {
            set(next);
            touch();
          }}
          aiId={ai}
        />
      </Field>,
    );
  }

  if (control === "tags") {
    const suggest = lf?.aiSuggest === true ? { title: str(root.title), description: str(root.description), parentId: str(root.parent_id) } : null;
    const service = lf?.aiSuggest === "service" ? { ready: canSuggest(root), body: suggestBody(root) } : null;
    return cell(
      <Field id={id} label={label} help={help} error={error} required={shown.required} span={span} note={note}>
        {(a) => (
          <TagsField
            id={id}
            a11y={withWarn(a)}
            value={strList(value)}
            label={label}
            readOnly={ro}
            ai={ai}
            suggest={suggest}
            service={service}
            onChange={(next) => {
              set(next);
              touch();
            }}
            onBlur={touch}
          />
        )}
      </Field>,
    );
  }

  const field = (render: (a: SxControlA11y) => ReactNode, aside?: ReactNode) => (
    <Field id={id} label={label} help={help} hint={hint} error={error} required={shown.required} span={span} labelAside={aside} note={note}>
      {(a) => render(withWarn(a))}
    </Field>
  );

  if ((control === "picker" || control === "pickerMulti") && source) {
    const emptyId = `${id}-src`;
    const inlineContext = { categoryId: str(root.category_id).trim() };
    return cell(
      field((a) =>
        control === "pickerMulti" ? (
          <RefPicker
            multiple
            a11y={a}
            label={label}
            source={source}
            value={strList(value)}
            onChange={(v) => {
              set(v);
              touch();
            }}
            required={shown.required}
            readOnly={ro}
            invalid={!!error}
            placeholder={placeholder}
            onBlur={touch}
            aiId={ai}
            code={model.code}
            pattern={node.pattern}
            recordId={env.recordId}
            emptyId={emptyId}
            inlineContext={inlineContext}
            inlineOwner={env.owner ?? ""}
            inlineAddKey={lf?.inlineAddKey}
          />
        ) : (
          <RefPicker
            a11y={a}
            label={label}
            source={source}
            value={str(value)}
            onChange={(v) => set(v)}
            required={shown.required}
            readOnly={ro}
            invalid={!!error}
            placeholder={placeholder}
            onBlur={touch}
            aiId={ai}
            code={model.code}
            pattern={node.pattern}
            recordId={env.recordId}
            emptyId={emptyId}
            inlineContext={inlineContext}
            inlineOwner={env.owner ?? ""}
            inlineAddKey={lf?.inlineAddKey}
          />
        ),
      ),
    );
  }

  if (control === "picker" || control === "pickerMulti") {
    const opts: SxOption[] = optionsFor(lf, f).map((v) => {
      const o: SxOption = { value: v, label: opt(v) };
      const icon = lf?.optionIcon?.(v);
      if (icon) o.icon = icon;
      return o;
    });
    const resolveRaw = async (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));
    return cell(
      field((a) =>
        control === "pickerMulti" ? (
          <Picker
            id={id}
            multiple
            label={label}
            options={opts}
            resolveOptions={resolveRaw}
            value={strList(value)}
            onChange={(v) => {
              set(v);
              touch();
            }}
            readOnly={ro}
            required={shown.required}
            invalid={!!error}
            placeholder={placeholder}
            onBlur={touch}
            aria-labelledby={a["aria-labelledby"]}
            aria-describedby={a["aria-describedby"]}
            aria-invalid={a["aria-invalid"]}
            aria-required={a["aria-required"]}
            aiId={ai}
          />
        ) : (
          <Picker
            id={id}
            label={label}
            options={opts}
            resolveOptions={resolveRaw}
            value={str(value)}
            onChange={(v) => set(v ? v : undefined)}
            clearable={!shown.required && !ro}
            readOnly={ro}
            required={shown.required}
            invalid={!!error}
            placeholder={placeholder}
            onBlur={touch}
            aria-labelledby={a["aria-labelledby"]}
            aria-describedby={a["aria-describedby"]}
            aria-invalid={a["aria-invalid"]}
            aria-required={a["aria-required"]}
            aiId={ai}
          />
        ),
      ),
    );
  }

  if (control === "number" || control === "percent" || control === "money") {
    const suffix = control === "percent" ? t("sx.form.percentSuffix") : lf?.suffixKey && t.has(lf.suffixKey) ? t(lf.suffixKey) : undefined;
    return cell(
      field((a) =>
        control === "money" ? (
          <MoneyInput
            id={id}
            value={num(value)}
            onChange={(v) => set(v)}
            onDraftInvalid={(bad) => env.onDraftError?.(norm, bad)}
            onBlur={touch}
            currency={str(scope.currency) || str(root.currency) || "UZS"}
            readOnly={ro}
            aria-labelledby={a["aria-labelledby"]}
            aria-describedby={a["aria-describedby"]}
            aria-invalid={a["aria-invalid"]}
            aria-required={a["aria-required"]}
            aiId={ai}
            aiLabel={label}
          />
        ) : (
          <NumberInput
            id={id}
            value={num(value)}
            onChange={(v) => set(v)}
            onDraftInvalid={(bad) => env.onDraftError?.(norm, bad)}
            onBlur={touch}
            min={f?.min}
            max={f?.max}
            suffix={suffix}
            readOnly={ro}
            aria-labelledby={a["aria-labelledby"]}
            aria-describedby={a["aria-describedby"]}
            aria-invalid={a["aria-invalid"]}
            aria-required={a["aria-required"]}
            aiId={ai}
            aiLabel={label}
          />
        ),
      ),
    );
  }

  if (control === "date" || control === "datetime") {
    const withTime = control === "datetime";
    const cur = str(value);
    return cell(
      field((a) => (
        <DateField
          id={id}
          value={cur}
          onChange={(v) => set(withTime ? withDefaultTime(cur, v) : v)}
          label={label}
          withTime={withTime}
          readOnly={ro}
          onBlur={touch}
          aria-labelledby={a["aria-labelledby"]}
          aria-describedby={a["aria-describedby"]}
          aria-invalid={a["aria-invalid"]}
          aria-required={a["aria-required"]}
          aiId={ai}
        />
      )),
    );
  }

  if (control === "richtext") {
    return cell(
      field((a) => (
        <RichText
          id={id}
          value={str(value)}
          onChange={(v) => set(v)}
          label={label}
          readOnly={ro}
          placeholder={placeholder}
          onBlur={touch}
          aria-labelledby={a["aria-labelledby"]}
          aria-describedby={a["aria-describedby"]}
          aria-invalid={a["aria-invalid"]}
          aria-required={a["aria-required"]}
          aiId={ai}
        />
      )),
    );
  }

  if (control === "textarea") {
    const max = f?.max && f.max > 0 ? f.max : undefined;
    return cell(
      field((a) => (
        <TextArea
          {...a}
          value={str(value)}
          onChange={(v) => set(v)}
          onBlur={touch}
          readOnly={ro}
          placeholder={placeholder}
          counter={!!max}
          maxLength={max}
          mono={f?.type === "code"}
          aiId={ai}
          aiLabel={label}
        />
      )),
    );
  }

  const inputType = f?.type === "url" ? "url" : f?.type === "email" ? "email" : f?.type === "phone" ? "tel" : "text";
  return cell(
    field((a) => (
      <TextInput
        {...a}
        type={inputType}
        value={str(value)}
        onChange={(v) => set(v)}
        onBlur={touch}
        readOnly={ro}
        mono={control === "mono"}
        placeholder={placeholder}
        aiId={ai}
        aiLabel={label}
      />
    )),
  );
}

export const SchemaField = memo(SchemaFieldImpl);
