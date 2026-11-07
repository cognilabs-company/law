import type { MotionApi } from "./types";

/**
 * The stair builds itself: each step rises from behind the one below it while
 * the azure dot climbs the treads. Both compositions run the same timeline; they
 * differ only in what is pinned and where. The resting CSS is the finished stair.
 */
export function stagesMotion({ gsap, ScrollTrigger, root, onCleanup }: MotionApi) {
  const stage = root.querySelector<HTMLElement>(".lh-st__stage");
  const inner = stage?.querySelector<HTMLElement>(".lh-st__in");
  const flight = stage?.querySelector<HTMLElement>(".lh-st__flight");
  const climb = stage?.querySelector<HTMLElement>(".lh-st__climb");
  if (!stage || !inner || !flight || !climb) return;
  const steps = gsap.utils.toArray<HTMLElement>(".lh-st__step", flight);
  const cta = stage.querySelector<HTMLElement>(".lh-st__btn");
  if (steps.length < 2) return;

  const readMode = () =>
    getComputedStyle(inner).getPropertyValue("--lh-st-mode").trim() === "wide" ? "wide" : "narrow";

  // Below the fixed tab bar's width the last 90px of the screen are taken.
  const floorClearance = () => (window.innerWidth <= 760 ? 96 : 28);

  const build = (mode: string) =>
    gsap.context(() => {
      const wide = mode === "wide";
      const clearance = floorClearance();
      const room = window.innerHeight - (wide ? 0 : 70 + clearance);
      // If a very short screen cannot hold the whole stair, nothing may be hidden
      // waiting for a pin: the steps stay put and only the path animates.
      const fits = (wide ? stage : flight).offsetHeight <= room + 2;

      const pct = (fn: (w: number, h: number) => number) => () =>
        fn(flight.offsetWidth || 1, flight.offsetHeight || 1);
      const xOf = (i: number) => pct((w) => (steps[i].offsetLeft / w) * 100);
      const yOf = (i: number) => pct((_, h) => (steps[i].offsetTop / h) * 100);
      const endX = pct((w) => {
        const last = steps[steps.length - 1];
        const line = last.querySelector<HTMLElement>(".lh-st__tread");
        return ((last.offsetLeft + (line?.offsetWidth ?? last.offsetWidth)) / w) * 100;
      });

      const treads = steps.map((s) => s.querySelector<HTMLElement>(".lh-st__tread"));
      const risers = steps.map((s) => s.querySelector<HTMLElement>(".lh-st__riser"));

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: fits
          ? {
              trigger: wide ? stage : flight,
              pin: wide ? stage : flight,
              start: wide ? "top top" : () => `bottom bottom-=${floorClearance()}`,
              end: () => `+=${Math.round(window.innerHeight * (wide ? 1.5 : 1.25))}`,
              scrub: 0.6,
              invalidateOnRefresh: true,
            }
          : {
              trigger: flight,
              start: "top 78%",
              end: "bottom 45%",
              scrub: 0.6,
              invalidateOnRefresh: true,
            },
      });

      gsap.set(climb, { x: 0, y: 0, xPercent: xOf(0), yPercent: yOf(0) });
      gsap.set(treads, { scaleX: 0 });
      gsap.set(risers, { scaleY: 0 });

      if (fits) {
        // The first step comes up with the section, before the pin takes hold.
        gsap.fromTo(
          steps[0],
          { yPercent: 104 },
          {
            yPercent: 0,
            ease: "power2.out",
            scrollTrigger: {
              trigger: wide ? stage : flight,
              start: "top 72%",
              end: wide ? "top top" : () => `bottom bottom-=${floorClearance()}`,
              scrub: 0.6,
              invalidateOnRefresh: true,
            },
          },
        );
      }

      steps.forEach((step, i) => {
        const at = i;
        const rise = 0.86;
        const body = step.querySelector(".lh-st__body");
        const desc = step.querySelector(".lh-st__desc");

        if (fits && i > 0) {
          // Sink it below the floor of the steps in front of it: fully covered.
          tl.fromTo(step, { yPercent: 100 * i + 8 }, { yPercent: 0, duration: rise, ease: "power3.out" }, at);
        }
        if (fits) {
          if (body) tl.fromTo(body, { y: 34, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: rise * 0.7, ease: "expo.out" }, at + 0.16);
          if (desc) tl.fromTo(desc, { y: 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: rise * 0.7, ease: "expo.out" }, at + 0.28);
        }

        // Up the riser as the step arrives, then along its tread.
        if (i > 0) {
          tl.to(risers[i], { scaleY: 1, duration: 0.28 }, at + 0.56);
          tl.to(climb, { yPercent: yOf(i), duration: 0.28 }, at + 0.56);
        }
        const last = i === steps.length - 1;
        const run = last ? 0.9 : 0.24;
        tl.to(treads[i], { scaleX: 1, duration: run, ease: last ? "power2.inOut" : "none" }, at + 0.84);
        tl.to(climb, { xPercent: last ? endX : xOf(i + 1), duration: run, ease: last ? "power2.inOut" : "none" }, at + 0.84);
      });

      // The climb ends right under the button.
      if (wide && cta) {
        tl.fromTo(
          cta,
          { scale: 0.86, transformOrigin: "100% 100%" },
          { scale: 1, duration: 0.5, ease: "expo.out", clearProps: "scale,transformOrigin" },
          steps.length + 0.3,
        );
      }
      tl.to({}, { duration: 0.3 });

      // Quiet depth on the way out of the pin.
      if (wide) {
        const title = stage.querySelector(".lh-st__title");
        if (title) {
          gsap.fromTo(
            title,
            { x: 0 },
            {
              x: () => -flight.offsetWidth * 0.018,
              ease: "none",
              scrollTrigger: {
                trigger: stage,
                start: "top top",
                end: () => `+=${Math.round(window.innerHeight * 1.5)}`,
                scrub: 0.6,
                invalidateOnRefresh: true,
              },
            },
          );
        }
      }
    }, stage);

  let mode = readMode();
  let ctx = build(mode);

  // Rotating a tablet or resizing across the threshold swaps the composition.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new ResizeObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const next = readMode();
      if (next === mode) return;
      mode = next;
      ctx.revert();
      ctx = build(mode);
      ScrollTrigger.refresh();
    }, 200);
  });
  observer.observe(document.documentElement);
  onCleanup(() => {
    clearTimeout(timer);
    observer.disconnect();
    ctx.revert();
  });
}
