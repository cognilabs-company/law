"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "../sx-form.css";
import "./sx-editor.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { useStudioRegistry } from "@/lib/services/studio";
import { SxButton, SxLinkButton } from "../Button";
import { SxFormContext } from "../form/formPolicy";
import { Picker } from "../form/Picker";
import { ArrowRightIcon, ArrowsClockwiseIcon, FileXIcon, LockSimpleIcon, StackIcon, ctorGlyph } from "../icons";
import { SxEmpty } from "../layout/Empty";
import { SxNote } from "../layout/Note";
import { SxOutline, focusSection } from "../layout/Outline";
import { SxPanel } from "../layout/Panel";
import { outlineItems } from "../schema/model";
import { SchemaErrorSummary } from "../schema/ErrorSummary";
import { SchemaForm } from "../schema/SchemaForm";
import { useStudioLabels } from "../useStudioLabels";
import { useEditorErrorText } from "./useEditorErrorText";
import type { EditorState } from "./useEditorState";

const AI = "admin.studio.editor";
const SK_FIELDS = [0, 1, 2, 3];

function FormSkeleton() {
  const t = useTranslations("studio");
  return (
    <div className="sx-ed" data-loading="">
      <div className="sx-ed__main">
        <div className="sx-panel sx-ed__panel sx-ed__sk" role="status" aria-busy="true">
          <span className="sx-vh">{t("sx.ui.loading")}</span>
          {SK_FIELDS.map((i) => (
            <span key={i} className="sx-ed__skfield" aria-hidden="true">
              <span className="sx-sk sx-ed__sklabel" />
              <span className="sx-sk sx-ed__skinput" />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function HomeLink() {
  const t = useTranslations("studio");
  return (
    <SxLinkButton href="/admin/studio" variant="secondary" aiId={`${AI}.home`}>
      {t("sx.editor.toHome")}
    </SxLinkButton>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("studio");
  return (
    <SxButton variant="ghost" size="sm" icon={ArrowsClockwiseIcon} onClick={onClick} aiId={`${AI}.retry`}>
      {t("sx.ui.retry")}
    </SxButton>
  );
}

function BlockedCard({ st }: { st: EditorState }) {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const reg = useStudioRegistry();
  const byCode = new Map(reg.items.map((c) => [c.code, c]));
  const first = st.missing[0] ?? "";
  const firstName = first ? labels.ctorName(first, byCode.get(first)?.title) : "";
  return (
    <SxPanel as="section" className="sx-ed__blocked" aiId={`${AI}.blocked`}>
      <div className="sx-ed__blocked-head">
        <span className="sx-ed__blocked-icon" aria-hidden="true">
          <LockSimpleIcon size={20} />
        </span>
        <div className="sx-ed__blocked-titles">
          <h2 className="sx-ed__blocked-title">{t("sx.editor.blockedTitle")}</h2>
          <p className="sx-ed__blocked-text">{t("sx.editor.blockedText")}</p>
        </div>
      </div>
      {st.missing.length ? (
        <ol className="sx-ed__blocked-list">
          {st.missing.map((code) => {
            const item = byCode.get(code);
            const done = !!item?.completed;
            return (
              <li key={code} className="sx-ed__blocked-item" data-done={done ? "" : undefined}>
                <span className="sx-ed__blocked-glyph" aria-hidden="true">
                  {ctorGlyph(code, item?.navigation?.groupKey, { size: 18 })}
                </span>
                <span className="sx-ed__blocked-name">{labels.ctorName(code, item?.title)}</span>
                <span className="sx-code">{code}</span>
                <span className="sx-ed__blocked-state">{t(done ? "sx.guide.done" : "sx.guide.notDone")}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
      {first ? (
        <div className="sx-ed__blocked-go">
          <SxLinkButton variant="primary" iconEnd={ArrowRightIcon} href={`/admin/studio/c/${encodeURIComponent(first)}`} aiId={`${AI}.blocked.go`}>
            {t("sx.editor.blockedGo", { name: firstName })}
          </SxLinkButton>
        </div>
      ) : null}
    </SxPanel>
  );
}

export function EditorForm({ st, onPick }: { st: EditorState; onPick: (path: string) => void }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const errorText = useEditorErrorText();

  if (st.phase === "loading") return <FormSkeleton />;
  if (st.phase === "unknown-ctor") return <SxEmpty icon={StackIcon} title={t("sx.editor.unknownTitle")} text={t("sx.editor.unknownText")} action={<HomeLink />} />;
  if (st.phase === "not-found") return <SxEmpty icon={FileXIcon} title={t("sx.editor.notFoundTitle")} text={t("sx.editor.notFoundText")} action={<HomeLink />} />;
  if (st.phase === "load-error") {
    const e = errorText(st.loadError);
    return (
      <SxNote tone="error" title={e.title} action={<RetryButton onClick={st.retryLoad} />}>
        {e.text}
      </SxNote>
    );
  }
  if (st.blocked) return <BlockedCard st={st} />;
  if (st.schemaFailed) {
    return (
      <SxNote tone="error" title={t("sx.form.schemaFail")} action={<RetryButton onClick={st.retryLoad} />}>
        {t("sx.ui.loadFail")}
      </SxNote>
    );
  }
  const model = st.model;
  if (!model) return <FormSkeleton />;

  const items = outlineItems(model, st.payload, st.errors, st.policy, { mode: st.formMode, recordId: st.recordId }, labels);
  const multi = items.length > 1;
  const sectionOptions = items.map((i) => ({ value: i.id, label: i.label }));
  const recordTitle = model.titleField ? null : { value: st.recordTitle, onChange: st.setRecordTitle, placeholderKey: st.layout.recordTitlePlaceholderKey };

  return (
    <SxFormContext.Provider value={st.policy}>
      <div className="sx-ed" data-outline={multi ? "" : undefined}>
        {multi ? (
          <aside className="sx-ed__aside">
            <SxOutline items={items} label={t("sx.editor.outline")} spy aiId={`${AI}.outline`} />
          </aside>
        ) : null}
        <div className="sx-ed__main">
          {multi ? (
            <div className="sx-ed__secpick">
              <Picker
                label={t("sx.editor.sectionPick")}
                placeholder={t("sx.editor.sectionPick")}
                options={sectionOptions}
                value=""
                onChange={(id) => {
                  if (id) focusSection(id);
                }}
                aiId={`${AI}.sections`}
              />
            </div>
          ) : null}
          {st.showSummary ? <SchemaErrorSummary model={model} errors={st.errors} onPick={onPick} /> : null}
          <SxPanel as="div" className="sx-ed__panel">
            <SchemaForm
              model={model}
              payload={st.payload}
              onChange={st.setPayload}
              onDraftError={st.setDraftError}
              errors={st.errors}
              warnings={st.warnings}
              readOnly={st.readOnly}
              mode={st.formMode}
              recordId={st.recordId}
              recordTitle={recordTitle}
            />
          </SxPanel>
        </div>
      </div>
    </SxFormContext.Provider>
  );
}
