import type { MotionApi } from "./types";

/**
 * Tiles arrive out of depth, drift apart at different speeds on scroll, and tilt
 * toward a precise pointer. Icons turn with the scroll on top of their CSS float.
 * Each layer owns its own transform: li, .lh-ben__depth, .lh-ben__tile, .lh-ben__ico.
 */
export function benefitsMotion({ gsap, root, finePointer, onCleanup }: MotionApi) {
  const sec = root.querySelector<HTMLElement>(".lh-ben");
  if (!sec) return;
  const items = gsap.utils.toArray<HTMLElement>(".lh-ben__item", sec);
  if (!items.length) return;

  items.forEach((item, i) => {
    const depth = item.querySelector<HTMLElement>(".lh-ben__depth");
    const icon = item.querySelector<HTMLElement>(".lh-ben__ico");

    // Each tile is triggered by itself: on a phone they are a screen apart.
    if (depth) {
      gsap.from(depth, {
        y: 130,
        z: -320,
        rotateX: 16,
        autoAlpha: 0,
        duration: 1.5,
        ease: "expo.out",
        delay: (i % 3) * 0.07,
        scrollTrigger: { trigger: item, start: "top 92%", once: true },
      });
    }

    // Icons leave the tile as they pass, each at its own rate.
    if (icon) {
      const lift = 12 + (i % 3) * 7;
      const turn = i % 2 ? -9 : 9;
      gsap.fromTo(
        icon,
        { yPercent: lift, rotate: -turn },
        {
          yPercent: -lift,
          rotate: turn,
          ease: "none",
          scrollTrigger: { trigger: item, start: "top bottom", end: "bottom top", scrub: 0.8 },
        },
      );
    }
  });

  // The tiles slide past each other a little, which is what gives the bento depth.
  const speeds = [-46, 34, -22, 26, 40, -30];
  const tiles = sec.querySelector<HTMLElement>(".lh-ben__tiles");
  const bento = () => !!tiles && getComputedStyle(tiles).gridTemplateColumns.trim().split(/\s+/).length > 2;
  items.forEach((item, i) => {
    const speed = speeds[i % speeds.length];
    gsap.fromTo(
      item,
      { y: () => (bento() ? -speed : 0) },
      {
        y: () => (bento() ? speed : 0),
        ease: "none",
        scrollTrigger: { trigger: sec, start: "top bottom", end: "bottom top", scrub: 1, invalidateOnRefresh: true },
      },
    );
  });

  gsap.utils.toArray<HTMLElement>(".lh-ben__light", sec).forEach((light, i) => {
    gsap.fromTo(
      light,
      { yPercent: i ? 22 : -18, xPercent: i ? -8 : 10 },
      {
        yPercent: i ? -26 : 24,
        xPercent: i ? 14 : -12,
        ease: "none",
        scrollTrigger: { trigger: sec, start: "top bottom", end: "bottom top", scrub: 1.2 },
      },
    );
  });

  if (!finePointer) return;

  items.forEach((item) => {
    const tile = item.querySelector<HTMLElement>(".lh-ben__tile");
    if (!tile) return;
    const glass = tile.querySelector<HTMLElement>(".lh-ben__glass");
    gsap.set(tile, { transformPerspective: 1200 });
    const rx = gsap.quickTo(tile, "rotateX", { duration: 0.7, ease: "power3" });
    const ry = gsap.quickTo(tile, "rotateY", { duration: 0.7, ease: "power3" });

    const onMove = (e: PointerEvent) => {
      const box = item.getBoundingClientRect();
      const px = (e.clientX - box.left) / box.width;
      const py = (e.clientY - box.top) / box.height;
      ry((px - 0.5) * 11);
      rx((0.5 - py) * 9);
      if (glass) {
        glass.style.setProperty("--lh-mx", `${(px * 100).toFixed(1)}%`);
        glass.style.setProperty("--lh-my", `${(py * 100).toFixed(1)}%`);
      }
    };
    const onLeave = () => {
      rx(0);
      ry(0);
      if (glass) {
        glass.style.removeProperty("--lh-mx");
        glass.style.removeProperty("--lh-my");
      }
    };
    item.addEventListener("pointermove", onMove, { passive: true });
    item.addEventListener("pointerleave", onLeave);
    onCleanup(() => {
      item.removeEventListener("pointermove", onMove);
      item.removeEventListener("pointerleave", onLeave);
    });
  });
}
