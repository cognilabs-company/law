"use client";

import "@/components/portal/plans1920.css";
import { useMemo, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Clock, FileText, Layers, Search } from "lucide-react";
import { listAcademyCourses } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import Select from "@/components/Select";
import { humanizeSlug } from "@/lib/lawyers";
import { IconGraduation, IconSearch } from "@/components/icons";

const SEARCH_FROM = 7;
// A course's cover is the dashboard's navy + blue drawing of its area, on
// the light plate the dashboard's area cards use (not a colour picked by the
// title's length); a cover the backend sends wins.
const COVER: Record<string, string> = {
  labor: "/img/category/Mehnat_huquqi.webp",
  family: "/img/category/Oila_huquqi.webp",
  real_estate: "/img/category/Kochmas_mulk.webp",
  tax: "/img/category/Biznes_va_soliq.webp",
  business: "/img/category/Biznes_va_soliq.webp",
  contract: "/img/doc-catalog/Shartnomalar.webp",
  court: "/img/doc-catalog/Sud_arizalari.webp",
  collection: "/img/doc-catalog/Qarzdorlik.webp",
  criminal: "/img/category/Jinoyat_ishlari.webp",
  consumer: "/img/category/Istemolchi_huquqlari.webp",
  inheritance: "/img/category/Meros.webp",
};
const coverStyle = (category: string, cover?: string) =>
  ({ "--img": `url(${cover || COVER[category] || "/img/doc-catalog/Onlayn_kurs.webp"})` }) as CSSProperties;

export default function ClientAcademy() {
  const t = useTranslations("portal.client.academy");
  const tl = useTranslations("lxPlans.acad");
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
  const filtered = !!needle || !!cat;

  return (
    <div className="acad plx-acad">
      {/* The dashboard's navy banner with the academy picture in a white
          circle; the page's title is the shell header's ("Tezkor Himoya Akademiya"). */}
      <section className="cx-gift plx-banner plx-banner--acad" aria-labelledby="plx-acad-h">
        <span className="plx-banner__art" style={{ "--art": "url(/img/xizmatlar/Akademiya.webp)" } as CSSProperties} aria-hidden />
        <div className="plx-banner__main">
          <h2 id="plx-acad-h">{tl("bannerTitle")}</h2>
          <p>{t("subtitle")}</p>
        </div>
      </section>

      <section className="lx-card plx-acadlist">
        <div className="cx-works__h">
          <h2 className="cx-h3">
            {tl("courses")}
            {res.status !== "loading" && res.data.length ? <span className="cx-count">{list.length}</span> : null}
          </h2>
        </div>

        {/* The dashboard's search tray (.cx-find): white fields on a chip tray. */}
        {barShown ? (
          <div className="cx-find plx-find" role="search">
            {searchable ? (
              <label className="cx-find__q">
                <Search aria-hidden />
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPh")} aria-label={t("searchPh")} />
              </label>
            ) : null}
            {cats.length > 1 ? (
              <div className="cx-find__region" data-ai-target="academy:categories">
                <Layers aria-hidden />
                <Select value={cat} onChange={setCat} options={catOpts} ariaLabel={t("fCategory")} />
              </div>
            ) : null}
          </div>
        ) : null}

        {res.status === "loading" ? (
          <Skeleton rows={3} />
        ) : !list.length && res.data.length ? (
          <EmptyState
            icon={<IconSearch />}
            title={t("noMatch")}
            text={t("noMatchText")}
            action={filtered ? <button type="button" className="btn btn--line btn--sm" onClick={() => { setQ(""); setCat(""); }}>{tl("clear")}</button> : undefined}
          />
        ) : !list.length ? (
          <EmptyState icon={<IconGraduation />} title={t("empty")} text={t("emptyText")} />
        ) : (
          <ul className="acad__grid plx-courses" data-ai-target="academy:courses">
            {list.map((c) => (
              <li key={c.id}>
                <article className="course cx-area plx-course">
                  <span className="course__cover cx-area__img" style={coverStyle(c.category, c.cover)}>
                    <span className="course__level cx-tag">{t.has(`level.${c.level}`) ? t(`level.${c.level}`) : c.level}</span>
                  </span>
                  <div className="course__b">
                    {c.category ? <span className="course__cat">{catLabel(c.category)}</span> : null}
                    <b className="course__t">{c.title}</b>
                    <div className="course__meta">
                      <span><FileText aria-hidden />{t("lessons", { n: c.lessons })}</span>
                      <span><Clock aria-hidden />{t("mins", { n: c.durationMin })}</span>
                    </div>
                    {c.progress > 0 ? (
                      <div className="plx-course__prog">
                        <div className="course__prog" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(c.progress, 100)} aria-label={tl("done", { n: Math.min(c.progress, 100) })}>
                          <span style={{ width: `${Math.min(c.progress, 100)}%` }} />
                        </div>
                        <small>{tl("done", { n: Math.min(c.progress, 100) })}</small>
                      </div>
                    ) : null}
                    {/* Lessons open later: said as a status, not a dead button. */}
                    <span className="cx-pill cx-pill--warn plx-course__soon"><Clock aria-hidden />{t("soon")}</span>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
