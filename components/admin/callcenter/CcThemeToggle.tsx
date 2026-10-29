"use client";

import { useTranslations } from "next-intl";
import { IconMoon, IconSun } from "@/components/icons";
import { setCcTheme, useCcTheme } from "@/lib/callcenter/ccTheme";

export default function CcThemeToggle() {
  const t = useTranslations("admin.cc");
  const theme = useCcTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="cctop__icon"
      aria-label={t(`theme.${next}`)}
      title={t(`theme.${next}`)}
      onClick={() => setCcTheme(next)}
      data-ai-id="call_center.theme"
    >
      {theme === "dark" ? <IconSun aria-hidden="true" /> : <IconMoon aria-hidden="true" />}
    </button>
  );
}
