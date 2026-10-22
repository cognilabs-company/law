"use client";

import "../sx-core.css";
import "../sx-form.css";
import "./sx-shared.css";
import { useId, useState, type FormEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import type { CategoryKind } from "../ctor/services";
import { categoryKindHref } from "./categoryKindLink";
import { SxButton, SxLinkButton, type SxButtonVariant } from "../Button";
import { SxDialog } from "../editor/SxDialog";
import { ChoiceCards, type ChoiceCard } from "../form/ChoiceCards";
import { Field, FormGrid } from "../form/Field";
import { ArrowRightIcon, ChevronRightIcon, FolderOpenIcon, FolderTreeIcon, InfoIcon, PlusIcon, SparklesIcon, glyph } from "../icons";
import { SxPage } from "../layout/Page";
import { RefPicker } from "../schema/RefPicker";
import { useCategoryTitle } from "../schema/categoryOptions";

// "Add category" asks first what is being made. A top-level category opens
// the form without a parent at all; a subcategory needs its parent picked
// here, and the form keeps it required. The answer travels in the editor
// URL (kind, parent), so every way into a new category ends at this choice.

const CATEGORY_SOURCE = "service-categories";

type Choice = { kind: CategoryKind | ""; parent: string };

function useCategoryChoice(start: Choice = { kind: "", parent: "" }) {
  const [choice, setChoice] = useState<Choice>(start);
  const [tried, setTried] = useState(false);
  const kindMissing = !choice.kind;
  const parentMissing = choice.kind === "sub" && !choice.parent.trim();
  return {
    choice,
    setKind: (kind: CategoryKind) => setChoice((c) => ({ ...c, kind })),
    setParent: (parent: string) => setChoice((c) => ({ ...c, parent })),
    tried,
    // True when the choice is complete; otherwise the errors show.
    check: () => (setTried(true), !kindMissing && !parentMissing),
    kindMissing,
    parentMissing,
  };
}

type FieldsProps = {
  idPrefix: string;
  state: ReturnType<typeof useCategoryChoice>;
  aiBase: string;
};

// Where the new record will sit: Catalogue › (parent ›) new one.
function PlacePath({ kind, parent }: { kind: CategoryKind | ""; parent: string }): ReactElement {
  const t = useTranslations("studio");
  const parentTitle = useCategoryTitle(kind === "sub" ? parent : "");
  const sep = glyph(ChevronRightIcon, { size: 14, className: "sx-ck-path__sep" });
  return (
    <div className="sx-ck-path" data-kind={kind || undefined} aria-live="polite">
      <span className="sx-ck-path__label">{t("sx.k01kind.place")}</span>
      <ol className="sx-ck-path__trail">
        <li className="sx-ck-path__node">{t("sx.k01kind.catalogue")}</li>
        {kind === "sub" ? (
          <li className={`sx-ck-path__node${parentTitle ? "" : " is-empty"}`}>
            {sep}
            {glyph(FolderOpenIcon, { size: 14 })}
            <span>{parentTitle || t("sx.k01kind.parentPending")}</span>
          </li>
        ) : null}
        <li className="sx-ck-path__node is-new">
          {sep}
          {glyph(SparklesIcon, { size: 14 })}
          <span>{kind === "sub" ? t("sx.k01kind.newSub") : kind === "root" ? t("sx.k01kind.newRoot") : t("sx.k01kind.newAny")}</span>
        </li>
      </ol>
    </div>
  );
}

export function CategoryKindFields({ idPrefix, state, aiBase }: FieldsProps): ReactElement {
  const t = useTranslations("studio");
  const { choice } = state;
  const options: readonly ChoiceCard[] = [
    { value: "root", title: t("sx.k01kind.root"), description: t("sx.k01kind.rootWhat"), icon: FolderOpenIcon, meta: t("sx.k01kind.rootExample") },
    { value: "sub", title: t("sx.k01kind.sub"), description: t("sx.k01kind.subWhat"), icon: FolderTreeIcon, meta: t("sx.k01kind.subExample") },
  ];
  const parentLabel = t("sx.k01kind.parent");
  const kindErr = state.tried && state.kindMissing ? t("sx.k01kind.kindRequired") : "";
  const parentErr = state.tried && state.parentMissing ? t("sx.k01kind.parentRequired") : "";
  return (
    <FormGrid>
      <Field id={`${idPrefix}-kind`} label={t("sx.k01kind.question")} as="fieldset" required error={kindErr}>
        {(a) => (
          <ChoiceCards
            id={`${idPrefix}-kind`}
            value={choice.kind}
            onChange={(v) => state.setKind(v === "sub" ? "sub" : "root")}
            options={options}
            columns={2}
            required
            invalid={!!kindErr}
            aria-labelledby={a["aria-labelledby"]}
            aria-describedby={a["aria-describedby"]}
            aiId={`${aiBase}.kind`}
          />
        )}
      </Field>
      {choice.kind === "sub" ? (
        <div className="sx-ck-parent">
          <Field id={`${idPrefix}-parent`} label={parentLabel} required help={t("sx.k01kind.parentHelp")} error={parentErr}>
            {(a) => (
              <RefPicker
                a11y={a}
                label={parentLabel}
                source={CATEGORY_SOURCE}
                required
                readOnly={false}
                invalid={!!parentErr}
                placeholder={t("sx.k01kind.parentPh")}
                code="K01"
                pattern="parent_id"
                recordId=""
                value={choice.parent}
                onChange={(v) => state.setParent(v ?? "")}
                aiId={`${aiBase}.parent`}
              />
            )}
          </Field>
        </div>
      ) : choice.kind === "root" ? (
        <p className="sx-ck-note">
          {glyph(InfoIcon, { size: 16 })}
          <span>{t("sx.k01kind.rootNote")}</span>
        </p>
      ) : null}
      <PlacePath kind={choice.kind} parent={choice.parent} />
    </FormGrid>
  );
}

function CategoryKindDialog({ base, label, aiId, onClose }: { base: string; label: string; aiId: string; onClose: () => void }): ReactElement {
  const t = useTranslations("studio");
  const router = useRouter();
  const formId = `${useId()}-form`;
  const modalAi = `${aiId}-modal`;
  const state = useCategoryChoice();
  const [leaving, setLeaving] = useState(false);
  function go(e: FormEvent) {
    e.preventDefault();
    if (leaving || !state.check() || !state.choice.kind) return;
    setLeaving(true);
    router.push(categoryKindHref(base, state.choice.kind, state.choice.parent));
  }
  return (
    <SxDialog
      open
      onClose={onClose}
      title={label}
      description={t("sx.k01kind.lead")}
      busy={leaving}
      dirty={!!state.choice.kind}
      aiId={modalAi}
      footer={
        <>
          <SxButton variant="secondary" onClick={onClose} disabled={leaving} aiId={`${modalAi}.cancel`}>
            {t("sx.ui.cancel")}
          </SxButton>
          <SxButton type="submit" form={formId} variant="primary" iconEnd={ArrowRightIcon} busy={leaving} aiId={`${modalAi}.confirm`}>
            {t("sx.k01kind.continue")}
          </SxButton>
        </>
      }
    >
      <form id={formId} className="sx-dlg__form sx-ck" onSubmit={go} noValidate>
        <CategoryKindFields idPrefix="sx-ck-dlg" state={state} aiBase={modalAi} />
      </form>
    </SxDialog>
  );
}

export type AddCategoryButtonProps = { base: string; variant?: SxButtonVariant; size?: "md" | "sm"; label: string; disabledReason?: string; aiId: string };

export function AddCategoryButton({ base, variant = "primary", size = "md", label, disabledReason, aiId }: AddCategoryButtonProps): ReactElement {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const why = String(disabledReason ?? "").trim();
  const whyId = `${uid}-why`;
  return (
    <>
      <SxButton
        variant={variant}
        size={size}
        icon={PlusIcon}
        aria-disabled={why ? true : undefined}
        aria-describedby={why ? whyId : undefined}
        aria-haspopup={why ? undefined : "dialog"}
        onClick={() => {
          if (!why) setOpen(true);
        }}
        aiId={aiId}
        aiLabel={label}
      >
        {label}
      </SxButton>
      {why ? (
        <span id={whyId} className="sx-vh">
          {why}
        </span>
      ) : null}
      {open && !why ? <CategoryKindDialog base={base} label={label} aiId={aiId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

// A new category opened by a plain link (home, guides, search) asks the
// same question on the page before the form appears.
export function CategoryKindGate({ base, listHref, listLabel }: { base: string; listHref: string; listLabel: string }): ReactElement {
  const t = useTranslations("studio");
  const router = useRouter();
  const state = useCategoryChoice();
  const formId = `${useId()}-form`;
  const ai = "admin.studio.editor.category-kind";
  function go(e: FormEvent) {
    e.preventDefault();
    if (!state.check() || !state.choice.kind) return;
    router.replace(categoryKindHref(base, state.choice.kind, state.choice.parent));
  }
  return (
    <SxPage title={t("sx.k01kind.add")} section="home" crumbs={[{ label: listLabel, href: listHref }, { label: t("sx.k01kind.add") }]} aiId={ai}>
      <form id={formId} className="sx-ck sx-ck--page" onSubmit={go} noValidate>
        <p className="sx-ck__lead">{t("sx.k01kind.lead")}</p>
        <CategoryKindFields idPrefix="sx-ck-page" state={state} aiBase={ai} />
        <div className="sx-ck__acts">
          <SxLinkButton variant="secondary" href={listHref} aiId={`${ai}.cancel`}>
            {t("sx.ui.cancel")}
          </SxLinkButton>
          <SxButton type="submit" variant="primary" iconEnd={ArrowRightIcon} aiId={`${ai}.confirm`}>
            {t("sx.k01kind.continue")}
          </SxButton>
        </div>
      </form>
    </SxPage>
  );
}

// Shown above a new category's form: which kind it is, and a way back to
// the choice.
export function CategoryKindBar({ kind, base }: { kind: CategoryKind; base: string }): ReactElement {
  const t = useTranslations("studio");
  return (
    <p className="sx-ck-bar" data-kind={kind}>
      <span className="sx-ck-bar__icon">{glyph(kind === "sub" ? FolderTreeIcon : FolderOpenIcon, { size: 16 })}</span>
      <span className="sx-ck-bar__text">
        <strong>{kind === "sub" ? t("sx.k01kind.sub") : t("sx.k01kind.root")}</strong>
        <span>{kind === "sub" ? t("sx.k01kind.subBar") : t("sx.k01kind.rootBar")}</span>
      </span>
      <Link href={base} className="sx-ck-bar__change" data-ai-id="admin.studio.editor.category-kind.change" data-ai-type="link">
        {t("sx.k01kind.change")}
      </Link>
    </p>
  );
}
