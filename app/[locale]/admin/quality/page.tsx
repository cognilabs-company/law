"use client";

import { useTranslations } from "next-intl";
import { getQualityOverview, adminListComplaints } from "@/lib/services/backend";
import { useResourceOne, useResource } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { IconStar, IconClock, IconAlert, IconCheck } from "@/components/icons";

const EMPTY = { avgRating: 0, responseSlaPct: 0, complaintRate: 0, resolvedPct: 0, flagged: [] };

export default function AdminQuality() {
  const t = useTranslations("admin.quality");
  const res = useResourceOne(getQualityOverview, []);
  const comp = useResource(() => adminListComplaints(), []);
  const q = res.data ?? EMPTY;

  return (
    <>
      <div className="ppanel">
        <div className="ppanel__h"><b>{t("title")}</b></div>
        {res.status === "loading" ? (
          <Skeleton rows={3} />
        ) : (
          <>
            <div className="castat">
              <div className="castat__c"><span className="castat__i"><IconStar /></span><b>{q.avgRating.toFixed(1)}</b><span>{t("avgRating")}</span></div>
              <div className="castat__c"><span className="castat__i castat__i--ok"><IconClock /></span><b>{q.responseSlaPct}%</b><span>{t("sla")}</span></div>
              <div className="castat__c"><span className="castat__i castat__i--bad"><IconAlert /></span><b>{q.complaintRate}</b><span>{t("complaintCount")}</span></div>
              <div className="castat__c"><span className="castat__i castat__i--ok"><IconCheck /></span><b>{q.resolvedPct}%</b><span>{t("resolved")}</span></div>
            </div>
            <div className="cablock">
              <h3>{t("flagged")}</h3>
              {q.flagged.length ? (
                <div className="alist">
                  {q.flagged.map((f, i) => (
                    <div className="aitem" key={i}>
                      <span className={`tprio tprio--${f.severity === "high" ? "high" : f.severity === "medium" ? "medium" : "low"}`}>{t.has(`severity.${f.severity}`) ? t(`severity.${f.severity}`) : f.severity}</span>
                      <div className="aitem__m"><b>{f.title}</b><span className="aitem__meta">{f.detail}</span></div>
                    </div>
                  ))}
                </div>
              ) : <p className="advmuted">{t("noFlagged")}</p>}
            </div>
          </>
        )}
      </div>

      <div className="ppanel">
        <div className="ppanel__h"><b>{t("complaints")}</b></div>
        {comp.status === "loading" ? (
          <Skeleton rows={2} />
        ) : !comp.data.length ? (
          <EmptyState icon={<IconAlert />} title={t("noComplaints")} text={t("noComplaintsText")} />
        ) : (
          <div className="alist">
            {comp.data.map((c) => (
              <div className="creq" key={c.id}>
                <span className="creq__st" />
                <div className="creq__m"><b>{c.subject || (t.has(`category.${c.category}`) ? t(`category.${c.category}`) : c.category)}</b><span>{c.description}</span></div>
                <span className="creq__badge">{t.has(`status.${c.status}`) ? t(`status.${c.status}`) : c.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
