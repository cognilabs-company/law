"use client";

import { useTranslations } from "next-intl";
import { listB2bProducts } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { IconBuilding } from "@/components/icons";

const som = (n?: number) => (n ? fmtUzs(n) : "");

export default function B2bSection() {
  const t = useTranslations("b2b");
  const res = useResource(listB2bProducts, []);

  return (
    <section className="sec">
      <div className="wrap">
        <div className="head">
          <span className="kick">
            <IconBuilding />
            {t("kicker")}
          </span>
          <h2 className="h2">{t("title")}</h2>
          <p className="lead">{t("lead")}</p>
        </div>

        {res.status === "loading" ? (
          <Skeleton rows={3} />
        ) : !res.data.length ? (
          <EmptyState icon={<IconBuilding />} title={t("empty")} text={t("emptyText")} />
        ) : (
          <div className="grid">
            {res.data.map((p) => (
              <article className="card" key={p.id}>
                <span className="card__i"><IconBuilding /></span>
                <h3 className="h4">{p.title}</h3>
                {p.payload?.description ? <p>{String(p.payload.description)}</p> : null}
                <div className="oprice" style={{ marginTop: 14 }}>
                  <span>{p.status || t("product")}</span>
                  <b>{p.price ? `${som(p.price)} ${t("som")}` : t("byRequest")}</b>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
