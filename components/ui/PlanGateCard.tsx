"use client";

import "./planGate.css";
import type { ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconArrowRight, IconCrown } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { dateOnly } from "@/lib/date";
import type { PlanGate } from "@/lib/planGate";

// What a 402 plan refusal means and the way out: which limit was reached
// (used / limit, when it renews) or what the plan lacks, and a button to
// the plan page. Shown where the action was tried, not as a toast.
export default function PlanGateCard({ gate, onClose }: { gate: PlanGate; onClose?: () => void }): ReactElement {
  const t = useTranslations("common.planGate");
  const locale = useLocale();
  const role = useAuth().session?.role ?? "client";
  const href = role === "client" ? "/portal/client/subscription" : `/portal/${role}/subscription`;
  const feature = gate.featureKey && t.has(`feature.${gate.featureKey}`) ? t(`feature.${gate.featureKey}`) : "";
  const unit = gate.unit && t.has(`unit.${gate.unit}`) ? t(`unit.${gate.unit}`, { n: gate.limit ?? 0 }) : String(gate.limit ?? "");
  const full = gate.limit !== null && gate.used !== null && gate.limit > 0;
  return (
    <section className="pgate" role="alert" data-code={gate.code}>
      <span className="pgate__ic" aria-hidden="true">
        <IconCrown />
      </span>
      <div className="pgate__body">
        <b>{t(`title.${gate.code}`)}</b>
        <p>{feature ? t(`text.${gate.code}`, { feature }) : t(`textAny.${gate.code}`)}</p>
        {full ? (
          <div className="pgate__meter">
            <span className="pgate__bar" aria-hidden="true">
              <i style={{ width: `${Math.min(100, Math.round(((gate.used ?? 0) / (gate.limit ?? 1)) * 100))}%` }} />
            </span>
            <small>
              {t("used", { used: gate.used ?? 0, limit: unit })}
              {gate.resetsAt ? ` · ${t("resets", { date: dateOnly(gate.resetsAt, locale) })}` : ""}
            </small>
          </div>
        ) : null}
        <div className="pgate__acts">
          <Link href={href} className="btn btn--grad btn--sm">
            {t("choose")}
            <IconArrowRight aria-hidden="true" />
          </Link>
          {onClose ? (
            <button type="button" className="btn btn--line btn--sm" onClick={onClose}>
              {t("later")}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
