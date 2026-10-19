"use client";

import "../sx-core.css";
import "../sx-tones.css";
import "./sx-ap2.css";
import type { ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { MinusIcon } from "lucide-react";
import { CheckIcon, ClockIcon, ctorGlyph, glyph } from "../icons";
import { StatusPill } from "../StatusPill";
import { SX_STAGES, sxStatus } from "../status";
import { useStudioLabels } from "../useStudioLabels";

const DAY_MS = 86_400_000;

export type AgeTone = "new" | "fresh" | "warn" | "late";

export function ageDays(since: number, now: number): number | null {
  if (!now || !Number.isFinite(since) || since >= Number.MAX_SAFE_INTEGER) return null;
  return Math.max(0, Math.floor((now - since) / DAY_MS));
}

export function ageTone(days: number | null): AgeTone | undefined {
  if (days === null) return undefined;
  if (days >= 7) return "late";
  if (days >= 3) return "warn";
  return days === 0 ? "new" : "fresh";
}

export function railAt(status: string): number {
  const info = sxStatus(status);
  return info.stage < 0 ? 0 : info.stage + 1;
}

export function MiniRail({ status }: { status: string }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const info = sxStatus(status);
  const total = SX_STAGES.length;
  const at = railAt(status);
  const tip = t("sx.ap2.rail.tip", { n: at, total, status: labels.status(status) });
  return (
    <span className="sx-ap2-st" title={tip}>
      <span className="sx-ap2-rail" data-tone={info.tone} data-branch={info.branch ?? undefined} aria-hidden="true">
        {SX_STAGES.map((s, i) => (
          <i key={s} data-on={i < at ? "" : undefined} data-cur={i === at - 1 ? "" : undefined} />
        ))}
      </span>
      <span className="sx-vh">{t("sx.ap2.rail.sr", { n: at, total })}</span>
      <StatusPill status={status} size="sm" />
    </span>
  );
}

export function AgeChip({ at, since, now }: { at: string; since: number; now: number }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const days = ageDays(since, now);
  const tone = ageTone(days);
  const full = labels.dateTime(at);
  return (
    <time className="sx-ap2-age" dateTime={at} title={t("sx.ap2.age.tip", { date: full })} data-tone={tone}>
      {tone === "new" ? <span className="sx-ap2-age__dot" aria-hidden="true" /> : glyph(ClockIcon, { size: 13 })}
      <span>{now ? labels.ago(at, now) : labels.date(at)}</span>
      {tone === "late" || tone === "warn" || tone === "new" ? <span className="sx-vh">{t(`sx.ap2.age.${tone}`)}</span> : null}
    </time>
  );
}

export function CtorTile({ code, group, hue }: { code: string; group: string; hue?: string }): ReactElement {
  return (
    <span className="sx-ap2-sq" data-hue={hue} aria-hidden="true">
      {ctorGlyph(code, group, { size: 17 })}
    </span>
  );
}

export type PickBoxProps = {
  checked: boolean;
  mixed?: boolean;
  onToggle: () => void;
  label?: string;
  aiId: string;
  className?: string;
  children?: ReactNode;
};

export function PickBox({ checked, mixed = false, onToggle, label, aiId, className, children }: PickBoxProps): ReactElement {
  const state = mixed ? "mixed" : checked;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state}
      aria-label={children ? undefined : label}
      className={className ? `sx-ap2-ck ${className}` : "sx-ap2-ck"}
      onClick={onToggle}
      data-ai-id={aiId}
      data-ai-type="checkbox"
      data-ai-label={label}
    >
      <span className="sx-ap2-ck__box" aria-hidden="true">
        {mixed ? glyph(MinusIcon, { size: 14, strokeWidth: 2.75 }) : checked ? glyph(CheckIcon, { size: 14, strokeWidth: 2.75 }) : null}
      </span>
      {children}
    </button>
  );
}
