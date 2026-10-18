"use client";

import "../sx-tones.css";
import "./sx-home.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { aiId } from "@/lib/ai/ids";
import { useStudioAccess } from "@/lib/services/studio";
import { approvalsHref } from "../approvals/urlState";
import { enterStyle } from "../hooks";
import { ArrowRightIcon, Undo2Icon, CircleCheckIcon, HourglassIcon, LockIcon, RocketIcon, ctorIcon, glyph } from "../icons";
import { SxRing } from "../shared/Ring";
import type { SxHue } from "../tones";
import type { SxIcon } from "../types";
import { useStudioLabels } from "../useStudioLabels";
import { GroupTile } from "./GroupTile";
import { StepMap, type StepMapStep } from "./StepMap";

export type GroupCardKind = "returned" | "review" | "publish";
export type GroupCardModel = {
  key: string;
  order: number;
  hue: SxHue;
  name: string;
  what: string;
  done: number;
  total: number;
  blocked: number;
  records: number | null;
  steps: readonly StepMapStep[];
  next: { code: string; name: string } | null;
  counts: Readonly<Record<GroupCardKind, number>>;
};
export type GroupCardProps = { model: GroupCardModel; loadingCounts: boolean; index?: number };

export const NEED_KINDS: readonly GroupCardKind[] = ["returned", "review", "publish"];
export const NEED_ICON: Readonly<Record<GroupCardKind, SxIcon>> = { returned: Undo2Icon, review: HourglassIcon, publish: RocketIcon };

const enc = encodeURIComponent;

export function groupHref(key: string, need?: GroupCardKind): string {
  return `/admin/studio/g/${enc(key)}${need ? `?need=${need}` : ""}`;
}

export function pctOf(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

export function GroupCard({ model, loadingCounts, index = 0 }: GroupCardProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const acc = useStudioAccess();
  const { key, order, hue, name, what, done, total, blocked, records, steps, next, counts } = model;
  const base = aiId("admin.studio.home.group", key);
  const href = groupHref(key);
  const pct = pctOf(done, total);
  const needHref = (k: GroupCardKind) => (acc.canReview ? approvalsHref({ group: key, need: k }) : groupHref(key, k));
  const nextLabel = next ? t("sx.home.card.next", { name: next.name }) : "";
  const meta = [t("sx.hm.card.ctors", { n: total }), records === null ? "" : t("sx.hm.card.records", { n: records })].filter(Boolean).join(" · ");
  return (
    <li className="sx-gcard sx-lift sx-enter" data-hue={hue} data-done={next ? undefined : ""} style={enterStyle(Math.min(index, 12))}>
      <div className="sx-gcard__top">
        <GroupTile groupKey={key} order={order} size="lg" />
        <div className="sx-gcard__id">
          <h3 className="sx-gcard__name">
            <Link className="sx-gcard__link" href={href} data-ai-id={base} data-ai-type="card" data-ai-label={name}>
              {name}
            </Link>
          </h3>
          <p className="sx-gcard__meta sx-num">{meta}</p>
        </div>
        <SxRing value={pct} size={46} stroke={4} label={t("sx.home.card.progressLabel", { name, done, total })} className="sx-gcard__ring">
          <span className="sx-gcard__pct">{t("sx.journeyRun.percent", { n: pct })}</span>
        </SxRing>
      </div>
      <p className="sx-gcard__what">{what}</p>
      <div className="sx-gcard__mapbox">
        <div className="sx-gcard__maphead">
          <span className="sx-gcard__count sx-num">{t("sx.home.card.progress", { done, total })}</span>
          {blocked > 0 ? (
            <span className="sx-gcard__blocked">
              {glyph(LockIcon, { size: 13 })}
              <span>{t("sx.hm.chip.blocked", { n: blocked })}</span>
            </span>
          ) : null}
        </div>
        <StepMap steps={steps} label={t("sx.hm.card.map", { name })} className="sx-gcard__map" />
      </div>
      {loadingCounts ? (
        <div className="sx-gcard__needs" aria-hidden="true">
          <span className="sx-sk sx-gcard__needs-sk" />
          <span className="sx-sk sx-gcard__needs-sk" />
          <span className="sx-sk sx-gcard__needs-sk" />
        </div>
      ) : (
        <ul className="sx-gcard__needs" aria-label={t("sx.hm.card.stats")}>
          {NEED_KINDS.map((k) => {
            const n = counts[k] ?? 0;
            const full = t(`sx.home.card.${k}`, { n });
            const inner = (
              <>
                {glyph(NEED_ICON[k], { size: 14 })}
                <span className="sx-gcard__need-l">{t(`sx.hm.chip.${k}`)}</span>
                <span className="sx-gcard__need-n sx-num">{labels.num(n)}</span>
              </>
            );
            return (
              <li key={k}>
                {n > 0 ? (
                  <Link href={needHref(k)} className="sx-gcard__need" data-kind={k} title={full} aria-label={full} data-ai-id={aiId(base, "need", k)} data-ai-type="link" data-ai-label={full}>
                    {inner}
                  </Link>
                ) : (
                  <span className="sx-gcard__need" data-kind={k} data-zero="" title={full}>
                    <span className="sx-gcard__need-in" aria-hidden="true">
                      {inner}
                    </span>
                    <span className="sx-vh">{full}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="sx-gcard__foot">
        {next ? (
          <Link href={`/admin/studio/c/${enc(next.code)}`} className="sx-gcard__next" aria-label={nextLabel} title={nextLabel} data-ai-id={aiId(base, "next")} data-ai-type="link" data-ai-label={nextLabel}>
            <span className="sx-gcard__next-k">{t("sx.guide.next")}</span>
            <span className="sx-gcard__next-row">
              <span className="sx-gcard__next-ic">{glyph(ctorIcon(next.code, key), { size: 16 })}</span>
              <span className="sx-gcard__next-t">{next.name}</span>
              <span className="sx-gcard__next-go">{glyph(ArrowRightIcon, { size: 16 })}</span>
            </span>
          </Link>
        ) : (
          <Link href={href} className="sx-gcard__next" data-all="" data-ai-id={aiId(base, "view")} data-ai-type="link" data-ai-label={t("sx.home.card.allDone")}>
            <span className="sx-gcard__next-row">
              <span className="sx-gcard__next-ic">{glyph(CircleCheckIcon, { size: 16 })}</span>
              <span className="sx-gcard__next-t">{t("sx.home.card.allDone")}</span>
              <span className="sx-gcard__next-go">{glyph(ArrowRightIcon, { size: 16 })}</span>
            </span>
          </Link>
        )}
      </div>
    </li>
  );
}

export function GroupCardSkeleton({ index = 0 }: { index?: number }): ReactElement {
  return (
    <li className="sx-gcard sx-enter" data-sk="" data-enter="fade" aria-hidden="true" style={enterStyle(index)}>
      <div className="sx-gcard__top">
        <span className="sx-sk sx-gcard__sk-tile" />
        <span className="sx-gcard__id">
          <span className="sx-sk sx-gcard__sk-name" />
          <span className="sx-sk sx-gcard__sk-meta" />
        </span>
        <span className="sx-sk sx-gcard__sk-ring" />
      </div>
      <span className="sx-sk" />
      <span className="sx-sk sx-gcard__sk-map" />
      <span className="sx-sk sx-gcard__sk-btn" />
    </li>
  );
}
