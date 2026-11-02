"use client";

import { useLocale, useTranslations } from "next-intl";
import { shortDateTime } from "@/lib/date";
import { leadCan, type CrmLead } from "@/lib/services/crm";
import type { Tab } from "@/components/crm/leadQuery";
import { prettyPhone } from "../../now/feed";
import { IcCheck, IcClock } from "../../icons";
import { ScoreBadge, SourceChip } from "./LeadCard";
import { initials, shortName, stageStyle, useDayTime, useRegionName, useWhen } from "./util";

export type Hold = "hold" | "done" | "lost";

type Props = {
  rows: CrmLead[];
  total: number;
  tab: Tab;
  now: number;
  active: number;
  flash: Record<string, number>;
  holding: Record<string, Hold>;
  stageLabel: (key: string) => string;
  onOpen: (l: CrmLead) => void;
  onHover: (i: number) => void;
  onClaim: (l: CrmLead) => void;
};

export default function LeadTableX({ rows, total, tab, now, active, flash, holding, stageLabel, onOpen, onHover, onClaim }: Props) {
  const t = useTranslations("crm.leads");
  const tn = useTranslations("crm.newLead");
  const locale = useLocale();
  const when = useWhen();
  const dayTime = useDayTime();
  const regionName = useRegionName();

  return (
    <div className="opx-ld-tablewrap">
      <table className="opx-ld-table" aria-rowcount={total}>
        <thead>
          <tr>
            <th scope="col">{t("col.lead")}</th>
            <th scope="col">{tn("customer")}</th>
            <th scope="col">{t("col.status")}</th>
            <th scope="col">{t("col.score")}</th>
            <th scope="col">{t("col.next")}</th>
            <th scope="col">{t("col.owner")}</th>
            <th scope="col" className="opx-ld-hide">
              {t("col.created")}
            </th>
            <th scope="col">
              <span className="opx-sr">{t("col.actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l, i) => {
            const h = holding[l.id];
            const next = l.nextActionAt ? when(l.nextActionAt, now) : null;
            return (
              <tr
                key={l.id}
                data-row={i}
                data-active={i === active || undefined}
                data-urgency={l.urgency || "normal"}
                data-flash={flash[l.id] ? "" : undefined}
                data-holding={h === "hold" || undefined}
                data-shake={h === "lost" || undefined}
                data-gone={h === "lost" || (h === "done" && tab === "queue") || undefined}
                onClick={() => onOpen(l)}
                onMouseEnter={() => onHover(i)}
              >
                <td>
                  <span className="opx-ld-tl">
                    <b>{l.title || l.workId}</b>
                    <small>
                      <span className="opx-num">{l.workId}</span>
                      <SourceChip source={l.source} />
                    </small>
                  </span>
                </td>
                <td>
                  <span className="opx-ld-tl">
                    <b>{l.customer?.name || "—"}</b>
                    {l.customer?.phone ? (
                      <small className="opx-num" dir="ltr">
                        {prettyPhone(l.customer.phone)}
                      </small>
                    ) : l.region ? (
                      <small>{regionName(l.region)}</small>
                    ) : null}
                  </span>
                </td>
                <td>
                  <span className="opx-ld-stage" style={stageStyle(l.status)}>
                    <i aria-hidden="true" />
                    {stageLabel(l.status)}
                  </span>
                </td>
                <td>
                  <ScoreBadge score={l.score} />
                </td>
                <td>
                  {next ? (
                    <span className="opx-ld-when" data-tone={next.tone || undefined}>
                      <IcClock size={14} />
                      <span>
                        <b className="opx-num">{dayTime(l.nextActionAt, now)}</b>
                        <small>{next.text}</small>
                      </span>
                    </span>
                  ) : (
                    <span className="opx-ld-muted">—</span>
                  )}
                </td>
                <td>
                  {l.operator ? (
                    <span className="opx-ld-op" title={l.operator.name}>
                      <i aria-hidden="true">{initials(l.operator.name)}</i>
                      <span>{shortName(l.operator.name)}</span>
                    </span>
                  ) : (
                    <span className="opx-ld-muted">{t("unassigned")}</span>
                  )}
                </td>
                <td className="opx-ld-hide opx-ld-muted opx-num">{l.createdAt ? shortDateTime(l.createdAt, locale) : ""}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  {leadCan(l, "claim") && !l.operatorId ? (
                    <button type="button" className="opx-ld-claim" data-done={h === "done" || undefined} onClick={() => onClaim(l)} disabled={!!h} aria-busy={h === "hold" || undefined}>
                      {h === "done" ? <IcCheck size={14} /> : null}
                      {h === "done" ? t("claimDone") : t("claim")}
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
