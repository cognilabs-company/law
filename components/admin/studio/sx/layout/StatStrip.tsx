"use client";

import "../sx-core.css";
import "../sx-layout.css";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { SxTone } from "../types";
import { useStudioLabels } from "../useStudioLabels";
import { cx } from "./util";

export type SxStat = { key: string; label: string; value: number | null; href?: string; tone?: SxTone | "neutral"; hint?: string; aiId?: string };
export type SxStatStripProps = { items: readonly SxStat[]; label: string; loading?: boolean; className?: string };

export function SxStatStrip({ items, label, loading = false, className }: SxStatStripProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  return (
    <ul className={cx("sx-stats", className)} aria-label={label} aria-busy={loading || undefined} style={{ "--n": Math.max(1, items.length) } as CSSProperties}>
      {items.map((s) => {
        const tone = s.tone && s.tone !== "neutral" ? s.tone : undefined;
        const v = typeof s.value === "number" && Number.isFinite(s.value) ? s.value : null;
        const value: ReactNode = loading ? (
          <span className="sx-sk sx-stat__sk" aria-hidden="true" />
        ) : v === null ? (
          <>
            <span aria-hidden="true">—</span>
            <span className="sx-vh">{t("sx.ui.notSet")}</span>
          </>
        ) : (
          labels.num(v)
        );
        const inner = (
          <>
            <span className="sx-stat__label">
              {tone ? <span className="sx-stat__dot" aria-hidden="true" /> : null}
              {s.label}
            </span>
            <span className="sx-stat__value sx-num">{value}</span>
            {s.hint ? <span className="sx-stat__hint">{s.hint}</span> : null}
          </>
        );
        return (
          <li key={s.key} className="sx-stat" data-tone={tone}>
            {s.href ? (
              <Link href={s.href} className="sx-stat__in" data-link="" data-ai-id={s.aiId} data-ai-type={s.aiId ? "link" : undefined} data-ai-label={s.aiId ? s.label : undefined}>
                {inner}
              </Link>
            ) : (
              <div className="sx-stat__in">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
