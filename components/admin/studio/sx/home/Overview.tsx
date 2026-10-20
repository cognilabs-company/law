"use client";

import "../sx-tones.css";
import "./sx-home.css";
import "./sx-kpi.css";
import { useId, useState, type ReactElement } from "react";
import Image from "next/image";
import { ArrowUpRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { aiId } from "@/lib/ai/ids";
import { useStudioAccess, useStudioRegistry } from "@/lib/services/studio";
import { approvalsHref } from "../approvals/urlState";
import { enterStyle } from "../hooks";
import { ChevronRightIcon, ctorIcon, glyph } from "../icons";
import { SxDrawer } from "../layout/Drawer";
import { SxNote } from "../layout/Note";
import { useNow } from "../live";
import { SxCount } from "../shared/Count";
import { SxRing } from "../shared/Ring";
import { groupHue, type SxHue } from "../tones";
import { useStudioLabels } from "../useStudioLabels";
import { useCtorUsage, type CtorUsage } from "./ctorUsage";
import { createTypeOf, recordsHrefOf, type EntityCard } from "./entityModel";
import { pctOf } from "./GroupCard";
import { groupOfCode } from "./groupModel";
import { statusCount, type StudioSummary, type StudioSummaryState } from "./summary";

type KpiKey = "services" | "packages" | "ctors" | "queue";
type Kpi = { key: KpiKey; hue: SxHue; value: number | null; hint: string; href: string; open: boolean };

const BASE = "admin.studio.home.overview";
const SK = [0, 1, 2, 3];
const HUE: Readonly<Record<KpiKey, SxHue>> = { services: "blue", packages: "violet", ctors: "teal", queue: "amber" };
const FALLBACK_CODE: Readonly<Record<"service" | "package", readonly string[]>> = { service: ["K02"], package: ["K03-M", "K03"] };
const enc = encodeURIComponent;

function entityOf(s: StudioSummary, type: "service" | "package"): { total: number | null; active: number | null; href: string } {
  const card: EntityCard | undefined = s.entityCards?.find((c) => createTypeOf(c) === type);
  if (card) return { total: card.total, active: card.active, href: recordsHrefOf(card.listUrl, card.code) };
  const code = FALLBACK_CODE[type].find((c) => s.ctors[c]);
  const ctor = code ? s.ctors[code] : undefined;
  return { total: ctor ? ctor.total : null, active: ctor ? ctor.active : null, href: code ? `/admin/studio/c/${enc(code)}` : "" };
}

export type OverviewProps = { done: number; total: number; groups: number; groupsDone: number; ready: boolean; summary: StudioSummaryState };

export function Overview({ done, total, groups, groupsDone, ready, summary }: OverviewProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const acc = useStudioAccess();
  const headingId = useId();
  const [usageOpen, setUsageOpen] = useState(false);
  const [usageNonce, setUsageNonce] = useState(0);
  const usage = useCtorUsage(acc.isAdmin, summary.data, usageNonce);
  const pct = pctOf(done, total);
  const s = summary.data;
  const fmt = (n: number) => labels.num(n);
  const kpis: Kpi[] = [];
  if (s) {
    const svc = entityOf(s, "service");
    const pkg = entityOf(s, "package");
    const review = statusCount(s, "submitted", "in_review");
    const publish = statusCount(s, "approved");
    const opens = usage.data?.totalOpens ?? null;
    kpis.push(
      { key: "services", hue: HUE.services, value: svc.total, hint: svc.active !== null ? t("sx.hm.kpi.activeN", { n: fmt(svc.active) }) : t("sx.hm.kpi.servicesHint"), href: svc.href, open: false },
      { key: "packages", hue: HUE.packages, value: pkg.total, hint: pkg.active !== null ? t("sx.hm.kpi.activeN", { n: fmt(pkg.active) }) : t("sx.hm.kpi.packagesHint"), href: pkg.href, open: false },
      { key: "ctors", hue: HUE.ctors, value: usage.data ? usage.data.usedCount : null, hint: opens !== null ? t("sx.hm.kpi.ctorsOpens", { n: fmt(opens) }) : t("sx.hm.kpi.ctorsHint"), href: "", open: true },
      { key: "queue", hue: HUE.queue, value: review + publish, hint: t("sx.hm.kpi.queueHint", { review: fmt(review), publish: fmt(publish) }), href: acc.canReview ? approvalsHref() : "", open: false },
    );
  }

  const openUsage = () => {
    setUsageNonce((n) => n + 1);
    setUsageOpen(true);
  };

  return (
    <section className="sx-hov sx-enter" data-hue="blue" aria-labelledby={headingId} data-ai-id={BASE} data-ai-type="section" data-ai-label={t("sx.hm.ov.title")}>
      <span className="sx-hov__glow" aria-hidden="true" />
      <div className="sx-hov__main">
        {ready ? (
          <SxRing value={pct} size={88} stroke={8} label={t("sx.hm.ov.ringLabel", { pct })} className="sx-hov__ring">
            <span className="sx-hov__pct">
              <SxCount value={pct} format={(n) => t("sx.journeyRun.percent", { n })} />
            </span>
          </SxRing>
        ) : (
          <span className="sx-sk sx-hov__ring-sk" aria-hidden="true" />
        )}
        <div className="sx-hov__text">
          <h2 id={headingId} className="sx-hov__title">
            {t("sx.hm.ov.title")}
          </h2>
          {ready ? (
            <>
              <p className="sx-hov__line sx-num">{t("sx.hm.ov.ctors", { done, total })}</p>
              <p className="sx-hov__sub sx-num">{t("sx.hm.ov.groups", { n: groups, done: groupsDone })}</p>
            </>
          ) : (
            <span className="sx-hov__text-sk" aria-hidden="true">
              <span className="sx-sk" />
              <span className="sx-sk" />
            </span>
          )}
        </div>
      </div>
      {summary.loading && !s ? (
        <ul className="sx-hov__kpis sx-kpis" aria-hidden="true">
          {SK.map((i) => (
            <li key={i} className="sx-kpi" data-sk="">
              <span className="sx-sk sx-kpi__sk-ic" />
              <span className="sx-sk sx-kpi__sk-l" />
              <span className="sx-sk sx-kpi__sk-n" />
            </li>
          ))}
        </ul>
      ) : kpis.length ? (
        <ul className="sx-hov__kpis sx-kpis" aria-label={t("sx.hm.kpi.listAria")}>
          {kpis.map((k, i) => {
            const label = t(`sx.hm.kpi.${k.key}`);
            const valueText = k.value === null ? "—" : fmt(k.value);
            const go = !!k.href || k.open;
            const body = (
              <>
                <span className="sx-kpi__top">
                  <span className="sx-kpi__ic" aria-hidden="true">
                    <Image src={`/img/studio/kpi/${k.key}.webp`} alt="" width={96} height={96} unoptimized />
                  </span>
                  <span className="sx-kpi__l">{label}</span>
                  {go ? <span className="sx-kpi__go">{glyph(k.open ? ChevronRightIcon : ArrowUpRightIcon, { size: 15 })}</span> : null}
                </span>
                <SxCount value={k.key === "ctors" && usage.loading ? null : k.value} format={fmt} className="sx-kpi__n" />
                <span className="sx-kpi__h">{k.hint}</span>
              </>
            );
            const aria = `${label}: ${valueText}. ${k.hint}`;
            return (
              <li key={k.key} className="sx-kpi-li sx-enter" data-enter="zoom" style={enterStyle(i + 1)}>
                {k.href ? (
                  <Link href={k.href} className="sx-kpi sx-lift" data-hue={k.hue} data-link="" aria-label={aria} data-ai-id={aiId(BASE, "kpi", k.key)} data-ai-type="link" data-ai-label={label}>
                    {body}
                  </Link>
                ) : k.open ? (
                  <button type="button" className="sx-kpi sx-lift" data-hue={k.hue} data-link="" aria-label={aria} aria-haspopup="dialog" onClick={openUsage} data-ai-id={aiId(BASE, "kpi", k.key)} data-ai-type="button" data-ai-label={label}>
                    {body}
                  </button>
                ) : (
                  <div className="sx-kpi" data-hue={k.hue} data-ai-id={aiId(BASE, "kpi", k.key)} data-ai-type="stat" data-ai-label={label}>
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      <UsageDrawer open={usageOpen} onClose={() => setUsageOpen(false)} usage={usage.data} loading={usage.loading} />
    </section>
  );
}

function UsageDrawer({ open, onClose, usage, loading }: { open: boolean; onClose: () => void; usage: CtorUsage | null; loading: boolean }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const reg = useStudioRegistry();
  const now = useNow();
  const items = usage?.items ?? [];
  const fmt = (n: number) => labels.num(n);
  const description = usage
    ? usage.totalOpens !== null
      ? t("sx.hm.use.leadOpens", { n: fmt(usage.usedCount), opens: fmt(usage.totalOpens) })
      : t("sx.hm.use.lead", { n: fmt(usage.usedCount) })
    : undefined;
  return (
    <SxDrawer open={open} onClose={onClose} title={t("sx.hm.use.title")} description={description} aiId={aiId(BASE, "usage")}>
      <div className="sx-use">
        {usage && usage.source !== "usage" ? (
          <SxNote tone="info" className="sx-use__note">
            {t(usage.source === "sessions" ? "sx.hm.use.sessions" : "sx.hm.use.changes")}
          </SxNote>
        ) : null}
        {loading && !usage ? (
          <ul className="sx-use__list" aria-hidden="true">
            {SK.map((i) => (
              <li key={i} className="sx-use__sk">
                <span className="sx-sk sx-use__sk-ic" />
                <span className="sx-sk sx-use__sk-t" />
              </li>
            ))}
          </ul>
        ) : items.length ? (
          <ol className="sx-use__list" aria-label={t("sx.hm.use.title")}>
            {items.map((it, i) => {
              const ctor = reg.items.find((x) => x.code === it.code);
              const group = it.groupKey || groupOfCode(it.code, reg.groups, reg.items);
              const name = labels.ctorName(it.code, it.title || ctor?.title);
              const when = it.lastAt && now ? t("sx.mon.ago", { v: labels.ago(it.lastAt, now) }) : "";
              const sub = [group ? labels.groupName(group) : "", it.users ? t("sx.hm.use.users", { n: fmt(it.users) }) : "", when].filter(Boolean).join(" · ");
              return (
                <li key={it.code} className="sx-enter" style={enterStyle(Math.min(i, 12))}>
                  <Link href={`/admin/studio/c/${enc(it.code)}`} className="sx-use__row" aria-label={t("sx.hm.use.open", { name })} data-ai-id={aiId(BASE, "usage", it.code)} data-ai-type="link" data-ai-label={name}>
                    <span className="sx-use__ic" data-hue={groupHue(group, 0)} aria-hidden="true">
                      {glyph(ctorIcon(it.code, group), { size: 16 })}
                    </span>
                    <span className="sx-use__txt">
                      <span className="sx-use__t">{name}</span>
                      {sub ? <span className="sx-use__s sx-num">{sub}</span> : null}
                    </span>
                    {it.opens !== null ? <span className="sx-use__n sx-num">{t("sx.hm.use.times", { n: fmt(it.opens) })}</span> : null}
                    <span className="sx-use__go" aria-hidden="true">
                      {glyph(ChevronRightIcon, { size: 16 })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="sx-use__empty">{t("sx.hm.use.empty")}</p>
        )}
      </div>
    </SxDrawer>
  );
}
