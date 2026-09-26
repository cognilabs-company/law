"use client";

import { useId, type ReactNode } from "react";

// A drawn-tick checkbox, ported from the Uiverse "checkbox-wrapper-19" look:
// an outlined square whose border turns green on check while the tick itself
// is DRAWN in two strokes — the short one first (.2s), then the long one
// (.4s) — both rotated strips grown from height:0 with transform-origin at
// their left top. All of that lives in app/globals.css (wp-cbx); this file
// only supplies the markup the rules hang off.
//
// Two deliberate departures from the snippet:
//  • the native input is visually hidden the .filepick way (1px + clip)
//    instead of display:none — display:none drops it out of the tab order
//    entirely, so the control became mouse-only, which for a consent gate is
//    not acceptable. Focus is mirrored onto the drawn box below.
//  • the label is a real <label htmlFor>, so the hit area and the
//    accessible name are the sentence next to the box, not just the square.
//
// The tick's crossing point is masked with a box-shadow in the colour of
// whatever sits behind the box — set --cbx-bg on an ancestor when placing
// this on anything other than the default surface.
export default function CheckBox({
  checked,
  onChange,
  children,
  id,
  hint,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  // The label sentence. Long copy is expected and wraps beside the box.
  children: ReactNode;
  // Optional — one is generated when the caller has no stable id to give.
  id?: string;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const auto = useId();
  const inputId = id || `cbx-${auto}`;
  const hintId = `${inputId}-hint`;

  return (
    <div className={`cbx${disabled ? " cbx--off" : ""}${className ? ` ${className}` : ""}`}>
      {/* Must stay the label's immediate previous sibling: every checked /
          focus rule is written as .cbx__in:… + .cbx__row … */}
      <input
        id={inputId}
        className="cbx__in"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label className="cbx__row" htmlFor={inputId}>
        <span className="cbx__box" aria-hidden="true" />
        <span className="cbx__tx">{children}</span>
      </label>
      {hint ? (
        <p className="cbx__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
