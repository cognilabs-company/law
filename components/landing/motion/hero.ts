import { clipTween, insetClip } from "./clip";
import type { MotionApi } from "./types";

/**
 * Hero: exact fit of the big line, pointer parallax and the scrubbed exit.
 *
 * The entrance is CSS at paint, on inner wrappers and on `translate`. GSAP only
 * ever touches the outer wrappers. The two h1 parts must keep the h1 free of a
 * stacking context and carry their gradient themselves, so they move through
 * CSS variables that their own transform reads.
 */
export function heroMotion(api: MotionApi) {
  const { gsap, root, finePointer, onCleanup } = api;
  const pin = root.querySelector<HTMLElement>(".lh-hero__pin");
  const big = root.querySelector<HTMLElement>(".lh-hero__big");
  const small = root.querySelector<HTMLElement>(".lh-hero__small");
  if (!pin || !big || !small) return;

  const q = <T extends Element = HTMLElement>(sel: string) => pin.querySelector<T>(sel);
  const plate = q(".lh-hero__plate-img");
  const woman = q(".lh-hero__woman");
  const mark = q(".lh-hero__mark");
  const slotA = q(".lh-hero__slot--a");
  const slotB = q(".lh-hero__slot--b");
  const foot = q(".lh-hero__foot");
  const tags = q(".lh-hero__tags");

  /* ---- Exact fit: CSS is within a percent, this removes the rest (kerning). ---- */
  let lastWidth = 0;
  const fit = () => {
    const width = pin.clientWidth;
    if (!width) return;
    lastWidth = width;
    const style = getComputedStyle(big);
    const current = parseFloat(style.fontSize);
    const edge = parseFloat(style.marginLeft) || 0;
    const measured = big.getBoundingClientRect().width;
    if (!current || !measured) return;
    // Same side-bearing allowance as the CSS: the ink, not the box, meets the edges.
    pin.style.setProperty("--lh-fit", `${((width - 2 * edge) / (measured / current - 0.07)).toFixed(2)}px`);
  };
  fit();
  const resize = new ResizeObserver(() => {
    if (pin.clientWidth !== lastWidth) fit();
  });
  resize.observe(pin);
  let alive = true;
  document.fonts?.ready.then(() => {
    if (alive) fit();
  });
  onCleanup(() => {
    alive = false;
    resize.disconnect();
    pin.style.removeProperty("--lh-fit");
  });

  /* ---- Pointer depth, fine pointers only. ---- */
  if (finePointer) {
    const layers = [
      { el: plate, depth: -12 },
      { el: woman, depth: 26 },
      { el: mark, depth: 26 },
      { el: slotA, depth: 26 },
      { el: slotB, depth: 40 },
    ].flatMap(({ el, depth }) =>
      el
        ? [{
            depth,
            x: gsap.quickTo(el, "x", { duration: 1.1, ease: "power3" }),
            y: gsap.quickTo(el, "y", { duration: 1.1, ease: "power3" }),
          }]
        : [],
    );
    const pointer = { x: 0, y: 0 };
    const paint = () => {
      big.style.setProperty("--lh-bpx", `${(pointer.x * -16).toFixed(2)}px`);
      big.style.setProperty("--lh-bpy", `${(pointer.y * -8).toFixed(2)}px`);
    };
    const px = gsap.quickTo(pointer, "x", { duration: 1.1, ease: "power3", onUpdate: paint });
    const py = gsap.quickTo(pointer, "y", { duration: 1.1, ease: "power3", onUpdate: paint });

    const onMove = (e: PointerEvent) => {
      const box = pin.getBoundingClientRect();
      const nx = (e.clientX - box.left) / box.width - 0.5;
      const ny = (e.clientY - box.top) / box.height - 0.5;
      for (const layer of layers) {
        layer.x(nx * layer.depth);
        layer.y(ny * layer.depth * 0.5);
      }
      px(nx);
      py(ny);
    };
    const onLeave = () => {
      for (const layer of layers) {
        layer.x(0);
        layer.y(0);
      }
      px(0);
      py(0);
    };
    pin.addEventListener("pointermove", onMove, { passive: true });
    pin.addEventListener("pointerleave", onLeave);
    onCleanup(() => {
      pin.removeEventListener("pointermove", onMove);
      pin.removeEventListener("pointerleave", onLeave);
      big.style.removeProperty("--lh-bpx");
      big.style.removeProperty("--lh-bpy");
    });
  }

  /* ---- Scroll: she runs at the camera, the type leaves, the frame closes. ---- */
  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger: pin,
      // A hero taller than the screen (phones, with the cards) pins once its end arrives.
      start: () => (pin.offsetHeight > window.innerHeight + 1 ? "bottom bottom" : "top top"),
      end: () => `+=${Math.round(window.innerHeight * 0.7)}`,
      pin: true,
      scrub: 0.6,
      invalidateOnRefresh: true,
    },
  });

  if (plate) tl.fromTo(plate, { scale: 1 }, { scale: 1.14, duration: 1 }, 0);
  if (woman) tl.fromTo(woman, { xPercent: 0, scale: 1 }, { xPercent: 7, scale: 1.26, duration: 1 }, 0);

  tl.fromTo(
    big,
    { "--lh-bx": "0px", "--lh-bo": 1 },
    { "--lh-bx": () => `${Math.round(-0.24 * pin.clientWidth)}px`, "--lh-bo": 0, duration: 0.85 },
    0,
  );
  tl.fromTo(
    small,
    { "--lh-sy": "0px", "--lh-so": 1 },
    { "--lh-sy": () => `${Math.round(-0.14 * window.innerHeight)}px`, "--lh-so": 0, duration: 0.6 },
    0,
  );

  if (tags) tl.fromTo(tags, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3 }, 0);
  if (foot) tl.fromTo(foot, { yPercent: 0, autoAlpha: 1 }, { yPercent: -40, autoAlpha: 0, duration: 0.55 }, 0.02);
  for (const [el, at, lift] of [[mark, 0, -60], [slotA, 0, -60], [slotB, 0.06, -90]] as const) {
    if (el) tl.fromTo(el, { yPercent: 0, autoAlpha: 1 }, { yPercent: el === mark ? 0 : lift, autoAlpha: 0, duration: 0.6 }, at);
  }

  tl.add(clipTween(api, pin, insetClip([0, 0, 0, 0], [3, 3, 5, 3], 0, 2.5), { duration: 1 }), 0);

  onCleanup(() => {
    big.style.removeProperty("--lh-bx");
    big.style.removeProperty("--lh-bo");
    small.style.removeProperty("--lh-sy");
    small.style.removeProperty("--lh-so");
  });
}
