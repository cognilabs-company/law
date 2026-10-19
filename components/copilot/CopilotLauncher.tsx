"use client";

import { useTranslations } from "next-intl";
import { SparklesIcon } from "lucide-react";
import { openCopilot, useCopilotAvailable, type CopilotOpenOptions } from "./store";
import "./launcher.css";

export type CopilotLauncherProps = Omit<CopilotOpenOptions, "trigger"> & {
  variant?: "button" | "icon";
  label?: string;
  className?: string;
  aiId?: string;
};

export default function CopilotLauncher({ surface, entity, title, context, prompt, variant = "button", label, className, aiId }: CopilotLauncherProps) {
  const t = useTranslations();
  const available = useCopilotAvailable(entity ?? false);
  if (!available) return null;
  const text = label || t("portal.desk.copilot.title");
  const hint = surface === "client_chat" || surface === "lawyer_chat" ? t("secureChat.askCopilot") : text;
  return (
    <button
      type="button"
      className={`cpl-launch cpl-launch--${variant}${className ? ` ${className}` : ""}`}
      onClick={(e) => openCopilot({ surface, entity, title, context, prompt, trigger: e.currentTarget })}
      aria-label={variant === "icon" ? hint : undefined}
      title={variant === "icon" || hint !== text ? hint : undefined}
      aria-haspopup="dialog"
      aria-controls="lexgo-copilot"
      data-ai-id={aiId || `copilot.launcher.${surface}`}
    >
      <span className="cpl-launch__ic" aria-hidden="true">
        <SparklesIcon size={variant === "icon" ? 17 : 15} strokeWidth={1.75} />
      </span>
      {variant === "icon" ? null : <span className="cpl-launch__t">{text}</span>}
    </button>
  );
}
