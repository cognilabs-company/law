"use client";

import "./sx-core.css";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { celebrate } from "./celebrate";
import { prefersReducedMotion, useReducedMotion } from "./hooks";
import { CheckIcon, glyph, STATUS_ICON } from "./icons";
import { StatusPill } from "./StatusPill";
import { stageCount, stageKey, stageOnLine, sxStatus } from "./status";
import type { SxIcon, SxRecordSource, SxStage, SxStatusInfo } from "./types";
import { useStudioLabels } from "./useStudioLabels";

export type StatusRailProps = {
  status: string;
  source?: SxRecordSource;
  direct?: boolean;
  variant?: "full" | "compact";
  note?: ReactNode;
  celebrateOnPublish?: boolean;
  id?: string;
  className?: string;
};

type Seen = { status: string; from: number; run: number };
type StepState = "done" | "current" | "todo";

const POP_DELAY = 60;
const LINE_STAGGER = 90;
const LINE_SPREAD = 360;
const MOMENT_MS = 960;
const BURST_MS = 650;
const GLOW_MS = 600;
const GLOW_LAG = 140;
const LATE_MS = 320;
const CHECK_GLYPH = { size: 16, strokeWidth: 2.5 } as const;
const STAGE_GLYPH = { size: 18 } as const;

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

function useStatusMotion(status: string, source: SxRecordSource | undefined, direct: boolean): Seen {
  const [seen, setSeen] = useState<Seen>({ status, from: -2, run: 0 });
  if (seen.status !== status) {
    const next: Seen = { status, from: stageOnLine(sxStatus(seen.status, source), direct), run: seen.run + 1 };
    setSeen(next);
    return next;
  }
  return seen;
}

function currentIcon(info: SxStatusInfo, stage: SxStage): SxIcon {
  return info.branch || info.key === "scheduled" ? info.icon : STATUS_ICON[stage];
}

export function StatusRail({ status, source, direct = false, variant = "full", note, celebrateOnPublish = true, id, className }: StatusRailProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const reduced = useReducedMotion();
  const motion = useStatusMotion(status, source, direct);
  const wrapRef = useRef<HTMLDivElement>(null);
  const compactRef = useRef<HTMLSpanElement>(null);

  const info = sxStatus(status, source);
  const n = stageCount(direct);
  const to = stageOnLine(info, direct);
  const offLine = to < 0;
  const moved = motion.run > 0 && motion.from >= 0 && info.branch === null && to > motion.from;
  const toLive = moved && info.live && to === n - 1;
  const animate = moved && !reduced;
  const steps = animate ? to - motion.from : 0;
  const stagger = steps ? Math.min(LINE_STAGGER, LINE_SPREAD / steps) : 0;
  const lastDelay = steps ? (steps - 1) * stagger : 0;
  const compact = variant === "compact";
  const party = toLive && animate && celebrateOnPublish;

  useLayoutEffect(() => {
    if (!party) return;
    const box = compact ? compactRef.current : wrapRef.current;
    const origin = box?.querySelector<HTMLElement>("[data-origin]");
    if (!box || !origin) return;
    const glowTarget = box.querySelector<HTMLElement>(".sx-rail__live > .sx-pill, .sx-rail-c > .sx-pill");
    const lag = compact ? 0 : GLOW_LAG;
    const born = performance.now();
    let fired = false;
    let cancel: (() => void) | null = null;
    const fire = () => {
      if (fired) return;
      fired = true;
      window.clearTimeout(timer);
      origin.removeEventListener("animationstart", onStart);
      const left = MOMENT_MS - (performance.now() - born);
      if (prefersReducedMotion() || left < LATE_MS) return;
      if (glowTarget) {
        glowTarget.style.setProperty("--sx-glow-ms", `${Math.round(Math.min(GLOW_MS, left - lag))}ms`);
        glowTarget.setAttribute("data-glow", "");
      }
      cancel = celebrate(origin, { duration: Math.min(BURST_MS, left) });
    };
    const onStart = (e: AnimationEvent) => {
      if (e.animationName === "sx-pop") fire();
    };
    origin.addEventListener("animationstart", onStart);
    const timer = window.setTimeout(fire, lastDelay + (compact ? 0 : POP_DELAY));
    return () => {
      window.clearTimeout(timer);
      origin.removeEventListener("animationstart", onStart);
      glowTarget?.removeAttribute("data-glow");
      glowTarget?.style.removeProperty("--sx-glow-ms");
      cancel?.();
    };
  }, [motion.run, party, lastDelay, compact]);

  const stateOf = (i: number): StepState => (offLine ? "todo" : i < to ? "done" : i === to ? "current" : "todo");
  const fresh = (i: number) => animate && i > motion.from && i <= to;
  const delay = (i: number): CSSProperties | undefined => (fresh(i) ? ({ "--d": `${Math.round((i - motion.from - 1) * stagger)}ms` } as CSSProperties) : undefined);

  if (compact) {
    return (
      <span ref={compactRef} id={id} className={cx("sx-rail-c", className)} data-tone={info.tone}>
        <span key={motion.run} className="sx-rail-c__track" aria-hidden="true">
          {Array.from({ length: n }, (_, i) => (
            <span
              key={i}
              className="sx-rail-c__dot"
              data-on={!offLine && i <= to ? "" : undefined}
              data-current={!offLine && i === to ? "" : undefined}
              data-fresh={fresh(i) ? "" : undefined}
              data-origin={!offLine && i === to ? "" : undefined}
              style={delay(i)}
            />
          ))}
        </span>
        <StatusPill status={status} source={source} size="sm" />
      </span>
    );
  }

  const announce = motion.run > 0 ? (toLive ? t("sx.rail.live") : t("sx.rail.aria", { status: labels.status(status, source) })) : "";
  const stepWord: Record<StepState, string> = { done: t("sx.rail.done"), current: t("sx.rail.current"), todo: t("sx.rail.ahead") };
  const liveFresh = animate && toLive;

  return (
    <div ref={wrapRef} id={id} className={cx("sx-rail-wrap", className)}>
      <div className="sx-rail-row">
        <ol key={motion.run} className="sx-rail" aria-label={t("sx.rail.label")} data-tone={info.tone} data-direct={direct ? "" : undefined} data-status={info.key}>
          {Array.from({ length: n }, (_, i) => {
            const state = stateOf(i);
            const stage = stageKey(i, direct);
            const current = state === "current";
            const branch = current && info.branch ? info.branch : null;
            const text = current && (branch || info.key === "scheduled") ? labels.status(status, source) : labels.status(stage);
            const icon = state === "done" ? glyph(CheckIcon, CHECK_GLYPH) : glyph(current ? currentIcon(info, stage) : STATUS_ICON[stage], STAGE_GLYPH);
            return (
              <li
                key={stage}
                className="sx-rail__step"
                data-state={state}
                data-stage={stage}
                data-branch={branch ?? undefined}
                data-fresh={fresh(i) ? "" : undefined}
                aria-current={current ? "step" : undefined}
                style={delay(i)}
              >
                {i > 0 ? (
                  <span className="sx-rail__line" aria-hidden="true">
                    <i />
                  </span>
                ) : null}
                <span className="sx-rail__dot" aria-hidden="true" data-origin={current ? "" : undefined}>
                  {icon}
                </span>
                <span className="sx-rail__label">
                  <span className="sx-rail__text">{text}</span>
                  <span className="sx-vh"> — {stepWord[state]}</span>
                </span>
              </li>
            );
          })}
        </ol>
        {offLine ? <StatusPill status={status} source={source} /> : null}
        {!offLine && info.live ? (
          <span
            className="sx-rail__live"
            data-fresh={liveFresh ? "" : undefined}
            style={liveFresh ? ({ "--d": `${Math.round(lastDelay)}ms` } as CSSProperties) : undefined}
          >
            <StatusPill status="published" />
          </span>
        ) : null}
      </div>
      {note ? <p className="sx-rail__note">{note}</p> : null}
      <span className="sx-vh" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}
