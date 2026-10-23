"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ServiceRule } from "@/lib/services/marketRuntime";
import { IconChevronDown } from "@/components/icons";
import RuleBody from "@/components/services/rules/RuleBody";
import { FactHeading } from "./ChecklistPreview";
import type { HeadingLevel, RuleSide } from "./facts";
import "./runtime.css";

// `side` names whose rules these are: the client reads "rules for you", the
// lawyer "executor rules" — the lists themselves come from rulesOf(c, side).
// `during`: the order is already running, so the client's lead speaks of
// the work, not of buying.
export function RuleList({ rules, side, idBase, level = 3, limit = 3, tone = "detail", showScope = false, during = false }: { rules: readonly ServiceRule[]; side: RuleSide; idBase: string; level?: HeadingLevel; limit?: number; tone?: "detail" | "assist"; showScope?: boolean; during?: boolean }) {
  const t = useTranslations("marketplace.runtime");
  const [open, setOpen] = useState(false);
  if (!rules.length) return null;
  const cap = Math.max(1, limit);
  const extra = rules.length - cap;
  const shown = open || extra <= 0 ? rules : rules.slice(0, cap);
  const listId = `${idBase}-list`;
  return (
    <div className={`mkrt-rl mkrt-rl--${tone}`} data-side={side}>
      <FactHeading level={level} id={`${idBase}-title`}>
        {t(side === "client" ? "rulesTitleClient" : "rulesTitleExecutor")}
      </FactHeading>
      {tone === "detail" ? <p className="mkrt-lead">{t(side === "client" ? (during ? "rulesLead" : "rulesLeadClient") : "rulesLeadExecutor")}</p> : null}
      <ul className="mkrt-rl__list" id={listId} aria-labelledby={`${idBase}-title`}>
        {shown.map((r, i) => (
          <li key={r.id || `${r.title}-${i}`}>
            <details className="mkrt-rl__item">
              <summary>
                <span className="mkrt-rl__t">{r.title || t("ruleUntitled")}</span>
                {r.sellerOwn ? <em className="mkrt-tag mkrt-tag--own">{t("sellerOwn")}</em> : showScope && r.inline ? <em className="mkrt-tag">{t("serviceOnly")}</em> : null}
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
