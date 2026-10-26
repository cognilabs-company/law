"use client";

import "@/components/admin/ads/ads.css";
import { useMemo, useState, type ComponentType } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { listAds, type ModuleRecord } from "@/lib/services/backend";
import AdsReadiness from "@/components/admin/ads/AdsReadiness";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { fmtDate } from "@/lib/date";
import { Skeleton, EmptyState, ErrorState } from "@/components/portal/DataState";
import { IconBriefcase, IconEye, IconImage, IconInfo, IconLayers, IconMegaphone, IconRocket, IconSearch, IconTag, IconTrendingUp, IconUser } from "@/components/icons";

// Read-only overview of the advertising packages (K12-PROMO). Creating and
// editing them lives in Studio; this page shows every package in full.

const PLACEMENTS = ["banner", "profile_boost", "service_boost"] as const;
type Placement = (typeof PLACEMENTS)[number];
const PLACEMENT_ICON: Record<Placement, ComponentType> = { banner: IconImage, profile_boost: IconUser, service_boost: IconBriefcase };

type Tone = "ok" | "warn" | "muted" | "bad";
const TONE: Record<string, Tone> = {
  active: "ok",
  approved: "ok",
  draft: "warn",
  pending: "warn",
  paused: "warn",
  inactive: "muted",
  expired: "muted",
  archived: "muted",
  rejected: "bad",
  deleted: "bad",
  removed: "bad",
};

const statusRank = (s?: string) => (s === "deleted" || s === "removed" ? 2 : s === "archived" ? 1 : 0);

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
};
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

type Pack = {
  a: ModuleRecord;
  placement: Placement | "";
  days: number;
  reach: number;
  boost: number;
  badge: string;
};

function packOf(a: ModuleRecord): Pack {
  const p = a.payload;
  const raw = text(p.placement) || text(p.promotion_type) || text(a.recordType);
  return {
    a,
    placement: (PLACEMENTS as readonly string[]).includes(raw) ? (raw as Placement) : "",
    days: Math.round(num(p.days ?? p.duration_days)),
    reach: num(p.reach),
    boost: num(p.boost_score),
    badge: text(p.badge),
  };
}

export default function AdminAds() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const ads = useResource(listAds, []);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

  const packs = useMemo(
    () =>
      ads.data
        .map((a, i) => ({ a, i }))
        .sort((x, y) => statusRank(x.a.status) - statusRank(y.a.status) || x.i - y.i)
        .map((x) => packOf(x.a)),
    [ads.data],
  );
  const statuses = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of packs) if (p.a.status) m.set(p.a.status, (m.get(p.a.status) ?? 0) + 1);
    return [...m.entries()].sort((x, y) => statusRank(x[0]) - statusRank(y[0]) || y[1] - x[1]);
  }, [packs]);
  const shown = packs.filter((p) => (!status || p.a.status === status) && (!q.trim() || p.a.title.toLowerCase().includes(q.trim().toLowerCase())));

  const priced = packs.map((p) => p.a.price).filter((n) => n > 0);
  const lo = priced.length ? Math.min(...priced) : 0;
  const hi = priced.length ? Math.max(...priced) : 0;
  const active = packs.filter((p) => TONE[p.a.status] === "ok").length;
  const placements = new Set(packs.map((p) => p.placement).filter(Boolean)).size;
  const som = (n: number) => `${fmtUzs(n)} ${t("ads.som")}`;
  const range = !priced.length ? "—" : lo === hi ? som(lo) : `${fmtUzs(lo)} – ${som(hi)}`;
  const label = (group: string, key: string) => (key ? (t.has(`ads.${group}.${key}`) ? t(`ads.${group}.${key}`) : key) : "");
  const ready = ads.status !== "loading" && ads.status !== "error";

  return (
    <div className="ppanel ads">
      <header className="ads-hero">
        <span className="ads-hero__ico" aria-hidden="true">
          <IconMegaphone />
        </span>
        <div className="ads-hero__txt">
          <h2>{t("ads.title")}</h2>
          <p>{t("ads.lead")}</p>
        </div>
        <div className="ads-hero__acts">
          <Link href="/admin/studio/c/K12-PROMO" className="btn btn--pri btn--sm" data-ai-target="button:new-ad">
            <IconLayers />
            {t("ads.openStudio")}
          </Link>
        </div>
        <dl className="ads-meta">
          <div>
            <dt>{t("ads.kpi.total")}</dt>
            <dd>{ready ? packs.length : "—"}</dd>
          </div>
          <div data-tone="ok">
            <dt>{t("ads.kpi.active")}</dt>
            <dd>{ready ? active : "—"}</dd>
          </div>
          <div>
            <dt>{t("ads.kpi.price")}</dt>
            <dd>{ready ? range : "—"}</dd>
          </div>
          <div>
            <dt>{t("ads.kpi.placements")}</dt>
            <dd>{ready ? t("ads.kpi.placementsOf", { n: placements, total: PLACEMENTS.length }) : "—"}</dd>
          </div>
        </dl>
        <div className="ads-ro" role="note" aria-labelledby="ads-ro-title">
          <span className="ads-ro__ico" aria-hidden="true">
            <IconInfo />
          </span>
          <div>
            <b id="ads-ro-title">{t("ads.readOnlyTitle")}</b>
            <p>{t("ads.readOnlyText")}</p>
          </div>
        </div>
      </header>

      <AdsReadiness />

      <section className="ads-sec" aria-labelledby="ads-list-title">
        <div className="ads-sec__h">
          <span className="ads-sec__ico" aria-hidden="true">
            <IconTag />
          </span>
          <div>
            <h3 id="ads-list-title">
              {t("ads.listTitle")} <span className="ads-count">{ads.data.length}</span>
            </h3>
            <p>{t("ads.listLead")}</p>
          </div>
        </div>

        {ads.status === "ready" && packs.length ? (
          <div className="ads-tools">
            <div className="ads-chips" role="group" aria-label={t("ads.statusLabel")}>
              <button type="button" className="ads-chip" aria-pressed={!status} onClick={() => setStatus("")}>
                {t("ads.filterAll")} <em>{packs.length}</em>
              </button>
              {statuses.map(([s, n]) => (
                <button key={s} type="button" className="ads-chip" data-tone={TONE[s] ?? "muted"} aria-pressed={status === s} onClick={() => setStatus(status === s ? "" : s)}>
                  {label("status", s)} <em>{n}</em>
                </button>
              ))}
            </div>
            <label className="ads-search">
              <IconSearch />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ads.search")} aria-label={t("ads.search")} />
            </label>
          </div>
        ) : null}

        <div data-ai-target="ads:list">
          {ads.status === "loading" ? (
            <Skeleton rows={3} />
          ) : ads.status === "error" ? (
            <ErrorState error={ads.error} onRetry={ads.refresh} />
          ) : !ads.data.length ? (
            <EmptyState icon={<IconRocket />} title={t("ads.empty")} text={t("ads.emptyReadOnly")} />
          ) : !shown.length ? (
            <div className="ads-nomatch">
              <p>{t("ads.noMatch")}</p>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setStatus("");
                  setQ("");
                }}
              >
                {t("ads.resetFilter")}
              </button>
            </div>
          ) : (
            <ul className="ads-grid">
              {shown.map((p) => {
                const Ico = p.placement ? PLACEMENT_ICON[p.placement] : IconMegaphone;
                const tone = TONE[p.a.status] ?? "muted";
                const kind = p.placement ? label("placement", p.placement) : label("recordType", p.a.recordType);
                return (
                  <li key={p.a.id} className="ads-card" data-placement={p.placement || undefined} data-tone={tone}>
                    <div className="ads-card__top">
                      <span className="ads-card__ico" aria-hidden="true">
                        <Ico />
                      </span>
                      <span className="ads-card__kind">{kind || "—"}</span>
                      {p.a.status ? <span className="ads-pill" data-tone={tone}>{label("status", p.a.status)}</span> : null}
                    </div>
                    <b className="ads-card__title">{p.a.title || "—"}</b>
                    {p.badge ? <span className="ads-card__badge">{p.badge}</span> : null}
                    <div className="ads-card__price">
                      {p.a.price ? (
                        <>
                          <strong>{fmtUzs(p.a.price)}</strong> <span>{t("ads.som")}</span>
                        </>
                      ) : (
                        <strong>—</strong>
                      )}
                      {p.days ? <small>/ {t("ads.days", { n: p.days })}</small> : null}
                    </div>
                    <ul className="ads-card__facts">
                      {p.reach ? (
                        <li>
                          <IconEye />
                          {t("ads.fact.reach")}: <b>{fmtUzs(p.reach)}</b>
                        </li>
                      ) : null}
                      {p.boost ? (
                        <li>
                          <IconTrendingUp />
                          {t("ads.fact.boost")}: <b>{p.boost}</b>
                        </li>
                      ) : null}
                    </ul>
                    {p.a.createdAt ? <span className="ads-card__date">{t("ads.created", { date: fmtDate(p.a.createdAt, locale) })}</span> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
