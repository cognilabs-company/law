"use client";

import { useTranslations } from "next-intl";
import { openInstructor } from "@/lib/guide/panel";
import RobotAvatar from "./RobotAvatar";

export default function InstructorButton({ className, labelClassName, iconOnly = false, size = 20 }: { className: string; labelClassName?: string; iconOnly?: boolean; size?: number }) {
  const t = useTranslations("portal.aiAssistant");
  return (
    <button type="button" className={className} onClick={() => openInstructor()} aria-label={t("open")} title={t("open")} data-ai-target="button:open-instructor">
      <RobotAvatar size={size} mood="idle" />
      {iconOnly ? null : <span className={labelClassName}>{t("short")}</span>}
    </button>
  );
}
