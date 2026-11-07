import type { MotionApi } from "./types";

/**
 * A slow drift that scroll velocity speeds up, turns around and leans into.
 * Runs only while the band is on screen. Static under reduced motion, because
 * this whole function only runs when the visitor has not asked for less motion.
 */
export function bandMotion({ gsap, ScrollTrigger, root, onCleanup }: MotionApi) {
  const band = root.querySelector<HTMLElement>(".lh-band");
  const strip = band?.querySelector<HTMLElement>(".lh-band__strip");
  const skew = band?.querySelector<HTMLElement>(".lh-band__skew");
  const track = band?.querySelector<HTMLElement>(".lh-band__track");
  if (!band || !strip || !skew || !track) return;

  // Two identical runs, so -50% lands exactly where 0 started.
  const loop = gsap.to(track, { xPercent: -50, duration: 46, ease: "none", repeat: -1, paused: true });
  // Plenty of played time to run backwards into when the visitor scrolls up.
  loop.totalTime(loop.duration() * 100);

  const lean = gsap.quickTo(skew, "skewX", { duration: 0.55, ease: "power3" });
  const rest = gsap.delayedCall(0.14, () => lean(0)).pause();

  let direction = 1;
  const clamp = gsap.utils.clamp(-11, 11);

  ScrollTrigger.create({
    trigger: band,
    start: "top bottom",
    end: "bottom top",
    onToggle: (self) => {
      loop.paused(!self.isActive);
    },
    onUpdate: (self) => {
      const velocity = self.getVelocity();
      if (Math.abs(velocity) < 30) return;
      direction = velocity > 0 ? 1 : -1;
      const speed = direction * Math.min(1 + Math.abs(velocity) / 240, 11);
      gsap.to(loop, {
        timeScale: speed,
        duration: 0.25,
        ease: "power2.out",
        overwrite: true,
        onComplete: () => {
          gsap.to(loop, { timeScale: direction, duration: 1.6, ease: "power3.out", overwrite: true });
        },
      });
      lean(clamp(-velocity / 240));
      rest.restart(true);
    },
  });

  // The strip levels out a little as it crosses the viewport.
  gsap.fromTo(
    strip,
    { rotate: -3.3 },
    {
      rotate: -1.2,
      ease: "none",
      scrollTrigger: { trigger: band, start: "top bottom", end: "bottom top", scrub: 0.8 },
    },
  );

  onCleanup(() => {
    rest.kill();
    gsap.killTweensOf(loop);
  });
}
