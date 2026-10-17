"use client";

import "./rules.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { IconRefresh, IconShieldCheck } from "@/components/icons";
import type { RulesGateSnapshot } from "@/lib/services/rulesGate";

export default function RulesBanner({ gate, aiBase, onOpen, onRetry }: { gate: RulesGateSnapshot; aiBase: string; onOpen: () => void; onRetry: () => void }): ReactElement | null {
  const t = useTranslations("sellerServices");
  if (gate.closed) {
    return (
      <div className="svm__notice svm__notice--warn svr-banner" role="status" data-ai-id={`${aiBase}.rules-banner`} data-ai-type="section" data-ai-label={t("rules.bannerTitle")}>
        <span className="svm__nic" aria-hidden="true">
          <IconShieldCheck />
        </span>
        <div className="svm__nt">
          <b>{t("rules.bannerTitle")}</b>
          <p>{t("rules.bannerText", { n: gate.missing.length })}</p>
        </div>
        <button type="button" className="btn btn--line btn--sm svr-banner__act" onClick={onOpen} data-ai-id={`${aiBase}.rules-banner.open`}>
          {t("rules.bannerAction")}
        </button>
      </div>
    );
  }
  if (gate.status === "error") {
    return (
      <div className="svm__notice svr-banner svr-banner--error" role="status" data-ai-id={`${aiBase}.rules-banner`} data-ai-type="section" data-ai-label={t("rules.bannerError")}>
        <span className="svm__nic" aria-hidden="true">
          <IconShieldCheck />
        </span>
        <div className="svm__nt">
          <p>{t("rules.bannerError")}</p>
        </div>
        <button type="button" className="btn btn--line btn--sm svr-banner__act" onClick={onRetry}>
          <IconRefresh aria-hidden="true" />
          {t("retry")}
        </button>
      </div>
    );
  }
  return null;
}
