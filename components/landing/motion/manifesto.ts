import type { MotionApi } from "./types";

/**
 * Motion for the two sections that follow the hero.
 *
 * Finder: the wrapper panel rises over the end of the pinned hero. Only that
 * wrapper moves, never the Finder inside it.
 *
 * Manifesto: the mist words deepen to the text colour, the words part from
 * behind the card, the card turns through the fold, and on a mouse it leans
 * toward the pointer. Colours go through a CSS variable so they follow a theme
 * switch; a tweened colour would freeze the value from setup time.
 */
export function manifestoMotion(api: MotionApi) {
  finder(api);
  manifesto(api);
}

function finder({ gsap, root, onCleanup }: MotionApi) {
  const section = root.querySelector<HTMLElement>(".lh-finder");
  const panel = section?.querySelector<HTMLElement>(".lh-finder__panel");
  if (!section || !panel) return;

  // The deep overlap is only safe once the hero is held: its content lifts
  // away during the hold, and at rest it must not be covered.
  if (root.querySelector(".lh-hero [data-lh-held]")) {
    section.classList.add("is-pulled");
    onCleanup(() => section.classList.remove("is-pulled"));
  }

  gsap.fromTo(
    panel,
    { y: () => window.innerHeight * 0.2, scale: 0.97 },
    {
      y: 0,
      scale: 1,
      ease: "none",
      scrollTrigger: {
        trigger: section,
        start: "top bottom",
        end: "top 40%",
        scrub: 0.7,
        invalidateOnRefresh: true,
      },
    },
  );
}

function manifesto({ gsap, root, finePointer, onCleanup }: MotionApi) {
  const section = root.querySelector<HTMLElement>(".lh-mani");
  if (!section) return;
  const q = gsap.utils.selector(section);
  const card = q(".lh-mani__card")[0] as HTMLElement | undefined;
  const type = q(".lh-mani__type")[0] as HTMLElement | undefined;
  if (!card || !type) return;

  // Mist to text colour, the first word leading the last.
  q(".lh-mani__w--mist").forEach((word: Element, i: number) => {
    gsap.fromTo(
      word,
      { "--lh-mix": 0 },
      {
        "--lh-mix": 1,
        ease: "none",
        scrollTrigger: {
          trigger: type,
          start: i === 0 ? "top 88%" : "top 70%",
          end: i === 0 ? "top 42%" : "top 26%",
          scrub: 0.6,
        },
      },
    );
  });

  // The card turns through the whole crossing, and rises a little.
  gsap.fromTo(
    card,
    { rotation: -9, yPercent: 5 },
    {
      rotation: 5,
      yPercent: -5,
      ease: "none",
      scrollTrigger: { trigger: card, start: "top bottom", end: "bottom top", scrub: 0.9 },
    },
  );

  // The picture drifts inside the frame, against the card.
  gsap.fromTo(
    q(".lh-mani__slide img"),
    { yPercent: -3.5, scale: 1.09 },
    {
      yPercent: 3.5,
      ease: "none",
      scrollTrigger: { trigger: card, start: "top bottom", end: "bottom top", scrub: 0.9 },
    },
  );

  // Scroll turns the bead around the badge; the top row floats at its own pace.
  gsap.fromTo(
    q(".lh-mani__orbit"),
    { rotation: -40 },
    {
      rotation: 200,
      ease: "none",
      scrollTrigger: { trigger: section, start: "top bottom", end: "bottom top", scrub: 1.2 },
    },
  );
  const scrubFloat = (selector: string, distance: number) => {
    gsap.fromTo(
      q(selector),
      { y: () => section.clientWidth * distance },
      {
        y: () => -section.clientWidth * distance,
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top bottom",
          end: "bottom top",
          scrub: 0.9,
          invalidateOnRefresh: true,
        },
      },
    );
  };
  scrubFloat(".lh-mani__badge", 0.022);
  scrubFloat(".lh-mani__note", 0.012);

  gsap.from(q(".lh-mani__badge"), {
    scale: 0.62,
    autoAlpha: 0,
    duration: 1.5,
    ease: "expo.out",
    scrollTrigger: { trigger: section, start: "top 82%", once: true },
  });
  gsap.from(q(".lh-mani__no, .lh-mani__body"), {
    autoAlpha: 0,
    xPercent: 7,
    duration: 1.4,
    ease: "expo.out",
    stagger: 0.09,
    scrollTrigger: { trigger: section, start: "top 80%", once: true },
  });
  gsap.from(q(".lh-mani__ctrl .lh-round"), {
    scale: 0.4,
    autoAlpha: 0,
    duration: 1.2,
    ease: "expo.out",
    stagger: 0.1,
    clearProps: "transform,opacity,visibility",
    scrollTrigger: { trigger: card, start: "top 85%", once: true },
  });

  // The words. Beside the card they part from behind it. Where they sit above
  // and below it (portrait) the two lines slide in from opposite sides.
  const mm = gsap.matchMedia();
  onCleanup(() => mm.revert());
  const settle = {
    ease: "none",
    scrollTrigger: {
      trigger: type,
      start: "top bottom",
      end: "center 58%",
      scrub: 0.8,
      invalidateOnRefresh: true,
    },
  };
  mm.add("not all and (max-aspect-ratio: 1/1)", () => {
    const part = () => section.clientWidth * 0.085;
    gsap.fromTo(q('[data-w="1"], [data-w="3"]'), { x: part }, { x: 0, ...settle });
    gsap.fromTo(q('[data-w="2"], [data-w="4"]'), { x: () => -part() }, { x: 0, ...settle });
  });
  mm.add("(max-aspect-ratio: 1/1)", () => {
    const slide = () => section.clientWidth * 0.12;
    const lines = q(".lh-mani__line");
    gsap.fromTo(lines[0], { x: slide }, { x: 0, ...settle });
    gsap.fromTo(lines[1], { x: () => -slide() }, { x: 0, ...settle });
  });

  if (!finePointer) return;

  // Pointer: the card leans toward the cursor, in true perspective.
  const tilt = q(".lh-mani__tilt")[0] as HTMLElement | undefined;
  if (!tilt) return;
  gsap.set(tilt, { transformPerspective: 1400 });
  const rotY = gsap.quickTo(tilt, "rotationY", { duration: 1, ease: "power3" });
  const rotX = gsap.quickTo(tilt, "rotationX", { duration: 1, ease: "power3" });
  const onMove = (e: PointerEvent) => {
    const box = card.getBoundingClientRect();
    const dx = gsap.utils.clamp(-1, 1, (e.clientX - (box.left + box.width / 2)) / window.innerWidth);
    const dy = gsap.utils.clamp(-1, 1, (e.clientY - (box.top + box.height / 2)) / window.innerHeight);
    rotY(dx * 16);
    rotX(dy * -12);
  };
  const onLeave = () => {
    rotY(0);
    rotX(0);
  };
  section.addEventListener("pointermove", onMove, { passive: true });
  section.addEventListener("pointerleave", onLeave);
  onCleanup(() => {
    section.removeEventListener("pointermove", onMove);
    section.removeEventListener("pointerleave", onLeave);
  });
}
