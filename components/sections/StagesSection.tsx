import { useTranslations } from "next-intl";

const KEYS = [
  "preInvestigation",
  "investigation",
  "firstInstance",
  "appeal",
  "cassation",
];

// The stepper used to run a second IntersectionObserver of its own, at
// threshold .3, purely to put .go on the container so the progress lines could
// fill. Measured against the shared reveal on /uz at 1440x1000 it fired 60px of
// scroll EARLY: .steps got .go with the container top at 937px while the cards
// only reached .in at 877px — the lines were already animating underneath
// cards that were still at opacity 0, and their nth-child delays (.11-.44s) ran
// against a card stagger that started from a different phase. The fill now
// rides .step.in from components/RevealOnScroll.tsx (see the wp-landinga block
// in app/globals.css), which is the same trigger the cards use, so there is one
// observer and one sequence. That also lets this be a server component again.
export default function StagesSection() {
  const t = useTranslations("stages");
  const te = useTranslations("enums");

  return (
    <section className="sec" id="bosqich">
      <div className="wrap">
        <div className="head">
          <span className="kick">{t("kicker")}</span>
          <h2 className="h2">{t("title")}</h2>
          <p className="lead">{t("lead")}</p>
        </div>
        <div className="steps">
          {KEYS.map((k) => (
            <div className="step hit" key={k}>
              <div className="step__l" />
              <div className="step__c">{te(`stages.${k}.code`)}</div>
              <b>{te(`stages.${k}.name`)}</b>
              <p>{te(`stages.${k}.desc`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
