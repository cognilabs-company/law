"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getMyMatches } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { useRouter } from "@/i18n/navigation";
import { Skeleton } from "@/components/portal/DataState";
import LawyerProfileModal from "@/components/portal/LawyerProfileModal";
import { humanizeSlug } from "@/lib/lawyers";
import { IconSparkle, IconStar, IconMapPin, IconArrowRight } from "@/components/icons";
import { fmtRating } from "@/lib/date";

export default function ClientMatches() {
  const t = useTranslations("portal.client.matches");
  const te = useTranslations("enums");
  const locale = useLocale();
  const regionLabel = (r: string) => (te.has(`regions.${r}`) ? te(`regions.${r}`) : humanizeSlug(r));
  const areaLabel = (a: string) =>
    a.split(",").map((x) => x.trim()).filter(Boolean).map((x) => (te.has(`areas.${x}`) ? te(`areas.${x}`) : humanizeSlug(x))).join(", ");
  const router = useRouter();
  const res = useResource(() => getMyMatches(), []);
  const [viewId, setViewId] = useState<string | null>(null);

  return (
    <div className="mtch">
      <div className="mtch__hero">
        <span className="mtch__ico"><IconSparkle /></span>
        <div>
          <h1 className="mtch__title">{t("title")}</h1>
          <p className="mtch__sub">{t("subtitle")}</p>
        </div>
      </div>

      {res.status === "loading" ? (
        <Skeleton rows={3} />
      ) : !res.data.length ? (
        <div className="mtch__empty">
          <span className="mtch__emptyi"><IconSparkle /></span>
          <b>{t("empty")}</b>
          <span className="mtch__emptyt">{t("emptyText")}</span>
          <button className="btn btn--pri" type="button" onClick={() => router.push("/portal/client/ai")}>
            {t("describe")}
            <IconArrowRight />
          </button>
        </div>
      ) : (
        <div className="mtch__grid">
          {res.data.map((m) => (
            <article className="mtchcard" key={m.id}>
              <div className="mtchcard__ring" style={{ ["--p" as string]: `${Math.min(m.matchPct, 100)}` }}>
                <span>{Math.min(m.matchPct, 100)}%</span>
              </div>
              <div className="mtchcard__b">
                <div className="mtchcard__top">
                  <b>{m.name || "—"}</b>
                  <span className={`advcard__kind advcard__kind--${m.kind}`}>{t(`kind.${m.kind}`)}</span>
                </div>
                <div className="mtchcard__meta">
                  <span><IconStar />{fmtRating(m.rating, locale)}</span>
                  {m.region ? <span><IconMapPin />{regionLabel(m.region)}</span> : null}
                  {m.area ? <span>{areaLabel(m.area)}</span> : null}
                </div>
                {m.reason ? <p className="mtchcard__reason">{m.reason}</p> : null}
                <button
                  className="btn btn--pri btn--sm btn--full"
                  type="button"
                  onClick={() => setViewId(m.lawyerUserId || m.id)}
                >
                  {t("view")}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <LawyerProfileModal userId={viewId} open={viewId !== null} onClose={() => setViewId(null)} />
    </div>
  );
}
