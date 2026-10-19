"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { studioErrorOf } from "@/lib/services/studio";
import { useEditorErrorText } from "../editor/useEditorErrorText";

const CODE_KEY: Readonly<Record<string, string>> = {
  journey_step_invalid: "sx.journeyRun.err.stepInvalid",
  journey_status_invalid: "sx.journeyRun.err.statusInvalid",
  journey_type_invalid: "sx.journeyRun.err.typeInvalid",
  reference_not_found: "sx.journeyRun.err.referenceNotFound",
  journey_not_found: "sx.journeyRun.err.notFound",
};

export function journeyErrorKey(e: unknown): string {
  const se = studioErrorOf(e);
  if (CODE_KEY[se.code]) return CODE_KEY[se.code];
  if (se.status === 404 && /journey/i.test(se.code)) return CODE_KEY.journey_not_found;
  return "";
}

export function useJourneyErrorText(): (e: unknown) => { title: string; text: string } {
  const t = useTranslations("studio");
  const fallback = useEditorErrorText();
  return useCallback(
    (e: unknown) => {
      const key = journeyErrorKey(e);
      if (!key) return fallback(e);
      return { title: t("sx.editor.alert.actionTitle"), text: t(key) };
    },
    [t, fallback],
  );
}
