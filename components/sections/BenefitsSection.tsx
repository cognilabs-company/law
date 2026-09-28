import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  IconSparkle,
  IconUser,
  IconShieldCheck,
  IconGrid,
  IconInfo,
  IconGlobe,
} from "../icons";

const ICONS = [IconSparkle, IconUser, IconShieldCheck, IconGrid, IconInfo, IconGlobe];

export default function BenefitsSection() {
  const t = useTranslations("home.benefits");
  const cta = useTranslations("home.funnelCta");
  const items = t.raw("items") as { title: string; text: string }[];
  return (
    <section className="sec" style={{ background: "var(--b50)" }}>
      <div className="wrap">
        <div className="head">
          <span className="kick">{t("kicker")}</span>
          <h2 className="h2">{t("title")}</h2>
          <p className="lead">{t("lead")}</p>
        </div>
        {/* grid--six: this grid always holds exactly six cards, and the shared
            auto-fill track sizing resolved to 4 columns at 1200 and 5 at 1440
            and 1600, leaving one card alone in the last row. rvseq puts the
            reveal stagger in child order — see the wp-landingb block in
            globals.css. */}
        <div className="grid grid--six rvseq">
          {items.map((it, i) => {
            const I = ICONS[i] ?? IconSparkle;
            return (
              <article className="card" key={i}>
                <span className="card__i">
                  <I />
                </span>
                <h3 className="h4">{it.title}</h3>
                <p>{it.text}</p>
              </article>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
          <Link href="/chat" className="btn btn--pri btn--lg">
            {cta("primary")}
          </Link>
          <Link href="/lawyers" className="btn btn--line btn--lg">
            {cta("secondary")}
          </Link>
        </div>
      </div>
    </section>
  );
}
