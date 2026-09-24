"use client";

import { useTranslations, useLocale } from "next-intl";
import { getIntegrationsOverview, type DataResidency, type Integration } from "@/lib/services/backend";
import { useResourceOne } from "@/lib/useResource";
import { humanizeSlug } from "@/lib/lawyers";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { IconBolt, IconLock } from "@/components/icons";
import { dateTimeFull } from "@/lib/date";

function fmt(s: string, locale: string) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : dateTimeFull(s, locale);
}

// Uzbekistan data residency (T0-19). "Confirmed" only when the backend says so
// explicitly; otherwise pending infrastructure evidence, or unknown if absent.
function ResidencyCard({ r }: { r: DataResidency | null }) {
  const t = useTranslations("admin.integrations.residency");
  const locale = useLocale();
  const state = r?.state ?? "unknown";
  const tone = state === "confirmed" ? "ok" : state === "pending" ? "warn" : "off";
  const where = [r?.region ? `${t("region")}: ${r.region}` : "", r?.provider ? `${t("provider")}: ${r.provider}` : ""]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="intg__group">
      <b className="intg__cat">{t("category")}</b>
      <div className={`intg__c intg__c--${tone} intg__res`}>
        <span className="intg__dot" />
        <div className="intg__resm">
          <b>{t("title")}</b>
          <span className="intg__resst">{t(`state.${state}`)}</span>
          <span>{t(`${state}Note`)}</span>
          {where ? <span>{where}</span> : null}
          {r?.checkedAt ? <span>{t("checkedAt")}: {fmt(r.checkedAt, locale)}</span> : null}
        </div>
      </div>
    </div>
  );
}

export default function AdminIntegrations() {
  const t = useTranslations("admin.integrations");
  const tp = useTranslations("portal.common");
  const res = useResourceOne(getIntegrationsOverview, []);
  const items = res.data?.items ?? [];

  // Group by backend category, keeping the order the backend returns them in.
  const groups: { category: string; items: Integration[] }[] = [];
  for (const i of items) {
    const g = groups.find((x) => x.category === i.category);
    if (g) g.items.push(i);
    else groups.push({ category: i.category, items: [i] });
  }

  return (
    <div className="ppanel">
      <div className="ppanel__h"><b>{t("title")}</b></div>
      <p className="ppanel__note">{t("lead")}</p>
      {res.status === "loading" ? (
        <Skeleton rows={3} />
      ) : res.status === "error" ? (
        <EmptyState icon={<IconBolt />} title={tp("loadError")} text={tp("loadErrorText")} />
      ) : (
        <ResidencyCard r={res.data?.dataResidency ?? null} />
      )}
      {res.status !== "ready" ? null : !items.length ? (
        <EmptyState icon={<IconBolt />} title={t("empty")} text={t("empty")} />
      ) : (
        groups.map((g) => (
          <div className="intg__group" key={g.category || "_"}>
            {g.category ? (
              <b className="intg__cat">{t.has(`categories.${g.category}`) ? t(`categories.${g.category}`) : humanizeSlug(g.category)}</b>
            ) : null}
            <div className="intg">
              {g.items.map((i) => {
                // queued/pending = waiting for provider delivery (amber); unknown stays grey.
                const tone =
                  i.status === "connected" || i.healthy
                    ? "ok"
                    : i.status === "degraded" || i.status === "queued" || i.status === "pending"
                      ? "warn"
                      : "off";
                return (
                  <div className={`intg__c intg__c--${tone}`} key={i.key}>
                    <span className="intg__dot" />
                    <b>{t.has(`keys.${i.key}`) ? t(`keys.${i.key}`) : i.label || i.key}</b>
                    {i.requiresSuperadmin ? (
                      <span className="intg__lock" title={t("superadminOnly")} aria-label={t("superadminOnly")}>
                        <IconLock />
                      </span>
                    ) : null}
                    <span className="intg__st">{t.has(`status.${i.status}`) ? t(`status.${i.status}`) : i.status}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
