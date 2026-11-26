import { useTranslations } from "next-intl";
import { IconExternal, IconMail, IconPhone, IconShield } from "@/components/icons";
import { formatSupportPhone, type SupportInfo } from "@/lib/support";

// The public support page (/support): the backend's localized text, the two
// contact actions and the operator's details. Renders on the server (ISR) and
// in the browser fallback alike. No promise of hours or reply times: the
// backend has not specified any.
// `source` says where the text came from: the API, or the built-in copy
// shown while (or because) the API can't be reached.
export default function SupportView({ info, source }: { info: SupportInfo; source: "api" | "fallback" }) {
  const t = useTranslations("supportPage");
  const { contact, company, links } = info;
  const docs = [
    { href: links.privacyPolicy, label: info.privacyLabel || t("privacy") },
    { href: links.accountDeletion, label: info.deletionLabel || t("deletion") },
  ].filter((d) => d.href);
  // Backend pages open in a new tab; this site's own pages in place.
  const external = (href: string) => /^https?:\/\//i.test(href);
  return (
    <section className="sec legal supp" lang={info.language} data-support={source}>
      <div className="wrap legal__in">
        <span className="kick">{info.brand}</span>
        <h1 className="h2">{info.title}</h1>
        {info.intro ? <p className="lead">{info.intro}</p> : null}
        <div className="supp__acts" role="group" aria-label={t("contactsTitle")}>
          {contact.emailUrl ? (
            <a className="supp__act" href={contact.emailUrl}>
              <span className="card__i" aria-hidden="true">
                <IconMail />
              </span>
              <span className="supp__txt">
                <b>{info.emailLabel || t("email")}</b>
                <span className="supp__v">{contact.email}</span>
              </span>
            </a>
          ) : null}
          {contact.phoneUrl ? (
            <a className="supp__act" href={contact.phoneUrl}>
              <span className="card__i" aria-hidden="true">
                <IconPhone />
              </span>
              <span className="supp__txt">
                <b>{info.phoneLabel || t("phone")}</b>
                <span className="supp__v">{formatSupportPhone(contact.phone)}</span>
              </span>
            </a>
          ) : null}
        </div>
        <div className="legal__body">
          {info.instructions ? <p>{info.instructions}</p> : null}
          {info.include ? (
            <>
              <h2 className="supp__h">{t("includeTitle")}</h2>
              <p>{info.include}</p>
            </>
          ) : null}
          {info.security ? (
            <p className="legal__fallback supp__warn" role="note">
              <IconShield aria-hidden="true" />
              <span>{info.security}</span>
            </p>
          ) : null}
          {company ? (
            <>
              <h2 className="supp__h">{info.operatorLabel || t("operator")}</h2>
              <div className="office supp__co">
                {company.name ? <b>{company.name}</b> : null}
                {company.taxId ? (
                  <p>
                    {t("taxId")}: {company.taxId}
                  </p>
                ) : null}
                {company.address ? (
                  <p>
                    {t("address")}: {company.address}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
          {docs.length ? (
            <>
              <h2 className="supp__h">{t("docsTitle")}</h2>
              <nav className="legal__nav supp__docs" aria-label={t("docsTitle")}>
                {docs.map((d) =>
                  external(d.href) ? (
                    <a key={d.href} href={d.href} target="_blank" rel="noopener noreferrer">
                      {d.label}
                      <IconExternal aria-hidden="true" />
                    </a>
                  ) : (
                    <a key={d.href} href={d.href}>
                      {d.label}
                    </a>
                  ),
                )}
              </nav>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
