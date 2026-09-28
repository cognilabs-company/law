"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { initials } from "@/lib/lawyers";

export default function SocialProofSection() {
  const t = useTranslations("home.social");
  const ts = useTranslations("subscription");
  const items = ts.raw("testimonials") as {
    text: string;
    name: string;
    role: string;
  }[];
  const quotes = useRef<HTMLDivElement>(null);

  // .qcard is not in RevealOnScroll's selector list, so these cards were the
  // only ones on this stretch of the page that did not reveal: measured on /uz
  // at 1440, this section had 4 reveal-able elements and exactly 1 (.head) got
  // the .rv class — the heading faded up and the three quotes under it snapped
  // in. Reveal them here with RevealOnScroll's own classes and observer options
  // so the motion is the same one the benefit cards above and the plan cards
  // below already use. (Adding ".qcard" to that selector would do the same job
  // in one line, but that file belongs to another workpackage right now.)
  useEffect(() => {
    const root = quotes.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;
    const cards = Array.from(
      root.querySelectorAll<HTMLElement>(".qcard:not(.in)"),
    );
    cards.forEach((c) => c.classList.add("rv"));
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("in");
          io.unobserve(e.target);
        }),
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
    );
    cards.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, []);

  return (
    <section className="sec">
      <div className="wrap">
        <div className="head">
          <span className="kick">{t("kicker")}</span>
          <h2 className="h2">{t("title")}</h2>
        </div>
        <div className="quotes rvseq" ref={quotes}>
          {items.map((q, i) => (
            <div className="qcard" key={i}>
              <p>“{q.text}”</p>
              <div className="qcard__a">
                <span className="qcard__av">{initials(q.name)}</span>
                <div>
                  <b>{q.name}</b>
                  <span>{q.role}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
