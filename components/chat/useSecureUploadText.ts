"use client";

import { useTranslations } from "next-intl";
import type { SecureUploadProblem } from "@/lib/secureUpload";

const size = (b: number) => (b >= 1024 ** 3 ? `${+(b / 1024 ** 3).toFixed(1)} GB` : `${Math.round(b / 1024 ** 2)} MB`);

// A refused chat upload (lib/secureUpload) in the reader's words.
export function useSecureUploadText() {
  const t = useTranslations("secureChat");
  return (p: SecureUploadProblem): string =>
    p.kind === "type" ? t("attachType") : p.kind === "size" ? t("attachTooBig", { mb: p.mb }) : p.kind === "quota" ? t("attachQuota", { used: size(p.usedBytes), quota: size(p.quotaBytes) }) : t("attachBroken");
}
