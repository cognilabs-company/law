"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { CallAnalyticsFull } from "@/lib/services/dash";
import { fmtDateTime, fmtInt } from "@/lib/date";
import Sheet from "../panel/Sheet";
import { PanelFoot, Section } from "../panel/bits";
import { IcArrowRight, IcCheck, IcClock, IcClose, IcPhone, IcTimeline, IcUser } from "../icons";
import { mmss, rates, type DrillKind } from "./model";

type Point = { label: string; value: number };

function KindIcon({ kind }: { kind: DrillKind }) {
  switch (kind) {
    case "answered":
      return <IcCheck size={22} />;
    case "missed":
      return <IcClose size={22} />;
    case "avg":
      return <IcClock size={22} />;
    default:
      return <IcPhone size={22} />;
  }
}

export default function AnaDrill({ kind, data, days, demo, onClose }: { kind: DrillKind; data: CallAnalyticsFull; days: Point[]; demo: boolean; onClose: () => void }) {
  const t = useTranslations("admin.callAnalytics");
  const td = useTranslations("admin.dash");
  const tp = useTranslations("admin.ccx.panel");
  const tx = useTranslations("admin.ccx.analytics");
  const locale = useLocale();
  const r = rates(data);
  const title = kind === "answered" ? t("answered") : kind === "missed" ? t("missed") : kind === "avg" ? t("avg") : t("total");
  const value = kind === "answered" ? fmtInt(data.answered, locale) : kind === "missed" ? fmtInt(data.missed, locale) : kind === "avg" ? mmss(data.avgDurationSec) : fmtInt(data.total, locale);
  const sub = kind === "answered" ? `${t("answerRate")}: ${r.answer}%` : kind === "missed" ? `${td("drill.missRate")}: ${r.miss}%` : "";
  const tone = kind === "answered" ? "ok" : kind === "missed" ? "hot" : "info";
  const dayMax = Math.max(1, ...days.map((d) => d.value));
  const agentMax = Math.max(1, ...data.topAgents.map((a) => a.calls));
  const kv: { key: string; label: string; value: string; tone?: "ok" | "hot" }[] = [
    { key: "answered", label: t("answered"), value: fmtInt(data.answered, locale), tone: "ok" },
    { key: "missed", label: t("missed"), value: fmtInt(data.missed, locale), tone: "hot" },
    { key: "answerRate", label: td("drill.answerRate"), value: `${r.answer}%` },
    { key: "missRate", label: td("drill.missRate"), value: `${r.miss}%` },
    { key: "avg", label: t("avg"), value: mmss(data.avgDurationSec) },
  ];

  return (
    <Sheet
      label={title}
      onClose={onClose}
      head={
        <div className="opx-an-dhead" data-tone={tone}>
          <span className="opx-an-dhead__ic" aria-hidden="true">
            <KindIcon kind={kind} />
          </span>
          <span className="opx-an-dhead__txt">
            <small>{title}</small>
            <b className="opx-num">{value}</b>
          </span>
          {sub ? <span className="opx-pill" data-tone={kind === "missed" ? "hot" : "ok"}>{sub}</span> : null}
          {demo ? <span className="opx-pill" data-tone="warn">{td("demo.badge")}</span> : null}
        </div>
      }
    >
      <div className="opx-pscroll">
        <dl className="opx-an-kv">
          {kv.map((row) => (
            <div key={row.key} data-tone={row.tone}>
              <dt>
                {row.tone ? <i aria-hidden="true" /> : null}
                {row.label}
              </dt>
              <dd className="opx-num">{row.value}</dd>
            </div>
          ))}
        </dl>

        <Section icon={<IcTimeline size={17} />} title={t("byDay")} count={days.length}>
          {days.length ? (
            <table className="opx-an-table">
              <caption className="opx-sr">{t("byDay")}</caption>
              <thead>
                <tr>
                  <th scope="col">{tp("created")}</th>
                  <th scope="col" className="is-num">
                    {t("total")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {days
                  .slice()
                  .reverse()
                  .map((d, i) => (
                    <tr key={`${d.label}-${i}`}>
                      <th scope="row">{fmtDateTime(d.label, locale, false)}</th>
                      <td className="is-num">
                        <span className="opx-an-cell">
                          <i style={{ width: `${(d.value / dayMax) * 100}%` }} aria-hidden="true" />
                          <b className="opx-num">{fmtInt(d.value, locale)}</b>
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <p className="opx-pnone">{t("noData")}</p>
          )}
        </Section>

        <Section icon={<IcUser size={17} />} title={t("topAgents")} count={data.topAgents.length}>
          {data.topAgents.length ? (
            <ol className="opx-an-bars">
              {data.topAgents.map((ag, i) => (
                <li key={`${ag.name}-${i}`}>
                  <span className="opx-an-bars__n opx-num">{i + 1}</span>
                  <span className="opx-an-bars__name">{ag.name || "—"}</span>
                  <b className="opx-num">{fmtInt(ag.calls, locale)}</b>
                  <span className="opx-an-bars__track" aria-hidden="true">
                    <i style={{ width: `${(ag.calls / agentMax) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="opx-pnone">{tx("noAgents")}</p>
          )}
        </Section>
      </div>
      <PanelFoot
        onCancel={onClose}
        cancelLabel={tp("close")}
        kbd={false}
        extra={
          <Link href="/admin/call-center" className="opx-pbtn opx-pbtn--main">
            {tx("toQueue")}
            <IcArrowRight size={16} />
          </Link>
        }
      />
    </Sheet>
  );
}
