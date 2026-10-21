"use client";

import { useTranslations } from "next-intl";
import type { EligibilityRuleResult } from "@/lib/services/sellerPackages";
import { IconAlert, IconClose } from "@/components/icons";
import "./tierRules.css";

export default function TierRules({
  rules,
  reasons,
  message,
  live,
  note = "",
  onClose,
  aiId,
}: {
  rules: readonly EligibilityRuleResult[];
  reasons: readonly string[];
  message: string;
  live: boolean;
  note?: string;
  onClose?: () => void;
  aiId?: string;
}) {
  const t = useTranslations("sellerPackages.tier");
  if (!rules.length && !reasons.length && !message) return null;
  return (
    <div className="spk__why spktr" role={live ? "alert" : "note"} data-ai-id={aiId} data-ai-type={aiId ? "section" : undefined} data-ai-label={aiId ? t("title") : undefined}>
      <div className="spktr__h">
        <b>
          <IconAlert aria-hidden="true" />
          {t("title")}
        </b>
        {onClose ? (
          <button type="button" className="spktr__x" onClick={onClose} aria-label={t("dismiss")} title={t("dismiss")} data-ai-id={aiId ? `${aiId}.dismiss` : undefined} data-ai-type={aiId ? "button" : undefined}>
            <IconClose aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {message ? <p className="spktr__msg">{message}</p> : null}
      {rules.length ? (
        <ul className="spktr__rules">
          {rules.map((r, i) => (
            <li key={r.ruleId || `${r.title}-${i}`}>
              <span className="spktr__rt">{r.title || t("ruleUntitled")}</span>
              {r.reasons.length ? (
                <ul className="spktr__rs">
                  {r.reasons.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              ) : (
                <small>{t("noReason")}</small>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {reasons.length ? (
        <ul className="spktr__rs">
          {reasons.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : null}
      {note ? <small>{note}</small> : null}
      <small>{t("hint")}</small>
    </div>
  );
}
