"use client";

import "./servicesBanner.css";
import { useId, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { IconArrowRight, IconBriefcase, IconClose, IconSearch } from "@/components/icons";
import { fmtUzs } from "@/lib/money";
import { useFitPlaceholder } from "@/lib/useFitPlaceholder";

// The "Xizmatlar bo'yicha" view's own banner: the marketplace banner speaks
// about finding a specialist, this one about picking a priced service. Kept
// compact — a name, one line on how it works, the service search (which
// drives the cards below) and three facts from the live catalog.
export default function ServicesBanner({
  query,
  onQuery,
  onFind,
  stats,
  loading,
}: {
  query: string;
  onQuery: (v: string) => void;
  /** "Topish": the cards are already filtered as you type; this brings them into view. */
  onFind: () => void;
  stats: { services: number; min: number; areas: number };
  loading: boolean;
}) {
  const t = useTranslations("mkServices");
  const uid = useId();
  const [ph, qRef] = useFitPlaceholder([t("searchPh"), t("searchPhShort")]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onFind();
  };
  const num = (n: number) => (loading ? "—" : String(n));
  return (
    <section className="mksb" aria-labelledby={`${uid}-t`} data-ai-target="marketplace:services-banner">
      <div className="mksb__glow" aria-hidden="true" />
      <div className="mksb__in">
        <div className="mksb__main">
          <span className="mksb__kick">
            <IconBriefcase aria-hidden="true" />
            {t("kicker")}
          </span>
          <h2 id={`${uid}-t`} className="mksb__t">{t("title")}</h2>
          <p className="mksb__l">{t("lead")}</p>
          <form className="mksb__search" role="search" onSubmit={submit}>
            <IconSearch aria-hidden="true" />
            <input
              ref={qRef}
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder={ph}
              aria-label={t("searchLabel")}
              data-ai-id="marketplace.services-banner.search"
            />
            {query ? (
              <button type="button" className="mksb__x" onClick={() => onQuery("")} aria-label={t("clear")}>
                <IconClose />
              </button>
            ) : null}
            <button type="submit" className="mksb__go">
              <span>{t("find")}</span>
              <IconArrowRight aria-hidden="true" />
            </button>
          </form>
        </div>
        {/* term first for the dl's sake; the number is lifted above it in CSS */}
        <dl className="mksb__stats">
          <div>
            <dt>{t("stats.services")}</dt>
            <dd>{num(stats.services)}</dd>
          </div>
          <div>
            <dt>{t("stats.from")}</dt>
            <dd>{loading || !stats.min ? "—" : fmtUzs(stats.min)}</dd>
          </div>
          <div>
            <dt>{t("stats.areas")}</dt>
            <dd>{num(stats.areas)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
