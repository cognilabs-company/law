"use client";

import "./sx-core.css";
import "./sx-rail.css";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { celebrate } from "./celebrate";
import { prefersReducedMotion, useReducedMotion } from "./hooks";
import { CheckIcon, glyph, STATUS_ICON } from "./icons";
import { playStage, stageKeyOf, useStageText, type SxStageKey } from "./stage/stage";
import { StatusPill } from "./StatusPill";
import { stageCount, stageKey, stageOnLine, sxStatus } from "./status";
import type { SxIcon, SxRecordSource, SxStage, SxStatusInfo, SxStatusKey, SxTone } from "./types";
import { useStudioLabels } from "./useStudioLabels";

export type StatusRailProps = {
  status: string;
  source?: SxRecordSource;
  direct?: boolean;
  variant?: "full" | "compact";
  note?: ReactNode;
  celebrateOnPublish?: boolean;
  announce?: boolean;
  id?: string;
  className?: string;
};

type Seen = { status: string; prev: string; from: number; run: number };
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

const STAGE_TONE: Readonly<Record<SxStage, SxTone>> = { draft: "draft", submitted: "submitted", in_review: "review", approved: "approved", published: "published" };

const SCENE_ALIAS: Partial<Readonly<Record<SxStatusKey, SxStageKey>>> = { scheduled: "approved", active: "published" };

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

function sceneOf(status: string, source: SxRecordSource | undefined): SxStageKey | null {
  const key = sxStatus(status, source).key;
  return SCENE_ALIAS[key] ?? stageKeyOf(key);
}

function useStatusMotion(status: string, source: SxRecordSource | undefined, direct: boolean): Seen {
  const [seen, setSeen] = useState<Seen>({ status, prev: status, from: -2, run: 0 });
  if (seen.status !== status) {
    const next: Seen = { status, prev: seen.status, from: stageOnLine(sxStatus(seen.status, source), direct), run: seen.run + 1 };
    setSeen(next);
    return next;
  }
  return seen;
}

function currentIcon(info: SxStatusInfo, stage: SxStage): SxIcon {
  return info.branch || info.key === "scheduled" ? info.icon : STATUS_ICON[stage];
}

export function StatusRail({ status, source, direct = false, variant = "full", note, celebrateOnPublish = true, announce = false, id, className }: StatusRailProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const reduced = useReducedMotion();
  const motion = useStatusMotion(status, source, direct);
  const wrapRef = useRef<HTMLDivElement>(null);
  const compactRef = useRef<HTMLSpanElement>(null);
  const stageText = useStageText();
  const playedRun = useRef(0);

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
  const sceneTo = announce && !compact && motion.run > 0 ? sceneOf(status, source) : null;
  const sceneFrom = sceneTo ? sceneOf(motion.prev, source) : null;
  const staged = !!sceneTo && sceneTo !== sceneFrom;
  const party = toLive && animate && celebrateOnPublish && !staged;

  useEffect(() => {
    if (!staged || !sceneTo || playedRun.current === motion.run) return;
    playedRun.current = motion.run;
    const crossed = motion.from >= 0 && info.branch === null && to - motion.from > 1;
    const steps = crossed ? Array.from({ length: to - motion.from }, (_, i) => stageKey(motion.from + 1 + i, direct)) : undefined;
    const origin = wrapRef.current?.querySelector('[aria-current="step"] .sx-rail__dot') ?? null;
    const { title, text } = stageText(sceneTo);
    playStage({ to: sceneTo, from: sceneFrom, steps, origin, title, text });
  }, [staged, sceneTo, sceneFrom, motion.run, motion.from, info.branch, to, direct, stageText]);

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

  const liveText = motion.run > 0 && !staged ? (toLive ? t("sx.rail.live") : t("sx.rail.aria", { status: labels.status(status, source) })) : "";
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
            const from = i > 0 && state !== "todo" ? ({ "--rail-from": `var(--sx-${STAGE_TONE[stageKey(i - 1, direct)]}-fg)` } as CSSProperties) : undefined;
            const style = from || fresh(i) ? { ...from, ...delay(i) } : undefined;
            return (
              <li
                key={stage}
                className="sx-rail__step"
                data-state={state}
                data-stage={stage}
                data-tone={state === "done" ? STAGE_TONE[stage] : undefined}
                data-branch={branch ?? undefined}
                data-fresh={fresh(i) ? "" : undefined}
                aria-current={current ? "step" : undefined}
                style={style}
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
        {liveText}
      </span>
    </div>
  );
}
