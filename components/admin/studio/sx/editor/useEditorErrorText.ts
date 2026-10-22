"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { studioErrorOf, type StudioErrorKind } from "@/lib/services/studio";
import { codeLike, isEnglishLooking } from "../labels";
import { duplicateNameOf } from "../schema/ruleDuplicates";

const KIND_KEY: Partial<Record<StudioErrorKind, string>> = {
  forbidden: "sx.editor.err.forbidden",
  not_found: "sx.editor.err.notFound",
  network: "sx.editor.err.network",
  conflict: "sx.editor.err.conflict",
  edit_conflict: "sx.editor.err.conflict",
  validation: "sx.editor.err.validation",
  payload_invalid: "sx.editor.err.validation",
  submit_invalid: "sx.editor.err.validation",
  publish_requires_approved: "sx.editor.err.publishRequiresApproved",
};

const CODE_KEY: Readonly<Record<string, string>> = {
  studio_edit_conflict: "sx.editor.err.conflict",
  studio_version_locked: "sx.editor.err.versionLocked",
  studio_object_archived: "sx.editor.err.objectArchived",
  studio_submit_invalid: "sx.editor.err.submitInvalid",
  studio_publish_requires_approved: "sx.editor.err.publishRequiresApproved",
  category_cycle: "sx.editor.err.categoryCycle",
  rule_version_duplicate: "sx.editor.err.ruleVersionDuplicate",
  reference_not_found: "sx.editor.err.referenceNotFound",
};

const JARGON = /[`{}<>\[\]=]|_|\b(runtime|payload|schema|null|undefined|none|true|false|json|api|http|https|uuid|id|traceback|exception|error|object|constructor|studio_\w+)\b/i;
const CYRILLIC = /[Ѐ-ӿ]/;
const EN_STOP = /\b(the|a|an|is|are|was|were|be|been|not|no|for|of|to|in|on|with|by|and|or|failed|fail|invalid|required|error|found|forbidden|denied|missing|allowed|must|should|cannot|unable|already|exists|does|please|server|request|unknown)\b/i;
const UZ_APOSTROPHE = /[og]['ʻʼ‘’]/i;
const UZ_SUFFIX = /^[a-z'ʻʼ‘’]{2,}(ga|da|dan|ni|ning|lar|madi|moqda|adi|ydi|di|mas|ing|ish|siz|mi|lik|ligi|gan|kan)$/i;
const LETTERS = /[a-z]/i;

export function plainUzMessage(message: string): string {
  const text = String(message ?? "").trim();
  if (!text || text.length > 240 || !LETTERS.test(text)) return "";
  if (CYRILLIC.test(text) || JARGON.test(text)) return "";
  if (text.split(/\s+/).some((w) => codeLike(w.replace(/[.,;:!?«»"'()]+$/g, "")))) return "";
  if (isEnglishLooking(text) || EN_STOP.test(text)) return "";
  if (!UZ_APOSTROPHE.test(text) && !text.split(/\s+/).some((w) => UZ_SUFFIX.test(w.replace(/[.,;:!?«»"()]+/g, "")))) return "";
  return text;
}

export function editorErrorKey(e: unknown): string {
  if (duplicateNameOf(e)) return "sx.editor.err.ruleTitleDuplicate";
  const se = studioErrorOf(e);
  if (se.kind !== "network" && Object.prototype.hasOwnProperty.call(CODE_KEY, se.code)) return CODE_KEY[se.code];
  return KIND_KEY[se.kind] ?? "sx.editor.err.other";
}

export function useEditorErrorText(): (e: unknown) => { title: string; text: string } {
  const t = useTranslations("studio");
  const locale = useLocale();
  return useCallback(
    (e: unknown) => {
      const se = studioErrorOf(e);
      const coded = Object.prototype.hasOwnProperty.call(CODE_KEY, se.code);
      const own = locale === "uz" && !coded && !duplicateNameOf(e) ? plainUzMessage(se.message) : "";
      return { title: t("sx.editor.alert.actionTitle"), text: own || t(editorErrorKey(e)) };
    },
    [t, locale],
  );
}
