import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconLogo } from "./icons";

export default function Footer() {
  const t = useTranslations("footer");
  const tn = useTranslations("nav");

  return (
    <footer className="ftr">
      <div className="wrap">
        <div className="ftr__g">
          <div>
            <Link href="/" className="logo">
              <span className="logo__m">
                <IconLogo />
              </span>
              LexGo
            </Link>
            <p style={{ maxWidth: "32ch", margin: "16px 0 0" }}>{t("about")}</p>
            <a href="tel:+998787770000" className="ftr__p">
              78 777 00 00
              <small>{t("phoneNote")}</small>
            </a>
          </div>

          <div>
            <h4>{t("servicesTitle")}</h4>
            <ul>
              <li>
                <Link href="/ai">{tn("ai")}</Link>
              </li>
              <li>
                <Link href="/services">{t("links.onlineConsultation")}</Link>
              </li>
              <li>
                <Link href="/services">{t("links.docPrep")}</Link>
              </li>
              <li>
                <Link href="/services">{t("links.docReview")}</Link>
              </li>
              <li>
                <Link href="/subscription">{t("links.personalSub")}</Link>
              </li>
              <li>
                <Link href="/subscription">{t("links.giftSub")}</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4>{t("directionsTitle")}</h4>
            <ul>
              <li>
                <Link href="/lawyers?area=criminal">{t("links.criminal")}</Link>
              </li>
              <li>
                <Link href="/lawyers?area=civil">{t("links.civil")}</Link>
              </li>
              <li>
                <Link href="/lawyers?area=economic">{t("links.economic")}</Link>
              </li>
              <li>
                <Link href="/business">{tn("business")}</Link>
              </li>
              <li>
                <Link href="/lawyers">{t("links.findLawyer")}</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4>{t("companyTitle")}</h4>
            <ul>
              <li>
                <Link href="/for-lawyers">{tn("forLawyers")}</Link>
              </li>
              <li>
                <Link href="/academy">{t("links.courses")}</Link>
              </li>
              <li>
                <Link href="/legal-aid">{t("links.legalAid")}</Link>
              </li>
              <li>
                <Link href="/warranty">{tn("warranty")}</Link>
              </li>
              <li>
                <Link href="/faq">{tn("faq")}</Link>
              </li>
              <li>
                <Link href="/app">{tn("app")}</Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="ftr__b">
          <span>{t("rights")}</span>
          <nav>
            <Link href="/legal/terms">{t("terms")}</Link>
            <Link href="/legal/privacy">{t("privacy")}</Link>
            <Link href="/legal/disclaimer">{t("disclaimer")}</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
