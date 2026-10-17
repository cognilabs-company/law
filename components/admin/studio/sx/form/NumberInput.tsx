"use client";

import "../sx-core.css";
import "../sx-form.css";
import { useState, type ReactElement } from "react";
import { useStudioLabels } from "../useStudioLabels";
import { numberText, parseNumberText, sameNumber } from "./logic";
import { focusBoxInput } from "./TextInput";

export { parseNumberText } from "./logic";

export type NumberInputProps = {
  id?: string;
  value: number | null | undefined;
  onChange: (value: number | undefined) => void;
  onDraftInvalid?: (invalid: boolean) => void;
  onBlur?: () => void;
  min?: number | null;
  max?: number | null;
  placeholder?: string;
  suffix?: string;
  invalid?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  "aria-describedby"?: string;
  "aria-required"?: true;
  "aria-invalid"?: true;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  aiId?: string;
  aiLabel?: string;
};

type Draft = { text: string; emitted: number | undefined };

export function NumberInput({
  id,
  value,
  onChange,
  onDraftInvalid,
  onBlur,
  placeholder,
  suffix,
  invalid = false,
  readOnly = false,
  disabled = false,
  "aria-describedby": describedBy,
  "aria-required": ariaRequired,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  "aria-labelledby": labelledBy,
  aiId,
  aiLabel,
}: NumberInputProps): ReactElement {
  const labels = useStudioLabels();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [seen, setSeen] = useState(value);
  if (!sameNumber(seen, value)) {
    setSeen(value);
    if (draft && !sameNumber(draft.emitted, value)) setDraft(null);
  }
  const bad = invalid || ariaInvalid === true;
  const shown = draft ? draft.text : numberText(value, labels.locale);

  return (
    <span
      className="sx-input sx-num"
      data-num=""
      data-invalid={bad ? "" : undefined}
      data-ro={readOnly ? "" : undefined}
      data-disabled={disabled ? "" : undefined}
      onMouseDown={focusBoxInput}
    >
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        className="sx-input__control"
        value={shown}
        placeholder={placeholder}
        readOnly={readOnly}
        disabled={disabled}
        aria-describedby={describedBy}
        aria-required={ariaRequired}
        aria-invalid={bad ? true : undefined}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        onChange={(e) => {
          const text = e.target.value;
          const parsed = parseNumberText(text);
          const next = parsed.valid ? parsed.value : undefined;
          setDraft({ text, emitted: next });
          onChange(next);
          onDraftInvalid?.(!parsed.valid);
        }}
        onBlur={() => {
          if (draft && parseNumberText(draft.text).valid) setDraft(null);
          onBlur?.();
        }}
        data-ai-id={aiId}
        data-ai-type={aiId ? "input" : undefined}
        data-ai-label={aiId ? (aiLabel ?? ariaLabel) : undefined}
      />
      {suffix ? <span className="sx-input__suffix">{suffix}</span> : null}
    </span>
  );
}
