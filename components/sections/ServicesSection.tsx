"use client";

import { useState, type ComponentType } from "react";
import { useTranslations } from "next-intl";
import {
  IconBolt,
  IconVideo,
  IconChat,
  IconClipboardCheck,
  IconAlert,
  IconShield,
  IconEdit,
  IconInfo,
} from "../icons";

type Card = { title: string; text: string; price?: string; unit?: string };
type Step = { title: string; text: string };
type Tab = "consultation" | "docPrep" | "docReview";

const CONSULT_ICONS = [IconBolt, IconVideo, IconChat, IconClipboardCheck];
const REVIEW_ICONS = [IconAlert, IconShield, IconEdit];

function CardGrid({
  cards,
  icons,
}: {
  cards: Card[];
  icons?: ComponentType<{ className?: string }>[];
}) {
  // grid--even pins the column count to a divisor of the card count. The three
  // tabs hold 4, 6 and 3 cards, and the stock .grid (auto-fill) stranded one of
  // the six on its own row at 1440/1600 and left two dead tracks beside the
  // three at 1920. See the wp-landinga block in app/globals.css.
  return (
    <div className="grid grid--even">
      {cards.map((c, i) => {
        const I = icons?.[i];
        return (
          <article className="card" key={i}>
            {I ? (
              <span className="card__i">
                <I />
              </span>
            ) : null}
            <h3 className="h4">{c.title}</h3>
            <p>{c.text}</p>
            {c.price ? (
              <div className="card__p">
                <b>{c.price}</b>
                <span>{c.unit}</span>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function Flow({ steps }: { steps: Step[] }) {
  return (
    <div className="flow">
      {steps.map((s, i) => (
        <div className="fstep" key={i}>
          <b>{i + 1}</b>
          <strong>{s.title}</strong>
          <span>{s.text}</span>
        </div>
      ))}
    </div>
  );
}

export default function ServicesSection() {
  const t = useTranslations("servicesPage");
  const [tab, setTab] = useState<Tab>("consultation");

  const consult = t.raw("consultation") as { cards: Card[]; info: string };
  const docPrep = t.raw("docPrep") as {
    cards: Card[];
    flow: Step[];
    info: string;
  };
  const docReview = t.raw("docReview") as { cards: Card[]; flow: Step[] };

  return (
    <section className="sec" id="xizmatlar" style={{ background: "var(--b50)" }}>
      <div className="wrap">
        <div className="head">
          <span className="kick">{t("kicker")}</span>
          <h2 className="h2">{t("title")}</h2>
          <p className="lead">{t("lead")}</p>
        </div>

        <div className="tabs" role="tablist">
          <button
            className="tab"
            role="tab"
            aria-selected={tab === "consultation"}
            onClick={() => setTab("consultation")}
          >
            {t("tabs.consultation")}
          </button>
          <button
            className="tab"
            role="tab"
            aria-selected={tab === "docPrep"}
            onClick={() => setTab("docPrep")}
          >
            {t("tabs.docPrep")}
          </button>
          <button
            className="tab"
            role="tab"
            aria-selected={tab === "docReview"}
            onClick={() => setTab("docReview")}
          >
            {t("tabs.docReview")}
          </button>
        </div>

        {tab === "consultation" ? (
          <div className="pane on">
            <CardGrid cards={consult.cards} icons={CONSULT_ICONS} />
            <div className="info">
              <IconInfo />
              <span>{consult.info}</span>
            </div>
          </div>
        ) : null}

        {tab === "docPrep" ? (
          <div className="pane on">
            <CardGrid cards={docPrep.cards} />
            <Flow steps={docPrep.flow} />
            <div className="info">
              <IconInfo />
              <span>{docPrep.info}</span>
            </div>
          </div>
        ) : null}

        {tab === "docReview" ? (
          <div className="pane on">
            <CardGrid cards={docReview.cards} icons={REVIEW_ICONS} />
            <Flow steps={docReview.flow} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
