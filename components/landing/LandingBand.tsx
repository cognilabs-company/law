import { useTranslations } from "next-intl";
import "./css/band.css";

/** One run of the words. Rendered twice so the drift can wrap without a seam. */
function Run({ words }: { words: string[] }) {
  return (
    <span className="lh-band__run">
      {words.map((word, i) => (
        <span className="lh-band__item" key={i}>
          <span>{word}</span>
          <i className="lh-band__mark">§</i>
        </span>
      ))}
    </span>
  );
}

export default function LandingBand() {
  const t = useTranslations("landing");
  const words = t.raw("band") as string[];

  return (
    <section className="lh-band" aria-hidden="true">
      <div className="lh-band__strip">
        <div className="lh-band__skew">
          <div className="lh-band__track">
            <Run words={words} />
            <Run words={words} />
          </div>
        </div>
      </div>
    </section>
  );
}
