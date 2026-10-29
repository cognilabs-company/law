"use client";

import { useLocale, useTranslations } from "next-intl";
import { labelIn, type Labelled } from "@/lib/backendLabel";
import type { AchievementConfig, AchievementStatus, AiState, ConfigOption } from "@/lib/services/achievements";

// Human names for an achievement's stage, result and status. Stage and
// result come only from the backend (final contract 2026-10-29 §3–4, §11.4):
// the record's own *_label_i18n, else the config's option label. A value
// with no label is left out, never shown as a code.
export function useAchievementLabels(config?: AchievementConfig | null) {
  const t = useTranslations("portal.achievements");
  const locale = useLocale();
  const name = (value: string, opts?: readonly ConfigOption[], own?: Labelled | null) => (value ? labelIn(own, locale) || labelIn(opts?.find((x) => x.value === value), locale) : "");
  return {
    stage: (v: string, own?: Labelled | null) => name(v, config?.stages, own),
    result: (v: string, own?: Labelled | null) => name(v, config?.results, own),
    status: (s: AchievementStatus) => t(`status.${s}`),
    ai: (a: AiState) => (a ? t(`ai.${a}`) : ""),
  };
}
