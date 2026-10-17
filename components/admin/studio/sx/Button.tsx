"use client";

import "./sx-core.css";
import type { ButtonHTMLAttributes, MouseEvent, ReactElement, ReactNode, Ref } from "react";
import { Link } from "@/i18n/navigation";
import { glyph } from "./icons";
import type { SxIcon } from "./types";

export type SxButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type SxButtonOwn = {
  variant?: SxButtonVariant;
  size?: "md" | "sm";
  icon?: SxIcon;
  iconEnd?: SxIcon;
  busy?: boolean;
  aiId?: string;
  aiLabel?: string;
};

export type SxButtonProps = SxButtonOwn & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-busy"> & { ref?: Ref<HTMLButtonElement> };

export type SxLinkButtonProps = SxButtonOwn & {
  href: string;
  children: ReactNode;
  className?: string;
  target?: string;
  prefetch?: boolean;
  ref?: Ref<HTMLAnchorElement>;
};

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

function classes(variant: SxButtonVariant, size: "md" | "sm", extra?: string): string {
  return cx("sx-btn", `sx-btn--${variant}`, size === "sm" && "sx-btn--sm", extra);
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return "";
}

function Inner({ icon, iconEnd, busy, children }: { icon?: SxIcon; iconEnd?: SxIcon; busy?: boolean; children?: ReactNode }) {
  return (
    <>
      {busy ? <span className="sx-spin" aria-hidden="true" /> : icon ? glyph(icon, { size: 16 }) : null}
      {children !== undefined && children !== null && children !== false ? <span className="sx-btn__label">{children}</span> : null}
      {iconEnd ? glyph(iconEnd, { size: 16 }) : null}
    </>
  );
}

export function SxButton({
  variant = "secondary",
  size = "md",
  icon,
  iconEnd,
  busy = false,
  aiId,
  aiLabel,
  className,
  type = "button",
  onClick,
  children,
  ...rest
}: SxButtonProps): ReactElement {
  const click = (e: MouseEvent<HTMLButtonElement>) => {
    if (busy || rest["aria-disabled"] === true || rest["aria-disabled"] === "true") {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };
  const label = aiLabel ?? (textOf(children) || rest["aria-label"] || "");
  return (
    <button
      {...rest}
      type={type}
      className={classes(variant, size, className)}
      aria-busy={busy || undefined}
      aria-disabled={busy ? true : rest["aria-disabled"]}
      data-ai-id={aiId}
      data-ai-type={aiId ? "button" : undefined}
      data-ai-label={aiId ? label || undefined : undefined}
      onClick={click}
    >
      <Inner icon={icon} iconEnd={iconEnd} busy={busy}>
        {children}
      </Inner>
    </button>
  );
}

export function SxLinkButton({ variant = "secondary", size = "md", icon, iconEnd, busy = false, aiId, aiLabel, href, children, className, target, prefetch, ref }: SxLinkButtonProps): ReactElement {
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    if (busy) e.preventDefault();
  };
  const label = aiLabel ?? textOf(children);
  return (
    <Link
      ref={ref}
      href={href}
      prefetch={prefetch}
      target={target}
      rel={target === "_blank" ? "noopener noreferrer" : undefined}
      className={classes(variant, size, className)}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      data-ai-id={aiId}
      data-ai-type={aiId ? "link" : undefined}
      data-ai-label={aiId ? label || undefined : undefined}
      onClick={click}
    >
      <Inner icon={icon} iconEnd={iconEnd} busy={busy}>
        {children}
      </Inner>
    </Link>
  );
}
