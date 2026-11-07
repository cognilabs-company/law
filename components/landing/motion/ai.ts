import type { MotionApi } from "./types";

/**
 * The statue drifts and lights up on scrub, the list draws its hairlines, and
 * the phone floats and tilts. Tilt and drift touch only .lh-ai__device: the live
 * chat inside it stays React's, and the phone flattens under the pointer so it
 * stays easy to type in.
 */
export function aiMotion({ gsap, root, finePointer, onCleanup }: MotionApi) {
  const section = root.querySelector<HTMLElement>(".lh-ai");
  if (!section) return;
  const statue = section.querySelector<HTMLElement>(".lh-ai__statue");
  const statueIn = section.querySelector<HTMLElement>(".lh-ai__statue-in");
  const device = section.querySelector<HTMLElement>(".lh-ai__device");

  if (statueIn) {
    gsap.fromTo(
      statueIn,
      { yPercent: -5, xPercent: -2.5, scale: 1.05 },
      {
        yPercent: 7,
        xPercent: 2.5,
        scale: 1,
        ease: "none",
        scrollTrigger: { trigger: section, start: "top bottom", end: "bottom top", scrub: 0.9 },
      },
    );
    // She comes out of the dark as the section arrives.
    gsap.fromTo(
      statueIn,
      { autoAlpha: 0.12 },
      {
        autoAlpha: 1,
        ease: "none",
        scrollTrigger: { trigger: section, start: "top 80%", end: "top 12%", scrub: 0.6 },
      },
    );
  }

  gsap.utils.toArray<HTMLElement>(".lh-ai__row", section).forEach((row) => {
    const rule = row.querySelector(".lh-ai__rule");
    const parts = row.querySelectorAll(".lh-ai__num, .lh-ai__term, .lh-ai__detail");
    const tl = gsap.timeline({
      scrollTrigger: { trigger: row, start: "top 90%", once: true },
    });
    if (rule) tl.from(rule, { scaleX: 0, duration: 1.5, ease: "expo.out" }, 0);
    tl.from(parts, { y: 30, autoAlpha: 0, duration: 1.1, ease: "expo.out", stagger: 0.07 }, 0.08);
  });

  if (!device) return;

  gsap.set(device, { transformPerspective: 1500 });
  gsap.fromTo(
    device,
    // Touch screens have no pointer tilt, so the scrub carries the turn for them.
    {
      y: () => window.innerHeight * 0.09,
      rotation: 2.4,
      ...(finePointer ? {} : { rotationY: -13, rotationX: 5 }),
    },
    {
      y: () => window.innerHeight * -0.03,
      rotation: -0.8,
      ...(finePointer ? {} : { rotationY: 5, rotationX: -2 }),
      ease: "none",
      scrollTrigger: {
        trigger: section,
        start: "top 70%",
        end: "bottom bottom",
        scrub: 0.9,
        invalidateOnRefresh: true,
      },
    },
  );

  if (!finePointer) return;

  const tiltX = gsap.quickTo(device, "rotationX", { duration: 1, ease: "power3" });
  const tiltY = gsap.quickTo(device, "rotationY", { duration: 1, ease: "power3" });
  const shiftX = statue ? gsap.quickTo(statue, "x", { duration: 1.6, ease: "power3" }) : null;
  const shiftY = statue ? gsap.quickTo(statue, "y", { duration: 1.6, ease: "power3" }) : null;

  const onMove = (e: PointerEvent) => {
    const box = section.getBoundingClientRect();
    const nx = (e.clientX - box.left) / box.width - 0.5;
    const ny = e.clientY / window.innerHeight - 0.5;
    const overPhone = (e.target as Element | null)?.closest?.(".lh-ai__device");
    tiltY(overPhone ? 0 : nx * 14);
    tiltX(overPhone ? 0 : ny * -9);
    shiftX?.(nx * -box.width * 0.012);
    shiftY?.(ny * -window.innerHeight * 0.012);
  };
  const onLeave = () => {
    tiltX(0);
    tiltY(0);
    shiftX?.(0);
    shiftY?.(0);
  };
  section.addEventListener("pointermove", onMove, { passive: true });
  section.addEventListener("pointerleave", onLeave);
  onCleanup(() => {
    section.removeEventListener("pointermove", onMove);
    section.removeEventListener("pointerleave", onLeave);
  });
}
