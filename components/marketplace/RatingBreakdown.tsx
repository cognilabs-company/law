"use client";

import "./ratingBreakdown.css";
import { useEffect, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconStarRate } from "@/components/icons";
import { shortDateTime } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { getMySellerRating, getSellerRating, type SellerRating } from "@/lib/services/sellerRating";

// How a seller's rating is made up (TSK-332221): the score or "not rated
// yet", then each factor as a bar with what it rests on. `mine` reads the
// seller's own rating; otherwise the public one for `sellerId`.

const fmtWait = (sec: number, t: (k: string, v?: Record<string, number>) => string) => {
  const m = Math.round(sec / 60);
  return m < 60 ? t("minutes", { n: Math.max(1, m) }) : t("hours", { n: Math.round((m / 60) * 10) / 10 });
};

export default function RatingBreakdown({ sellerId, mine = false, compact = false }: { sellerId?: string; mine?: boolean; compact?: boolean }): ReactElement | null {
  const t = useTranslations("marketplace.ratingBreakdown");
  const locale = useLocale();
  const key = mine ? "me" : (sellerId ?? "");
  const [state, setState] = useState<{ key: string; data: SellerRating | null; failed: boolean }>({ key: "", data: null, failed: false });

  useEffect(() => {
    if (!key) return;
    const ctl = new AbortController();
    (mine ? getMySellerRating(ctl.signal) : getSellerRating(key, ctl.signal)).then(
      (data) => setState({ key, data, failed: false }),
      (e) => {
        if (isAborted(e)) return;
        logApiError("rating.breakdown", e);
        setState({ key, data: null, failed: true });
      },
    );
    return () => ctl.abort();
  }, [key, mine]);

  if (!key || state.failed || (state.key === key && !state.data)) return null;
  if (state.key !== key) return <section className="rbd rbd--ghost" aria-hidden="true" />;
  const r = state.data as SellerRating;
  const label = (k: string) => (t.has(`factor.${k}`) ? t(`factor.${k}`) : k);
  const hint = (k: string) => (t.has(`hint.${k}`) ? t(`hint.${k}`) : "");

  return (
    <section className={`rbd${compact ? " rbd--compact" : ""}`} aria-label={mine ? t("titleMine") : t("title")} data-ai-id={mine ? "seller.rating.breakdown" : "marketplace.seller.rating"}>
      <div className="rbd__head">
        <div className="rbd__score" data-rated={r.rated || undefined}>
          {r.rated && r.publicRating !== null ? (
            <>
              <IconStarRate aria-hidden="true" />
              <b className="sx-num">{r.publicRating.toFixed(1)}</b>
              <small>{t("reviews", { n: r.reviews })}</small>
            </>
          ) : (
            <>
              <b className="rbd__unrated">{r.unratedText || t("unrated")}</b>
              <small>{t("unratedWhy")}</small>
            </>
          )}
        </div>
        <div className="rbd__titles">
          <h2>{mine ? t("titleMine") : t("title")}</h2>
          <p>{mine ? t("leadMine") : t("lead")}</p>
        </div>
        {r.rankingScore !== null ? (
          <div className="rbd__rank">
            <b className="sx-num">{Math.round(r.rankingScore)}</b>
            <small>{t("ranking")}</small>
          </div>
        ) : null}
      </div>

      <ul className="rbd__bars">
        {r.components.map((c) => (
          <li key={c.key} title={hint(c.key) || undefined}>
            <span className="rbd__lab">{label(c.key)}</span>
            <span className="rbd__bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(c.score)} aria-label={label(c.key)}>
              <i style={{ width: `${c.score}%` }} data-level={c.score >= 70 ? "hi" : c.score >= 40 ? "mid" : "lo"} />
            </span>
            <b className="sx-num">{Math.round(c.score)}</b>
          </li>
        ))}
      </ul>

      <dl className="rbd__facts">
        <div>
          <dt>{t("completed")}</dt>
          <dd className="sx-num">{t("ofN", { n: r.completed, of: r.terminal })}</dd>
        </div>
        {r.responseSeconds !== null ? (
          <div>
            <dt>{t("response")}</dt>
            <dd>{fmtWait(r.responseSeconds, t)}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t("experience")}</dt>
          <dd>{r.experienceYears ? t("years", { n: r.experienceYears }) : t("noExperience")}</dd>
        </div>
      </dl>

      {r.calculatedAt || r.policyVersion !== null ? (
        <p className="rbd__foot">{[r.calculatedAt ? t("calculatedAt", { date: shortDateTime(r.calculatedAt, locale) }) : "", r.policyVersion !== null ? t("policy", { n: r.policyVersion }) : ""].filter(Boolean).join(" · ")}</p>
      ) : null}
    </section>
  );
}
