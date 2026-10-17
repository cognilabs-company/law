"use client";

import "../sx-core.css";
import "../sx-form.css";
import type { InputHTMLAttributes, MouseEvent, ReactElement, ReactNode, Ref } from "react";
import { glyph } from "../icons";
import type { SxIcon } from "../types";

export type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "size" | "type"> & {
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "url" | "email" | "search" | "tel";
  invalid?: boolean;
  mono?: boolean;
  leading?: SxIcon;
  trailing?: ReactNode;
  size?: "md" | "sm";
  aiId?: string;
  aiLabel?: string;
  ref?: Ref<HTMLInputElement>;
};

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export function focusBoxInput(e: MouseEvent<HTMLElement>): void {
  const target = e.target as HTMLElement;
  if (target.closest("input,textarea,button,a,[tabindex]")) return;
  const input = e.currentTarget.querySelector<HTMLInputElement>("input");
  if (!input || input.disabled) return;
  e.preventDefault();
  input.focus();
}

export function TextInput({
  value,
  onChange,
  type = "text",
  invalid = false,
  mono = false,
  leading,
  trailing,
  size = "md",
  aiId,
  aiLabel,
  className,
  readOnly,
  disabled,
  autoComplete = "off",
  spellCheck,
  autoCapitalize,
  ref,
  ...rest
}: TextInputProps): ReactElement {
  const ariaInvalid = rest["aria-invalid"];
  const bad = invalid || ariaInvalid === true || ariaInvalid === "true";
  return (
    <span
      className={cx("sx-input", className)}
      data-size={size}
      data-invalid={bad ? "" : undefined}
      data-ro={readOnly ? "" : undefined}
      data-disabled={disabled ? "" : undefined}
      data-mono={mono ? "" : undefined}
      onMouseDown={focusBoxInput}
    >
      {leading ? <span className="sx-input__lead">{glyph(leading, { size: size === "sm" ? 16 : 18 })}</span> : null}
      <input
        {...rest}
        ref={ref}
        type={type}
        className="sx-input__control"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        disabled={disabled}
        autoComplete={autoComplete}
        spellCheck={mono ? false : spellCheck}
        autoCapitalize={mono ? "off" : autoCapitalize}
        aria-invalid={bad ? true : undefined}
        data-ai-id={aiId}
        data-ai-type={aiId ? "input" : undefined}
        data-ai-label={aiId ? (aiLabel ?? rest["aria-label"]) : undefined}
      />
      {trailing}
    </span>
  );
}
