"use client";

import "../sx-core.css";
import "../sx-form.css";
import type { ReactElement } from "react";

export type SwitchProps = {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  readOnly?: boolean;
  disabled?: boolean;
  "aria-describedby"?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
  aiId?: string;
  aiLabel?: string;
};

export function Switch({
  id,
  checked,
  onChange,
  label,
  readOnly = false,
  disabled = false,
  "aria-describedby": describedBy,
  "aria-label": ariaLabel,
  "aria-labelledby": labelledBy,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
  aiId,
  aiLabel,
}: SwitchProps): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      className="sx-switch"
      aria-checked={checked}
      aria-readonly={readOnly ? true : undefined}
      aria-describedby={describedBy}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      aria-invalid={ariaInvalid}
      aria-required={ariaRequired}
      disabled={disabled}
      onClick={() => {
        if (readOnly || disabled) return;
        onChange(!checked);
      }}
      data-ai-id={aiId}
      data-ai-type={aiId ? "button" : undefined}
      data-ai-label={aiId ? (aiLabel ?? label ?? ariaLabel) : undefined}
    >
      <span className="sx-switch__track" aria-hidden="true">
        <span className="sx-switch__thumb" />
      </span>
      {label ? <span className="sx-switch__label">{label}</span> : null}
    </button>
  );
}
