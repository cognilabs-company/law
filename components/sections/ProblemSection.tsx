import { useTranslations } from "next-intl";
import { IconAlert } from "../icons";

export default function ProblemSection() {
  const t = useTranslations("home.problem");
  const items = t.raw("items") as { title: string; text: string }[];
  return (
    <section className="sec">
      <div className="wrap">
        <div className="head">
          <span className="kick">{t("kicker")}</span>
          <h2 className="h2">{t("title")}</h2>
          <p className="lead">{t("lead")}</p>
        </div>
        {/* grid--even: four cards, and the stock .grid (auto-fill) measured six
            255px tracks for them at 1920 and three tracks at 980 — a lone card
            with a wide hole beside it at both ends. See the wp-landinga block
            in app/globals.css. */}
        <div className="grid grid--even">
          {items.map((it, i) => (
            <article className="card card--warn" key={i}>
              <span className="card__i">
                <IconAlert />
              </span>
              <h3 className="h4">{it.title}</h3>
              <p>{it.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
