"use client";

import { useLocale, useTranslations } from "next-intl";
import type { AchievementConfig, AchievementStatus, AiState, ConfigOption } from "@/lib/services/achievements";

// Human names for an achievement's stage, result and status — shared by the
// advocate's form, the public profile and the operator's review. The
// backend's config labels win (they are the source of the form); our own
// strings cover screens without the config (public, call center).
export function useAchievementLabels(config?: AchievementConfig | null) {
  const t = useTranslations("portal.achievements");
  const locale = useLocale();
  const lang = locale === "uz" ? "uz_latn" : locale;
  const name = (kind: "stage" | "result", value: string, opts?: readonly ConfigOption[]) => {
    const o = opts?.find((x) => x.value === value);
    const own = value && t.has(`${kind}.${value}`) ? t(`${kind}.${value}`) : "";
    return o?.i18n[lang] || o?.i18n[locale] || (locale === "uz" ? o?.label : "") || own || o?.label || t(`${kind}Other`);
  };
  return {
    stage: (v: string) => name("stage", v, config?.stages),
    result: (v: string) => name("result", v, config?.results),
    status: (s: AchievementStatus) => t(`status.${s}`),
    ai: (a: AiState) => (a ? t(`ai.${a}`) : ""),
  };
}
