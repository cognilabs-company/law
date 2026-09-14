import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { fmtDate } from "@/lib/date";
import { legalLabelKey, legalPathFromSlug } from "@/lib/legal";
import type { ConsentDoc } from "@/lib/services/backend";

// One legal document (server-rendered by /legal/[slug], client-rendered by
// LegalDocsFallback). The API text is Uzbek-only and of unknown format, so it
// is rendered as plain text — never as HTML.
export default function LegalDocument({ doc, all }: { doc: ConsentDoc; all: ConsentDoc[] }) {
  const t = useTranslations("legal");
  const locale = useLocale();
  const label = (d: ConsentDoc) => {
    const key = legalLabelKey(d.slug);
    return key ? t(key) : d.title;
  };
  const heading = locale === "uz" ? doc.title || label(doc) : label(doc);
  const paragraphs = doc.body
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <section className="sec legal">
      <div className="wrap legal__in">
        {all.length > 1 ? (
          <nav className="legal__nav" aria-label={t("allDocs")}>
            {all.map((d) => (
              <Link
                key={d.id}
                href={`/legal/${legalPathFromSlug(d.slug)}`}
                className={d.slug === doc.slug ? "on" : undefined}
                aria-current={d.slug === doc.slug ? "page" : undefined}
              >
                {label(d)}
              </Link>
            ))}
          </nav>
        ) : null}
        <span className="kick">{t("indexTitle")}</span>
        <h1 className="h2">{heading}</h1>
        <p className="legal__meta">
          {doc.version ? <span>{t("version", { version: doc.version })}</span> : null}
          {doc.createdAt ? <span>{t("published", { date: fmtDate(doc.createdAt, locale) })}</span> : null}
        </p>
        {locale !== "uz" ? (
          <p className="legal__note">
            {t("uzOnlyNote")}
            {doc.title && doc.title !== heading ? ` ${t("originalTitle", { title: doc.title })}` : null}
          </p>
        ) : null}
        <article className="legal__body" lang="uz">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </article>
      </div>
    </section>
  );
}
