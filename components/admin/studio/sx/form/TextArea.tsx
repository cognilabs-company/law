"use client";

import "../sx-core.css";
import "../sx-form.css";
import { useId, useLayoutEffect, useRef, type CSSProperties, type ReactElement, type TextareaHTMLAttributes } from "react";

export type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "rows"> & {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  minRows?: number;
  maxRows?: number;
  counter?: boolean;
  mono?: boolean;
  aiId?: string;
  aiLabel?: string;
};

const LINE = 20;
const CHROME = 18;

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

let sizingSupport: boolean | null = null;

function cssSizing(): boolean {
  if (sizingSupport === null) {
    sizingSupport = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("field-sizing", "content");
  }
  return sizingSupport;
}

export function TextCount({ value, max, id }: { value: string; max: number; id?: string }): ReactElement {
  const used = value.length;
  return (
    <span className="sx-count sx-num" id={id} data-near={used >= max * 0.9 ? "" : undefined}>
      {used}/{max}
    </span>
  );
}

export function TextArea({
  value,
  onChange,
  invalid = false,
  minRows = 3,
  maxRows = 12,
  counter = false,
  mono = false,
  aiId,
  aiLabel,
  className,
  style,
  maxLength,
  "aria-describedby": describedBy,
  ...rest
}: TextAreaProps): ReactElement {
  const ref = useRef<HTMLTextAreaElement>(null);
  const countId = useId();
  const minH = minRows * LINE + CHROME;
  const maxH = Math.max(minRows, maxRows) * LINE + CHROME;
  const ariaInvalid = rest["aria-invalid"];
  const bad = invalid || ariaInvalid === true || ariaInvalid === "true";
  const cap = counter && typeof maxLength === "number" && maxLength > 0 ? maxLength : 0;
  const showCount = cap > 0;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || cssSizing()) return;
    el.style.height = "auto";
    const next = Math.min(maxH, Math.max(minH, el.scrollHeight + 2));
    el.style.height = `${next}px`;
  }, [value, minH, maxH]);

  const box = (
    <textarea
      {...rest}
      ref={ref}
      className={cx("sx-textarea", !showCount && className)}
      style={{ ...style, "--sx-ta-min": `${minH}px`, "--sx-ta-max": `${maxH}px` } as CSSProperties}
      value={value}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={bad ? true : undefined}
      aria-describedby={[describedBy, showCount ? countId : ""].filter(Boolean).join(" ") || undefined}
      data-mono={mono ? "" : undefined}
      spellCheck={mono ? false : rest.spellCheck}
      data-ai-id={aiId}
      data-ai-type={aiId ? "textarea" : undefined}
      data-ai-label={aiId ? (aiLabel ?? rest["aria-label"]) : undefined}
    />
  );

  if (!showCount) return box;
  return (
    <div className={cx("sx-textarea-wrap", className)}>
      {box}
      <TextCount value={value} max={cap} id={countId} />
    </div>
  );
}
