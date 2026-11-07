import type { CSSProperties } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import ChatWidget from "@/components/chat/ChatWidget";
import { IMG } from "./images";
import LandingAiParticles from "./LandingAiParticles";
import "./css/ai.css";

// "Term: detail" strings become two columns of the list; a string with no colon
// stays whole. The wording itself is untouched.
function splitFeature(text: string): [string, string] {
  const at = text.indexOf(": ");
  return at > 0 ? [text.slice(0, at), text.slice(at + 2)] : [text, ""];
}

// Keeps one- and two-letter words ("со", "на") from hanging at a line end.
const glueShortWords = (text: string) => text.replace(/(^|\s)(\S{1,2})\s/g, "$1$2 ");

export default function LandingAi() {
  const t = useTranslations("landing.ai");
  const page = useTranslations("aiPage");
  const cta = useTranslations("cta");
  const features = (page.raw("features") as string[]).map(splitFeature);

  const title = t("title");
  const lastSpace = title.lastIndexOf(" ");
  const titleStart = lastSpace > 0 ? title.slice(0, lastSpace) : "";
  const titleEnd = title.slice(lastSpace + 1);
  const fit = {
    "--chars": title.length,
    "--word": Math.max(...title.split(/\s+/).map((word) => word.length)),
  } as CSSProperties;

  return (
    <section className="lh-ai lh-dark" id="ai">
      <LandingAiParticles />

      <div className="lh-ai__poster" style={fit}>
        <div className="lh-ai__statue" aria-hidden="true">
          <div className="lh-ai__statue-in">
            <Image
              src={IMG.aiThemis.src}
              width={IMG.aiThemis.width}
              height={IMG.aiThemis.height}
              alt=""
              quality={90}
              sizes="(max-aspect-ratio: 1/1) 135vw, min(86vw, 150vh)"
            />
          </div>
        </div>

        <header className="lh-ai__head">
          <p className="lh-kicker" data-lh-rise>
            {t("kicker")}
          </p>
          <h2 className="lh-ai__title" data-lh-lines>
            {titleStart ? `${glueShortWords(titleStart)} ` : null}
            <em className="lh-accent">{titleEnd}</em>
          </h2>
        </header>

        <div className="lh-ai__dock">
          <div className="lh-ai__device">
            <div className="phone">
              <div className="phone__s">
                <span className="phone__n" />
                <div className="phone__status" aria-hidden="true">
                  <span>9:41</span>
                  <span className="phone__status-i">
                    <svg viewBox="0 0 18 12" width="17" height="11">
                      <rect x="0" y="8" width="3" height="4" rx="1" />
                      <rect x="5" y="5" width="3" height="7" rx="1" />
                      <rect x="10" y="2" width="3" height="10" rx="1" />
                      <rect x="15" y="0" width="3" height="12" rx="1" opacity="0.45" />
                    </svg>
                    <svg viewBox="0 0 16 12" width="15" height="11">
                      <path d="M8 10.6a1 1 0 100-2 1 1 0 000 2zM8 7c1.3 0 2.5.5 3.4 1.4l1.1-1.1A6.4 6.4 0 008 5.4 6.4 6.4 0 003.5 7.3l1.1 1.1A4.8 4.8 0 018 7zM8 3.4c2.2 0 4.3.9 5.8 2.4l1.1-1.1A9.6 9.6 0 008 1.8 9.6 9.6 0 001.1 4.7l1.1 1.1A8 8 0 018 3.4z" />
                    </svg>
                    <svg viewBox="0 0 26 12" width="24" height="11">
                      <rect x="1" y="1" width="21" height="10" rx="3" fill="none" stroke="#fff" strokeWidth="1.2" opacity="0.6" />
                      <rect x="2.5" y="2.5" width="15" height="7" rx="1.5" />
                      <rect x="23.5" y="4" width="2" height="4" rx="1" opacity="0.6" />
                    </svg>
                  </span>
                </div>
                <ChatWidget variant="phone" />
              </div>
            </div>
          </div>
        </div>

        <div className="lh-ai__body">
          <p className="lh-ai__lead" data-lh-rise>
            {t("lead")}
          </p>

          <ol className="lh-ai__list">
            {features.map(([term, detail], i) => (
              <li className="lh-ai__row" key={term}>
                <i className="lh-ai__rule" aria-hidden="true" />
                <span className="lh-ai__num" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <strong className="lh-ai__term">{term}</strong>
                {detail ? <span className="lh-ai__detail">{detail}</span> : null}
              </li>
            ))}
          </ol>

          <div className="lh-ai__foot">
            <p className="lh-ai__info" data-lh-rise>
              {page("info")}
            </p>
            <div className="lh-ai__cta" data-lh-rise-group>
              <Link href="/chat" className="lh-btn lh-btn--white">
                {cta("tryFree")}
              </Link>
              <Link href="/subscription" className="lh-btn lh-btn--glass">
                {cta("subscriptionPrices")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
