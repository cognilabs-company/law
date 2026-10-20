"use client";

import "../sx-core.css";
import "../sx-form.css";
import "../sx-layout.css";
import "./sx-schema.css";
import "./sx-schema-neon.css";
import { useCallback, useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { normPath } from "@/lib/studioSchema";
import { Field, FormGrid } from "../form/Field";
import { useSxFormContext, useSxFormPolicy } from "../form/formPolicy";
import { KeyValue } from "../form/KeyValue";
import { TextCount } from "../form/TextArea";
import { TextInput } from "../form/TextInput";
import { FileTextIcon, glyph } from "../icons";
import { useFormOwner } from "../inline/owner";
import { SxNote } from "../layout/Note";
import { SxSectionHeader } from "../layout/Panel";
import type { SchemaFormProps, SchemaRecordTitle, SxPayload, SxValues } from "../contract";
import type { SxErrors } from "../types";
import { useStudioLabels } from "../useStudioLabels";
import { NeonCell, NeonValue, SfContext, SchemaField, type SfEnv } from "./fields";
import { RECORD_TITLE_PATH, layoutCtx, parentPath, scopeAt, setAt, type SchemaTr } from "./model";
import { sectionIcon, sectionLeadKey, type SxLook } from "./neonLook";

const TITLE_MAX = 200;

export type SxSchemaFormProps = SchemaFormProps & { look?: SxLook; inlineOwner?: string };

function RecordTitleField({ rt, readOnly, idPrefix, errors, neon }: { rt: SchemaRecordTitle; readOnly: boolean; idPrefix: string; errors: SxErrors; neon: boolean }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const env = useSxFormContext();
  const own = useSxFormPolicy();
  const policy = env ?? own;
  const id = `${idPrefix}-f-record-title`;
  const label = t("sx.form.recordTitle");
  const value = rt.value ?? "";
  if (readOnly) {
    if (neon) {
      return (
        <NeonCell icon={FileTextIcon} path={RECORD_TITLE_PATH} span={1}>
          <NeonValue id={id} label={label} value={value} empty={!value.trim()} />
        </NeonCell>
      );
    }
    return (
      <div className="sx-sf__f" data-path={RECORD_TITLE_PATH} data-span={2}>
        <Field id={id} label={label} readOnly value={value} />
      </div>
    );
  }
  const field = (
    <Field
      id={id}
      label={label}
      help={t("sx.form.recordTitleHelp")}
      required
      error={(() => {
        const tok = policy.visible(RECORD_TITLE_PATH, errors);
        return tok ? labels.error(tok, { type: "text", key: "title" }) : "";
      })()}
      labelAside={<TextCount value={value} max={TITLE_MAX} />}
    >
      {(a) => (
        <TextInput
          {...a}
          value={value}
          onChange={(v) => rt.onChange(v.slice(0, TITLE_MAX))}
          onBlur={() => policy.touch(RECORD_TITLE_PATH)}
          maxLength={TITLE_MAX}
          placeholder={rt.placeholderKey && t.has(rt.placeholderKey) ? t(rt.placeholderKey) : undefined}
          aiId="admin.studio.editor.title"
          aiLabel={label}
        />
      )}
    </Field>
  );
  if (neon) {
    return (
      <NeonCell icon={FileTextIcon} path={RECORD_TITLE_PATH} span={2}>
        {field}
      </NeonCell>
    );
  }
  return (
    <div className="sx-sf__f" data-path={RECORD_TITLE_PATH} data-span={2}>
      {field}
    </div>
  );
}

function NeonSection({ id, domId, headingId, title, lead, index, children }: { id: string; domId: string; headingId: string; title: string; lead: string; index: number; children: ReactNode }): ReactElement {
  return (
    <section id={domId} aria-labelledby={headingId} className="sx-sf__sec sx-sfn sx-enter" data-section={id} style={{ "--i": Math.min(index, 8) } as CSSProperties}>
      <div className="sx-sfn__head">
        <span className="sx-sfn__icon" aria-hidden="true">
          {glyph(sectionIcon(id), { size: 20 })}
        </span>
        <SxSectionHeader as="h2" id={headingId} title={title} lead={lead || undefined} />
      </div>
      <div className="sx-sfn__card">{children}</div>
    </section>
  );
}

export function SchemaForm(props: SxSchemaFormProps): ReactElement {
  const { model, payload, onChange, errors, warnings, readOnly, mode, recordId, recordTitle, onDraftError, footer, look, inlineOwner } = props;
  const t = useTranslations("studio") as unknown as SchemaTr;
  const labels = useStudioLabels();
  const titleNow = model.titleField ? payload[model.titleField] : recordTitle?.value;
  const owner = useFormOwner(inlineOwner, model.code, typeof titleNow === "string" ? titleNow : "");
  const ctxPolicy = useSxFormContext();
  const ownPolicy = useSxFormPolicy();
  const policy = ctxPolicy ?? ownPolicy;
  const latest = useRef<SxValues>(payload);
  const ro = readOnly || mode === "view";
  const neon = look === "neon";

  useLayoutEffect(() => {
    latest.current = payload;
  }, [payload]);

  const emit = useCallback(
    (path: string, value: unknown, clears?: readonly string[]) => {
      let next: SxPayload = setAt(latest.current, path, value);
      if (clears?.length) {
        const parent = parentPath(path);
        for (const c of clears) next = setAt(next, parent ? `${parent}.${c}` : c, undefined);
      }
      latest.current = next;
      onChange(next, normPath(path));
    },
    [onChange],
  );

  const env = useMemo<SfEnv>(
    () => ({ model, root: payload, errors, warnings: warnings ?? [], readOnly: ro, mode, recordId, owner, emit, onDraftError, policy, labels, t, look }),
    [model, payload, errors, warnings, ro, mode, recordId, owner, emit, onDraftError, policy, labels, t, look],
  );

  const ctx = layoutCtx(model, payload, payload, mode, recordId);
  const sections = model.sections.filter((s) => !s.visible || s.visible(ctx));
  const showTitle = !!recordTitle && model.titleField === null;
  const leadOf = (id: string): string => {
    const key = sectionLeadKey(id);
    return t.has(key) ? t(key) : t("sx.ed2.sec.fallback");
  };

  const firstId = sections[0]?.domId ?? `${model.idPrefix}-sec-asosiy`;
  const firstTitle = sections[0]?.title ?? labels.section("asosiy", "");
  const emptyBody = (
    <FormGrid>
      {showTitle && recordTitle ? <RecordTitleField rt={recordTitle} readOnly={ro} idPrefix={model.idPrefix} errors={errors} neon={neon} /> : null}
      <div className="sx-sf__f" data-span={2}>
        <SxNote tone="info" role="note">
          {t("sx.form.noSchema")}
        </SxNote>
      </div>
      <div className="sx-sf__f" data-span={2} data-path="_">
        <Field id={`${model.idPrefix}-f-payload`} label={labels.ctorName(model.code, model.ctor.title)} as="fieldset">
          <KeyValue
            id={`${model.idPrefix}-f-payload`}
            label={labels.ctorName(model.code, model.ctor.title)}
            value={payload}
            readOnly={ro}
            onChange={(next) => onChange(next, "")}
            nameOf={(k) => {
              const n = labels.field(k, { ctor: model.code, path: k });
              return n && n !== k ? n : null;
            }}
            aiId={`${model.aiBase}.field.payload`}
          />
        </Field>
      </div>
    </FormGrid>
  );

  return (
    <SfContext.Provider value={env}>
      <div
        id={`${model.idPrefix}-form`}
        className="sx-sf"
        data-look={look}
        data-ro={neon && ro ? "" : undefined}
        data-ai-id={model.aiBase}
        data-ai-type="editor"
        data-ai-label={labels.ctorName(model.code, model.ctor.title)}
      >
        {model.typedEmpty ? (
          neon ? (
            <NeonSection id={sections[0]?.id ?? "asosiy"} domId={firstId} headingId={`${firstId}-h`} title={firstTitle} lead={leadOf(sections[0]?.id ?? "asosiy")} index={0}>
              {emptyBody}
            </NeonSection>
          ) : (
            <section id={firstId} aria-labelledby={`${firstId}-h`} className="sx-sf__sec">
              <SxSectionHeader as="h2" id={`${firstId}-h`} title={firstTitle} />
              {emptyBody}
            </section>
          )
        ) : (
          sections.map((s, i) => {
            const body = (
              <FormGrid>
                {i === 0 && showTitle && recordTitle ? <RecordTitleField rt={recordTitle} readOnly={ro} idPrefix={model.idPrefix} errors={errors} neon={neon} /> : null}
                {s.fields.map((fm) => (
                  <SchemaField key={fm.pattern} node={fm} path={fm.pattern} scope={scopeAt(payload, fm.pattern)} />
                ))}
              </FormGrid>
            );
            return neon ? (
              <NeonSection key={s.id} id={s.id} domId={s.domId} headingId={s.headingId} title={s.title} lead={leadOf(s.id)} index={i}>
                {body}
              </NeonSection>
            ) : (
              <section key={s.id} id={s.domId} aria-labelledby={s.headingId} className="sx-sf__sec">
                <SxSectionHeader as="h2" id={s.headingId} title={s.title} />
                {body}
              </section>
            );
          })
        )}
        {footer}
      </div>
    </SfContext.Provider>
  );
}
