"use client";

import { useId, type Ref } from "react";
import { CrmDateTime } from "@/components/crm/fields";
import Select from "@/components/Select";

export type Opt = { value: string; label: string };

export function SelectField({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (v: string) => void; options: Opt[]; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="opx-field opx-ld-f">
      <label id={`${id}-l`}>{label}</label>
      <Select value={value} onChange={onChange} options={options} labelId={`${id}-l`} disabled={disabled} />
    </div>
  );
}

// A local date and time ("YYYY-MM-DDTHH:MM", "" for none) with the site's own pickers.
export function DateTimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="opx-field opx-ld-f">
      <span className="opx-field__cap">{label}</span>
      <CrmDateTime value={value} onChange={onChange} label={label} />
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
  type?: "text" | "email" | "tel";
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
