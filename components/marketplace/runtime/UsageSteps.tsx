"use client";

import { useTranslations } from "next-intl";
import type { UsageStep } from "@/lib/services/marketRuntime";
import { FactHeading } from "./ChecklistPreview";
import type { HeadingLevel } from "./facts";
import "./runtime.css";

// How the service is used, step by step (Studio K02 usage_steps), in the
// checklist's numbered style.
export function UsageSteps({ steps, idBase, level = 3 }: { steps: readonly UsageStep[]; idBase: string; level?: HeadingLevel }) {
  const t = useTranslations("marketplace.runtime");
  if (!steps.length) return null;
  return (
    <div className="mkrt-ck">
      <FactHeading level={level} id={`${idBase}-title`}>
        {t("stepsTitle")}
      </FactHeading>
      <ol className="mkrt-ck__list" aria-labelledby={`${idBase}-title`}>
        {steps.map((s, i) => (
          <li key={i}>
            {s.title ? <span className="mkrt-ck__t">{s.title}</span> : null}
            {s.text ? s.title ? <small>{s.text}</small> : <span>{s.text}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
