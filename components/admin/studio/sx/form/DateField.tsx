"use client";

import "../sx-core.css";
import "../sx-form.css";
import { useLayoutEffect, useRef, type FocusEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import DatePicker from "@/components/DatePicker";
import TimePicker from "@/components/TimePicker";
import { useStudioLabels } from "../useStudioLabels";
import { splitDateValue, zonedIso } from "./logic";

export { zonedIso } from "./logic";

export type DateFieldProps = {
  id?: string;
  value: string;
  onChange: (value: string | undefined) => void;
  label: string;
  withTime?: boolean;
  min?: string;
  max?: string;
  invalid?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  required?: boolean;
  onBlur?: () => void;
  "aria-describedby"?: string;
  "aria-labelledby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
  aiId?: string;
};

function setAttr(el: Element, name: string, value: string | undefined): void {
  if (value === undefined || value === "") el.removeAttribute(name);
  else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

export function DateField({
  id,
  value,
  onChange,
  label,
  withTime = false,
  min,
  max,
  invalid: invalidProp = false,
  readOnly = false,
  disabled = false,
  required: requiredProp = false,
  onBlur,
  "aria-describedby": describedBy,
  "aria-labelledby": labelledBy,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
  aiId,
}: DateFieldProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const wrap = useRef<HTMLDivElement>(null);
  const parts = splitDateValue(value, withTime);
  const invalid = invalidProp || ariaInvalid === true;
  const required = requiredProp || ariaRequired === true;

  useLayoutEffect(() => {
    const root = wrap.current;
    if (!root || readOnly) return;
    const input = root.querySelector<HTMLInputElement>("input.mpick__val");
    if (input) {
      setAttr(input, "id", id);
      setAttr(input, "aria-labelledby", labelledBy);
      setAttr(input, "aria-describedby", describedBy);
      setAttr(input, "aria-required", required ? "true" : undefined);
      setAttr(input, "aria-invalid", invalid ? "true" : undefined);
      setAttr(input, "data-ai-id", aiId);
      setAttr(input, "data-ai-type", aiId ? "input" : undefined);
      setAttr(input, "data-ai-label", aiId ? label : undefined);
    }
    const timeBtn = root.querySelector<HTMLButtonElement>(".tpick .mpick__btn");
    if (timeBtn) {
      setAttr(timeBtn, "aria-describedby", describedBy);
      setAttr(timeBtn, "data-ai-id", aiId ? `${aiId}.time` : undefined);
      setAttr(timeBtn, "data-ai-type", aiId ? "select" : undefined);
      setAttr(timeBtn, "data-ai-label", aiId ? t("sx.form.time") : undefined);
    }
  });

  if (readOnly) {
    const text = value ? (withTime && !/^\d{4}-\d{2}-\d{2}$/.test(value) ? labels.dateTime(value) : labels.date(value)) : "";
    return (
      <span className="sx-input" data-ro="">
        <input
          id={id}
          className="sx-input__control"
          type="text"
          readOnly
          value={text}
          placeholder={t("sx.ui.notSet")}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          data-ai-id={aiId}
          data-ai-type={aiId ? "input" : undefined}
          data-ai-label={aiId ? label : undefined}
        />
      </span>
    );
  }

  const onWrapBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget instanceof Element ? e.relatedTarget : null;
    if (next && (e.currentTarget.contains(next) || next.closest(".mpick__pop"))) return;
    onBlur?.();
  };

  return (
    <div ref={wrap} className="sx-date" data-time={withTime ? "" : undefined} data-invalid={invalid ? "" : undefined} onBlur={onWrapBlur}>
      <DatePicker
        value={parts.date}
        onChange={(d) => {
          if (!d) onChange(undefined);
          else onChange(withTime ? zonedIso(d, parts.time) : d);
        }}
        placeholder={t("sx.form.datePh")}
        ariaLabel={label}
        clearLabel={t("sx.form.clear")}
        min={min}
        max={max}
        disabled={disabled}
      />
      {withTime ? (
        <TimePicker
          value={parts.time}
          onChange={(time) => {
            if (parts.date) onChange(zonedIso(parts.date, time));
          }}
          placeholder={t("sx.form.timePh")}
          ariaLabel={t("sx.form.time")}
          step={15}
          disabled={disabled || !parts.date}
        />
      ) : null}
    </div>
  );
}
