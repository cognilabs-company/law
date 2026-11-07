import type { MotionApi } from "./types";

/**
 * The panel settles as it arrives, the row of cards slides in from the right on
 * scrub, the giant word behind it drifts, and each photo slides inside its
 * notched frame as the row scrolls sideways, so the frames read as windows.
 */
export function servicesMotion({ gsap, root, onCleanup }: MotionApi) {
  const section = root.querySelector<HTMLElement>(".lh-svc");
  const panel = section?.querySelector<HTMLElement>(".lh-svc__panel");
  const view = section?.querySelector<HTMLElement>(".lh-svc__view");
  const row = view?.querySelector<HTMLElement>(".lh-svc__row");
  const ghost = section?.querySelector<HTMLElement>(".lh-svc__ghost");
  if (!section || !panel || !view || !row || !ghost) return;
  const cards = Array.from(row.children) as HTMLElement[];

  gsap.fromTo(
    panel,
    { scale: 0.955, transformOrigin: "50% 100%" },
    {
      scale: 1,
      ease: "none",
      scrollTrigger: { trigger: panel, start: "top bottom", end: "top 45%", scrub: 0.8 },
    },
  );

  // Later cards travel further, so the row fans out and closes up as it lands.
  cards.forEach((card, i) => {
    gsap.fromTo(
      card,
      { xPercent: 62 + i * 38, rotate: 3.5 + i * 1.5, y: 40 + i * 14 },
      {
        xPercent: 0,
        rotate: 0,
        y: 0,
        ease: "power2.out",
        scrollTrigger: { trigger: view, start: "top 98%", end: "top 32%", scrub: 1 },
      },
    );
  });

  gsap.fromTo(
    ghost,
    { xPercent: 7 },
    {
      xPercent: -5,
      ease: "none",
      scrollTrigger: { trigger: panel, start: "top bottom", end: "bottom top", scrub: 1.2 },
    },
  );

  // Horizontal scroll: photos slide inside their frames, the word follows slowly.
  const ghostX = gsap.quickTo(ghost, "x", { duration: 0.9, ease: "power3" });
  const drifts = cards.map((card) => {
    const el = card.querySelector<HTMLElement>(".lh-svc__drift");
    if (!el) return null;
    gsap.fromTo(
      el,
      { yPercent: -3.5 },
      {
        yPercent: 3.5,
        ease: "none",
        scrollTrigger: { trigger: view, start: "top bottom", end: "bottom top", scrub: 0.8 },
      },
    );
    gsap.set(el, { xPercent: 0 });
    return { card, to: gsap.quickTo(el, "xPercent", { duration: 0.8, ease: "power3" }) };
  });

  const update = () => {
    const width = view.clientWidth;
    const x = view.scrollLeft;
    for (const d of drifts) {
      if (!d) continue;
      const centre = d.card.offsetLeft + d.card.offsetWidth / 2 - x;
      const off = gsap.utils.clamp(-1, 1, (centre - width / 2) / width);
      // The drift layer overhangs its frame by 8% a side, about 6.9% of itself.
      d.to(off * -6.2);
    }
    ghostX(x * -0.14);
  };
  update();
  view.addEventListener("scroll", update, { passive: true });
  onCleanup(() => view.removeEventListener("scroll", update));
}
