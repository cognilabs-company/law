"use client";

import "../sx-tones.css";
import "./sx-home.css";
import { useId, type ReactElement } from "react";
import Image from "next/image";
import { ArrowUpRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { aiId } from "@/lib/ai/ids";
import { useStudioAccess } from "@/lib/services/studio";
import { approvalsHref } from "../approvals/urlState";
import { enterStyle } from "../hooks";
import { HourglassIcon, LayersIcon, PencilLineIcon, RadioIcon, RocketIcon, glyph } from "../icons";
import { SxCount } from "../shared/Count";
import { SxRing } from "../shared/Ring";
import type { SxIcon, SxTone } from "../types";
import { useStudioLabels } from "../useStudioLabels";
import { pctOf } from "./GroupCard";
import { statusCount, type StudioSummaryState } from "./summary";

type KpiKey = "total" | "published" | "draft" | "submitted" | "approved";
type Kpi = { key: KpiKey; icon: SxIcon; art: string; tone: SxTone | "accent"; value: number; href: string };

const ART: Record<KpiKey, string> = {
  total: "/img/yozuvlar.png",
  published: "/img/yuborildi.png",
  draft: "/img/qoralama.png",
  submitted: "/img/tekshiruvda.png",
  approved: "/img/elon-kutilmoqda.png",
};

const BASE = "admin.studio.home.overview";
const SK = [0, 1, 2, 3, 4];

export type OverviewProps = { done: number; total: number; groups: number; groupsDone: number; ready: boolean; summary: StudioSummaryState };

export function Overview({ done, total, groups, groupsDone, ready, summary }: OverviewProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const acc = useStudioAccess();
  const headingId = useId();
  const pct = pctOf(done, total);
  const s = summary.data;
  const kpis: Kpi[] = s
    ? [
        { key: "total", icon: LayersIcon, art: ART.total, tone: "accent", value: s.total, href: "" },
        { key: "published", icon: RadioIcon, art: ART.published, tone: "published", value: statusCount(s, "published"), href: "" },
        { key: "draft", icon: PencilLineIcon, art: ART.draft, tone: "draft", value: statusCount(s, "draft"), href: "" },
        { key: "submitted", icon: HourglassIcon, art: ART.submitted, tone: "submitted", value: statusCount(s, "submitted", "in_review"), href: acc.canReview ? approvalsHref({ need: "review" }) : "" },
        { key: "approved", icon: RocketIcon, art: ART.approved, tone: "approved", value: statusCount(s, "approved"), href: acc.canReview ? approvalsHref({ need: "publish" }) : "" },
      ]
    : [];
  const fmt = (n: number) => labels.num(n);

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
      {summary.loading ? (
        <ul className="sx-hov__kpis" aria-hidden="true">
          {SK.map((i) => (
            <li key={i} className="sx-kpi" data-sk="">
              <span className="sx-sk sx-kpi__sk-ic" />
              <span className="sx-sk sx-kpi__sk-n" />
              <span className="sx-sk sx-kpi__sk-l" />
            </li>
          ))}
        </ul>
      ) : kpis.length ? (
        <ul className="sx-hov__kpis" aria-label={t("sx.hm.ov.kpis")}>
          {kpis.map((k, i) => {
            const label = t(`sx.hm.kpi.${k.key}`);
            const hint = k.key === "total" && s && s.activeTotal !== null ? t("sx.hm.kpi.totalActive", { n: fmt(s.activeTotal) }) : t(`sx.hm.kpi.${k.key}Hint`);
            const body = (
              <>
                <span className="sx-kpi__ic sx-kpi__ic--art">
                  <Image src={k.art} alt="" width={52} height={52} />
                </span>
                <SxCount value={k.value} format={fmt} className="sx-kpi__n" />
                <span className="sx-kpi__l">{label}</span>
                <span className="sx-kpi__h">{hint}</span>
                {k.href ? <span className="sx-kpi__go">{glyph(ArrowUpRightIcon, { size: 14 })}</span> : null}
              </>
            );
            return (
              <li key={k.key} className="sx-kpi-li sx-enter" data-enter="zoom" style={enterStyle(i + 1)}>
                {k.href ? (
                  <Link
                    href={k.href}
                    className="sx-kpi sx-lift"
                    data-tone={k.tone === "accent" ? undefined : k.tone}
                    data-link=""
                    aria-label={`${t("sx.hm.kpi.open", { label })}: ${fmt(k.value)}`}
                    data-ai-id={aiId(BASE, "kpi", k.key)}
                    data-ai-type="link"
                    data-ai-label={label}
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="sx-kpi" data-tone={k.tone === "accent" ? undefined : k.tone} data-ai-id={aiId(BASE, "kpi", k.key)} data-ai-type="stat" data-ai-label={label}>
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
