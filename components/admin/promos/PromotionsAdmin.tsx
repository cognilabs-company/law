"use client";

import "./promos.css";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { EmptyState, ErrorState, Skeleton } from "@/components/portal/DataState";
import IconButton from "@/components/ui/IconButton";
import { IconArrowRight, IconCalendar, IconCrown, IconInfo, IconMegaphone, IconPlus, IconRefresh, IconHistory, IconTag } from "@/components/icons";
import { fmtUzs } from "@/lib/money";
import { dateOnly } from "@/lib/date";
import { isAborted, isForbidden, logApiError } from "@/lib/http";
import { loadStudioReference } from "@/lib/services/studio";
import { fetchCtorRecords, type CtorRecord } from "@/components/admin/studio/sx/ctorpage/recordsApi";
import { loadRowPayload, type RowPayload } from "@/components/admin/studio/sx/ctorpage/rowPayloads";
import { sxStatus } from "@/components/admin/studio/sx/status";
import { PROMO_TARGETS, discountedPrice, promoTermsOf, promoTiming, type PromoTerms } from "@/components/admin/studio/sx/ctor/mp09";

// Every promotion ("aksiya", TSK-537634) in one place: what it discounts,
// by how much, for how long, how often, and where it stands. A promotion is
// created and changed in Studio (constructor MP09 — draft, approval,
// publish, rollback); this page is the way in and the overview.

const CODE = "MP09";
const NEW_HREF = `/admin/studio/o/new?new=${CODE}`;

type Target = { id: string; label: string; type: string; price: number | null };
type State = "running" | "scheduled" | "ended" | "open" | "paused" | "pending" | "draft";
type Row = { rec: CtorRecord; terms: PromoTerms | null; state: State };
type Filter = "all" | "advertising" | "subscription";

const STATE_ORDER: Record<State, number> = { running: 0, open: 0, scheduled: 1, pending: 2, draft: 3, paused: 4, ended: 5 };

// Where a promotion stands: its Studio life (draft → review → published,
// archived = paused) and, once published, its own period.
function stateOf(rec: CtorRecord, terms: PromoTerms | null, now: number): State {
  const s = sxStatus(rec.status, rec.source);
  if (s.key === "archived" || s.key === "paused" || s.key === "inactive") return "paused";
  if (!s.live && rec.source !== "runtime") return s.stage >= 1 ? "pending" : "draft";
  if (!terms) return "open";
  const timing = promoTiming(terms, now);
  return timing === "ended" ? "ended" : timing === "scheduled" ? "scheduled" : timing === "running" ? "running" : "open";
}

const editHref = (r: CtorRecord) => (r.source === "studio" && r.studioObjectId ? `/admin/studio/o/${encodeURIComponent(r.studioObjectId)}` : `/admin/studio/c/${CODE}`);

export default function PromotionsAdmin(): ReactElement {
  const t = useTranslations("admin.promos");
  const ts = useTranslations("studio");
  const locale = useLocale();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "forbidden">("loading");
  const [failure, setFailure] = useState<unknown>(null);
  const [targets, setTargets] = useState<Map<string, Target>>(new Map());
  const [filter, setFilter] = useState<Filter>("all");
  const [reload, setReload] = useState(0);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const ctl = new AbortController();
    void (async () => {
      try {
        const list = await fetchCtorRecords(CODE, { limit: 100 }, ctl.signal);
        const payloads = await Promise.all(list.items.map((r) => loadRowPayload(r).catch((): RowPayload => null)));
        if (ctl.signal.aborted) return;
        setRows(
          list.items.map((rec, i) => {
            const p = payloads[i];
            const terms = p && (p.target_type || p.discount_type) ? promoTermsOf(p) : null;
            return { rec, terms, state: stateOf(rec, terms, now) };
          }),
        );
        setState("ready");
      } catch (e) {
        if (isAborted(e)) return;
        if (isForbidden(e)) return setState("forbidden");
        logApiError("promos.list", e);
        setFailure(e);
        setState("error");
      }
    })();
    return () => ctl.abort();
  }, [reload, now]);

  useEffect(() => {
    let alive = true;
    loadStudioReference(PROMO_TARGETS, "", 200).then(
      (items) => {
        if (!alive) return;
        setTargets(
          new Map(
            items.map((i) => {
              const p = Number(i.raw.price);
              return [i.value || i.id, { id: i.value || i.id, label: i.label, type: String(i.raw.target_type ?? ""), price: Number.isFinite(p) ? p : null }];
            }),
          ),
        );
      },
      (e) => logApiError("promos.targets", e),
    );
    return () => {
      alive = false;
    };
  }, []);

  const shown = useMemo(
    () => (rows ?? []).filter((r) => filter === "all" || r.terms?.targetType === filter).sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.rec.updatedAt.localeCompare(a.rec.updatedAt)),
    [rows, filter],
  );
  const count = (s: State[]) => (rows ?? []).filter((r) => s.includes(r.state)).length;
  const som = (n: number) => `${fmtUzs(n)} ${t("som")}`;
  const statusLabel = (r: CtorRecord) => {
    const info = sxStatus(r.status, r.source);
    return info.labelKey && ts.has(info.labelKey) ? ts(info.labelKey) : r.status;
  };

  return (
    <div className="ppanel prm">
      <header className="prm-hero">
        <span className="prm-hero__ico" aria-hidden="true">
          <IconTag />
        </span>
        <div className="prm-hero__txt">
          <h2>{t("title")}</h2>
          <p>{t("lead")}</p>
        </div>
        <div className="prm-hero__acts">
          <IconButton label={t("refresh")} icon={<IconRefresh />} tipAlign="end" onClick={() => setReload((n) => n + 1)} />
          <Link href={NEW_HREF} className="btn btn--pri btn--sm" data-ai-target="button:new-promotion">
            <IconPlus aria-hidden="true" />
            {t("new")}
          </Link>
        </div>
        <dl className="prm-meta">
          <div data-tone="ok">
            <dt>{t("kpi.running")}</dt>
            <dd>{rows ? count(["running", "open"]) : "—"}</dd>
          </div>
          <div data-tone="info">
            <dt>{t("kpi.scheduled")}</dt>
            <dd>{rows ? count(["scheduled"]) : "—"}</dd>
          </div>
          <div data-tone="warn">
            <dt>{t("kpi.pending")}</dt>
            <dd>{rows ? count(["pending", "draft"]) : "—"}</dd>
          </div>
          <div>
            <dt>{t("kpi.ended")}</dt>
            <dd>{rows ? count(["ended", "paused"]) : "—"}</dd>
          </div>
        </dl>
        <ol className="prm-how" aria-label={t("howTitle")}>
          {(["how1", "how2", "how3"] as const).map((k, i) => (
            <li key={k}>
              <span aria-hidden="true">{i + 1}</span>
              {t(k)}
            </li>
          ))}
        </ol>
      </header>

      <section className="prm-sec" aria-labelledby="prm-list">
        <div className="prm-sec__h">
          <h3 id="prm-list">{t("listTitle")}</h3>
          <div className="prm-seg" role="tablist" aria-label={t("filter")}>
            {(["all", "advertising", "subscription"] as Filter[]).map((f) => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}>
                {f === "advertising" ? <IconMegaphone aria-hidden="true" /> : f === "subscription" ? <IconCrown aria-hidden="true" /> : null}
                {t(`filters.${f}`)}
              </button>
            ))}
          </div>
        </div>

        {state === "loading" ? (
          <Skeleton rows={4} />
        ) : state === "forbidden" ? (
          <EmptyState icon={<IconTag />} title={t("noAccess")} />
        ) : state === "error" ? (
          <ErrorState error={failure} onRetry={() => setReload((n) => n + 1)} title={t("loadFailed")} compact />
        ) : !shown.length ? (
          <EmptyState
            icon={<IconTag />}
            title={filter === "all" ? t("empty") : t("emptyFilter")}
            text={t("emptyText")}
            action={
              <Link href={NEW_HREF} className="btn btn--pri btn--sm">
                <IconPlus aria-hidden="true" />
                {t("new")}
              </Link>
            }
          />
        ) : (
          <ul className="prm-grid">
            {shown.map(({ rec, terms, state: st }) => {
              const off = terms?.type && terms.value ? (terms.type === "percent" ? `−${terms.value}%` : `−${som(terms.value)}`) : "";
              const items = (terms?.targetIds ?? []).map((id) => targets.get(id) ?? { id, label: t("unknownTarget"), type: terms?.targetType ?? "", price: null });
              const period =
                terms?.startsAt || terms?.endsAt
                  ? [terms.startsAt ? dateOnly(terms.startsAt, locale) : "…", terms.endsAt ? dateOnly(terms.endsAt, locale) : "…"].join(" — ")
                  : t("noPeriod");
              return (
                <li key={`${rec.source}:${rec.id}`} className="prm-card" data-state={st}>
                  <div className="prm-card__h">
                    <span className="prm-card__ico" aria-hidden="true">
                      {terms?.targetType === "subscription" ? <IconCrown /> : <IconMegaphone />}
                    </span>
                    <span className="prm-card__t">
                      <b>{rec.title || t("untitled")}</b>
                      <small>
                        {terms?.targetType ? t(`filters.${terms.targetType === "subscription" ? "subscription" : "advertising"}`) : t("legacy")} · {statusLabel(rec)}
                      </small>
                    </span>
                    {off ? <span className="prm-off">{off}</span> : null}
                  </div>
                  <span className="prm-state" data-state={st}>
                    <i aria-hidden="true" />
                    {t(`state.${st}`)}
                  </span>
                  {items.length ? (
                    <ul className="prm-targets">
                      {items.map((x) => {
                        const after = x.price !== null && terms ? discountedPrice(x.price, terms) : null;
                        return (
                          <li key={x.id}>
                            <span>{x.label}</span>
                            {x.price !== null && after !== null ? (
                              <span className="prm-price">
                                {after !== x.price ? <s>{x.price ? som(x.price) : t("free")}</s> : null}
                                <b>{after ? som(after) : t("free")}</b>
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  <dl className="prm-facts">
                    <div>
                      <dt>
                        <IconCalendar aria-hidden="true" />
                        {t("period")}
                      </dt>
                      <dd>{period}</dd>
                    </div>
                    <div>
                      <dt>
                        <IconHistory aria-hidden="true" />
                        {t("limit")}
                      </dt>
                      <dd>{terms?.usageLimit ? t("limitN", { n: terms.usageLimit }) : t("noLimit")}</dd>
                    </div>
                  </dl>
                  <Link href={editHref(rec)} className="prm-open">
                    {t("open")}
                    <IconArrowRight aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside className="prm-rules" aria-labelledby="prm-rules-t">
        <span className="prm-rules__ico" aria-hidden="true">
          <IconInfo />
        </span>
        <div>
          <b id="prm-rules-t">{t("rulesTitle")}</b>
          <ul>
            {(["rule1", "rule2", "rule3", "rule4"] as const).map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
