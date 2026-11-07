import { clipTween } from "./clip";
import type { MotionApi } from "./types";

/**
 * The closing shot. The frame opens from a rounded inset to full bleed while the
 * camera eases back from the walker, and the words of the title step out from
 * behind the columns. In portrait, where the title sits above the roof, they rise
 * into the sky instead. CTAs are magnetic on fine pointers.
 */
export function finalCtaMotion(api: MotionApi) {
  const { gsap, root, finePointer, onCleanup } = api;
  const section = root.querySelector<HTMLElement>(".lh-final");
  if (!section) return;
  const frame = section.querySelector<HTMLElement>(".lh-final__frame");
  const back = section.querySelector<HTMLElement>(".lh-final__plate--back");
  const front = section.querySelector<HTMLElement>(".lh-final__plate--front");
  const title = section.querySelector<HTMLElement>(".lh-final__title");
  const sun = section.querySelector<HTMLElement>(".lh-final__sun");
  if (!frame || !back || !front || !title || !sun) return;
  const words = gsap.utils.toArray<HTMLElement>("b", title);
  const plates = [back, front];
  const isPortrait = () => window.matchMedia("(max-aspect-ratio: 1/1)").matches;

  clipTween(
    api,
    frame,
    (p) => {
      const q = 1 - p;
      const r = (3 * q).toFixed(3);
      return `inset(${(7 * q).toFixed(3)}% ${(2.8 * q).toFixed(3)}% 0% ${(2.8 * q).toFixed(3)}% round ${r}rem ${r}rem 0rem 0rem)`;
    },
    { scrollTrigger: { trigger: section, start: "top bottom", end: "top 18%", scrub: 0.5 } },
  );

  // Both plates take identical transforms, so the silhouette never slips.
  gsap.fromTo(
    plates,
    { scale: 1.2 },
    {
      scale: 1,
      ease: "none",
      scrollTrigger: { trigger: section, start: "top bottom", end: "bottom bottom", scrub: 0.6 },
    },
  );
  gsap.fromTo(
    plates,
    { yPercent: 0 },
    {
      yPercent: 6,
      ease: "none",
      scrollTrigger: { trigger: section, start: "bottom bottom", end: "bottom top", scrub: 0.6 },
    },
  );

  // Light travels across the marble.
  gsap.fromTo(
    sun,
    { xPercent: -34 },
    {
      xPercent: 14,
      ease: "none",
      scrollTrigger: { trigger: section, start: "top bottom", end: "bottom top", scrub: 1 },
    },
  );

  // Each line starts hidden behind the columns and walks out to its place. Words on
  // one line move as one, so they never run into each other on the way. Line breaks
  // depend on the viewport, so all of this is measured again on every refresh.
  const lineTops = () => [...new Set(words.map((word) => word.offsetTop))].sort((a, b) => a - b);
  const lineIndex = (word: HTMLElement) => lineTops().indexOf(word.offsetTop);
  const lineLeft = (word: HTMLElement) =>
    Math.min(...words.filter((other) => other.offsetTop === word.offsetTop).map((other) => other.offsetLeft));

  words.forEach((word) => {
    gsap.fromTo(
      word,
      {
        x: () => {
          if (isPortrait()) return 0;
          const wall = front.offsetLeft + front.offsetWidth * 0.64;
          return wall - (title.offsetLeft + lineLeft(word));
        },
        y: () => (isPortrait() ? window.innerHeight * 0.3 : 0),
      },
      {
        x: 0,
        y: 0,
        ease: "power2.out",
        scrollTrigger: {
          trigger: section,
          // Always done by the time the section's top reaches the viewport's top.
          start: () => `top ${85 - lineIndex(word) * 6}%`,
          end: () => `top ${22 - lineIndex(word) * 5}%`,
          scrub: 0.7,
          invalidateOnRefresh: true,
        },
      },
    );
  });

  if (!finePointer) return;

  // Magnetic CTAs: the wrapper keeps the entrance, the button takes the pull.
  const actions = section.querySelector<HTMLElement>(".lh-final__actions");
  if (!actions) return;
  const pulls = gsap.utils.toArray<HTMLElement>(".lh-btn", actions).map((el) => ({
    el,
    x: gsap.quickTo(el, "x", { duration: 0.7, ease: "expo.out" }),
    y: gsap.quickTo(el, "y", { duration: 0.7, ease: "expo.out" }),
  }));
  const onMove = (e: PointerEvent) => {
    for (const { el, x, y } of pulls) {
      const box = el.getBoundingClientRect();
      const dx = e.clientX - (box.left + box.width / 2);
      const dy = e.clientY - (box.top + box.height / 2);
      const near = Math.hypot(dx, dy) < box.width * 0.9;
      x(near ? dx * 0.3 : 0);
      y(near ? dy * 0.34 : 0);
    }
  };
  const onLeave = () => {
    for (const { x, y } of pulls) {
      x(0);
      y(0);
    }
  };
  section.addEventListener("pointermove", onMove, { passive: true });
  section.addEventListener("pointerleave", onLeave);
  onCleanup(() => {
    section.removeEventListener("pointermove", onMove);
    section.removeEventListener("pointerleave", onLeave);
  });
}
