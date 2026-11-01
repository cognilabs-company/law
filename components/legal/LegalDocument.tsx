import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { fmtDate } from "@/lib/date";
import { legalLabelKey, legalPathFromSlug } from "@/lib/legal";
import type { ConsentDoc } from "@/lib/services/backend";
import { IconGlobe } from "../icons";

// One legal document (server-rendered by /legal/[slug], client-rendered by
// LegalDocsFallback), in the page's language as the backend wrote it — never
// translated here. The text is of unknown format, so it is rendered as plain
// text, never as HTML.
export default function LegalDocument({ doc, all }: { doc: ConsentDoc; all: ConsentDoc[] }) {
  const t = useTranslations("legal");
  const locale = useLocale();
  // The label only for a document the backend sent no title for.
  const label = (d: ConsentDoc) => {
    if (d.title) return d.title;
    const key = legalLabelKey(d.slug);
    return t.has(key) ? t(key) : t("indexTitle");
  };
  const heading = label(doc);
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
        <h1 className="h2" lang={doc.language || undefined}>{heading}</h1>
        <p className="legal__meta">
          {doc.version ? <span>{t("version", { version: doc.version })}</span> : null}
          {doc.createdAt ? <span>{t("published", { date: fmtDate(doc.createdAt, locale) })}</span> : null}
        </p>
        {doc.fallback ? (
          // The asked language isn't published: this is the real Uzbek text.
          <p className="legal__fallback" role="note">
            <IconGlobe aria-hidden="true" />
            <span>{t("fallback.note", { language: t(`fallback.lang.${doc.requestedLanguage === "ru" ? "ru" : "en"}`) })}</span>
          </p>
        ) : null}
        <article className="legal__body" lang={doc.language || undefined}>
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </article>
      </div>
    </section>
  );
}
