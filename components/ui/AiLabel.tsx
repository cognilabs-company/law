"use client";

import "./aiLabel.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

// Marks content an AI wrote (a chat answer, a drafted document, a summary or
// analysis) as AI-generated and not legal advice, in the page's language.
// compact = one quiet line under a chat bubble; the default is a small band
// above or below a result panel.
export default function AiLabel({ compact = false, className = "" }: { compact?: boolean; className?: string }): ReactElement {
  const t = useTranslations("aiLabel");
  return (
    <p className={`ailbl${compact ? " ailbl--compact" : ""}${className ? ` ${className}` : ""}`} role="note" data-ai-generated="">
      <span className="ailbl__b">
        <Sparkles aria-hidden />
        {t("badge")}
      </span>
      <span className="ailbl__t">{t("text")}</span>
    </p>
  );
}
