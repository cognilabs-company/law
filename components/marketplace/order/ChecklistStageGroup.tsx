"use client";

import "./checklist-stages.css";
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { IconAlert, IconCheck, IconClock, IconCoins, IconFlag, IconLock, IconSparkle } from "@/components/icons";
import { fmtUzs } from "@/lib/money";
import { firstStageMark, justCompleted, stageAmount, type StageGroup, type StageMark, type StageState } from "./payStages";

// One payout stage of the seller's checklist: the 30% items (paid once every
// one is done or skipped with a reason — the reason stays on the item) or
// the final 40% ones (paid once the order is completed, the 15-minute window
// closes and no hold remains). Its own progress, the
// backend's amount for the stage (the percent alone when there is none),
// and where that money is — from the payout row, never assumed. Used by the
// cabinet's order page and the desktop's order window; the client's
// checklist never shows it.
// How long the "30% is yours" moment keeps its sparkle.
const CHEER_MS = 8000;

// True for a while after the last 30% item is done in front of the seller
// (a save or a live update) — not when an already-done list first loads.
export function useFirstStageCheer(groups: readonly StageGroup[]): boolean {
  const mark = firstStageMark(groups);
  const sig = mark ? `${mark.total}:${mark.complete}` : "";
  const [prev, setPrev] = useState<StageMark>(mark);
  const [cheer, setCheer] = useState(false);
  if ((prev ? `${prev.total}:${prev.complete}` : "") !== sig) {
    setPrev(mark);
    if (justCompleted(prev, mark)) setCheer(true);
    else if (!mark?.complete) setCheer(false);
  }
  useEffect(() => {
    if (!cheer) return;
    const tm = window.setTimeout(() => setCheer(false), CHEER_MS);
    return () => window.clearTimeout(tm);
  }, [cheer]);
  return cheer;
}

const BADGE_ICON: Readonly<Record<StageState, typeof IconCheck>> = {
  open: IconClock,
  recording: IconCheck,
  sending: IconClock,
  paid: IconCheck,
  issue: IconAlert,
  held: IconLock,
};

export default function ChecklistStageGroup({ group: g, idBase, celebrate, ai, children }: { group: StageGroup; idBase: string; celebrate: boolean; ai: string; children: ReactNode }): ReactElement {
  const t = useTranslations("marketplace.orderDetail.payStage");
  const cheerRef = useRef<HTMLDivElement>(null);
  const first = g.stage === "first_checklist";
  const amount = stageAmount(g);
  const money = amount !== null ? `${fmtUzs(amount)} ${t("som")}` : "";
  const share = money ? t("shareWith", { percent: g.percent, amount: money }) : t("share", { percent: g.percent });
  const headId = `${idBase}-h`;
  const pct = g.total ? Math.round((g.done / g.total) * 100) : 0;
  const BadgeIcon = BADGE_ICON[g.state];
  const reached = first ? g.state !== "open" : g.state === "sending" || g.state === "paid" || g.state === "held" || g.state === "issue";

  // The moment the last 30% item is done: bring the news into view.
  useEffect(() => {
    if (!celebrate) return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    cheerRef.current?.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  }, [celebrate]);

  return (
    <section className="cps" data-stage={g.stage} data-state={g.state} data-complete={g.complete ? "" : undefined} aria-labelledby={headId} data-ai-id={ai} data-ai-type="section" data-ai-private>
      <header className="cps__h">
        <span className="cps__ic" aria-hidden="true">
          {first ? <IconCoins /> : <IconFlag />}
        </span>
        <span className="cps__t">
          <b id={headId}>{t(`title.${g.stage}`, { percent: g.percent })}</b>
          <small>{t(`lead.${g.stage}`)}</small>
        </span>
        <span className="cps__pay">
          <b className="cps__amt" data-known={money ? "" : undefined}>
            {money ? (
              <>
                <em>{t("share", { percent: g.percent })}</em>
                <span className="sx-num">{money}</span>
              </>
            ) : (
              <span>{t("share", { percent: g.percent })}</span>
            )}
          </b>
          <span className="cps__badge" data-state={g.state}>
            <BadgeIcon aria-hidden />
            {t(`badge.${g.state}.${g.stage}`)}
          </span>
        </span>
      </header>
      <div className="cps__bar">
        <span className="cps__track" role="progressbar" aria-valuemin={0} aria-valuemax={g.total} aria-valuenow={g.done} aria-label={t("progressAria", { stage: t(`title.${g.stage}`, { percent: g.percent }) })}>
          <i style={{ width: `${pct}%` }} />
        </span>
        <span className="cps__count sx-num">
          {t("progress", { done: g.done, total: g.total })}
          {g.skipped ? <small className="cps__skip">{t("skipped", { n: g.skipped })}</small> : null}
        </span>
      </div>
      {first && !reached && g.left > 0 ? (
        <p className="cps__hint">
          <IconCoins aria-hidden />
          <span>{t("todo", { n: g.left, share })}</span>
        </p>
      ) : null}
      {!first && !reached ? (
        <p className="cps__hint" data-tone="calm">
          <IconFlag aria-hidden />
          <span>{t("finalWhen", { share })}</span>
        </p>
      ) : null}
      {children}
      {reached ? (
        <div ref={cheerRef} className="cps__cheer" data-state={g.state} data-celebrate={celebrate ? "" : undefined} role="status" aria-live="polite">
          <span className="cps__cheer-ic" aria-hidden="true">
            {g.state === "paid" || g.state === "sending" ? <IconCoins /> : g.state === "issue" ? <IconAlert /> : g.state === "held" ? <IconLock /> : <IconCheck />}
            {celebrate && (g.state === "paid" || g.state === "sending" || g.state === "recording") ? (
              <span className="cps__spark">
                <IconSparkle />
                <IconSparkle />
                <IconSparkle />
              </span>
            ) : null}
          </span>
          <span className="cps__cheer-t">
            <b>{t(`cheer.${g.stage}.${g.state}.title`, { share, percent: g.percent })}</b>
            <small>{t(`cheer.${g.stage}.${g.state}.text`, { share, percent: g.percent })}</small>
          </span>
        </div>
      ) : null}
    </section>
  );
}
