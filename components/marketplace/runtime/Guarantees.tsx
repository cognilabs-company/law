"use client";

import type { ComponentType, SVGProps } from "react";
import { useTranslations } from "next-intl";
import type { RuntimeGuarantee } from "@/lib/services/marketRuntime";
import { IconCircleCheck, IconClock, IconCoins, IconFileText, IconLock, IconShieldCheck, IconStar } from "@/components/icons";
import { guaranteeIcon, type GuaranteeIcon } from "./facts";
import "./runtime.css";

const ICONS: Record<GuaranteeIcon, ComponentType<SVGProps<SVGSVGElement>>> = {
  shield: IconShieldCheck,
  refund: IconCoins,
  clock: IconClock,
  check: IconCircleCheck,
  lock: IconLock,
  star: IconStar,
  doc: IconFileText,
};

function GIcon({ icon }: { icon: string }) {
  const Icon = ICONS[guaranteeIcon(icon)];
  return <Icon aria-hidden="true" />;
}

export function GuaranteeBadges({ items, max = 2 }: { items: readonly RuntimeGuarantee[]; max?: number }) {
  const t = useTranslations("marketplace.runtime");
  if (!items.length) return null;
  const shown = items.slice(0, Math.max(1, max));
  const rest = items.length - shown.length;
  return (
    <span className="mkrt-gb">
      {shown.map((g, i) => (
        <span key={g.id || `${g.title}-${i}`} className="mkrt-gb__i" title={g.description || undefined}>
          <GIcon icon={g.icon} />
          {g.title}
        </span>
      ))}
      {rest > 0 ? (
        <span className="mkrt-gb__more" title={t("guaranteesMoreLabel", { n: rest })}>
          <span aria-hidden="true">{t("guaranteesMore", { n: rest })}</span>
          <span className="sr-only">{t("guaranteesMoreLabel", { n: rest })}</span>
        </span>
      ) : null}
    </span>
  );
}

export function GuaranteeList({ items, tone, max, aiId, showScope = false }: { items: readonly RuntimeGuarantee[]; tone: "side" | "ticket" | "assist"; max?: number; aiId?: string; showScope?: boolean }) {
  const t = useTranslations("marketplace.runtime");
  if (!items.length) return null;
  const limit = max && max > 0 ? max : items.length;
  const shown = items.slice(0, limit);
  const rest = items.length - shown.length;
  return (
    <ul className={`mkrt-gl mkrt-gl--${tone}`} data-ai-id={aiId} data-ai-type={aiId ? "list" : undefined} aria-label={t("guaranteesTitle")}>
      {shown.map((g, i) => (
        <li key={g.id || `${g.title}-${i}`}>
          <GIcon icon={g.icon} />
          <span>
            <b>
              {g.title}
              {showScope && g.inline ? <em className="mkrt-tag">{t("serviceOnly")}</em> : null}
            </b>
            {g.description ? <small>{g.description}</small> : null}
          </span>
        </li>
      ))}
      {rest > 0 ? <li className="mkrt-gl__more">{t("guaranteesMoreLabel", { n: rest })}</li> : null}
    </ul>
  );
}
