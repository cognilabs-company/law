"use client";

import "./sx-home.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { HistoryIcon, glyph } from "../icons";
import { useNow } from "../live";
import { useStudioLabels } from "../useStudioLabels";
import type { LastActivity as LastActivityData } from "./summary";

export type LastActivityProps = { last: LastActivityData | null; aiId: string; className?: string; compact?: boolean };

export function lastActivityHref(last: LastActivityData | null): string {
  return last?.objectId ? `/admin/studio/o/${encodeURIComponent(last.objectId)}` : "";
}

export function LastActivity({ last, aiId, className, compact = false }: LastActivityProps): ReactElement | null {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const now = useNow();
  if (!last?.at) return null;
  const age = now ? labels.ago(last.at, now) : "";
  const when = age ? t("sx.mon.ago", { v: age }) : labels.date(last.at);
  const full = t("sx.hm.last.full", { when, name: labels.ctorName(last.code) });
  const body = (
    <>
      {glyph(HistoryIcon, { size: 13 })}
      <span className={compact ? "sx-vh" : "sx-last__k"}>{t("sx.hm.last.label")}</span>
      <time className="sx-last__t sx-num" dateTime={last.at} title={labels.dateTime(last.at)}>
        {when}
      </time>
    </>
  );
  const cls = className ? `sx-last ${className}` : "sx-last";
  const href = lastActivityHref(last);
  if (!href)
    return (
      <span className={cls} title={full} data-ai-id={aiId} data-ai-type="stat" data-ai-label={full}>
        {body}
      </span>
    );
  return (
    <Link href={href} className={cls} data-link="" aria-label={full} title={full} data-ai-id={aiId} data-ai-type="link" data-ai-label={full}>
      {body}
    </Link>
  );
}
