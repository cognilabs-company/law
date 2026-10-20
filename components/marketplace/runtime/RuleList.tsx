"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ServiceRule } from "@/lib/services/marketRuntime";
import { IconChevronDown } from "@/components/icons";
import RuleBody from "@/components/services/rules/RuleBody";
import { FactHeading } from "./ChecklistPreview";
import type { HeadingLevel } from "./facts";
import "./runtime.css";

export function RuleList({ rules, idBase, level = 3, limit = 3, tone = "detail", showScope = false }: { rules: readonly ServiceRule[]; idBase: string; level?: HeadingLevel; limit?: number; tone?: "detail" | "assist"; showScope?: boolean }) {
  const t = useTranslations("marketplace.runtime");
  const [open, setOpen] = useState(false);
  if (!rules.length) return null;
  const cap = Math.max(1, limit);
  const extra = rules.length - cap;
  const shown = open || extra <= 0 ? rules : rules.slice(0, cap);
  const listId = `${idBase}-list`;
  return (
    <div className={`mkrt-rl mkrt-rl--${tone}`}>
      <FactHeading level={level} id={`${idBase}-title`}>
        {t("rulesTitle")}
      </FactHeading>
      {tone === "detail" ? <p className="mkrt-lead">{t("rulesLead")}</p> : null}
      <ul className="mkrt-rl__list" id={listId} aria-labelledby={`${idBase}-title`}>
        {shown.map((r, i) => (
          <li key={r.id || `${r.title}-${i}`}>
            <details className="mkrt-rl__item">
              <summary>
                <span className="mkrt-rl__t">{r.title || t("ruleUntitled")}</span>
                {showScope && r.inline ? <em className="mkrt-tag">{t("serviceOnly")}</em> : null}
                <IconChevronDown aria-hidden="true" className="mkrt-rl__chev" />
              </summary>
              <div className="mkrt-rl__body">
                <RuleBody html={r.body} />
              </div>
            </details>
          </li>
        ))}
      </ul>
      {extra > 0 ? (
        <button type="button" className="mkrt-more" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((v) => !v)}>
          {open ? t("checklistLess") : t("rulesMore", { n: extra })}
          <IconChevronDown aria-hidden="true" className={open ? "is-up" : undefined} />
        </button>
      ) : null}
    </div>
  );
}
