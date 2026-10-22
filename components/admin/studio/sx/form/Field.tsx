"use client";

import "../sx-core.css";
import "../sx-form.css";
import type { ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CircleAlertIcon, glyph } from "../icons";
import type { SxControlA11y } from "../types";

export type FieldProps = {
  id: string;
  label: string;
  required?: boolean;
  help?: string;
  hint?: string;
  error?: string;
  as?: "div" | "fieldset";
  layout?: "stack" | "inline";
  span?: 1 | 2;
  readOnly?: boolean;
  value?: ReactNode;
  labelAside?: ReactNode;
  // A line under the control saying who reads the value and what for.
  note?: ReactNode;
  className?: string;
  children?: ReactNode | ((a11y: SxControlA11y) => ReactNode);
};

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

function isBlank(value: ReactNode): boolean {
  return value === undefined || value === null || value === false || value === "" || (Array.isArray(value) && value.length === 0);
}

export function fieldA11y(id: string, opts: { help?: string; hint?: string; error?: string; required?: boolean; note?: boolean }): SxControlA11y {
  const describedBy = [opts.error ? `${id}-err` : "", opts.note ? `${id}-note` : "", opts.help || opts.hint ? `${id}-help` : ""].filter(Boolean).join(" ");
  return {
    id,
    "aria-labelledby": `${id}-label`,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": opts.error ? true : undefined,
    "aria-required": opts.required ? true : undefined,
  };
}

export function Field({
  id,
  label,
  required = false,
  help = "",
  hint = "",
  error = "",
  as = "div",
  layout = "stack",
  span = 2,
  readOnly = false,
  value,
  labelAside,
  note,
  className,
  children,
}: FieldProps): ReactElement {
  const t = useTranslations("studio");
  const labelId = `${id}-label`;
  const mark = required ? (
    <span className="sx-field__req" aria-hidden="true">
      *
    </span>
  ) : null;

  if (readOnly && !children) {
    const empty = isBlank(value);
    return (
      <div className={cx("sx-field", className)} data-span={span} data-ro="" role="group" aria-labelledby={labelId}>
        <div className="sx-field__top">
          <span className="sx-field__label" id={labelId}>
            {label}
          </span>
          {labelAside}
        </div>
        <div className="sx-field__value" id={id} data-empty={empty ? "" : undefined}>
          {empty ? t("sx.ui.notSet") : value}
        </div>
      </div>
    );
  }

  const a11y = fieldA11y(id, { help, hint, error, required, note: !!note });
  const helpText = [help, hint].filter(Boolean).join(" · ");
  const control = typeof children === "function" ? children(a11y) : children;
  const noteEl = note ? (
    <p className="sx-field__note" id={`${id}-note`}>
      {note}
    </p>
  ) : null;
  const helpEl = helpText ? (
    <p className="sx-field__help" id={`${id}-help`}>
      {helpText}
    </p>
  ) : null;
  const errEl = error ? (
    <p className="sx-field__err" id={`${id}-err`}>
      {glyph(CircleAlertIcon, { size: 14 })}
      <span>{error}</span>
    </p>
  ) : null;

  if (as === "fieldset") {
    return (
      <fieldset
        className={cx("sx-field", className)}
        data-as="fieldset"
        data-layout={layout}
        data-span={span}
        data-invalid={error ? "" : undefined}
        aria-describedby={a11y["aria-describedby"]}
      >
        <legend className="sx-field__label sx-field__legend" id={labelId}>
          {label}
          {mark}
        </legend>
        {labelAside ? <div className="sx-field__aside">{labelAside}</div> : null}
        {control}
        {noteEl}
        {helpEl}
        {errEl}
      </fieldset>
    );
  }

  return (
    <div className={cx("sx-field", className)} data-layout={layout} data-span={span} data-invalid={error ? "" : undefined}>
      <div className="sx-field__top">
        <label className="sx-field__label" id={labelId} htmlFor={id}>
          {label}
          {mark}
        </label>
        {labelAside}
      </div>
      {layout === "inline" ? <div className="sx-field__ctl">{control}</div> : control}
      {noteEl}
      {helpEl}
      {errEl}
    </div>
  );
}

export function FormGrid({ children, className }: { children: ReactNode; className?: string }): ReactElement {
  return (
    <div className={cx("sx-form-grid", className)}>
      <div className="sx-form-grid__in">{children}</div>
    </div>
  );
}
