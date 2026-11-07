"use client";

import "./journey.css";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { IcCheck } from "../icons";

export type JourneyStep = { key: string; label: string; icon: ReactNode; onPick?: () => void; pickLabel?: string; locked?: boolean };

// Where a piece of work stands: icon circles on a line that fills up to the
// current step. Done steps carry a tick, the current one is large and glowing,
// the ones ahead are small and dim. Every circle has an icon.
export function Journey({ label, steps, at, ended = "", className }: { label: string; steps: JourneyStep[]; at: number; ended?: "" | "ok" | "hot" | "mute"; className?: string }) {
  const ref = useRef<HTMLOListElement>(null);
  const n = Math.max(steps.length, 1);
  const cur = steps[at]?.key ?? "";
  useEffect(() => {
    const ol = ref.current;
    const el = ol?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!ol || !el || ol.scrollWidth <= ol.clientWidth) return;
    ol.scrollLeft = Math.max(0, el.offsetLeft - (ol.clientWidth - el.offsetWidth) / 2);
  }, [cur]);
  return (
    <div className={`opx-jr${className ? ` ${className}` : ""}`} data-ended={ended || undefined}>
      <ol ref={ref} className="opx-jr__track" aria-label={label} style={{ "--jr-n": n, "--jr-at": Math.max(at, 0) } as CSSProperties}>
        {steps.map((s, i) => {
          const state = i < at ? "done" : i === at ? "now" : "todo";
          const inner = (
            <>
              <span className="opx-jr__dot" aria-hidden="true">
                {state === "done" ? <IcCheck size={16} /> : s.icon}
              </span>
              <span className="opx-jr__t">{s.label}</span>
            </>
          );
          return (
            <li key={s.key} data-state={state} data-locked={s.locked || undefined} aria-current={i === at ? "step" : undefined}>
              {s.onPick ? (
                <button type="button" onClick={s.onPick} aria-label={s.pickLabel} title={s.pickLabel}>
                  {inner}
                </button>
              ) : (
                <span className="opx-jr__cell">{inner}</span>
              )}
            </li>
          );
        })}
      </ol>
      {steps[at] ? (
        <p className="opx-jr__cap" aria-hidden="true">
          {steps[at].label}
        </p>
      ) : null}
    </div>
  );
}
