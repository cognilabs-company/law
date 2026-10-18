"use client";

import { useCallback, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { useStudioRegistry } from "@/lib/services/studio";
import { groupOfCode } from "../home/groupModel";
import { ctorIcon, glyph } from "../icons";
import { useNow } from "../live";
import { groupHue, type SxHue } from "../tones";
import type { SxIcon } from "../types";
import { useStudioLabels } from "../useStudioLabels";
import { DAY_MS, avatarHue, clock, initialsOf, isoAt, localDayKey, type MonSession } from "./model";

export type CtorLook = { icon: SxIcon; hue: SxHue | "neutral" };

export function useCtorLook(): (code: string) => CtorLook {
  const reg = useStudioRegistry();
  const { groups, items } = reg;
  return useCallback(
    (code: string) => {
      if (!code) return { icon: ctorIcon(""), hue: "neutral" };
      const key = groupOfCode(code, groups, items);
      const g = key ? groups.find((x) => x.key === key) : undefined;
      return { icon: ctorIcon(code, key), hue: key ? groupHue(key, g?.order ?? 1) : "neutral" };
    },
    [groups, items],
  );
}

export function Squircle({ icon, hue, size = "md" }: { icon: SxIcon; hue: SxHue | "neutral" | string; size?: "sm" | "md" | "lg" }): ReactElement {
  return (
    <span className="sx-mon-sq" data-hue={hue === "neutral" ? undefined : hue} data-size={size} aria-hidden="true">
      {glyph(icon, { size: size === "lg" ? 22 : size === "sm" ? 15 : 18 })}
    </span>
  );
}

export function Avatar({ name, seed, live = false, size = "md" }: { name: string; seed: string; live?: boolean; size?: "sm" | "md" | "lg" }): ReactElement {
  return (
    <span className="sx-mon-av" data-hue={avatarHue(seed || name)} data-size={size} data-live={live ? "" : undefined} aria-hidden="true">
      <span className="sx-mon-av__in">{initialsOf(name)}</span>
      {live ? <span className="sx-mon-av__dot" /> : null}
    </span>
  );
}

export function liveSeconds(s: MonSession, now: number): number {
  if (!s.live || !now || !s.at) return s.sec;
  return s.a.durationSec + Math.max(0, (now - s.at) / 1000);
}

export function LiveClock({ session }: { session: MonSession }): ReactElement {
  const now = useNow(1000);
  return (
    <span className="sx-mon-clock sx-num" aria-live="off">
      {clock(liveSeconds(session, now))}
    </span>
  );
}

export type MonFormat = {
  dur: (sec: number) => string;
  ago: (ms: number, now: number) => string;
  dayName: (key: string, now: number) => string;
  num: (n: number) => string;
};

export function useMonFormat(): MonFormat {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const dur = (sec: number) => {
    const s = Math.max(0, Math.round(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return t("fmt.hm", { h, m });
    if (m > 0) return t("fmt.m", { m });
    return t("fmt.s", { s });
  };
  const ago = (ms: number, now: number) => {
    if (!Number.isFinite(ms)) return "";
    if (!now) return labels.dateTime(isoAt(ms));
    if (now - ms < 60_000) return t("fmt.justNow");
    return t("sx.mon.ago", { v: labels.ago(isoAt(ms), now) });
  };
  const dayName = (key: string, now: number) => {
    if (!key) return "—";
    if (now && key === localDayKey(now)) return t("monitoring.period.today");
    if (now && key === localDayKey(now - DAY_MS)) return t("monitoring.period.yesterday");
    return labels.date(`${key}T12:00:00+05:00`);
  };
  return { dur, ago, dayName, num: labels.num };
}
