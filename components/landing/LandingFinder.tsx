import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import Finder from "@/components/sections/Finder";
import "./css/finder.css";

/**
 * The working instrument of the page: a white sheet that rises over the end of
 * the hero and carries the real Finder. The Finder itself is untouched; it is
 * only restyled from css/finder.css, and motion moves this wrapper, never it.
 */
export default function LandingFinder() {
  const t = useTranslations("landing.finder");
  const title = t("title");
  // The title is two clauses in every language. Each takes its own voice.
  const cut = title.indexOf(",") + 1;
  const first = cut > 0 ? title.slice(0, cut) : title;
  const second = cut > 0 ? title.slice(cut).trim() : "";

  return (
    <section className="lh-finder" id="finder">
      <div className="lh-finder__panel">
        <header
          className="lh-finder__head"
          style={{ "--lh-n": Math.max(first.length, second.length) } as CSSProperties}
        >
          <p className="lh-kicker">{t("kicker")}</p>
          <h2 className="lh-finder__title" data-lh-lines>
            {first}
            {second ? (
              <>
                {" "}
                <em className="lh-accent">{second}</em>
              </>
            ) : null}
          </h2>
        </header>
        <Finder />
      </div>
    </section>
  );
}
