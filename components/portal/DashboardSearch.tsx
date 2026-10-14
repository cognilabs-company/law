"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { searchServices, type BackendService } from "@/lib/services/backend";
import { searchMarketplaceSellers, type MarketSeller } from "@/lib/services/marketplace";
import { aiId } from "@/lib/ai/ids";
import { useAiField } from "@/lib/ai/registry";
import { initials } from "@/lib/lawyers";
import { personName, regionLabel } from "@/lib/labels";
import { fmtUzs } from "@/lib/money";
import { fmtRating } from "@/lib/date";
import { sellerTypeLabel, specLabel } from "@/components/marketplace/bits";
import { EmptyState, ErrorState, Skeleton } from "@/components/portal/DataState";
import {
  IconArrowRight,
  IconBriefcase,
  IconClose,
  IconFileText,
  IconMapPin,
  IconSearch,
  IconShieldCheck,
  IconSparkle,
  IconStar,
} from "@/components/icons";

const FILTERS = ["all", "advokat", "yurist", "services"] as const;
type Filter = (typeof FILTERS)[number];
const isFilter = (v: string | null): v is Filter => !!v && (FILTERS as readonly string[]).includes(v);
const SUGGEST = ["divorce", "inheritance", "labor", "contract"] as const;
const MIN = 2;
const SHOW = 5;

type Part<T> = { ok: true; items: T[]; total: number } | { ok: false; error: unknown };
type Result = { key: string; people: Part<MarketSeller> | null; services: Part<BackendService> | null };

const enc = encodeURIComponent;

export function DashboardSearchShell() {
  const t = useTranslations("portal.client.dashboard.search");
  return (
    <section className="cdsrch" aria-hidden="true">
      <div className="cdsrch__box">
        <IconSearch />
        <input type="search" placeholder={t("placeholder")} readOnly tabIndex={-1} />
      </div>
      <div className="cdsrch__chips">
        {FILTERS.map((f) => (
          <span key={f} className="fchip" aria-pressed={f === "all"}>{t(`filters.${f}`)}</span>
        ))}
      </div>
      <div className="cdsrch__try">
        <span>{t("try")}</span>
        {SUGGEST.map((k) => (
          <span key={k} className="cdsrch__tag">{t(`suggest.${k}`)}</span>
        ))}
      </div>
    </section>
  );
}

export default function DashboardSearch() {
  const t = useTranslations("portal.client.dashboard.search");
  const tm = useTranslations("marketplace");
  const te = useTranslations("enums");
  const locale = useLocale();
  const params = useSearchParams();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(() => params.get("q") ?? "");
  const [term, setTerm] = useState(() => (params.get("q") ?? "").trim());
  const [filter, setFilter] = useState<Filter>(() => {
    const f = params.get("f");
    return isFilter(f) ? f : "all";
  });
  const [attempt, setAttempt] = useState(0);
  const [res, setRes] = useState<Result | null>(null);
  useAiField("dashboard.search", { get: () => q, set: (v) => setQ(v), fillable: true });

  const active = term.length >= MIN;
  const key = active ? [term, filter, locale, attempt].join("\u0000") : "";

  useEffect(() => {
    const id = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (term) url.searchParams.set("q", term);
    else url.searchParams.delete("q");
    if (filter !== "all") url.searchParams.set("f", filter);
    else url.searchParams.delete("f");
    const next = url.pathname + url.search + url.hash;
    if (next !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(null, "", next);
  }, [term, filter]);

  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    const wantPeople = filter !== "services";
    const wantServices = filter === "all" || filter === "services";
    Promise.allSettled([
      wantPeople ? searchMarketplaceSellers(term, { sellerType: filter, limit: SHOW, signal: ctrl.signal }) : Promise.resolve(null),
      wantServices ? searchServices(term, { limit: SHOW + 1, signal: ctrl.signal }, locale) : Promise.resolve(null),
    ]).then(([p, s]) => {
      if (ctrl.signal.aborted) return;
      const people: Part<MarketSeller> | null =
        p.status === "rejected" ? { ok: false, error: p.reason } : p.value ? { ok: true, items: p.value.items, total: p.value.total } : null;
      const services: Part<BackendService> | null =
        s.status === "rejected"
          ? { ok: false, error: s.reason }
          : s.value
            ? (() => {
                const list = s.value.map((h) => h.service).filter((x) => x.id && x.isActive !== false);
                return { ok: true as const, items: list, total: list.length };
              })()
            : null;
      setRes({ key, people, services });
    });
    return () => ctrl.abort();
  }, [key, term, filter, locale]);

  function clear() {
    setQ("");
    setTerm("");
    input.current?.focus();
  }
  function pickSuggestion(text: string) {
    setQ(text);
    setTerm(text);
  }
  const retry = () => setAttempt((n) => n + 1);

  const loading = active && res?.key !== key;
  const shown = active ? res : null;
  const people = shown?.people ?? null;
  const services = shown?.services ?? null;
  const parts = [people, services].filter((x): x is NonNullable<typeof x> => x !== null);
  const allFailed = parts.length > 0 && parts.every((x) => !x.ok);
  const found = parts.reduce((n, x) => n + (x.ok ? x.items.length : 0), 0);
  const empty = parts.length > 0 && !allFailed && found === 0 && parts.every((x) => x.ok);
  const peopleTotal = people?.ok ? people.total : 0;
  const servicesCount = services?.ok ? Math.min(services.items.length, SHOW) : 0;
  const servicesMore = services?.ok && services.items.length > SHOW;

  const typeQs = filter === "advokat" || filter === "yurist" ? `&type=${filter}` : "";
  const peopleAll = `/portal/client/lawyers?q=${enc(term)}${typeQs}`;
  const servicesAll = `/portal/client/services?q=${enc(term)}`;

  const announce = !active || loading ? "" : allFailed ? t("errorTitle") : empty ? t("emptyTitle") : t("found", { n: peopleTotal + servicesCount });

  return (
    <section className="cdsrch" role="search" aria-label={t("label")} data-ai-target="dashboard:search">
      <div className="cdsrch__box" data-ai-id="dashboard.search" data-ai-type="input" data-ai-label={t("placeholder")}>
        <IconSearch aria-hidden />
        <input
          ref={input}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && q) {
              e.preventDefault();
              clear();
            } else if (e.key === "Enter") setTerm(q.trim());
          }}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          autoComplete="off"
          enterKeyHint="search"
        />
        {q ? (
          <button type="button" className="cdsrch__x" onClick={clear} aria-label={t("clear")} data-ai-id="dashboard.search.clear">
            <IconClose />
          </button>
        ) : null}
      </div>

      <div className="cdsrch__chips" role="group" aria-label={t("filterLabel")}>
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className="fchip"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            data-ai-id={aiId("dashboard.search.filter", f)}
          >
            {t(`filters.${f}`)}
          </button>
        ))}
      </div>

      {!active ? (
        q.trim() ? (
          <p className="cdsrch__hint">{t("minChars", { n: MIN })}</p>
        ) : (
          <div className="cdsrch__try">
            <span>{t("try")}</span>
            {SUGGEST.map((k) => (
              <button key={k} type="button" className="cdsrch__tag" onClick={() => pickSuggestion(t(`suggest.${k}`))} data-ai-id={aiId("dashboard.search.suggest", k)}>
                {t(`suggest.${k}`)}
              </button>
            ))}
          </div>
        )
      ) : loading && (!shown || allFailed || empty) ? (
        <Skeleton rows={3} label={t("loading")} />
      ) : allFailed ? (
        <ErrorState compact title={t("errorTitle")} error={parts.map((x) => (x.ok ? undefined : x.error)).find(Boolean)} onRetry={retry} />
      ) : empty ? (
        <EmptyState
          size="sm"
          icon={<IconSearch />}
          title={t("emptyTitle")}
          text={t("emptyText", { q: term })}
          action={
            <>
              <Link href={`/portal/client/ai?q=${enc(term)}`} className="btn btn--pri btn--sm" data-ai-id="dashboard.search.ask-ai">
                <IconSparkle />
                {t("askAi")}
              </Link>
              <Link href={filter === "services" ? "/portal/client/services" : "/portal/client/lawyers"} className="btn btn--line btn--sm" data-ai-id="dashboard.search.catalog">
                {filter === "services" ? t("servicesCatalog") : t("peopleCatalog")}
              </Link>
            </>
          }
        />
      ) : (
        <div className={`cdsrch__res${loading ? " is-stale" : ""}`} aria-busy={loading || undefined}>
          {people ? (
            <div className="cdsrch__grp" data-ai-id="dashboard.search.people">
              <div className="cdsrch__gh">
                <b>{filter === "advokat" ? t("groups.advokat") : filter === "yurist" ? t("groups.yurist") : t("groups.people")}</b>
                {people.ok && people.total ? <span className="cdsrch__n">{people.total}</span> : null}
                {people.ok && people.items.length ? (
                  <Link href={peopleAll} className="cdsrch__all" data-ai-id="dashboard.search.people.all">
                    {t("viewAll")}
                    <IconArrowRight />
                  </Link>
                ) : null}
              </div>
              {!people.ok ? (
                <p className="cdsrch__gerr" role="alert">
                  {t("groupError")}
                  <button type="button" onClick={retry}>{t("retry")}</button>
                </p>
              ) : people.items.length ? (
                <ul className="cdsrch__list">
                  {people.items.map((s) => {
                    const name = personName(s.name) || s.name || "—";
                    const area = s.specializations[0] ? specLabel(te, s.specializations[0]) : s.serviceTitles[0] || "";
                    return (
                      <li key={s.userId}>
                        <Link href={`/portal/client/lawyers/${enc(s.userId)}`} className="cdsrch__row" data-ai-id={aiId("dashboard.search.person", s.userId)}>
                          <span className="cdsrch__av" aria-hidden>{initials(name)}</span>
                          <span className="cdsrch__m">
                            <b>
                              <span className="cdsrch__name">{name}</span>
                              {s.verified ? <IconShieldCheck className="cdsrch__ok" aria-label={t("verified")} /> : null}
                            </b>
                            <span className="cdsrch__meta">
                              <i className={`cdsrch__type cdsrch__type--${s.sellerType === "yurist" ? "yurist" : "advokat"}`}>{sellerTypeLabel(tm, s.sellerType)}</i>
                              {s.rated ? <i className="cdsrch__rate"><IconStar aria-hidden />{fmtRating(s.rating, locale)}</i> : null}
                              {s.region ? <i><IconMapPin aria-hidden />{regionLabel(te, s.region)}</i> : null}
                              {area ? <i className="cdsrch__area">{area}</i> : null}
                            </span>
                          </span>
                          {s.priceFrom > 0 ? <span className="cdsrch__price">{t("from", { price: fmtUzs(s.priceFrom) })}</span> : null}
                          <IconArrowRight className="cdsrch__go" aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="cdsrch__none">{t("noPeople")}</p>
              )}
            </div>
          ) : null}

          {services ? (
            <div className="cdsrch__grp" data-ai-id="dashboard.search.services">
              <div className="cdsrch__gh">
                <b>{t("groups.services")}</b>
                {services.ok && servicesCount ? <span className="cdsrch__n">{servicesMore ? `${SHOW}+` : servicesCount}</span> : null}
                {services.ok && services.items.length ? (
                  <Link href={servicesAll} className="cdsrch__all" data-ai-id="dashboard.search.services.all">
                    {t("viewAll")}
                    <IconArrowRight />
                  </Link>
                ) : null}
              </div>
              {!services.ok ? (
                <p className="cdsrch__gerr" role="alert">
                  {t("groupError")}
                  <button type="button" onClick={retry}>{t("retry")}</button>
                </p>
              ) : services.items.length ? (
                <ul className="cdsrch__list">
                  {services.items.slice(0, SHOW).map((sv) => {
                    const doc = Boolean(sv.documentTemplateId);
                    const group = sv.subcategory || sv.categoryTitle || "";
                    return (
                      <li key={sv.id}>
                        <Link href={`/portal/client/services?service=${enc(sv.id)}`} className="cdsrch__row" data-ai-id={aiId("dashboard.search.service", sv.id)}>
                          <span className={`cdsrch__ic${doc ? " cdsrch__ic--doc" : ""}`} aria-hidden>{doc ? <IconFileText /> : <IconBriefcase />}</span>
                          <span className="cdsrch__m">
                            <b><span className="cdsrch__name">{sv.name}</span></b>
                            <span className="cdsrch__meta">
                              <i className={`cdsrch__type${doc ? " cdsrch__type--doc" : ""}`}>{doc ? t("kind.doc") : t("kind.service")}</i>
                              {group ? <i className="cdsrch__area">{group}</i> : null}
                            </span>
                          </span>
                          <span className="cdsrch__price">{sv.price ? t("price", { price: fmtUzs(sv.price) }) : t("byRequest")}</span>
                          <IconArrowRight className="cdsrch__go" aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="cdsrch__none">{t("noServices")}</p>
              )}
            </div>
          ) : null}
        </div>
      )}

      <p className="sr-only" aria-live="polite">{announce}</p>
    </section>
  );
}
