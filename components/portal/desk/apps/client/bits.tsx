"use client";

import { useState } from "react";
import { IconStarRate } from "@/components/icons";
import type { Tone } from "../../kit/kit";

// Shared pieces of the client's programs.

// A status as a tag colour: green when it is done, amber while it waits on
// someone, grey when it stopped, the accent while it moves.
export function toneOf(status: string): Tone {
  if (/^(completed|resolved|closed|file_ready|rated|done|paid|approved)$/.test(status)) return "ok";
  if (/^(new|open_pool|pending|pending_payment|payment_required|awaiting_payment|under_review|lawyer_review|questionnaire|payment_pending)$/.test(status)) return "warn";
  if (/^(cancelled|rejected|expired|failed|payment_cancelled|payment_rejected)$/.test(status)) return "neutral";
  return "accent";
}

// Five stars to pick from (the Mac's rating control / Windows' rating).
export function StarPicker({ value, onChange, label, words }: { value: number; onChange: (n: number) => void; label: string; words?: (n: number) => string }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="dxc-stars" role="radiogroup" aria-label={label} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={words ? words(n) : String(n)} className={n <= shown ? "is-on" : ""} onMouseEnter={() => setHover(n)} onClick={() => onChange(n)}>
          <IconStarRate />
        </button>
      ))}
      {words && shown ? <span className="dxc-stars__w">{words(shown)}</span> : null}
    </div>
  );
}

export function StarsView({ value, small }: { value: number; small?: boolean }) {
  return (
    <span className={`dxc-starsv${small ? " is-sm" : ""}`} aria-label={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <IconStarRate key={n} className={n <= Math.round(value) ? "is-on" : ""} aria-hidden />
      ))}
    </span>
  );
}
