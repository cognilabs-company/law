import { hold } from "./hold";
import type { MotionApi } from "./types";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The shield is the sun: the panels start hidden behind it and spiral out into
 * their resting places. The spiral is measured from the real layout on every
 * refresh, so it holds for any viewport, language and panel height.
 */
export function warrantyMotion(api: MotionApi) {
  const { gsap, ScrollTrigger, root, finePointer, onCleanup } = api;
  const section = root.querySelector<HTMLElement>(".lh-war");
  if (!section) return;
  const pin = section.querySelector<HTMLElement>(".lh-war__pin");
  const orbit = section.querySelector<HTMLElement>(".lh-war__orbit");
  const panelsBox = section.querySelector<HTMLElement>(".lh-war__panels");
  const core = section.querySelector<HTMLElement>(".lh-war__core");
  const depth = section.querySelector<HTMLElement>(".lh-war__depth");
  const tilt = section.querySelector<HTMLElement>(".lh-war__tilt");
  const ghost = section.querySelector<HTMLElement>(".lh-war__ghost-in");
  const rings = section.querySelector<HTMLElement>(".lh-war__rings");
  const glow = section.querySelector<HTMLElement>(".lh-war__glow");
  if (!pin || !orbit || !panelsBox || !core || !depth || !tilt || !ghost || !rings || !glow) return;
  const panels = gsap.utils.toArray<HTMLElement>(".lh-war__panel", section);

  const shield = section.querySelector<HTMLImageElement>(".lh-war__shield");
  const sheen = section.querySelector<HTMLElement>(".lh-war__sheen");
  if (shield && sheen) {
    const mask = () => {
      const url = `url("${shield.currentSrc || shield.src}")`;
      sheen.style.setProperty("-webkit-mask-image", url);
      sheen.style.setProperty("mask-image", url);
      sheen.dataset.ready = "";
    };
    if (shield.complete && shield.naturalWidth) mask();
    else shield.addEventListener("load", mask, { once: true });
  }

  gsap.set(depth, { transformPerspective: 1400 });

  const mm = gsap.matchMedia();

  // Mirrors the orbit composition in warranty.css.
  mm.add("(min-aspect-ratio: 1/1) and (min-width: 860px)", () => {
    const fits = orbit.offsetHeight <= window.innerHeight + 2;

    const flights = panels.map((panel, i) => {
      const dir = i % 2 ? -1 : 1;
      const x = gsap.quickSetter(panel, "x", "px") as (v: number) => void;
      const y = gsap.quickSetter(panel, "y", "px") as (v: number) => void;
      const rotation = gsap.quickSetter(panel, "rotation", "deg") as (v: number) => void;
      const scale = gsap.quickSetter(panel, "scale") as (v: number) => void;
      const opacity = gsap.quickSetter(panel, "opacity") as (v: number) => void;
      const flight = { p: 0, dx: 0, dy: 0 };
      const apply = () => {
        const t = flight.p;
        const turn = (1 - t) * dir * 1.25;
        const reach = lerp(0.06, 1, t);
        const cos = Math.cos(turn);
        const sin = Math.sin(turn);
        x((flight.dx * cos - flight.dy * sin) * reach - flight.dx);
        y((flight.dx * sin + flight.dy * cos) * reach - flight.dy);
        rotation((1 - t) * dir * -16);
        scale(lerp(0.5, 1, t));
        opacity(Math.min(1, t * 3.2));
      };
      return { panel, flight, apply };
    });

    // Offsets ignore transforms, so this reads the resting layout mid-flight too.
    const measure = () => {
      const cx = orbit.offsetWidth / 2;
      const cy = orbit.offsetHeight / 2;
      flights.forEach(({ panel, flight, apply }) => {
        flight.dx = panelsBox.offsetLeft + panel.offsetLeft + panel.offsetWidth / 2 - cx;
        flight.dy = panelsBox.offsetTop + panel.offsetTop + panel.offsetHeight / 2 - cy;
        apply();
      });
    };
    measure();
    ScrollTrigger.addEventListener("refresh", measure);

    const held = fits ? hold(api, pin.parentElement as HTMLElement, pin, () => window.innerHeight * 1.65) : null;

    const tl = gsap.timeline({
      scrollTrigger: held
        ? { trigger: held.trigger, start: held.start, end: held.end, scrub: 0.8 }
        : { trigger: pin, start: "top 75%", end: "bottom 90%", scrub: 0.8 },
    });

    tl.fromTo(depth, { scale: 1.36, yPercent: 7, rotationY: -22 }, { scale: 1, yPercent: 0, rotationY: 0, ease: "power2.out", duration: 1.1 }, 0)
      .fromTo(ghost, { xPercent: 13 }, { xPercent: 0, ease: "power1.out", duration: 1.25 }, 0)
      .fromTo(rings, { rotation: -70, scale: 0.72 }, { rotation: 0, scale: 1, ease: "power2.out", duration: 1.1 }, 0)
      .fromTo(glow, { autoAlpha: 0.35 }, { autoAlpha: 1, ease: "none", duration: 0.7 }, 0);

    flights.forEach(({ panel, flight, apply }, i) => {
      const at = 0.1 + i * 0.13;
      tl.fromTo(flight, { p: 0 }, { p: 1, ease: "power3.out", duration: 0.68, onUpdate: apply }, at);
      const tick = panel.querySelector(".lh-war__tick");
      if (tick) tl.fromTo(tick, { scaleX: 0 }, { scaleX: 1, ease: "expo.out", duration: 0.26 }, at + 0.46);
    });
    tl.to({}, { duration: 0.14 });

    return () => {
      held?.release();
      ScrollTrigger.removeEventListener("refresh", measure);
      gsap.set(panels, { clearProps: "transform,opacity" });
    };
  });

  // Stacked composition: panels sweep in from alternating sides as each arrives.
  mm.add("not all and (min-aspect-ratio: 1/1), (max-width: 859.98px)", () => {
    const span = { trigger: core, start: "top bottom", end: "bottom top", scrub: 0.8 };
    gsap.fromTo(depth, { scale: 1.2, yPercent: 8, rotationY: -22 }, { scale: 0.96, yPercent: -5, rotationY: 14, ease: "none", scrollTrigger: span });
    gsap.fromTo(ghost, { xPercent: 12 }, { xPercent: -12, ease: "none", scrollTrigger: { ...span } });
    gsap.fromTo(rings, { rotation: -60, scale: 0.8 }, { rotation: 40, scale: 1.06, ease: "none", scrollTrigger: { ...span } });

    panels.forEach((panel, i) => {
      gsap.from(panel, {
        xPercent: i % 2 ? 34 : -34,
        y: 40,
        rotation: i % 2 ? 5 : -5,
        autoAlpha: 0,
        ease: "power2.out",
        scrollTrigger: { trigger: panel, start: "top 100%", end: "top 74%", scrub: 0.6 },
      });
    });
  });

  // Slow rotation by pointer. Touch devices get the scrubbed rotation above.
  if (finePointer) {
    const tiltY = gsap.quickTo(tilt, "rotationY", { duration: 1.4, ease: "power3" });
    const tiltX = gsap.quickTo(tilt, "rotationX", { duration: 1.4, ease: "power3" });
    const ghostX = gsap.quickTo(ghost, "x", { duration: 1.8, ease: "power3" });
    const glowX = gsap.quickTo(glow, "x", { duration: 1.6, ease: "power3" });
    gsap.set(tilt, { transformPerspective: 1100 });

    const onMove = (e: PointerEvent) => {
      const px = e.clientX / window.innerWidth - 0.5;
      const py = e.clientY / window.innerHeight - 0.5;
      tiltY(px * 30);
      tiltX(py * -18);
      ghostX(px * -window.innerWidth * 0.022);
      glowX(px * window.innerWidth * 0.03);
    };
    const onLeave = () => {
      tiltY(0);
      tiltX(0);
      ghostX(0);
      glowX(0);
    };
    section.addEventListener("pointermove", onMove, { passive: true });
    section.addEventListener("pointerleave", onLeave);
    onCleanup(() => {
      section.removeEventListener("pointermove", onMove);
      section.removeEventListener("pointerleave", onLeave);
    });
  }
}
