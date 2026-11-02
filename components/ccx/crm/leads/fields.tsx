"use client";

import { useId, type Ref } from "react";

export type Opt = { value: string; label: string };

export function SelectField({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (v: string) => void; options: Opt[]; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="opx-field opx-ld-f">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="opx-ld-select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

type TextProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  error?: string;
  hint?: string;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "datetime-local" | "date";
  inputMode?: "text" | "tel" | "email";
  min?: string;
  max?: string;
  maxLength?: number;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
};

export function TextField({ label, value, onChange, required, error, hint, placeholder, type = "text", inputMode, min, max, maxLength, autoFocus, inputRef }: TextProps) {
  const id = useId();
  const described = [hint && !error ? `${id}-h` : "", error ? `${id}-e` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`opx-field opx-ld-f${error ? " has-error" : ""}`}>
      <label htmlFor={id}>
        {label}
        {required ? <i aria-hidden="true">*</i> : null}
      </label>
      <input
        ref={inputRef}
        id={id}
        type={type}
        value={value}
        min={min}
        max={max}
        maxLength={maxLength}
        placeholder={placeholder}
        inputMode={inputMode}
        autoFocus={autoFocus}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? (
        <p className="opx-ferr" id={`${id}-e`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <small className="opx-ld-f__hint" id={`${id}-h`}>
          {hint}
        </small>
      ) : null}
    </div>
  );
}
