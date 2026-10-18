"use client";

import "../sx-core.css";
import "../sx-layout.css";
import type { ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";
import IconButton from "@/components/ui/IconButton";
import { CircleCheckIcon, InfoIcon, CircleAlertIcon, TriangleAlertIcon, XIcon, glyph } from "../icons";
import type { SxIcon, SxNoteTone } from "../types";
import { cx } from "./util";

export type SxNoteProps = {
  tone: SxNoteTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: SxIcon | false;
  role?: "status" | "alert" | "note" | "none";
  onDismiss?: () => void;
  id?: string;
  className?: string;
};

const NOTE_ICON: Readonly<Record<SxNoteTone, SxIcon>> = {
  info: InfoIcon,
  warn: TriangleAlertIcon,
  error: CircleAlertIcon,
  success: CircleCheckIcon,
};

export function SxNote({ tone, title, children, action, icon, role, onDismiss, id, className }: SxNoteProps): ReactElement {
  const t = useTranslations("studio");
  const shown = role ?? (tone === "error" ? "alert" : "none");
  const mark = icon === false ? null : glyph(icon ?? NOTE_ICON[tone] ?? InfoIcon, { size: 18, className: "sx-note__icon" });
  return (
    <div id={id} className={cx("sx-note", className)} data-note={tone} role={shown === "none" ? undefined : shown}>
      <div className="sx-note__in" data-action={action ? "" : undefined}>
        {mark}
        <div className="sx-note__body">
          {title ? <p className="sx-note__title">{title}</p> : null}
          {children ? <div className="sx-note__text">{children}</div> : null}
        </div>
        {action ? <div className="sx-note__action">{action}</div> : null}
        {onDismiss ? <IconButton className="sx-ibtn sx-note__close" size="sm" label={t("sx.ui.close")} icon={glyph(XIcon)} onClick={onDismiss} /> : null}
      </div>
    </div>
  );
}
