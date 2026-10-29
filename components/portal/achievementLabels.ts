"use client";

import { useLocale, useTranslations } from "next-intl";
import { labelIn } from "@/lib/backendLabel";
import type { AchievementConfig, AchievementStatus, AiState, ConfigOption } from "@/lib/services/achievements";

// Human names for an achievement's stage, result and status. The stage and
// result labels are the backend's (config label_i18n, contract 2026-10-29
// §2). The config is advocate-only, so the public profile and the call
// center fall back to our names of the four stages and two results until
// the backend sends labels with those records (follow-up question 2). A
// value with no label anywhere is left out, never shown as a code.
export function useAchievementLabels(config?: AchievementConfig | null) {
  const t = useTranslations("portal.achievements");
  const locale = useLocale();
  const name = (kind: "stage" | "result", value: string, opts?: readonly ConfigOption[]) => {
    const given = labelIn(opts?.find((x) => x.value === value), locale);
    if (given) return given;
    return value && t.has(`${kind}.${value}`) ? t(`${kind}.${value}`) : "";
  };
  return {
    stage: (v: string) => name("stage", v, config?.stages),
    result: (v: string) => name("result", v, config?.results),
    status: (s: AchievementStatus) => t(`status.${s}`),
    ai: (a: AiState) => (a ? t(`ai.${a}`) : ""),
  };
}
