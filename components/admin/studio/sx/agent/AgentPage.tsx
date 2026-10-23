"use client";

import "../sx-tones.css";
import "./sx-agent.css";
import { useMemo, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { BotIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { agentCreateErrorOf, type AgentFieldError, type AgentInput, type AgentJob, type AgentLanguage, type AgentScript } from "@/lib/services/studioAgent";
import { isRetiredStudioCode, studioCtorRank, useStudioRegistry } from "@/lib/services/studio";
import { notify } from "@/lib/toast";
import { errDetail, isOffline } from "@/lib/http";
import { SxButton } from "../Button";
import { SxDialog } from "../editor/SxDialog";
import { ArrowRightIcon, BookOpenTextIcon, ClockIcon, GlobeIcon, ListChecksIcon, SearchIcon, ShieldCheckIcon, SparklesIcon, ctorIcon, glyph } from "../icons";
import { SxEmpty } from "../layout/Empty";
import { SxNote } from "../layout/Note";
import { SxPage } from "../layout/Page";
import type { SxOption } from "../types";
import { useStudioLabels } from "../useStudioLabels";
import { AGENT_FORM_START, AgentForm, PROMPT_MIN, type AgentFormValues } from "./AgentForm";
import { AgentJobView } from "./AgentJobView";
import { useAgentJob } from "./useAgentJob";

// Studio's AI agent (FRONTEND_STUDIO_AI_AGENT_V21_AUTONOMOUS_TOOLS_2026_10_22.md):
// the request form on the left, the job it started on the right. The backend
// does the research, drafting, checks and saving; this page starts one job
// when asked, follows it, and opens the drafts it saved in the normal Studio
// flow. Nothing is ever published or resubmitted from here.

const AI = "admin.studio.agent";

const toInput = (v: AgentFormValues): AgentInput => ({
  prompt: v.prompt,
  constructorCodes: v.codes,
  drafts: v.drafts,
  language: v.language,
  script: v.language === "uz" ? v.script : "latn",
  officialSources: v.official,
});

// A finished job's own request, for a manual retry (§13): its values where
// it carries them, the form's otherwise.
function valuesOf(job: AgentJob | null, form: AgentFormValues): AgentFormValues {
  if (!job) return form;
  const lang = (["uz", "ru", "en"] as const).find((l) => l === job.language) ?? form.language;
  return {
    prompt: job.prompt || form.prompt,
    codes: job.constructorCodes.length ? job.constructorCodes : form.codes,
    drafts: job.targetDrafts || form.drafts,
    language: lang as AgentLanguage,
    script: (job.script === "cyrl" ? "cyrl" : job.script === "latn" ? "latn" : form.script) as AgentScript,
    official: job.officialSources ?? form.official,
  };
}

export default function AgentPage(): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const { session } = useAuth();
  const reg = useStudioRegistry();
  const preset = useSearchParams().get("ctor") ?? "";
  const agent = useAgentJob(session?.id ?? "");
  const [form, setForm] = useState<AgentFormValues>(() => ({ ...AGENT_FORM_START, codes: preset ? [preset.toUpperCase()] : [] }));
  const [tried, setTried] = useState(false);
  const [serverErr, setServerErr] = useState<AgentFieldError | null>(null);
  const [confirm, setConfirm] = useState<AgentFormValues | null>(null);

  const ctorOptions: SxOption[] = useMemo(
    () =>
      reg.items
        .filter((c) => !isRetiredStudioCode(c.code))
        .sort((a, b) => studioCtorRank(a.code) - studioCtorRank(b.code))
        .map((c) => ({ value: c.code, label: labels.ctorName(c.code, c.title), code: c.code, icon: ctorIcon(c.code) })),
    [reg.items, labels],
  );

  async function submit(values: AgentFormValues) {
    setTried(true);
    if (values.prompt.trim().length < PROMPT_MIN || agent.submitting) return;
    setServerErr(null);
    const r = await agent.start(toInput(values));
    if (r.ok) {
      setTried(false);
      return;
    }
    const field = agentCreateErrorOf(r.error);
    if (field) {
      setForm(values);
      setServerErr(field);
      return;
    }
    // §13: no automatic retry for 401/403 or anything else; the values stay.
    notify.error(isOffline(r.error) ? t("sx.agent.err.offline") : errDetail(r.error) || t("sx.agent.err.create"), { error: r.error });
  }

  const job = agent.job;
  const status = job ? String(job.status) : "";

  const right = agent.phase === "loading" ? (
    <div className="sx-ag-card sx-ag-sk" aria-busy="true">
      <span />
      <span />
      <span />
    </div>
  ) : job ? (
    <AgentJobView
      job={job}
      conn={agent.conn}
      polling={agent.polling}
      onRefresh={agent.refresh}
      onNew={agent.close}
      onRetry={() => setConfirm(valuesOf(job, form))}
      onAnother={() => setConfirm(valuesOf(job, form))}
    />
  ) : agent.phase === "missing" ? (
    <SxEmpty icon={SearchIcon} title={t("sx.agent.missing.title")} text={t("sx.agent.missing.text")} />
  ) : agent.phase === "forbidden" ? (
    <SxEmpty icon={ShieldCheckIcon} title={t("sx.agent.forbidden.title")} text={t("sx.agent.forbidden.text")} />
  ) : agent.phase === "error" ? (
    <SxNote tone="error" title={t("sx.agent.err.load")} action={<SxButton size="sm" variant="secondary" onClick={agent.refresh}>{t("sx.ui.retry")}</SxButton>}>
      {errDetail(agent.error) || t("sx.agent.err.loadText")}
    </SxNote>
  ) : (
    <section className="sx-ag-card sx-ag-idle" aria-labelledby="sx-ag-idle">
      <span className="sx-ag-idle__bot" aria-hidden="true">
        <BotIcon size={30} strokeWidth={1.8} />
      </span>
      <h2 id="sx-ag-idle">{t("sx.agent.idle.title")}</h2>
      <p>{t("sx.agent.idle.text")}</p>
      <ol className="sx-ag-how">
        {(
          [
            ["research", BookOpenTextIcon],
            ["draft", SparklesIcon],
            ["check", ListChecksIcon],
            ["save", ShieldCheckIcon],
          ] as const
        ).map(([k, I], i) => (
          <li key={k}>
            <span className="sx-ag-how__n sx-num">{i + 1}</span>
            <span className="sx-ag-how__ic">{glyph(I, { size: 16 })}</span>
            <b>{t(`sx.agent.idle.${k}`)}</b>
            <small>{t(`sx.agent.idle.${k}Text`)}</small>
          </li>
        ))}
      </ol>
    </section>
  );

  return (
    <SxPage title={t("sx.agent.title")} section="ai" icon={<BotIcon size={20} aria-hidden />} lead={t("sx.agent.lead")} need="edit" aiId={AI}>
      <div className="sx-ag" data-busy={agent.submitting ? "" : undefined}>
        <aside className="sx-ag-side">
          <div className="sx-ag-card">
            <AgentForm
              value={form}
              onChange={(v) => {
                setForm(v);
                if (serverErr) setServerErr(null);
              }}
              ctorOptions={ctorOptions}
              ctorsLoading={reg.avail === "checking"}
              busy={agent.submitting}
              tried={tried}
              serverError={serverErr}
              onSubmit={() => (job && (status === "queued" || status === "running") ? setConfirm(form) : void submit(form))}
            />
          </div>
          {agent.recent.length ? (
            <nav className="sx-ag-card sx-ag-recent" aria-labelledby="sx-ag-rec">
              <p id="sx-ag-rec" className="sx-ag-h3">
                {glyph(ClockIcon, { size: 15 })}
                {t("sx.agent.recent.title")}
              </p>
              <ul>
                {agent.recent.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="sx-ag-recent__b" aria-current={r.id === agent.id ? "true" : undefined} onClick={() => agent.open(r.id)}>
                      <span className="sx-ag-recent__t">
                        <b>{r.codes.length ? r.codes.join(", ") : t("sx.agent.recent.anyCtor")}</b>
                        <small>{[labels.dateTime(r.at), t("sx.agent.recent.drafts", { n: r.drafts })].filter(Boolean).join(" · ")}</small>
                      </span>
                      {glyph(ArrowRightIcon, { size: 14 })}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </aside>
        <div className="sx-ag-main" aria-live="polite">
          {right}
        </div>
      </div>

      {confirm ? (
        <SxDialog
          open
          onClose={() => setConfirm(null)}
          title={t("sx.agent.confirm.title")}
          description={job && (status === "queued" || status === "running") ? t("sx.agent.confirm.running") : t("sx.agent.confirm.text")}
          size="sm"
          aiId={`${AI}.confirm`}
          footer={
            <>
              <SxButton variant="secondary" onClick={() => setConfirm(null)} aiId={`${AI}.confirm.cancel`}>
                {t("sx.ui.cancel")}
              </SxButton>
              <SxButton
                variant="primary"
                icon={SparklesIcon}
                busy={agent.submitting}
                onClick={() => {
                  const v = confirm;
                  setConfirm(null);
                  setForm(v);
                  void submit(v);
                }}
                aiId={`${AI}.confirm.ok`}
              >
                {t("sx.agent.confirm.ok", { n: confirm.drafts })}
              </SxButton>
            </>
          }
        >
          <p className="sx-ag-confirm">
            {glyph(GlobeIcon, { size: 14 })}
            <span>{confirm.prompt.trim().slice(0, 220)}{confirm.prompt.trim().length > 220 ? "…" : ""}</span>
          </p>
        </SxDialog>
      ) : null}
    </SxPage>
  );
}
