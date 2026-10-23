"use client";

import { useId, type FormEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { BotIcon, MinusIcon } from "lucide-react";
import type { AgentFieldError, AgentLanguage, AgentScript } from "@/lib/services/studioAgent";
import { SxButton } from "../Button";
import { Field } from "../form/Field";
import { Picker } from "../form/Picker";
import { Switch } from "../form/Switch";
import { TextArea } from "../form/TextArea";
import { PlusIcon, ShieldCheckIcon, SparklesIcon, glyph } from "../icons";
import { SxSegmented } from "../shared/Segmented";
import type { SxOption } from "../types";

// What the agent is asked to make (§3): the request, the constructors, how
// many drafts, the output language and script, and whether official sources
// are required. Values live in the page, so a failed submit keeps them and a
// manual retry reuses them.

export const PROMPT_MIN = 10;
export const PROMPT_MAX = 4000;
export const DRAFTS_MAX = 10;

export type AgentFormValues = { prompt: string; codes: string[]; drafts: number; language: AgentLanguage; script: AgentScript; official: boolean };
export const AGENT_FORM_START: AgentFormValues = { prompt: "", codes: [], drafts: 3, language: "uz", script: "latn", official: true };

const AI = "admin.studio.agent.form";

export function AgentForm({
  value,
  onChange,
  ctorOptions,
  ctorsLoading,
  busy,
  tried,
  serverError,
  onSubmit,
}: {
  value: AgentFormValues;
  onChange: (next: AgentFormValues) => void;
  ctorOptions: readonly SxOption[];
  ctorsLoading: boolean;
  busy: boolean;
  tried: boolean;
  serverError: AgentFieldError | null;
  onSubmit: () => void;
}): ReactElement {
  const t = useTranslations("studio");
  const uid = useId();
  const set = <K extends keyof AgentFormValues>(k: K, v: AgentFormValues[K]) => onChange({ ...value, [k]: v });
  const short = value.prompt.trim().length < PROMPT_MIN;
  const promptErr =
    tried && short ? t("sx.agent.form.promptShort", { n: PROMPT_MIN }) : serverError?.field === "prompt" ? t("sx.agent.form.promptShort", { n: PROMPT_MIN }) : "";
  const ctorErr = serverError?.field === "constructors" ? t("sx.agent.form.ctorInvalid", { codes: serverError.extra || "—" }) : "";
  const langErr = serverError?.field === "language" ? t("sx.agent.form.langInvalid") : "";
  const examples = [t("sx.agent.form.ex1"), t("sx.agent.form.ex2"), t("sx.agent.form.ex3")];

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }

  return (
    <form className="sx-ag-form" onSubmit={submit} noValidate aria-labelledby={`${uid}-h`} data-ai-id={AI} data-ai-type="form">
      <header className="sx-ag-form__head">
        <span className="sx-ag-bot" aria-hidden="true">
          <BotIcon size={20} strokeWidth={2} />
        </span>
        <span className="sx-ag-form__ht">
          <b id={`${uid}-h`}>{t("sx.agent.form.title")}</b>
          <small>{t("sx.agent.form.lead")}</small>
        </span>
      </header>

      <Field id={`${uid}-prompt`} label={t("sx.agent.form.prompt")} required error={promptErr} help={t("sx.agent.form.promptHelp")}>
        {(a) => (
          <TextArea
            {...a}
            value={value.prompt}
            onChange={(v) => set("prompt", v)}
            minRows={5}
            maxRows={14}
            maxLength={PROMPT_MAX}
            counter
            placeholder={t("sx.agent.form.promptPh")}
            invalid={!!promptErr}
            disabled={busy}
            aiId={`${AI}.prompt`}
            aiLabel={t("sx.agent.form.prompt")}
          />
        )}
      </Field>
      {!value.prompt.trim() ? (
        <div className="sx-ag-ex" role="group" aria-label={t("sx.agent.form.examples")}>
          <span>{t("sx.agent.form.examples")}</span>
          {examples.map((ex, i) => (
            <button key={i} type="button" className="sx-ag-ex__b" onClick={() => set("prompt", ex)} disabled={busy}>
              {glyph(SparklesIcon, { size: 12 })}
              {ex}
            </button>
          ))}
        </div>
      ) : null}

      <Field id={`${uid}-ctors`} label={t("sx.agent.form.ctors")} help={t("sx.agent.form.ctorsHelp")} error={ctorErr}>
        {(a) => (
          <Picker
            {...a}
            multiple
            label={t("sx.agent.form.ctors")}
            placeholder={ctorsLoading ? t("sx.agent.form.ctorsLoading") : t("sx.agent.form.ctorsPh")}
            options={ctorOptions}
            value={value.codes}
            onChange={(v) => set("codes", v)}
            searchable
            invalid={!!ctorErr}
            disabled={busy}
            aiId={`${AI}.constructors`}
          />
        )}
      </Field>

      <div className="sx-ag-row">
        <Field id={`${uid}-n`} label={t("sx.agent.form.drafts")} help={t("sx.agent.form.draftsHelp", { max: DRAFTS_MAX })}>
          {(a) => (
            <div className="sx-ag-step" role="group" aria-labelledby={a["aria-labelledby"]} aria-describedby={a["aria-describedby"]}>
              <button type="button" className="sx-ag-step__b" onClick={() => set("drafts", Math.max(1, value.drafts - 1))} disabled={busy || value.drafts <= 1} aria-label={t("sx.agent.form.less")}>
                <MinusIcon size={16} aria-hidden />
              </button>
              <output className="sx-ag-step__n" aria-live="polite">
                {value.drafts}
              </output>
              <button type="button" className="sx-ag-step__b" onClick={() => set("drafts", Math.min(DRAFTS_MAX, value.drafts + 1))} disabled={busy || value.drafts >= DRAFTS_MAX} aria-label={t("sx.agent.form.more")}>
                {glyph(PlusIcon, { size: 16 })}
              </button>
            </div>
          )}
        </Field>
        <Field id={`${uid}-lang`} label={t("sx.agent.form.language")} error={langErr}>
          {() => (
            <SxSegmented<AgentLanguage>
              items={[
                { value: "uz", label: t("sx.agent.lang.uz"), aiId: `${AI}.language.uz` },
                { value: "ru", label: t("sx.agent.lang.ru"), aiId: `${AI}.language.ru` },
                { value: "en", label: t("sx.agent.lang.en"), aiId: `${AI}.language.en` },
              ]}
              value={value.language}
              onChange={(v) => set("language", v)}
              label={t("sx.agent.form.language")}
              size="sm"
              stretch
              aiId={`${AI}.language`}
            />
          )}
        </Field>
      </div>

      {value.language === "uz" ? (
        <Field id={`${uid}-script`} label={t("sx.agent.form.script")}>
          {() => (
            <SxSegmented<AgentScript>
              items={[
                { value: "latn", label: t("sx.agent.script.latn"), aiId: `${AI}.script.latn` },
                { value: "cyrl", label: t("sx.agent.script.cyrl"), aiId: `${AI}.script.cyrl` },
              ]}
              value={value.script}
              onChange={(v) => set("script", v)}
              label={t("sx.agent.form.script")}
              size="sm"
              stretch
              aiId={`${AI}.script`}
            />
          )}
        </Field>
      ) : null}

      <div className="sx-ag-official">
        <span className="sx-ag-official__ic" aria-hidden="true">
          {glyph(ShieldCheckIcon, { size: 18 })}
        </span>
        <span className="sx-ag-official__t">
          <b id={`${uid}-off`}>{t("sx.agent.form.official")}</b>
          <small id={`${uid}-offh`}>{value.official ? t("sx.agent.form.officialOn") : t("sx.agent.form.officialOff")}</small>
        </span>
        <Switch checked={value.official} onChange={(v) => set("official", v)} aria-labelledby={`${uid}-off`} aria-describedby={`${uid}-offh`} disabled={busy} aiId={`${AI}.official`} />
      </div>

      {serverError?.field === "form" ? (
        <p className="sx-ag-err" role="alert">
          {t("sx.agent.form.serverError", { code: serverError.code || "—" })}
        </p>
      ) : null}

      <SxButton type="submit" variant="primary" icon={SparklesIcon} busy={busy} className="sx-ag-start" aiId={`${AI}.start`}>
        {busy ? t("sx.agent.form.starting") : t("sx.agent.form.start", { n: value.drafts })}
      </SxButton>
    </form>
  );
}
