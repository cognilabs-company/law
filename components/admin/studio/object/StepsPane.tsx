"use client";

import type { StudioStep } from "@/lib/services/studio";
import { useStudioText } from "../bits";
import { IconCheck, IconCircleX, IconHourglass, IconRefresh, IconRocket, IconShieldCheck } from "@/components/icons";

function toneOf(status: string): "ok" | "warn" | "err" | "wait" {
  if (/approv|done|complete|pass/.test(status)) return "ok";
  if (/reject|declin/.test(status)) return "err";
  if (/change|return|rework/.test(status)) return "warn";
  return "wait";
}

const GLYPH = { ok: IconCheck, warn: IconRefresh, err: IconCircleX, wait: IconHourglass };

export default function StepsPane({ steps, approvalFree, submitted }: { steps: StudioStep[]; approvalFree: boolean; submitted: boolean }) {
  const { t, role, stepStatus, when } = useStudioText();

  if (approvalFree) {
    return (
      <div className="stu-opane" data-ai-id="admin.studio.editor.steps" data-ai-type="section" data-ai-label={t("editor.side.steps")}>
        <div className="stu-opane__none">
          <IconRocket aria-hidden />
          <p>{t("editor.steps.free")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stu-opane" data-ai-id="admin.studio.editor.steps" data-ai-type="section" data-ai-label={t("editor.side.steps")}>
      {steps.length ? (
        <ol className="stu-osteps">
          {steps.map((s, i) => {
            const tone = toneOf(s.status);
            const Glyph = GLYPH[tone];
            return (
              <li key={s.id || i} className={`stu-osteps__i stu-osteps__i--${tone}`}>
                <span className="stu-osteps__dot" aria-hidden>
                  <Glyph />
                </span>
                <div className="stu-osteps__m">
                  <div className="stu-osteps__top">
                    <b>{s.title || role(s.role) || t("editor.steps.step", { n: s.order || i + 1 })}</b>
                    <span className={`stu-osteps__st stu-osteps__st--${tone}`}>{stepStatus(s.status)}</span>
                  </div>
                  <small>
                    {t("editor.steps.order", { n: s.order || i + 1 })}
                    {s.role ? ` · ${role(s.role)}` : ""}
                  </small>
                  {s.decidedBy || s.decidedAt ? <small className="stu-osteps__by">{[s.decidedBy, when(s.decidedAt)].filter(Boolean).join(" · ")}</small> : null}
                  {s.comment ? <p className="stu-osteps__c">{s.comment}</p> : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="stu-opane__none">
          <IconShieldCheck aria-hidden />
          <p>{submitted ? t("editor.steps.pending") : t("editor.steps.empty")}</p>
        </div>
      )}
    </div>
  );
}
