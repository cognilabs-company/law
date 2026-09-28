"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

export default function FaqSection() {
  const t = useTranslations("faq");
  const items = t.raw("items") as { q: string; a: string }[];
  const [open, setOpen] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  // RevealOnScroll still looks for ".faq details"; this accordion stopped being
  // a <details> when it became a controlled .faqi, so the selector has matched
  // nothing here since. Measured on /uz at 1440: 13 reveal-able elements in
  // this section, 1 (.head) with .rv — twelve rows snapping in under a heading
  // that fades. Reveal them with the same classes and observer options as the
  // rest of the page. (Swapping ".faq details" for ".faqi" in that selector
  // would replace this, but that file belongs to another workpackage.)
  useEffect(() => {
    const root = list.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;
    const rows = Array.from(root.querySelectorAll<HTMLElement>(".faqi:not(.in)"));
    rows.forEach((r) => r.classList.add("rv"));
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("in");
          io.unobserve(e.target);
        }),
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
    );
    rows.forEach((r) => io.observe(r));
    return () => io.disconnect();
  }, []);

  return (
    <section className="sec" id="faq" style={{ background: "var(--b50)" }}>
      <div className="wrap">
        <div className="head">
          <span className="kick">{t("kicker")}</span>
          <h2 className="h2">{t("title")}</h2>
        </div>
        <div className="faq rvseq" ref={list}>
          {items.map((it, i) => {
            const on = open === i;
            return (
              <div className={`faqi${on ? " open" : ""}`} key={i}>
                <button
                  className="faqi__q"
                  aria-expanded={on}
                  onClick={() => setOpen(on ? -1 : i)}
                >
                  {it.q}
                </button>
                <div className="faqi__p">
                  <div>
                    <p>{it.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
