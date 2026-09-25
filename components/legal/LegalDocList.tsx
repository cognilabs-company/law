import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { legalLabelKey, legalPathFromSlug } from "@/lib/legal";
import type { ConsentDoc } from "@/lib/services/backend";
import { IconArrowRight } from "../icons";

// Index of the current legal documents (/legal and its client fallback).
export default function LegalDocList({ docs }: { docs: ConsentDoc[] }) {
  const t = useTranslations("legal");
  return (
    <section className="sec legal">
      <div className="wrap legal__in">
        <div className="head">
          <span className="kick">LexGo</span>
          <h1 className="h2">{t("indexTitle")}</h1>
          <p className="lead">{t("indexSubtitle")}</p>
        </div>
        {docs.length ? (
          <ul className="legal__list">
            {docs.map((d) => {
              const key = legalLabelKey(d.slug);
              return (
                <li key={d.id}>
                  <Link href={`/legal/${legalPathFromSlug(d.slug)}`}>
                    <b>{t.has(key) ? t(key) : d.title}</b>
                    {d.version ? <span>{t("version", { version: d.version })}</span> : null}
                    <span className="legal__read">
                      {t("read")}
                      <IconArrowRight />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="legal__note">{t("empty")}</p>
        )}
      </div>
    </section>
  );
}
