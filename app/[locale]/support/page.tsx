import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPublicSupport, prettyPhone, SUPPORT_EMAIL, SUPPORT_PHONE, type SupportLang } from "@/lib/publicSupport";

// Public, login-free support page for the App Store / Google Play Support URL
// (TEZKOR_HIMOYA_PUBLIC_SUPPORT_FRONTEND.md). The text comes from the
// backend's GET /public/support; it claims no hours and no response deadline.

type Props = { params: Promise<{ locale: string }> };

export const revalidate = 600;

const langOf = (l: string): SupportLang => (l === "ru" || l === "en" ? l : "uz");

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "supportPage" });
  const s = await getPublicSupport(langOf(locale));
  return { title: s?.title || t("metaTitle"), description: s?.intro || t("fallbackIntro") };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("supportPage");
  const s = await getPublicSupport(langOf(locale));

  const email = s?.contact.email || SUPPORT_EMAIL;
  const phone = s?.contact.phone || SUPPORT_PHONE;
  const emailUrl = s?.contact.emailUrl || `mailto:${email}`;
  const phoneUrl = s?.contact.phoneUrl || `tel:${phone.replace(/[^+\d]/g, "")}`;
  const company = s?.company;
  const privacy = s?.links.privacy || `/${locale}/legal/privacy`;
  const deletion = s?.links.deletion || `/${locale}/legal/account-deletion`;

  return (
    <section className="sec legal sup" data-ai-id="public.support">
      <div className="wrap legal__in">
        <span className="kick">{t("kicker")}</span>
        <h1 className="h2">{s?.title || t("fallbackTitle")}</h1>
        <p className="lead">{s?.intro || t("fallbackIntro")}</p>

        <h2 className="sup__h">{t("contactTitle")}</h2>
        <div className="sup__acts">
          <a className="sup__act" href={emailUrl} data-ai-id="public.support.email">
            <b>{s?.labels.email || t("emailAction")}</b>
            <span>{email}</span>
          </a>
          <a className="sup__act" href={phoneUrl} data-ai-id="public.support.phone">
            <b>{s?.labels.phone || t("phoneAction")}</b>
            <span dir="ltr">{prettyPhone(phone)}</span>
          </a>
        </div>

        <article className="legal__body">
          {s?.instructions ? (
            <>
              <h2>{t("howTitle")}</h2>
              <p>{s.instructions}</p>
            </>
          ) : null}
          {s?.include ? (
            <>
              <h2>{t("includeTitle")}</h2>
              <p>{s.include}</p>
            </>
          ) : null}
          {s?.security ? (
            <>
              <h2>{t("securityTitle")}</h2>
              <p className="sup__warn">{s.security}</p>
            </>
          ) : null}

          {company && (company.name || company.taxId || company.address) ? (
            <>
              <h2>{s?.labels.operator || t("companyTitle")}</h2>
              {company.name ? <p className="sup__co-name">{company.name}</p> : null}
              <dl className="sup__co">
                {company.taxId ? (
                  <div>
                    <dt>{t("taxId")}</dt>
                    <dd>{company.taxId}</dd>
                  </div>
                ) : null}
                {company.address ? (
                  <div>
                    <dt>{t("address")}</dt>
                    <dd>{company.address}</dd>
                  </div>
                ) : null}
              </dl>
            </>
          ) : null}

          <h2>{t("linksTitle")}</h2>
          <ul className="sup__links">
            <li>
              <a href={privacy}>{s?.labels.privacy || t("privacy")}</a>
            </li>
            <li>
              <a href={deletion}>{s?.labels.deletion || t("deletion")}</a>
            </li>
          </ul>
        </article>
      </div>
    </section>
  );
}
