"use client";

import { useTranslations } from "next-intl";
import { listCourses } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { IconGraduation } from "@/components/icons";

const som = (n?: number) => (n ? fmtUzs(n) : "");

export default function AcademySection() {
  const t = useTranslations("academy");
  const res = useResource(listCourses, []);

  return (
    <section className="sec" style={{ background: "var(--b50)" }}>
      <div className="wrap">
        <div className="head">
          <span className="kick">
            <IconGraduation />
            {t("kicker")}
          </span>
          <h2 className="h2">{t("title")}</h2>
          <p className="lead">{t("lead")}</p>
        </div>

        {res.status === "loading" ? (
          <Skeleton rows={3} />
        ) : !res.data.length ? (
          <EmptyState icon={<IconGraduation />} title={t("empty")} text={t("emptyText")} />
        ) : (
          <div className="grid">
            {res.data.map((c) => (
              <article className="card" key={c.id}>
                <span className="card__i"><IconGraduation /></span>
                <h3 className="h4">{c.title}</h3>
                {c.payload?.description ? <p>{String(c.payload.description)}</p> : null}
                <div className="oprice" style={{ marginTop: 14 }}>
                  <span>{c.status || t("course")}</span>
                  <b>{c.price ? `${som(c.price)} ${t("som")}` : t("free")}</b>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
