"use client";

import "./sx-home.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { enterStyle } from "../hooks";
import type { GroupStepState } from "./groupModel";

export type StepMapStep = { code: string; step: number; name: string; state: GroupStepState };

export function useStepStateText(): (state: GroupStepState) => string {
  const t = useTranslations("studio");
  return (state) => (state === "done" ? t("sx.guide.done") : state === "next" ? t("sx.gpage.state.next") : state === "blocked" ? t("sx.hm.state.blocked") : t("sx.guide.notDone"));
}

export function StepMap({ steps, label, className }: { steps: readonly StepMapStep[]; label: string; className?: string }): ReactElement | null {
  const stateText = useStepStateText();
  if (!steps.length) return null;
  return (
    <ol className={className ? `sx-smap ${className}` : "sx-smap"} aria-label={label}>
      {steps.map((s, i) => {
        const text = `${s.step}. ${s.name} — ${stateText(s.state)}`;
        return (
          <li key={s.code} className="sx-smap__seg" data-state={s.state} title={text} style={enterStyle(Math.min(i, 12))}>
            <span className="sx-vh">{text}</span>
          </li>
        );
      })}
    </ol>
  );
}
