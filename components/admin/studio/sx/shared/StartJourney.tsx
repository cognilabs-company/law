"use client";

import "../sx-core.css";
import "../sx-form.css";
import "./sx-shared.css";
import { useCallback, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { logApiError } from "@/lib/http";
import { startCreationJourney, type StudioCreationJourney, type StudioJourneyType } from "@/lib/services/studio";
import { SxButton, type SxButtonVariant } from "../Button";
import { SxDialog, SxDialogError } from "../editor/SxDialog";
import { useEditorErrorText } from "../editor/useEditorErrorText";
import { ChoiceCards, type ChoiceCard } from "../form/ChoiceCards";
import { Field, FormGrid } from "../form/Field";
import { TextInput } from "../form/TextInput";
import { BriefcaseIcon, PackageIcon, PlusIcon, RocketLaunchIcon } from "../icons";
import { creationJourneyHref } from "./journeyLinks";

export const JOURNEY_TITLE_MAX = 200;

export function journeyTitleOf(title: string): string {
  return String(title ?? "")
    .trim()
    .slice(0, JOURNEY_TITLE_MAX);
}

export function useStartJourney(): {
  busy: boolean;
  error: unknown;
  start: (input: { type: StudioJourneyType; title: string }) => Promise<StudioCreationJourney | null>;
  clear: () => void;
} {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const running = useRef(false);
  const start = useCallback(async (input: { type: StudioJourneyType; title: string }): Promise<StudioCreationJourney | null> => {
    const title = journeyTitleOf(input.title);
    if (!title || running.current) return null;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      return await startCreationJourney({ type: input.type, title });
    } catch (e) {
      logApiError("studio.journey.start", e);
      setError(e ?? new Error("journey_start_failed"));
      return null;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  const clear = useCallback(() => setError(null), []);
  return { busy, error, start, clear };
}

export type StartJourneyFieldsProps = {
  idPrefix: string;
  type: StudioJourneyType;
  onTypeChange?: (type: StudioJourneyType) => void;
  showType: boolean;
  title: string;
  onTitleChange: (v: string) => void;
  error?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
  aiBase: string;
};

export function StartJourneyFields({ idPrefix, type, onTypeChange, showType, title, onTitleChange, error, onSubmit, autoFocus, aiBase }: StartJourneyFieldsProps): ReactElement {
  const t = useTranslations("studio");
  const options: readonly ChoiceCard[] = [
    { value: "service", title: t("sx.journeyRun.service"), description: t("sx.journeyRun.serviceWhat"), icon: BriefcaseIcon },
    { value: "package", title: t("sx.journeyRun.package"), description: t("sx.journeyRun.packageWhat"), icon: PackageIcon },
  ];
  const nameLabel = t("sx.journeyRun.name");
  const keyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !onSubmit || e.nativeEvent.isComposing) return;
    e.preventDefault();
    onSubmit();
  };
  return (
    <FormGrid>
      {showType ? (
        <Field id={`${idPrefix}-type`} label={t("sx.journeyRun.kind")} as="fieldset">
          {(a) => (
            <ChoiceCards
              id={`${idPrefix}-type`}
              value={type}
              onChange={(v) => onTypeChange?.(v === "package" ? "package" : "service")}
              options={options}
              columns={2}
              readOnly={!onTypeChange}
              aria-labelledby={a["aria-labelledby"]}
              aria-describedby={a["aria-describedby"]}
              aiId={`${aiBase}.type`}
            />
          )}
        </Field>
      ) : null}
      <Field id={`${idPrefix}-name`} label={nameLabel} required error={error}>
        {(a) => (
          <TextInput
            {...a}
            value={title}
            onChange={onTitleChange}
            onKeyDown={keyDown}
            maxLength={JOURNEY_TITLE_MAX}
            placeholder={type === "package" ? t("sx.journeyRun.namePhPackage") : t("sx.journeyRun.namePhService")}
            autoFocus={autoFocus}
            aiId={`${aiBase}.name`}
            aiLabel={nameLabel}
          />
        )}
      </Field>
    </FormGrid>
  );
}

export type StartJourneyButtonProps = { type: StudioJourneyType; variant?: SxButtonVariant; size?: "md" | "sm"; label: string; disabledReason?: string; aiId: string };

function StartJourneyDialog({ type, label, aiId, onClose }: { type: StudioJourneyType; label: string; aiId: string; onClose: () => void }): ReactElement {
  const t = useTranslations("studio");
  const router = useRouter();
  const errText = useEditorErrorText();
  const uid = useId();
  const formId = `${uid}-form`;
  const modalAi = `${aiId}-modal`;
  const { busy, error, start, clear } = useStartJourney();
  const [title, setTitle] = useState("");
  const [tried, setTried] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const missing = !journeyTitleOf(title);
  const nameErr = tried && missing ? t("sx.err.required") : "";
  const working = busy || leaving;

  async function run(e: FormEvent) {
    e.preventDefault();
    if (working) return;
    setTried(true);
    if (missing) {
      box.current?.querySelector<HTMLInputElement>("input")?.focus();
      return;
    }
    const j = await start({ type, title });
    if (!j) return;
    setLeaving(true);
    router.push(creationJourneyHref(j));
  }

  return (
    <SxDialog
      open
      onClose={onClose}
      title={label}
      size="sm"
      busy={working}
      dirty={!missing}
      aiId={modalAi}
      footer={
        <>
          <SxButton variant="secondary" onClick={onClose} disabled={working} aiId={`${modalAi}.cancel`}>
            {t("sx.ui.cancel")}
          </SxButton>
          <SxButton type="submit" form={formId} variant="primary" icon={RocketLaunchIcon} busy={working} aiId={`${modalAi}.confirm`}>
            {t("sx.journeyRun.start")}
          </SxButton>
        </>
      }
    >
      <form id={formId} className="sx-dlg__form" onSubmit={run} noValidate>
        <div ref={box} className="sx-sj">
          <StartJourneyFields
            idPrefix={`sx-sj-${type}`}
            type={type}
            showType={false}
            title={title}
            onTitleChange={(v) => {
              setTitle(v);
              if (error) clear();
            }}
            error={nameErr}
            autoFocus
            aiBase={modalAi}
          />
        </div>
        <SxDialogError error={error ? errText(error) : null} />
      </form>
    </SxDialog>
  );
}

export function StartJourneyButton({ type, variant = "primary", size = "md", label, disabledReason, aiId }: StartJourneyButtonProps): ReactElement {
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
      {open && !why ? <StartJourneyDialog type={type} label={label} aiId={aiId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
