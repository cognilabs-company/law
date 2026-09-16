"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { listAcademyCourses } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { humanizeSlug } from "@/lib/lawyers";
import { IconGraduation, IconClock, IconFileText } from "@/components/icons";

export default function ClientAcademy() {
  const t = useTranslations("portal.client.academy");
  const res = useResource(() => listAcademyCourses(), []);
  const [cat, setCat] = useState("");

  const cats = useMemo(() => {
    const set = new Set(res.data.map((c) => c.category).filter(Boolean));
    return ["", ...set];
  }, [res.data]);
  const list = res.data.filter((c) => !cat || c.category === cat);
  const catLabel = (c: string) => (t.has(`categories.${c}`) ? t(`categories.${c}`) : humanizeSlug(c));

  return (
    <div className="acad">
      <div className="acad__hero">
        <span className="acad__ico"><IconGraduation /></span>
        <h1 className="acad__title">{t("title")}</h1>
        <p className="acad__sub">{t("subtitle")}</p>
      </div>

      {res.status !== "loading" && res.data.length ? (
        <div className="chiprow">
          {cats.map((c) => (
            <button key={c || "all"} className="fchip" aria-pressed={cat === c} onClick={() => setCat(c)}>
              {c ? catLabel(c) : t("all")}
            </button>
          ))}
        </div>
      ) : null}

      {res.status === "loading" ? (
        <Skeleton rows={3} />
      ) : !list.length ? (
        <EmptyState icon={<IconGraduation />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="acad__grid">
          {list.map((c) => (
            <article className="course" key={c.id}>
              <div className={`course__cover course__cover--${(c.title.length % 4) + 1}`}>
                <span className="course__level">{t.has(`level.${c.level}`) ? t(`level.${c.level}`) : c.level}</span>
              </div>
              <div className="course__b">
                {c.category ? <span className="course__cat">{catLabel(c.category)}</span> : null}
                <b className="course__t">{c.title}</b>
                <div className="course__meta">
                  <span><IconFileText />{t("lessons", { n: c.lessons })}</span>
                  <span><IconClock />{t("mins", { n: c.durationMin })}</span>
                </div>
                {c.progress > 0 ? (
                  <div className="course__prog"><span style={{ width: `${Math.min(c.progress, 100)}%` }} /></div>
                ) : null}
                <button className="btn btn--soft btn--sm btn--full" disabled title={t("soon")}>{t("soon")}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
