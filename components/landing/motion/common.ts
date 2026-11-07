import type { MotionApi } from "./types";

/**
 * Declarative scroll motion, driven by data attributes on server-rendered
 * markup. The resting CSS is the finished state: these only animate from an
 * offset and only for elements still below the fold.
 *
 *   data-lh-rise            fade and rise once
 *   data-lh-rise-group      fade and rise each child in turn
 *   data-lh-lines           split a static h2 or h3 into masked lines (headings only)
 *   data-lh-reveal          wipe a photo frame open once
 *   data-lh-parallax="12"   drift the image inside a frame by that many percent
 *
 * Never put data-lh-lines on text React can change: SplitText replaces the DOM
 * nodes React owns.
 */
export function commonMotion({ gsap, SplitText, root }: MotionApi) {
  gsap.utils.toArray<HTMLElement>("[data-lh-lines]", root).forEach((el) => {
    SplitText.create(el, {
      type: "lines",
      mask: "lines",
      linesClass: "lh-split-line",
      autoSplit: true,
      onSplit(self) {
        return gsap.from(self.lines, {
          yPercent: 110,
          duration: 1.1,
          ease: "expo.out",
          stagger: 0.09,
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
        });
      },
    });
  });

  gsap.utils.toArray<HTMLElement>("[data-lh-rise]", root).forEach((el) => {
    gsap.from(el, {
      y: 36,
      autoAlpha: 0,
      duration: 1,
      ease: "expo.out",
      scrollTrigger: { trigger: el, start: "top 90%", once: true },
    });
  });

  gsap.utils.toArray<HTMLElement>("[data-lh-rise-group]", root).forEach((el) => {
    gsap.from(el.children, {
      y: 42,
      autoAlpha: 0,
      duration: 1,
      ease: "expo.out",
      stagger: 0.08,
      scrollTrigger: { trigger: el, start: "top 86%", once: true },
    });
  });

  gsap.utils.toArray<HTMLElement>("[data-lh-reveal]", root).forEach((el) => {
    gsap.fromTo(
      el,
      { clipPath: "inset(12% 6% 12% 6% round 2.5rem)" },
      {
        clipPath: "inset(0% 0% 0% 0% round 0rem)",
        duration: 1.5,
        ease: "expo.out",
        clearProps: "clipPath",
        scrollTrigger: { trigger: el, start: "top 85%", once: true },
      },
    );
  });

  gsap.utils.toArray<HTMLElement>("[data-lh-parallax]", root).forEach((frame) => {
    const amount = Number(frame.dataset.lhParallax) || 10;
    const img = frame.querySelector("img");
    if (!img) return;
    gsap.fromTo(
      img,
      { yPercent: -amount / 2, scale: 1 + amount / 100 },
      {
        yPercent: amount / 2,
        ease: "none",
        scrollTrigger: { trigger: frame, start: "top bottom", end: "bottom top", scrub: 0.6 },
      },
    );
  });
}

/** Custom cursor, grows over elements marked data-lh-cursor="drag|link". */
export function cursorMotion({ gsap, root, finePointer, onCleanup }: MotionApi) {
  if (!finePointer) return;
  const el = root.querySelector<HTMLElement>(".lh-cursor");
  if (!el) return;
  const label = el.querySelector("b");
  const x = gsap.quickTo(el, "x", { duration: 0.4, ease: "power3" });
  const y = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3" });

  const onMove = (e: PointerEvent) => {
    el.classList.add("is-on");
    x(e.clientX);
    y(e.clientY);
    const hit = (e.target as Element | null)?.closest?.<HTMLElement>("[data-lh-cursor]");
    const mode = hit?.dataset.lhCursor;
    el.classList.toggle("is-big", mode === "drag");
    el.classList.toggle("is-link", mode === "link");
    if (label) label.textContent = mode === "drag" ? (hit?.dataset.lhCursorLabel ?? "") : "";
  };
  const onLeave = () => el.classList.remove("is-on");
  window.addEventListener("pointermove", onMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);
  onCleanup(() => {
    window.removeEventListener("pointermove", onMove);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    el.classList.remove("is-on", "is-big", "is-link");
  });
}
