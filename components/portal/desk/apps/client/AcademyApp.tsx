"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { listAcademyCourses, type AcademyCourse } from "@/lib/services/backend";
import { humanizeSlug } from "@/lib/lawyers";
import { IconClock, IconFileText, IconGraduation, IconGrid, IconLayers, IconSearch } from "@/components/icons";
import { App, Empty, Loading, Progress, Search, Sidebar, Tag, Toolbar, useOs, type NavSection } from "../../kit/kit";
import "./client.css";

// The academy as a desktop program — Apple's Books / a Store gallery of
// courses: the categories on the side, the courses as covers with their
// level, lessons, length and progress. Courses open when the backend
// starts serving lessons; until then each says so.

const TONES = ["#2f7cf6", "#8e5cf7", "#2e9d57", "#f08a24"];

export default function AcademyApp() {
  const t = useTranslations("portal.client.academy");
  const os = useOs();
  const [courses, setCourses] = useState<AcademyCourse[] | null>(null);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    let alive = true;
    listAcademyCourses()
      .then((l) => alive && setCourses(l))
      .catch(() => alive && setCourses([]));
    return () => {
      alive = false;
    };
  }, []);
  const all = useMemo(() => courses ?? [], [courses]);
  const catName = (c: string) => (t.has(`categories.${c}`) ? t(`categories.${c}`) : humanizeSlug(c));
  const cats = useMemo(() => [...new Set(all.map((c) => c.category).filter(Boolean))], [all]);
  const needle = q.trim().toLowerCase();
  const list = all.filter((c) => (!cat || c.category === cat) && (!needle || `${c.title} ${c.category ? catName(c.category) : ""}`.toLowerCase().includes(needle)));
  const sections: NavSection[] = [
    {
      id: "c",
      title: os === "mac" ? t("fCategory") : undefined,
      items: [{ id: "", label: t("all"), icon: <IconGrid />, count: all.length || undefined }, ...cats.map((c) => ({ id: c, label: catName(c), icon: <IconLayers />, count: all.filter((x) => x.category === c).length }))],
    },
  ];
  return (
    <App name="cacademy" sidebar={cats.length > 1 ? <Sidebar label={t("fCategory")} sections={sections} value={cat} onChange={setCat} /> : undefined}>
      <Toolbar title={cat ? catName(cat) : t("title")} subtitle={t("subtitle")} end={all.length > 6 ? <Search value={q} onChange={setQ} placeholder={t("searchPh")} /> : undefined} />
      <div className="dxcy dx-scroll">
        {courses === null ? (
          <Loading label={t("title")} />
        ) : !list.length ? (
          all.length ? <Empty icon={<IconSearch />} title={t("noMatch")} text={t("noMatchText")} /> : <Empty icon={<IconGraduation />} title={t("empty")} text={t("emptyText")} />
        ) : (
          <div className="dxcy-grid">
            {list.map((c) => (
              <article key={c.id} className="dxcy-course" style={{ ["--k" as string]: TONES[c.title.length % TONES.length] }}>
                <span className="dxcy-cover" aria-hidden>
                  <IconGraduation />
                  <Tag>{t.has(`level.${c.level}`) ? t(`level.${c.level}`) : c.level}</Tag>
                </span>
                {c.category ? <small>{catName(c.category)}</small> : null}
                <b>{c.title}</b>
                <span className="dxcy-meta">
                  <span>
                    <IconFileText aria-hidden /> {t("lessons", { n: c.lessons })}
                  </span>
                  <span>
                    <IconClock aria-hidden /> {t("mins", { n: c.durationMin })}
                  </span>
                </span>
                {c.progress > 0 ? <Progress value={Math.min(c.progress, 100)} label={`${Math.min(c.progress, 100)}%`} /> : null}
                <em>{t("soon")}</em>
              </article>
            ))}
          </div>
        )}
      </div>
    </App>
  );
}
