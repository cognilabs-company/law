"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { listAcademyCourses } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import FilterBar from "@/components/filters/FilterBar";
import { humanizeSlug } from "@/lib/lawyers";
import { IconGraduation, IconClock, IconFileText, IconLayers, IconSearch } from "@/components/icons";

const SEARCH_FROM = 7;

export default function ClientAcademy() {
  const t = useTranslations("portal.client.academy");
  const res = useResource(() => listAcademyCourses(), []);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");

  const cats = useMemo(() => [...new Set(res.data.map((c) => c.category).filter(Boolean))], [res.data]);
  const catLabel = (c: string) => (t.has(`categories.${c}`) ? t(`categories.${c}`) : humanizeSlug(c));
  const searchable = res.data.length >= SEARCH_FROM;
  const needle = searchable ? q.trim().toLowerCase() : "";
  const found = res.data.filter((c) => !needle || `${c.title} ${c.category ? catLabel(c.category) : ""}`.toLowerCase().includes(needle));
  const list = found.filter((c) => !cat || c.category === cat);
  const catOpts = [
    { value: "", label: `${t("all")} (${found.length})` },
    ...cats.map((c) => ({ value: c, label: `${catLabel(c)} (${found.filter((x) => x.category === c).length})` })),
  ];
  const barShown = res.status !== "loading" && (cats.length > 1 || searchable);

  return (
    <div className="acad">
      <div className="acad__hero">
        <span className="acad__ico"><IconGraduation /></span>
        <h1 className="acad__title">{t("title")}</h1>
        <p className="acad__sub">{t("subtitle")}</p>
      </div>

      {barShown ? (
        <FilterBar
          fields={[{ key: "cat", label: t("fCategory"), icon: IconLayers, value: cat, onChange: setCat, options: catOpts, hidden: cats.length < 2 }]}
          search={searchable ? { value: q, onChange: setQ, placeholder: t("searchPh") } : undefined}
          count={list.length}
          aiTarget={cats.length > 1 ? "academy:categories" : undefined}
        />
      ) : null}

      {res.status === "loading" ? (
        <Skeleton rows={3} />
      ) : !list.length && res.data.length ? (
        <EmptyState icon={<IconSearch />} title={t("noMatch")} text={t("noMatchText")} />
      ) : !list.length ? (
        <EmptyState icon={<IconGraduation />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="acad__grid" data-ai-target="academy:courses">
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
