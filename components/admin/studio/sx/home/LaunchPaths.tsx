"use client";

import "../sx-tones.css";
import "./sx-home.css";
import { useId, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { aiId } from "@/lib/ai/ids";
import type { StudioConstructor, StudioJourney } from "@/lib/services/studio";
import { enterStyle } from "../hooks";
import { ArrowRightIcon, CircleCheckIcon, RouteIcon, glyph } from "../icons";
import { SxRing } from "../shared/Ring";
import { groupHue, type SxHue } from "../tones";
import { useStudioLabels } from "../useStudioLabels";
import { launchSteps } from "./groupModel";
import { StepMap } from "./StepMap";

const enc = encodeURIComponent;

function hueOf(j: StudioJourney, items: readonly StudioConstructor[], i: number): SxHue {
  const first = j.steps.map((s) => items.find((c) => c.code === s.code)?.navigation).find((n) => !!n?.groupKey);
  return first ? groupHue(first.groupKey, first.groupOrder) : groupHue("", i + 1);
}

export function LaunchPaths({ journeys, items }: { journeys: readonly StudioJourney[]; items: readonly StudioConstructor[] }): ReactElement | null {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const headingId = useId();
  if (!journeys.length) return null;
  return (
    <section id="paths" className="sx-home__paths" aria-labelledby={headingId}>
      <div className="sx-home__hrow">
        <h2 id={headingId} className="sx-home__h">
          {t("sx.journeyRun.launchPaths")}
        </h2>
        <span className="sx-home__hcount sx-num">{labels.num(journeys.length)}</span>
      </div>
      <ul className="sx-lpgrid">
        {journeys.map((j, i) => {
          const name = labels.journeyName(j.key, j.title);
          const what = labels.journeyWhat(j.key, j.description);
          const total = j.steps.length;
          const progress = t("sx.journeyRun.progress", { done: j.completed, total });
          const pct = Math.round(Math.max(0, Math.min(100, j.progress)));
          const rows = launchSteps(j, items);
          const steps = rows.map((r) => ({ code: r.code, step: r.step, name: labels.ctorName(r.code, r.ctor?.title), state: r.state }));
          const done = total > 0 && j.completed >= total;
          const nextStep = steps.find((st) => st.state === "next");
          return (
            <li key={j.key} className="sx-enter" style={enterStyle(Math.min(i, 12))}>
              <Link href={`/admin/studio/j/${enc(j.key)}`} className="sx-lpcard sx-lift" data-hue={hueOf(j, items, i)} data-ai-id={aiId("admin.studio.home.path", j.key)} data-ai-type="list_item" data-ai-label={name}>
                <span className="sx-lpcard__top">
                  <span className="sx-lpcard__tile sx-sq">{glyph(RouteIcon, { size: 22 })}</span>
                  <span className="sx-lpcard__id">
                    <span className="sx-lpcard__name">{name}</span>
                    <span className="sx-lpcard__meta sx-num">{progress}</span>
                  </span>
                  <SxRing value={pct} size={42} stroke={4} label={`${name}: ${progress}`} className="sx-lpcard__ring">
                    <span className="sx-lpcard__pct">{t("sx.journeyRun.percent", { n: pct })}</span>
                  </SxRing>
                </span>
                {what ? (
                  <span className="sx-lpcard__what" title={what}>
                    {what}
                  </span>
                ) : null}
                <StepMap steps={steps} label={t("sx.hm.card.map", { name })} className="sx-lpcard__map" />
                <span className="sx-lpcard__foot">
                  <span className="sx-lpcard__state" data-done={done ? "" : undefined}>
                    {done ? glyph(CircleCheckIcon, { size: 14 }) : null}
                    <span className="sx-lpcard__statet">{done ? t("sx.home.card.allDone") : nextStep ? `${t("sx.guide.next")}: ${nextStep.name}` : t("sx.journeyRun.launchPath")}</span>
                  </span>
                  <span className="sx-lpcard__go">{glyph(ArrowRightIcon, { size: 16 })}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
