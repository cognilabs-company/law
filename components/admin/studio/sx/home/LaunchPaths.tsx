"use client";

import "./sx-home.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { aiId } from "@/lib/ai/ids";
import type { StudioConstructor, StudioJourney } from "@/lib/services/studio";
import { CaretRightIcon, glyph } from "../icons";
import { SxPanel } from "../layout/Panel";
import { SxProgress } from "../shared/Progress";
import { useStudioLabels } from "../useStudioLabels";

const enc = encodeURIComponent;

export function LaunchPaths({ journeys }: { journeys: readonly StudioJourney[]; items: readonly StudioConstructor[] }): ReactElement | null {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  if (!journeys.length) return null;
  return (
    <SxPanel as="section" flush id="paths" className="sx-hpanel" title={t("sx.journeyRun.launchPaths")} titleAs="h2">
      <ul className="sx-hlist">
        {journeys.map((j) => {
          const name = labels.journeyName(j.key, j.title);
          const what = labels.journeyWhat(j.key, j.description);
          const progress = t("sx.journeyRun.progress", { done: j.completed, total: j.steps.length });
          return (
            <li key={j.key}>
              <Link href={`/admin/studio/j/${enc(j.key)}`} className="sx-hrow" data-noicon="" data-ai-id={aiId("admin.studio.home.path", j.key)} data-ai-type="list_item" data-ai-label={name}>
                <span className="sx-hrow__main">
                  <span className="sx-hrow__title">{name}</span>
                  {what ? (
                    <span className="sx-hrow__meta" title={what}>
                      {what}
                    </span>
                  ) : null}
                </span>
                <span className="sx-hrow__side">
                  <span className="sx-hrow__pct sx-num">{progress}</span>
                  <SxProgress value={j.progress} label={`${name}: ${progress}`} size="sm" className="sx-hrow__bar sx-hrow__bar--wide" />
                </span>
                <span className="sx-hrow__caret">{glyph(CaretRightIcon, { size: 16 })}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </SxPanel>
  );
}
