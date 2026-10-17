"use client";

import "../sx-core.css";
import "../sx-form.css";
import { useState, type ReactElement } from "react";
import { useStudioLabels } from "../useStudioLabels";
import { moneyDecimal, moneyEdit, moneySeparator, moneyText, sameNumber } from "./logic";
import type { NumberInputProps } from "./NumberInput";
import { focusBoxInput } from "./TextInput";

export type MoneyInputProps = Omit<NumberInputProps, "suffix"> & { currency?: string };

type Draft = { text: string; emitted: number | undefined; bad: boolean };

export function MoneyInput({
  id,
  value,
  onChange,
  onDraftInvalid,
  onBlur,
  placeholder,
  currency = "UZS",
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
}: MoneyInputProps): ReactElement {
  const labels = useStudioLabels();
  const separator = moneySeparator(labels.num(1000));
  const decimal = moneyDecimal(separator);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [seen, setSeen] = useState(value);
  if (!sameNumber(seen, value)) {
    setSeen(value);
    if (draft && !sameNumber(draft.emitted, value)) setDraft(null);
  }
  const bad = invalid || ariaInvalid === true;
  const shown = draft ? draft.text : moneyText(value, separator, decimal);
  const unit = labels.currency(currency);

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
        onFocus={() => {
          if (!readOnly && !draft) setDraft({ text: moneyText(value, separator, decimal), emitted: value ?? undefined, bad: false });
        }}
        onChange={(e) => {
          const input = e.currentTarget;
          const step = moneyEdit(input.value, input.selectionStart ?? input.value.length, separator, decimal);
          setDraft({ text: step.text, emitted: step.value, bad: step.invalid });
          onChange(step.value);
          onDraftInvalid?.(step.invalid);
          requestAnimationFrame(() => {
            if (document.activeElement === input) input.setSelectionRange(step.caret, step.caret);
          });
        }}
        onBlur={() => {
          if (draft && !draft.bad) setDraft(null);
          onBlur?.();
        }}
        data-ai-id={aiId}
        data-ai-type={aiId ? "input" : undefined}
        data-ai-label={aiId ? (aiLabel ?? ariaLabel) : undefined}
      />
      {unit ? <span className="sx-input__suffix">{unit}</span> : null}
    </span>
  );
}
