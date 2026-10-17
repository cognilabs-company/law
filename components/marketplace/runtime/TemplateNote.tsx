"use client";

import { useTranslations } from "next-intl";
import type { RuntimeTemplate } from "@/lib/services/marketRuntime";
import { IconFileText } from "@/components/icons";
import { templateInfo } from "./facts";
import "./runtime.css";

export function TemplateNote({ template }: { template: RuntimeTemplate }) {
  const t = useTranslations("marketplace.runtime");
  const info = templateInfo(template);
  if (!info) return null;
  return (
    <p className="mkrt-note">
      <IconFileText aria-hidden="true" />
      <span>
        <b>{t("templateTitle")}</b>
        {t(`template.${info.mode}`)}
        {info.source ? ` ${t(`template.source.${info.source}`)}` : null}
      </span>
    </p>
  );
}
