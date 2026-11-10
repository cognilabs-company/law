"use client";

import { useEffect, useState } from "react";

const SEP = "\u0000";
const TYPE = ["font-family", "font-size", "font-weight", "font-style", "font-stretch", "font-feature-settings", "font-variation-settings", "font-kerning", "letter-spacing", "word-spacing", "text-transform"];

// A field's hint, whole: the first of `options` that fits the field's text
// box (inside its padding) at the field's current width, the last one being
// the fallback. A long hint ("Advokat, yurist yoki xizmat qidiring") is cut
// mid-word on a phone or beside other controls; with a shorter option after
// it the field shows that one instead. Re-checked whenever the field
// resizes, and once the web fonts have loaded (they change the widths).
//
//   const [ph, phRef] = useFitPlaceholder([t("searchPh"), t("searchPhShort")]);
//   <input ref={phRef} placeholder={ph} aria-label={t("searchPh")} />
//
// The ref is a callback, so a field that mounts later (another tab) is
// picked up too.
export function useFitPlaceholder(options: readonly string[]): [string, (el: HTMLInputElement | null) => void] {
  const key = options.join(SEP);
  const [el, setEl] = useState<HTMLInputElement | null>(null);
  const [pick, setPick] = useState(0);
  useEffect(() => {
    const list = key.split(SEP);
    if (!el || list.length < 2 || typeof ResizeObserver === "undefined") return;
    const probe = document.createElement("span");
    probe.setAttribute("aria-hidden", "true");
    Object.assign(probe.style, { position: "absolute", left: "-10000px", top: "0", visibility: "hidden", whiteSpace: "pre", pointerEvents: "none" });
    document.body.appendChild(probe);
    const check = () => {
      if (!el.isConnected) return;
      const box = getComputedStyle(el);
      // the hint's own type (often lighter than the value's), property by
      // property: the `font` shorthand reads back empty whenever a font
      // feature or variation is set, which would measure in the page's font
      const ph = getComputedStyle(el, "::placeholder");
      for (const k of TYPE) probe.style.setProperty(k, ph.getPropertyValue(k) || box.getPropertyValue(k));
      const room = el.clientWidth - parseFloat(box.paddingLeft) - parseFloat(box.paddingRight);
      if (room <= 0) return;
      let i = 0;
      for (; i < list.length - 1; i++) {
        probe.textContent = list[i];
        if (probe.getBoundingClientRect().width <= room + 0.5) break;
      }
      setPick(i);
    };
    // a ResizeObserver reports once as soon as it starts observing
    const ro = new ResizeObserver(check);
    ro.observe(el);
    void document.fonts?.ready.then(check);
    return () => {
      ro.disconnect();
      probe.remove();
    };
  }, [el, key]);
  return [options[Math.min(pick, options.length - 1)] ?? "", setEl];
}
