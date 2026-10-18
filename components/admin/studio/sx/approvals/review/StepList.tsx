"use client";

import "../../sx-core.css";
import "../../editor/sx-editor-panels.css";
import "./sx-review.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import type { StudioDetail } from "@/lib/services/studio";
import { useStudioLabels } from "../../useStudioLabels";
import { BadgeCheckIcon, glyph } from "../../icons";
import { roleName, stepName, stepTone } from "../../editor/model";
import { STEP_TONE_ICON, StepMeta } from "../../editor/drawer/StepsTab";

export type StepListProps = { detail: StudioDetail; code: string; onChanged: () => void };

export function StepList({ detail, code, onChanged }: StepListProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const steps = detail.steps;
  if (!steps.length) {
    return (
      <div className="sx-ed-none sx-rv-none">
        {glyph(BadgeCheckIcon, { size: 24 })}
        <p>{t("sx.editor.steps.pending")}</p>
      </div>
    );
  }
  return (
    <div className="sx-ed-steps sx-rv-steps">
      <ol className="sx-ed-steps__list">
        {steps.map((s, i) => {
          const tone = stepTone(s.status);
          const n = s.order || i + 1;
          const stepLabel = t("sx.editor.steps.step", { n });
          const title = stepName(labels, s) || stepLabel;
          const role = s.role && !s.approvers.length ? roleName(labels, s.role) : "";
          const sub = [title !== stepLabel ? stepLabel : "", role && role !== title ? role : ""].filter(Boolean).join(" · ");
          const by = [s.decidedBy, s.decidedAt ? labels.dateTime(s.decidedAt) : ""].filter(Boolean).join(" · ");
          return (
            <li key={s.id || i} className="sx-ed-steps__item" data-tone={tone}>
              <span className="sx-ed-steps__dot" aria-hidden="true">
                {glyph(STEP_TONE_ICON[tone], { size: 14 })}
              </span>
              <div className="sx-ed-steps__body">
                <div className="sx-ed-steps__top">
                  <span className="sx-ed-steps__title">{title}</span>
                  <span className="sx-ed-steps__state" data-tone={tone}>
                    {labels.stepDecision(s.status)}
                  </span>
                </div>
                {sub ? <p className="sx-ed-steps__sub">{sub}</p> : null}
                {by ? <p className="sx-ed-steps__by">{by}</p> : null}
                {s.comment ? <p className="sx-ed-steps__comment">{s.comment}</p> : null}
                <StepMeta step={s} code={code} onChanged={onChanged} />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
