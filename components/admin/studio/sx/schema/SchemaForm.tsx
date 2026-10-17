"use client";

import "../sx-core.css";
import "../sx-form.css";
import "../sx-layout.css";
import "./sx-schema.css";
import { useCallback, useLayoutEffect, useMemo, useRef, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { normPath } from "@/lib/studioSchema";
import { Field, FormGrid } from "../form/Field";
import { useSxFormContext, useSxFormPolicy } from "../form/formPolicy";
import { KeyValue } from "../form/KeyValue";
import { TextCount } from "../form/TextArea";
import { TextInput } from "../form/TextInput";
import { SxNote } from "../layout/Note";
import { SxSectionHeader } from "../layout/Panel";
import type { SchemaFormProps, SchemaRecordTitle, SxPayload, SxValues } from "../contract";
import type { SxErrors } from "../types";
import { useStudioLabels } from "../useStudioLabels";
import { SfContext, SchemaField, type SfEnv } from "./fields";
import { RECORD_TITLE_PATH, layoutCtx, parentPath, scopeAt, setAt, type SchemaTr } from "./model";

const TITLE_MAX = 200;

function RecordTitleField({ rt, readOnly, idPrefix, errors }: { rt: SchemaRecordTitle; readOnly: boolean; idPrefix: string; errors: SxErrors }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const env = useSxFormContext();
  const own = useSxFormPolicy();
  const policy = env ?? own;
  const id = `${idPrefix}-f-record-title`;
  const label = t("sx.form.recordTitle");
  const value = rt.value ?? "";
  if (readOnly) {
    return (
      <div className="sx-sf__f" data-path={RECORD_TITLE_PATH} data-span={2}>
        <Field id={id} label={label} readOnly value={value} />
      </div>
    );
  }
  return (
    <div className="sx-sf__f" data-path={RECORD_TITLE_PATH} data-span={2}>
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
    </div>
  );
}

export function SchemaForm(props: SchemaFormProps): ReactElement {
  const { model, payload, onChange, errors, warnings, readOnly, mode, recordId, recordTitle, onDraftError, footer } = props;
  const t = useTranslations("studio") as unknown as SchemaTr;
  const labels = useStudioLabels();
  const ctxPolicy = useSxFormContext();
  const ownPolicy = useSxFormPolicy();
  const policy = ctxPolicy ?? ownPolicy;
  const latest = useRef<SxValues>(payload);
  const ro = readOnly || mode === "view";

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
    () => ({ model, root: payload, errors, warnings: warnings ?? [], readOnly: ro, mode, recordId, emit, onDraftError, policy, labels, t }),
    [model, payload, errors, warnings, ro, mode, recordId, emit, onDraftError, policy, labels, t],
  );

  const ctx = layoutCtx(model, payload, payload, mode, recordId);
  const sections = model.sections.filter((s) => !s.visible || s.visible(ctx));
  const showTitle = !!recordTitle && model.titleField === null;

  return (
    <SfContext.Provider value={env}>
      <div id={`${model.idPrefix}-form`} className="sx-sf" data-ai-id={model.aiBase} data-ai-type="editor" data-ai-label={labels.ctorName(model.code, model.ctor.title)}>
        {model.typedEmpty ? (
          <section id={sections[0]?.domId ?? `${model.idPrefix}-sec-asosiy`} aria-labelledby={`${sections[0]?.domId ?? `${model.idPrefix}-sec-asosiy`}-h`} className="sx-sf__sec">
            <SxSectionHeader as="h2" id={`${sections[0]?.domId ?? `${model.idPrefix}-sec-asosiy`}-h`} title={sections[0]?.title ?? labels.section("asosiy", "")} />
            <FormGrid>
              {showTitle && recordTitle ? <RecordTitleField rt={recordTitle} readOnly={ro} idPrefix={model.idPrefix} errors={errors} /> : null}
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
          </section>
        ) : (
          sections.map((s, i) => (
            <section key={s.id} id={s.domId} aria-labelledby={s.headingId} className="sx-sf__sec">
              <SxSectionHeader as="h2" id={s.headingId} title={s.title} />
              <FormGrid>
                {i === 0 && showTitle && recordTitle ? <RecordTitleField rt={recordTitle} readOnly={ro} idPrefix={model.idPrefix} errors={errors} /> : null}
                {s.fields.map((fm) => (
                  <SchemaField key={fm.pattern} node={fm} path={fm.pattern} scope={scopeAt(payload, fm.pattern)} />
                ))}
              </FormGrid>
            </section>
          ))
        )}
        {footer}
      </div>
    </SfContext.Provider>
  );
}
