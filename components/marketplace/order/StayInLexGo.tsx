"use client";

import "./retain.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { SxPanel } from "@/components/admin/studio/sx/layout/Panel";
import { SxLinkButton } from "@/components/admin/studio/sx/Button";
import type { MarketPhase } from "@/lib/services/marketplace";
import type { RuntimeConfig } from "@/lib/services/marketRuntime";
import { GuaranteeList } from "../runtime/Guarantees";
import { guaranteesOf } from "../runtime/facts";
import { LifeBuoyIcon, LockIcon, MessageSquareTextIcon, ShieldCheckIcon, glyph } from "./icons";

export const RETAIN_PHASES: ReadonlySet<MarketPhase> = new Set<MarketPhase>(["paid", "in_progress", "review"]);

const REASONS = [
  { key: "pay", icon: LockIcon },
  { key: "talk", icon: MessageSquareTextIcon },
  { key: "help", icon: LifeBuoyIcon },
] as const;

export default function StayInLexGo({ phase, runtime, aiBase }: { phase: MarketPhase; runtime: RuntimeConfig | null; aiBase: string }): ReactElement | null {
  const t = useTranslations("marketplace.orderDetail.retain");
  const td = useTranslations("marketplace.detail");
  if (!RETAIN_PHASES.has(phase)) return null;
  const guarantees = guaranteesOf(runtime);
  return (
    <SxPanel title={t("title")} lead={t("lead")} aiId={`${aiBase}.retain`} className="mret">
      {guarantees.length ? (
        <div className="mret__g">
          <h3 className="mret__h">
            {glyph(ShieldCheckIcon, { size: 16 })}
            {t("guarantees")}
          </h3>
          <GuaranteeList items={guarantees} tone="side" aiId={`${aiBase}.retain.guarantees`} />
        </div>
      ) : null}
      <ul className="mret__list" data-ai-id={`${aiBase}.retain.reasons`} data-ai-type="list" aria-label={t("title")}>
        {REASONS.map((r) => (
          <li key={r.key} className="mret__item">
            <span className="mret__ico" aria-hidden="true">
              {glyph(r.icon, { size: 16 })}
            </span>
            <span className="mret__txt">
              <b>{t(`${r.key}.title`)}</b>
              <small>{r.key === "talk" ? td("safe3") : t(`${r.key}.text`)}</small>
            </span>
          </li>
        ))}
      </ul>
      <div className="mret__foot">
        <SxLinkButton variant="ghost" size="sm" icon={ShieldCheckIcon} href="/portal/client/warranty" aiId={`${aiBase}.retain.warranty`}>
          {t("more")}
        </SxLinkButton>
      </div>
    </SxPanel>
  );
}
