"use client";

import type { ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from "react";

export type IconButtonVariant = "ghost" | "line" | "danger";
export type IconButtonSize = "sm" | "md";
export type TipSide = "top" | "bottom";
export type TipAlign = "center" | "start" | "end";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label" | "aria-pressed" | "aria-busy"> & {
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  tip?: boolean | string;
  tipSide?: TipSide;
  tipAlign?: TipAlign;
  busy?: boolean;
  pressed?: boolean;
  aiId?: string;
  aiType?: string;
  ref?: Ref<HTMLButtonElement>;
};

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export default function IconButton({
  label,
  icon,
  variant = "ghost",
  size = "md",
  tip = true,
  tipSide = "top",
  tipAlign = "center",
  busy = false,
  pressed,
  aiId,
  aiType = "button",
  className,
  type = "button",
  onClick,
  ref,
  ...rest
}: IconButtonProps) {
  const tipText = typeof tip === "string" ? tip : tip ? label : "";

  const click = (e: MouseEvent<HTMLButtonElement>) => {
    if (busy) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={cx("ibtn", variant !== "ghost" && `ibtn--${variant}`, size === "sm" && "ibtn--sm", className)}
      aria-label={label}
      aria-pressed={pressed}
      aria-busy={busy || undefined}
      aria-disabled={busy || rest["aria-disabled"] || undefined}
      data-tip={tipText || undefined}
      data-tip-side={tipText && tipSide !== "top" ? tipSide : undefined}
      data-tip-align={tipText && tipAlign !== "center" ? tipAlign : undefined}
      data-ai-id={aiId}
      data-ai-type={aiId ? aiType : undefined}
      data-ai-label={aiId ? label : undefined}
      onClick={click}
    >
      {busy ? (
        <span className="ibtn__spin" aria-hidden="true" />
      ) : (
        <span className="ibtn__ic" aria-hidden="true">
          {icon}
        </span>
      )}
    </button>
  );
}
