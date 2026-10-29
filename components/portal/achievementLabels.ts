"use client";

import { useLocale, useTranslations } from "next-intl";
import { labelIn, type Labelled } from "@/lib/backendLabel";
import type { AchievementConfig, AchievementStatus, AiState, ConfigOption } from "@/lib/services/achievements";

// Human names for an achievement's stage, result and status: the record's
// own label when the backend sends it, else the config's (contract
// 2026-10-29 §2), else — where no config exists (public profile, call
// center) — our names of the four stages and two results, until the backend
// ships record labels (follow-up 2). A value with no label anywhere is left
// out, never shown as a code.
export function useAchievementLabels(config?: AchievementConfig | null) {
  const t = useTranslations("portal.achievements");
  const locale = useLocale();
  const name = (kind: "stage" | "result", value: string, opts?: readonly ConfigOption[], own?: Labelled | null) => {
    const given = labelIn(own, locale) || labelIn(opts?.find((x) => x.value === value), locale);
    if (given) return given;
    return value && t.has(`${kind}.${value}`) ? t(`${kind}.${value}`) : "";
  };
  return {
    stage: (v: string, own?: Labelled | null) => name("stage", v, config?.stages, own),
    result: (v: string, own?: Labelled | null) => name("result", v, config?.results, own),
    status: (s: AchievementStatus) => t(`status.${s}`),
    ai: (a: AiState) => (a ? t(`ai.${a}`) : ""),
  };
}
