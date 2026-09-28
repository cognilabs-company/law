import { useTranslations } from "next-intl";
import { IconClock, IconAlert, IconRefresh, IconShieldCheck } from "../icons";

const ICONS = [IconClock, IconAlert, IconRefresh, IconShieldCheck];

export default function WarrantySection() {
  const t = useTranslations("warranty");
  const cards = t.raw("cards") as { title: string; text: string }[];
  const rules = t.raw("rules") as string[];

  return (
    <section className="sec dark" id="kafolat">
      <div className="wrap">
        <div className="head">
          <span className="kick">{t("kicker")}</span>
          <h2 className="h2" style={{ color: "#fff" }}>
            {t("title")}
          </h2>
          <p className="lead">{t("lead")}</p>
        </div>
        {/* rvseq: reveal these four in child order. Without it RevealOnScroll's
            page-wide index decides the stagger, which is a rotation rather than
            a ramp — see the wp-landingb block in globals.css. */}
        <div className="wgrid rvseq">
          {cards.map((c, i) => {
            const I = ICONS[i] ?? IconShieldCheck;
            return (
              <div className="wcard" key={i}>
                <span className="wcard__i">
                  <I />
                </span>
                <b>{c.title}</b>
                <p>{c.text}</p>
              </div>
            );
          })}
        </div>
        <div className="rules">
          {rules.map((r, i) => (
            <p className="rule" key={i}>
              <i>{String(i + 1).padStart(2, "0")}</i>
              {r}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
