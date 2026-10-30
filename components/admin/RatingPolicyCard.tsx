"use client";

import "./ratingPolicy.css";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconCheck, IconAlert, IconScale } from "@/components/icons";
import { isAborted, isForbidden, logApiError } from "@/lib/http";
import { getRatingPolicy, getRatingStatus, type RatingPolicy, type RatingRecalcStatus } from "@/lib/services/backend";

// TSK-332221: how the marketplace rating is worked out, from the backend's
// own policy — each factor's share, the rules around it (start score, the
// reviews a score needs, penalties) — and whether every seller's rating is
// up to date with this version. Read only; the policy is edited in Studio.
const RULES = ["cold_start_score", "review_confidence_count", "response_target_seconds", "response_zero_score_seconds", "experience_full_score_years", "achievements_full_score_count"] as const;
const PENALTIES = [
  ["complaint_penalty_points", "complaint_penalty_cap"],
  ["refund_penalty_points", "refund_penalty_cap"],
] as const;

export default function RatingPolicyCard({ refreshKey = 0 }: { refreshKey?: number }): ReactElement | null {
  const t = useTranslations("admin.ratingPolicy");
  const [policy, setPolicy] = useState<RatingPolicy | null>(null);
  const [status, setStatus] = useState<RatingRecalcStatus | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const ctl = new AbortController();
    Promise.all([getRatingPolicy(ctl.signal), getRatingStatus(ctl.signal).catch(() => null)]).then(
      ([p, s]) => {
        setPolicy(p);
        setStatus(s);
      },
      (e) => {
        if (isAborted(e)) return;
        if (!isForbidden(e)) logApiError("ratings.policy", e);
        setHidden(true);
      },
    );
    return () => ctl.abort();
  }, [refreshKey]);
  if (hidden || !policy) return null;
  const factor = (k: string) => (t.has(`factor.${k}`) ? t(`factor.${k}`) : t("factor.other"));
  const rule = (k: (typeof RULES)[number]) => (policy.rules[k] === undefined ? null : t(`rule.${k}`, { n: policy.rules[k] }));
  const stale = status ? status.stale + status.missing + status.pending : 0;
  return (
    <section className="ppanel rpol" aria-labelledby="rpol-h" data-ai-target="admin:rating-policy">
      <div className="ppanel__h">
        <b className="ppanel__t" id="rpol-h">
          <span className="pico">
            <IconScale />
          </span>
          {t("title")}
        </b>
        {policy.version !== null ? <span className="rpol__v">{t("version", { n: policy.version })}</span> : null}
      </div>
      <p className="rpol__lead">{t("lead")}</p>
      <ol className="rpol__weights" aria-label={t("weights")}>
        {policy.weights.map((w) => (
          <li key={w.key}>
            <span className="rpol__name">{factor(w.key)}</span>
            <span className="rpol__bar" aria-hidden="true">
              <i style={{ width: `${Math.max(0, Math.min(100, w.percent))}%` }} />
            </span>
            <b className="rpol__pct">{`${w.percent}%`}</b>
          </li>
        ))}
      </ol>
      <ul className="rpol__rules">
        {RULES.map((k) => {
          const text = rule(k);
          return text ? <li key={k}>{text}</li> : null;
        })}
        {PENALTIES.map(([pts, cap]) =>
          policy.rules[pts] !== undefined ? (
            <li key={pts} data-tone="bad">
              {t(`penalty.${pts}`, { n: policy.rules[pts], cap: policy.rules[cap] ?? policy.rules[pts] })}
            </li>
          ) : null,
        )}
      </ul>
      {status ? (
        <p className="rpol__status" data-ok={stale === 0 && status.ready ? "" : undefined} role="status">
          {stale === 0 && status.ready ? <IconCheck aria-hidden="true" /> : <IconAlert aria-hidden="true" />}
          {stale === 0 && status.ready ? t("statusOk", { n: status.current, total: status.profiles }) : t("statusStale", { n: stale, total: status.profiles })}
          {status.reconcileHours ? <small>{t("reconcile", { h: status.reconcileHours })}</small> : null}
        </p>
      ) : null}
      {policy.studioUrl ? (
        <Link href={policy.studioUrl} className="btn btn--line btn--sm rpol__edit">
          {t("edit")}
        </Link>
      ) : null}
    </section>
  );
}
