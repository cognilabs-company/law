"use client";

import "./sx-agent-flow.css";
import type { ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { timeOnly } from "@/lib/date";
import { AGENT_TOOLS, type AgentJob } from "@/lib/services/studioAgent";
import { BookOpenTextIcon, CircleCheckIcon, FileTextIcon, GlobeIcon, LayersIcon, ListChecksIcon, SaveIcon, SparklesIcon, TriangleAlertIcon, glyph } from "../icons";

// The agent's work as a pipeline: five steps the backend's stages fall
// into, the one it is on glowing with its exact sub-stage, the steps behind
// it ticked; then what it is doing right now, newest first, from the tools
// it reports. Every value is the backend's; the grouping is only how the
// stages are drawn.

const STEPS = [
  { key: "understand", icon: SparklesIcon, stages: ["queued", "understanding", "loading_contracts"] },
  { key: "research", icon: BookOpenTextIcon, stages: ["catalog_research", "legal_research", "primary_research", "reading_sources"] },
  { key: "draft", icon: FileTextIcon, stages: ["drafting"] },
  { key: "check", icon: ListChecksIcon, stages: ["schema_validation", "language_review", "source_verification", "duplicate_comparison"] },
  { key: "save", icon: SaveIcon, stages: ["saving_drafts", "completed"] },
] as const;

const KNOWN_TOOLS = new Set<string>(AGENT_TOOLS);
const FEED_MAX = 6;

function stepOf(stage: string): number {
  const i = STEPS.findIndex((s) => (s.stages as readonly string[]).includes(stage));
  return i;
}

export function AgentPipeline({ job, live }: { job: AgentJob; live: boolean }): ReactElement {
  const t = useTranslations("studio");
  const locale = useLocale();
  const status = String(job.status);
  const done = status === "completed";
  const broken = status === "failed" || status === "partial_failed" || status === "cancelled";
  // Where it is: the stage it reports; a finished job is past every step,
  // a stopped one stays on the step it stopped at (or the last it reached).
  let at = stepOf(job.stage);
  if (done) at = STEPS.length;
  else if (at < 0) at = broken ? Math.max(0, stepOf(job.tools.length ? "reading_sources" : "understanding")) : 0;
  const fill = done ? 100 : Math.round((Math.max(0, at) / (STEPS.length - 1)) * 100);
  const stageText = t.has(`sx.agent.stage.${job.stage}`) ? t(`sx.agent.stage.${job.stage}`) : t("sx.agent.stage.unknown");
  const feed = job.tools.slice(-FEED_MAX).reverse();
  const saved = job.savedCount ?? job.drafts.length;

  return (
    <div className="sx-agf" data-live={live || undefined} data-broken={broken || undefined} data-done={done || undefined}>
      <ol className="sx-agf__steps" style={{ ["--fillw" as string]: `calc(80% * ${fill / 100})` }} aria-label={t("sx.agent.flow.title")}>
        {STEPS.map((s, i) => {
          const state = done || i < at ? "done" : i === at ? (broken ? "fail" : "now") : "next";
          return (
            <li key={s.key} className="sx-agf__step" data-state={state} aria-current={state === "now" ? "step" : undefined}>
              <span className="sx-agf__node" aria-hidden="true">
                {state === "done" ? glyph(CircleCheckIcon, { size: 18 }) : state === "fail" ? glyph(TriangleAlertIcon, { size: 18 }) : glyph(s.icon, { size: 18 })}
                {state === "now" && live ? <i className="sx-agf__halo" /> : null}
              </span>
              <b className="sx-agf__label">{t(`sx.agent.flow.${s.key}`)}</b>
              {state === "now" || state === "fail" ? <small className="sx-agf__sub">{stageText}</small> : null}
            </li>
          );
        })}
      </ol>

      <div className="sx-agf__stats">
        <span>
          {glyph(GlobeIcon, { size: 14 })}
          <b className="sx-num">{job.sources.length}</b>
          {t("sx.agent.flow.sources")}
        </span>
        <span>
          {glyph(LayersIcon, { size: 14 })}
          <b className="sx-num">
            {saved}/{job.targetDrafts || "—"}
          </b>
          {t("sx.agent.flow.drafts")}
        </span>
        <span>
          {glyph(SparklesIcon, { size: 14 })}
          <b className="sx-num">{job.toolCalls ?? job.tools.length}</b>
          {t("sx.agent.flow.actions")}
        </span>
      </div>

      {feed.length ? (
        <ol className="sx-agf__feed" aria-label={t("sx.agent.flow.now")} aria-live={live ? "polite" : undefined}>
          {feed.map((x, k) => (
            <li key={`${x.at}-${x.tool}-${k}`} data-ok={x.ok === false ? "no" : x.ok === true ? "yes" : undefined} data-first={k === 0 || undefined}>
              <span className="sx-agf__dot" aria-hidden="true" />
              <span className="sx-agf__tool">{KNOWN_TOOLS.has(x.tool) ? t(`sx.agent.tool.${x.tool}`) : x.tool}</span>
              {x.durationMs !== null ? <span className="sx-agf__ms sx-num">{x.durationMs >= 1000 ? `${(x.durationMs / 1000).toFixed(1)} s` : `${Math.round(x.durationMs)} ms`}</span> : null}
              {x.at ? <time className="sx-agf__at">{timeOnly(x.at, locale)}</time> : null}
            </li>
          ))}
        </ol>
      ) : live ? (
        <p className="sx-agf__wait">
          <span className="sx-agf__typing" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {t("sx.agent.flow.thinking")}
        </p>
      ) : null}
    </div>
  );
}
