import type { MotionApi } from "./types";

/**
 * Animates clip-path through a plain progress value.
 *
 * Never tween `clipPath` directly with GSAP on this page. Its CSS string parser
 * compares every number in the string against the computed value, and the
 * browser normalises that value (`57.30%` becomes `57.3%`, `inset(0% 0% 0% 0%)`
 * collapses to `inset(0%)`, `rem` becomes `px`). Each mismatch runs a unit
 * conversion that inserts a probe element and forces a layout. With this site's
 * very large stylesheet one polygon froze the page for more than a minute.
 *
 * The from-state is painted at once, like a fromTo. Pass the tween to `tl.add()`
 * with a position, or give it a scrollTrigger of its own.
 */
export function clipTween(
  { gsap, onCleanup }: Pick<MotionApi, "gsap" | "onCleanup">,
  el: HTMLElement,
  build: (p: number) => string,
  vars: gsap.TweenVars = {},
): gsap.core.Tween {
  const state = { p: 0 };
  const paint = () => {
    el.style.clipPath = build(state.p);
  };
  paint();
  onCleanup(() => el.style.removeProperty("clip-path"));
  return gsap.to(state, { p: 1, ease: "none", ...vars, onUpdate: paint });
}

const mix = (a: number, b: number, p: number) => a + (b - a) * p;

/** inset() between two [top, right, bottom, left] percentages, with a corner radius. */
export const insetClip =
  (from: number[], to: number[], radiusFrom = 0, radiusTo = 0, unit = "rem") =>
  (p: number) => {
    const [t, r, b, l] = from.map((v, i) => mix(v, to[i], p).toFixed(3));
    return `inset(${t}% ${r}% ${b}% ${l}% round ${mix(radiusFrom, radiusTo, p).toFixed(3)}${unit})`;
  };
