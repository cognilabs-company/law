"use client";

import { useId } from "react";
import type { RuntimeConfig } from "@/lib/services/marketRuntime";
import { ASSIST_SECTIONS, DETAIL_SECTIONS, checklistOf, factSections, guaranteesOf, rulesOf, type FactSection } from "./facts";
import { DurationChip } from "./DurationChip";
import { GuaranteeList } from "./Guarantees";
import { ChecklistPreview } from "./ChecklistPreview";
import { UsageSteps } from "./UsageSteps";
import { TemplateNote } from "./TemplateNote";
import { FactorList } from "./FactorList";
import { RequirementsNote } from "./RequirementsNote";
import { RuleList } from "./RuleList";
import "./runtime.css";

export type ServiceFactsTone = "detail" | "assist";

export function ServiceFacts({
  config,
  tone,
  title,
  basePrice,
  currency,
  aiId,
  sections,
  showScope = false,
}: {
  config: RuntimeConfig;
  tone: ServiceFactsTone;
  title?: string;
  basePrice: number;
  currency: string;
  aiId?: string;
  sections?: readonly FactSection[];
  showScope?: boolean;
}) {
  const uid = useId();
  const list = factSections(config, sections ?? (tone === "detail" ? DETAIL_SECTIONS : ASSIST_SECTIONS));
  if (!list.length) return null;
  const has = (s: FactSection) => list.includes(s);
  const level = tone === "detail" ? (title ? 4 : 3) : 5;
  const titleId = `${uid}-t`;
  const durOnly = list.length === 1 && list[0] === "duration";
  return (
    <section
      className={`mkrt-facts mkrt-facts--${tone}${durOnly ? " mkrt-facts--duronly" : ""}`}
      data-ai-id={aiId}
      data-ai-type={aiId ? "section" : undefined}
      data-ai-label={title || undefined}
      aria-labelledby={title ? titleId : undefined}
    >
      {title ? (
        <h3 className="mkrt-facts__t" id={titleId}>
          {title}
        </h3>
      ) : null}
      {has("duration") ? (
        <div className="mkrt-facts__dur">
          <DurationChip duration={config.duration} tone={tone === "detail" ? "side" : "assist"} start />
        </div>
      ) : null}
      {has("steps") ? <UsageSteps steps={config.usageSteps} idBase={`${uid}-st`} level={level} /> : null}
      {has("guarantees") ? <GuaranteeList items={guaranteesOf(config)} tone="assist" showScope={showScope} /> : null}
      {has("checklist") ? <ChecklistPreview items={checklistOf(config)} tone={tone} idBase={`${uid}-ck`} level={level} /> : null}
      {has("rules") ? <RuleList rules={rulesOf(config)} tone={tone} showScope={showScope} idBase={`${uid}-rl`} level={level} /> : null}
      {has("template") ? <TemplateNote template={config.template} /> : null}
      {has("factors") ? <FactorList factors={config.pricing.factors} basePrice={basePrice} currency={currency} level={level} /> : null}
      {has("requirements") ? <RequirementsNote requirements={config.minimumRequirements} level={level} /> : null}
    </section>
  );
}

export function ServiceFactsSkeleton({ label }: { label: string }) {
  return (
    <div className="mkrt-facts mkrt-facts--ghost" aria-busy="true">
      <span className="sr-only" role="status">
        {label}
      </span>
      <i aria-hidden="true" />
      <i aria-hidden="true" />
    </div>
  );
}
