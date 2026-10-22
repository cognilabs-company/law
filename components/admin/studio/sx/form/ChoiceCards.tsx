"use client";

import "../sx-core.css";
import "../sx-form.css";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { aiId as makeAiId } from "@/lib/ai/ids";
import { CheckIcon, CircleCheckIcon, glyph } from "../icons";
import type { SxIcon } from "../types";

export type ChoiceCard = { value: string; title: string; description?: string; icon?: SxIcon; meta?: ReactNode; disabled?: boolean | string };

export type ChoiceCardsProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly ChoiceCard[];
  columns?: 1 | 2 | 3;
  invalid?: boolean;
  readOnly?: boolean;
  required?: boolean;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
  aiId?: string;
};

export function ChoiceCards({
  id,
  value,
  onChange,
  options,
  columns = 3,
  invalid: invalidProp = false,
  readOnly = false,
  required: requiredProp = false,
  "aria-labelledby": labelledBy,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
  aiId,
}: ChoiceCardsProps): ReactElement {
  const cols = Math.max(1, Math.min(columns, options.length || 1));
  const invalid = invalidProp || ariaInvalid === true;
  const required = requiredProp || ariaRequired === true;
  return (
    <div
      className="sx-choices"
      id={id}
      role="radiogroup"
      aria-labelledby={labelledBy ?? `${id}-label`}
      aria-describedby={describedBy}
      aria-required={required ? true : undefined}
      aria-invalid={invalid ? true : undefined}
      data-cols={cols}
      data-invalid={invalid ? "" : undefined}
      data-ro={readOnly ? "" : undefined}
      style={{ "--sx-cols": cols } as CSSProperties}
    >
      <div className="sx-choices__grid">
        {options.map((o, i) => {
          const checked = o.value === value;
          const why = typeof o.disabled === "string" ? o.disabled : "";
          const off = !!o.disabled;
          const base = `${id}-c${i}`;
          const described = [o.description ? `${base}-d` : "", o.meta ? `${base}-m` : "", why ? `${base}-w` : ""].filter(Boolean).join(" ");
          return (
            <label
              key={o.value}
              className="sx-choice"
              data-checked={checked ? "" : undefined}
              data-disabled={off ? "" : undefined}
              data-noicon={o.icon ? undefined : ""}
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest("input, a, button")) return;
                e.preventDefault();
                const input = e.currentTarget.querySelector<HTMLInputElement>("input");
                if (!input || input.disabled) return;
                input.focus({ preventScroll: true });
                if (!checked && !readOnly && !off) onChange(o.value);
              }}
            >
              <input
                type="radio"
                className="sx-choice__input sx-vh"
                name={id}
                value={o.value}
                checked={checked}
                disabled={off || readOnly}
                aria-labelledby={`${base}-t`}
                aria-describedby={described || undefined}
                onChange={() => {
                  if (!readOnly && !off) onChange(o.value);
                }}
                data-ai-id={aiId ? makeAiId(aiId, o.value) : undefined}
                data-ai-type={aiId ? "button" : undefined}
                data-ai-label={aiId ? o.title : undefined}
              />
              {o.icon ? (
                <span className="sx-choice__icon" aria-hidden="true">
                  {glyph(o.icon, { size: 20 })}
                </span>
              ) : null}
              <span className="sx-choice__title" id={`${base}-t`}>
                {o.title}
              </span>
              {o.description ? (
                <span className="sx-choice__desc" id={`${base}-d`}>
                  {o.description}
                </span>
              ) : null}
              {o.meta ? (
                <span className="sx-choice__meta" id={`${base}-m`}>
                  {o.meta}
                </span>
              ) : null}
              {why ? (
                <span className="sx-choice__why" id={`${base}-w`}>
                  {why}
                </span>
              ) : null}
              {checked ? <span className="sx-choice__check">{glyph(CircleCheckIcon, { size: 20 })}</span> : null}
            </label>
          );
        })}
      </div>
    </div>
  );
}

export type ChoiceCardsMultiProps = Omit<ChoiceCardsProps, "value" | "onChange"> & {
  value: readonly string[];
  onChange: (value: string[]) => void;
  countLabel?: (n: number) => string;
};

// The same cards with several picks: each card is a checkbox, a square mark
// shows it can be combined with others, and the picks keep the cards' order.
export function ChoiceCardsMulti({
  id,
  value,
  onChange,
  options,
  columns = 3,
  invalid: invalidProp = false,
  readOnly = false,
  required: requiredProp = false,
  "aria-labelledby": labelledBy,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
  aiId,
  countLabel,
}: ChoiceCardsMultiProps): ReactElement {
  const cols = Math.max(1, Math.min(columns, options.length || 1));
  const invalid = invalidProp || ariaInvalid === true;
  const required = requiredProp || ariaRequired === true;
  const picked = new Set(value);
  const toggle = (v: string) => {
    if (readOnly) return;
    const next = new Set(picked);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    const known = options.map((o) => o.value).filter((x) => next.has(x));
    onChange([...known, ...[...next].filter((x) => !known.includes(x))]);
  };
  return (
    <div
      className="sx-choices"
      id={id}
      role="group"
      aria-labelledby={labelledBy ?? `${id}-label`}
      aria-describedby={describedBy}
      data-cols={cols}
      data-multi=""
      data-required={required ? "" : undefined}
      data-invalid={invalid ? "" : undefined}
      data-ro={readOnly ? "" : undefined}
      style={{ "--sx-cols": cols } as CSSProperties}
    >
      <div className="sx-choices__grid">
        {options.map((o, i) => {
          const checked = picked.has(o.value);
          const why = typeof o.disabled === "string" ? o.disabled : "";
          const off = !!o.disabled && !checked;
          const base = `${id}-c${i}`;
          const described = [o.description ? `${base}-d` : "", o.meta ? `${base}-m` : "", why ? `${base}-w` : ""].filter(Boolean).join(" ");
          return (
            <label key={o.value} className="sx-choice" data-checked={checked ? "" : undefined} data-disabled={off ? "" : undefined} data-noicon={o.icon ? undefined : ""}>
              <input
                type="checkbox"
                className="sx-choice__input sx-vh"
                name={id}
                value={o.value}
                checked={checked}
                disabled={off || readOnly}
                aria-labelledby={`${base}-t`}
                aria-describedby={described || undefined}
                onChange={() => {
                  if (!off) toggle(o.value);
                }}
                data-ai-id={aiId ? makeAiId(aiId, o.value) : undefined}
                data-ai-type={aiId ? "checkbox" : undefined}
                data-ai-label={aiId ? o.title : undefined}
              />
              {o.icon ? (
                <span className="sx-choice__icon" aria-hidden="true">
                  {glyph(o.icon, { size: 20 })}
                </span>
              ) : null}
              <span className="sx-choice__title" id={`${base}-t`}>
                {o.title}
              </span>
              {o.description ? (
                <span className="sx-choice__desc" id={`${base}-d`}>
                  {o.description}
                </span>
              ) : null}
              {o.meta ? (
                <span className="sx-choice__meta" id={`${base}-m`}>
                  {o.meta}
                </span>
              ) : null}
              {why ? (
                <span className="sx-choice__why" id={`${base}-w`}>
                  {why}
                </span>
              ) : null}
              <span className="sx-choice__box" aria-hidden="true">
                {checked ? glyph(CheckIcon, { size: 14, strokeWidth: 3 }) : null}
              </span>
            </label>
          );
        })}
      </div>
      {countLabel ? (
        <p className="sx-choices__count" aria-live="polite">
          {countLabel(value.length)}
        </p>
      ) : null}
    </div>
  );
}
