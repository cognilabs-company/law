"use client";

import { useState, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { BotIcon, CircleXIcon, Link2Icon, WifiIcon, WifiOffIcon } from "lucide-react";
import { AGENT_STAGES, AGENT_TOOLS, safeUrl, shortfallOf, type AgentCheck, type AgentDraft, type AgentJob, type AgentSource } from "@/lib/services/studioAgent";
import { SxButton, SxLinkButton } from "../Button";
import {
  ActivityIcon,
  ChevronDownIcon,
  CircleCheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GlobeIcon,
  HourglassIcon,
  LayersIcon,
  ListChecksIcon,
  RefreshCwIcon,
  ScaleIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TriangleAlertIcon,
  glyph,
} from "../icons";
import { SxNote } from "../layout/Note";
import { SxRing } from "../shared/Ring";
import { useStudioLabels } from "../useStudioLabels";
import { AgentPipeline } from "./AgentPipeline";
import type { AgentConn } from "./useAgentJob";

// A job as the backend reports it: where it is, what it saved, how the
// saved drafts were checked, what it read, and — folded away — every tool
// it used. Every verdict shown here is the backend's; a missing one is
// shown as "not reported", never as a pass.

const AI = "admin.studio.agent.job";
const KNOWN_STAGES = new Set<string>(AGENT_STAGES);
const KNOWN_TOOLS = new Set<string>(AGENT_TOOLS);

type T = ReturnType<typeof useTranslations>;

function Verdict({ check, label, t }: { check: AgentCheck; label: string; t: T }): ReactElement {
  const tone = check.ok === true ? "ok" : check.ok === false ? "bad" : "none";
  return (
    <li className="sx-ag-verdict" data-tone={tone}>
      {glyph(check.ok === true ? CircleCheckIcon : check.ok === false ? TriangleAlertIcon : HourglassIcon, { size: 14 })}
      <span>{label}</span>
      <b>{check.ok === true ? t("sx.agent.check.ok") : check.ok === false ? t("sx.agent.check.bad") : t("sx.agent.check.none")}</b>
    </li>
  );
}

function SourceRow({ s, t, labels }: { s: AgentSource; t: T; labels: ReturnType<typeof useStudioLabels> }): ReactElement {
  const url = safeUrl(s.url);
  return (
    <li className="sx-ag-src">
      <span className="sx-ag-src__ic" aria-hidden="true">
        {glyph(GlobeIcon, { size: 15 })}
      </span>
      <span className="sx-ag-src__t">
        <b>{s.title}</b>
        <small>
          {[s.domain, s.checkedAt ? t("sx.agent.src.checked", { at: (/^\d{4}-\d{2}-\d{2}$/.test(s.checkedAt) ? labels.date(s.checkedAt) : labels.dateTime(s.checkedAt)) || s.checkedAt }) : ""].filter(Boolean).join(" · ")}
        </small>
      </span>
      {s.official === true ? <span className="sx-ag-tag" data-tone="ok">{t("sx.agent.src.official")}</span> : s.trusted === true ? <span className="sx-ag-tag">{t("sx.agent.src.trusted")}</span> : null}
      {url ? (
        <a className="sx-ag-src__go" href={url} target="_blank" rel="noopener noreferrer" aria-label={t("sx.agent.src.open", { title: s.title })}>
          {glyph(ExternalLinkIcon, { size: 15 })}
        </a>
      ) : null}
    </li>
  );
}

function DraftCard({ d, i, t, labels }: { d: AgentDraft; i: number; t: T; labels: ReturnType<typeof useStudioLabels> }): ReactElement {
  const warn = d.validation.ok === false || d.language.ok === false || d.sourcesCheck.ok === false;
  const dup = d.matches.length > 0 || d.comparisonRequired;
  return (
    <li className="sx-ag-draft" data-warn={warn || dup ? "" : undefined} style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
      <div className="sx-ag-draft__top">
        <span className="sx-ag-draft__ic" aria-hidden="true">
          {glyph(FileTextIcon, { size: 18 })}
        </span>
        <span className="sx-ag-draft__t">
          <b>{d.title || t("sx.ui.untitled")}</b>
          <small>
            <span className="sx-code">{d.constructorCode}</span> {labels.ctorName(d.constructorCode)}
          </small>
        </span>
        <span className="sx-ag-tag" data-tone="draft">
          {t("sx.agent.draft.badge")}
        </span>
      </div>
      <ul className="sx-ag-verdicts">
        <Verdict check={d.validation} label={t("sx.agent.check.schema")} t={t} />
        <Verdict check={d.language} label={t("sx.agent.check.language")} t={t} />
        <Verdict check={d.sourcesCheck} label={t("sx.agent.check.sources")} t={t} />
      </ul>
      {[...d.validation.errors, ...d.language.errors, ...d.sourcesCheck.errors].length ? (
        <ul className="sx-ag-issues">
          {[...d.validation.errors, ...d.language.errors, ...d.sourcesCheck.errors].map((e, k) => (
            <li key={k}>{e}</li>
          ))}
        </ul>
      ) : null}
      {dup ? (
        <div className="sx-ag-dup" role="note">
          <p>
            {glyph(ScaleIcon, { size: 15 })}
            <b>{t("sx.agent.draft.dupTitle")}</b>
            <span>{t("sx.agent.draft.dupText")}</span>
          </p>
          {d.matches.length ? (
            <ul>
              {d.matches.map((m, k) => (
                <li key={m.objectId || k}>
                  {m.objectId ? (
                    <a href={`/admin/studio/o/${encodeURIComponent(m.objectId)}`} target="_blank" rel="noopener noreferrer">
                      {m.title || m.objectId}
                    </a>
                  ) : (
                    <span>{m.title}</span>
                  )}
                  {m.similarity !== null ? <small>{t("sx.agent.draft.similar", { pct: Math.round(m.similarity <= 1 ? m.similarity * 100 : m.similarity) })}</small> : null}
                  {m.kind ? <small>{m.kind}</small> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {d.dependencies.length ? (
        <p className="sx-ag-deps">
          {glyph(Link2Icon, { size: 14 })}
          <span>{t("sx.agent.draft.deps")}</span>
          {d.dependencies.map((x) => (
            <span key={x} className="sx-ag-tag">
              {x}
            </span>
          ))}
        </p>
      ) : null}
      {d.improvements.length ? (
        <div className="sx-ag-impr">
          <p>{t("sx.agent.draft.improvements")}</p>
          <ul>
            {d.improvements.map((x, k) => (
              <li key={k}>{x}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {d.sources.length ? (
        <ul className="sx-ag-srcs sx-ag-srcs--in">
          {d.sources.map((s, k) => (
            <SourceRow key={`${s.url}-${k}`} s={s} t={t} labels={labels} />
          ))}
        </ul>
      ) : null}
      <div className="sx-ag-draft__acts">
        {d.objectId ? (
          <SxLinkButton variant="primary" size="sm" iconEnd={ExternalLinkIcon} href={`/admin/studio/o/${encodeURIComponent(d.objectId)}`} aiId={`${AI}.draft.${d.objectId}.open`}>
            {t("sx.agent.draft.open")}
          </SxLinkButton>
        ) : null}
      </div>
    </li>
  );
}

function QualityTile({ label, n, of, icon, t }: { label: string; n: number | null; of: number | null; icon: typeof ShieldCheckIcon; t: T }): ReactElement {
  const short = n !== null && of !== null && n < of;
  return (
    <div className="sx-ag-q" data-tone={n === null ? "none" : short ? "warn" : "ok"}>
      <span className="sx-ag-q__ic" aria-hidden="true">
        {glyph(icon, { size: 16 })}
      </span>
      <b className="sx-num">{n === null ? "—" : of !== null ? `${n} / ${of}` : n}</b>
      <small>{label}</small>
      {short ? <em>{t("sx.agent.quality.short")}</em> : null}
    </div>
  );
}

export function AgentJobView({
  job,
  conn,
  polling,
  onRefresh,
  onNew,
  onRetry,
  onAnother,
}: {
  job: AgentJob;
  conn: AgentConn;
  polling: boolean;
  onRefresh: () => void;
  onNew: () => void;
  onRetry: () => void;
  onAnother: () => void;
}): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const [copied, setCopied] = useState(false);
  const status = String(job.status);
  const known = ["queued", "running", "completed", "partial_failed", "failed", "cancelled"].includes(status) ? status : "running";
  const stageKey = KNOWN_STAGES.has(job.stage) ? job.stage : "";
  const stageLabel = stageKey ? t(`sx.agent.stage.${stageKey}`) : t("sx.agent.stage.unknown");
  const live = known === "queued" || known === "running";
  const pct = job.progress === null ? null : Math.max(0, Math.min(100, Math.round(job.progress)));
  const draftsTotal = job.draftCount ?? job.drafts.length;
  const saved = job.savedCount ?? job.drafts.length;
  const fall = shortfallOf(job);
  const qOf = draftsTotal || null;

  const copy = () => {
    void navigator.clipboard?.writeText(job.id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const connChip: ReactNode = !live ? null : conn === "online" ? (
    <span className="sx-ag-conn" data-state="online">
      <WifiIcon size={13} aria-hidden />
      {t("sx.agent.conn.online")}
    </span>
  ) : (
    <span className="sx-ag-conn" data-state="off">
      <WifiOffIcon size={13} aria-hidden />
      {polling ? t("sx.agent.conn.polling") : t("sx.agent.conn.reconnecting")}
    </span>
  );

  return (
    <div className="sx-ag-job" data-status={known} data-ai-id={AI} data-ai-type="section" data-ai-entity-type="studio_ai_agent_job" data-ai-entity-id={job.id}>
      <section className="sx-ag-card sx-ag-head" aria-labelledby="sx-ag-h">
        <div className="sx-ag-head__ring">
          <SxRing value={live ? pct : known === "failed" || known === "cancelled" ? pct : 100} label={t("sx.agent.progress")} size={84} stroke={7}>
            {live ? (
              <b className="sx-num">{pct === null ? "…" : `${pct}%`}</b>
            ) : known === "completed" ? (
              glyph(CircleCheckIcon, { size: 28 })
            ) : known === "partial_failed" ? (
              glyph(TriangleAlertIcon, { size: 26 })
            ) : (
              <CircleXIcon size={26} aria-hidden />
            )}
          </SxRing>
          {live ? <span className="sx-ag-pulse" aria-hidden="true" /> : null}
        </div>
        <div className="sx-ag-head__t">
          <p className="sx-ag-head__row">
            <span className="sx-ag-status" data-status={known}>
              {t(`sx.agent.status.${known}`)}
            </span>
            {connChip}
          </p>
          <h2 id="sx-ag-h">{live ? stageLabel : t(`sx.agent.outcome.${known}`, { n: draftsTotal, of: job.targetDrafts })}</h2>
          <p className="sx-ag-head__lead" aria-live="polite">
            {known === "queued" ? t("sx.agent.queuedLead") : live ? t("sx.agent.runningLead", { saved, of: job.targetDrafts }) : stageKey && known !== "completed" ? stageLabel : t("sx.agent.doneLead")}
          </p>
          <dl className="sx-ag-meta">
            {job.requestedAt ? (
              <div>
                <dt>{t("sx.agent.meta.requested")}</dt>
                <dd>{labels.dateTime(job.requestedAt)}</dd>
              </div>
            ) : null}
            {job.toolCalls !== null ? (
              <div>
                <dt>{t("sx.agent.meta.tools")}</dt>
                <dd className="sx-num">{job.toolCalls}</dd>
              </div>
            ) : null}
            {job.turns !== null ? (
              <div>
                <dt>{t("sx.agent.meta.turns")}</dt>
                <dd className="sx-num">{job.turns}</dd>
              </div>
            ) : null}
            {job.attempts !== null && job.attempts > 1 ? (
              <div>
                <dt>{t("sx.agent.meta.attempts")}</dt>
                <dd className="sx-num">{job.attempts}</dd>
              </div>
            ) : null}
            <div>
              <dt>{t("sx.agent.meta.id")}</dt>
              <dd>
                <button type="button" className="sx-ag-id" onClick={copy} title={job.id} aria-label={t("sx.agent.meta.copy")}>
                  <span className="sx-code">{job.id.slice(0, 8)}</span>
                  {glyph(copied ? CircleCheckIcon : CopyIcon, { size: 13 })}
                </button>
              </dd>
            </div>
          </dl>

        </div>
        <div className="sx-ag-head__acts">
          <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={onRefresh} aiId={`${AI}.refresh`}>
            {t("sx.agent.refresh")}
          </SxButton>
          {!live ? (
            <SxButton variant="secondary" size="sm" icon={SparklesIcon} onClick={onNew} aiId={`${AI}.new`}>
              {t("sx.agent.newJob")}
            </SxButton>
          ) : null}
        </div>
      </section>

      <section className="sx-ag-card sx-ag-flowcard" aria-label={t("sx.agent.flow.title")}>
        <AgentPipeline job={job} live={live} />
      </section>

      {known === "partial_failed" ? (
        <SxNote
          tone="warn"
          title={t("sx.agent.partial.title", { created: fall.created, requested: fall.requested, short: Math.max(0, fall.requested - fall.created) })}
          action={
            <span className="sx-ag-note-acts">
              <SxButton size="sm" variant="secondary" icon={ListChecksIcon} onClick={() => document.getElementById("sx-ag-drafts")?.scrollIntoView({ behavior: "smooth", block: "start" })} aiId={`${AI}.partial.review`}>
                {t("sx.agent.partial.review")}
              </SxButton>
              <SxButton size="sm" variant="secondary" icon={SparklesIcon} onClick={onAnother} aiId={`${AI}.partial.another`}>
                {t("sx.agent.partial.another")}
              </SxButton>
            </span>
          }
        >
          {t("sx.agent.partial.text")}
          {job.error?.message || job.error?.code ? (
            <span className="sx-ag-errline">
              {job.error.code ? <span className="sx-code">{job.error.code}</span> : null} {job.error.message}
            </span>
          ) : null}
        </SxNote>
      ) : null}
      {known === "failed" ? (
        <SxNote
          tone="error"
          title={t("sx.agent.failed.title")}
          action={
            <SxButton size="sm" variant="secondary" icon={RefreshCwIcon} onClick={onRetry} aiId={`${AI}.retry`}>
              {t("sx.agent.failed.retry")}
            </SxButton>
          }
        >
          {job.error?.message || t("sx.agent.failed.text")}
          <span className="sx-ag-errline">
            {job.error?.code ? <span className="sx-code">{job.error.code}</span> : null}
            {job.error?.reason ? <span className="sx-code">{job.error.reason}</span> : null}
            <span>{t("sx.agent.failed.keep", { id: job.id })}</span>
          </span>
        </SxNote>
      ) : null}
      {known === "cancelled" ? <SxNote tone="info" title={t("sx.agent.cancelled.title")}>{t("sx.agent.cancelled.text")}</SxNote> : null}

      <SxNote tone="info" title={t("sx.agent.human.title")} icon={BotIcon}>
        {t("sx.agent.human.text")}
        {job.autoPublished ? <span className="sx-ag-errline">{t("sx.agent.human.autoPublished")}</span> : null}
      </SxNote>

      {job.quality || draftsTotal ? (
        <section className="sx-ag-card" aria-labelledby="sx-ag-q">
          <h3 id="sx-ag-q" className="sx-ag-h3">
            {glyph(ShieldCheckIcon, { size: 16 })}
            {t("sx.agent.quality.title")}
          </h3>
          <div className="sx-ag-qs">
            <QualityTile label={t("sx.agent.quality.validated")} n={job.quality?.validated ?? null} of={qOf} icon={ListChecksIcon} t={t} />
            <QualityTile label={t("sx.agent.quality.language")} n={job.quality?.language ?? null} of={qOf} icon={GlobeIcon} t={t} />
            <QualityTile label={t("sx.agent.quality.sources")} n={job.quality?.sources ?? null} of={qOf} icon={ShieldCheckIcon} t={t} />
            <QualityTile label={t("sx.agent.quality.compared")} n={job.quality?.comparisons ?? null} of={null} icon={ScaleIcon} t={t} />
          </div>
        </section>
      ) : null}

      <section className="sx-ag-card" id="sx-ag-drafts" aria-labelledby="sx-ag-d">
        <h3 id="sx-ag-d" className="sx-ag-h3">
          {glyph(LayersIcon, { size: 16 })}
          {t("sx.agent.drafts.title")}
          <span className="sx-ag-count sx-num">{t("sx.agent.drafts.count", { n: job.drafts.length, of: job.targetDrafts })}</span>
        </h3>
        {job.drafts.length ? (
          <ul className="sx-ag-drafts">
            {job.drafts.map((d, i) => (
              <DraftCard key={d.objectId || `${d.title}-${i}`} d={d} i={i} t={t} labels={labels} />
            ))}
          </ul>
        ) : (
          <p className="sx-ag-empty">{live ? t("sx.agent.drafts.waiting") : t("sx.agent.drafts.none")}</p>
        )}
      </section>

      <section className="sx-ag-card" aria-labelledby="sx-ag-s">
        <h3 id="sx-ag-s" className="sx-ag-h3">
          {glyph(GlobeIcon, { size: 16 })}
          {t("sx.agent.sources.title")}
          {job.sources.length ? <span className="sx-ag-count sx-num">{job.sources.length}</span> : null}
        </h3>
        {job.sources.length ? (
          <ul className="sx-ag-srcs">
            {job.sources.map((s, k) => (
              <SourceRow key={`${s.url}-${k}`} s={s} t={t} labels={labels} />
            ))}
          </ul>
        ) : (
          <p className="sx-ag-empty">{live ? t("sx.agent.sources.waiting") : t("sx.agent.sources.none")}</p>
        )}
      </section>

      <details className="sx-ag-card sx-ag-acts">
        <summary>
          {glyph(ActivityIcon, { size: 16 })}
          <span>{t("sx.agent.activity.title")}</span>
          <span className="sx-ag-count sx-num">{job.tools.length}</span>
          {glyph(ChevronDownIcon, { size: 16, className: "sx-ag-acts__chev" })}
        </summary>
        {job.tools.length ? (
          <ol className="sx-ag-tools">
            {job.tools.map((x, k) => (
              <li key={k} data-ok={x.ok === false ? "no" : x.ok === true ? "yes" : undefined}>
                <span className="sx-ag-tools__dot" aria-hidden="true" />
                <span className="sx-ag-tools__name">{KNOWN_TOOLS.has(x.tool) ? t(`sx.agent.tool.${x.tool}`) : x.tool}</span>
                {x.status ? <span className="sx-ag-tag">{x.status}</span> : null}
                {x.durationMs !== null ? <span className="sx-ag-tools__ms sx-num">{x.durationMs >= 1000 ? `${(x.durationMs / 1000).toFixed(1)} s` : `${Math.round(x.durationMs)} ms`}</span> : null}
                {x.at ? <time className="sx-ag-tools__at">{labels.dateTime(x.at)}</time> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="sx-ag-empty">{t("sx.agent.activity.none")}</p>
        )}
      </details>
    </div>
  );
}
