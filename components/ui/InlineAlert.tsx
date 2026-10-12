"use client";

import { isValidElement, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconAlert, IconCircleCheck, IconClose, IconInfo, IconLock } from "@/components/icons";
import IconButton from "./IconButton";

export type InlineAlertTone = "info" | "warn" | "error" | "success" | "locked";
export type InlineAlertRole = "alert" | "status" | "note" | "none";
export type InlineAlertAction = {
  label: string;
  onClick?: () => unknown;
  href?: string;
  busy?: boolean;
  aiId?: string;
};

export type InlineAlertProps = {
  tone?: InlineAlertTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode | InlineAlertAction;
  icon?: ReactNode | false;
  role?: InlineAlertRole;
  compact?: boolean;
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
  id?: string;
  aiId?: string;
};

const ROLE: Record<InlineAlertTone, InlineAlertRole> = {
  info: "note",
  warn: "status",
  error: "alert",
  success: "status",
  locked: "note",
};

function toneIcon(tone: InlineAlertTone): ReactNode {
  if (tone === "success") return <IconCircleCheck />;
  if (tone === "locked") return <IconLock />;
  if (tone === "info") return <IconInfo />;
  return <IconAlert />;
}

function isAction(v: unknown): v is InlineAlertAction {
  return typeof v === "object" && v !== null && !isValidElement(v) && !Array.isArray(v) && typeof (v as { label?: unknown }).label === "string";
}

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export default function InlineAlert({
  tone = "info",
  title,
  children,
  action,
  icon,
  role,
  compact = false,
  onDismiss,
  dismissLabel,
  className,
  id,
  aiId,
}: InlineAlertProps) {
  const tc = useTranslations("common.a11y");
  const [running, setRunning] = useState(false);
  const r = role ?? ROLE[tone];

  const renderAction = (): ReactNode => {
    if (!isAction(action)) return action ?? null;
    const busy = Boolean(action.busy) || running;
    if (action.href) {
      return (
        <Link href={action.href} className="btn btn--line btn--sm" data-ai-id={action.aiId}>
          {action.label}
        </Link>
      );
    }
    const run = () => {
      if (busy || !action.onClick) return;
      const fn = action.onClick;
      setRunning(true);
      Promise.resolve()
        .then(fn)
        .catch(() => undefined)
        .finally(() => setRunning(false));
    };
    return (
      <button type="button" className="btn btn--line btn--sm" onClick={run} aria-disabled={busy || undefined} aria-busy={busy || undefined} data-ai-id={action.aiId}>
        {action.label}
      </button>
    );
  };

  const act = renderAction();
  const shownIcon = icon === false ? null : (icon ?? toneIcon(tone));

  return (
    <div id={id} className={cx("ialert", `ialert--${tone}`, compact && "ialert--compact", className)} role={r === "none" ? undefined : r} data-ai-id={aiId}>
      {shownIcon ? (
        <span className="ialert__ic" aria-hidden="true">
          {shownIcon}
        </span>
      ) : null}
      <div className="ialert__m">
        {title ? <b className="ialert__t">{title}</b> : null}
        {children ? <div className="ialert__x">{children}</div> : null}
      </div>
      {act ? <div className="ialert__a">{act}</div> : null}
      {onDismiss ? <IconButton className="ialert__close" size="sm" label={dismissLabel ?? tc("close")} icon={<IconClose />} tip={false} onClick={onDismiss} /> : null}
    </div>
  );
}
