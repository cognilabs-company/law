"use client";

import { useLocale, useTranslations } from "next-intl";
import type { MinimumRequirements } from "@/lib/services/marketRuntime";
import { fmtRating } from "@/lib/date";
import { IconBriefcase, IconShieldCheck, IconStar } from "@/components/icons";
import { requirementInfo, type HeadingLevel } from "./facts";
import { FactHeading } from "./ChecklistPreview";
import "./runtime.css";

export function RequirementsNote({ requirements, level = 3 }: { requirements: MinimumRequirements; level?: HeadingLevel }) {
  const t = useTranslations("marketplace.runtime");
  const locale = useLocale();
  const info = requirementInfo(requirements);
  if (!info) return null;
  return (
    <div className="mkrt-req">
      <FactHeading level={level}>{t("reqTitle")}</FactHeading>
      <p className="mkrt-lead">{t("reqLead")}</p>
      <ul className="mkrt-req__chips">
        {info.verified ? (
          <li>
            <IconShieldCheck aria-hidden="true" />
            {t("reqVerified")}
          </li>
        ) : null}
        {info.years ? (
          <li>
            <IconBriefcase aria-hidden="true" />
            {t("reqExperience", { n: info.years })}
          </li>
        ) : null}
        {info.rating ? (
          <li>
            <IconStar aria-hidden="true" />
            {t("reqRating", { r: fmtRating(info.rating, locale) })}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
