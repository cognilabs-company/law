import type { MotionApi } from "./types";

/**
 * Keeps `el` on screen for `run()` pixels of scrolling with CSS sticky, inside
 * `track`, which must be its parent and contain nothing else that matters.
 *
 * Use this instead of ScrollTrigger's `pin`. A pin moves the element into a spacer,
 * switches it to position:fixed and undoes all of that on every refresh, and on
 * this site each of those steps forces a full style recalculation: with five pins
 * a refresh blocked the main thread for 8 seconds on a slower device. Sticky costs
 * nothing per frame and does not jitter when a phone's address bar moves.
 *
 * An element taller than the screen starts holding once its bottom edge arrives.
 * Spread the returned values into a ScrollTrigger. Call `release` to undo it.
 */
export function hold(
  { ScrollTrigger }: Pick<MotionApi, "ScrollTrigger">,
  track: HTMLElement,
  el: HTMLElement,
  run: () => number,
) {
  const apply = () => {
    const height = el.offsetHeight;
    track.style.height = `${height + run()}px`;
    el.style.top = `${Math.min(0, window.innerHeight - height)}px`;
  };

  el.style.position = "sticky";
  el.dataset.lhHeld = "";
  apply();
  // Before every refresh measures anything, so triggers read the final layout.
  ScrollTrigger.addEventListener("refreshInit", apply);

  return {
    trigger: track,
    start: () => `top+=${Math.max(0, el.offsetHeight - window.innerHeight)} top`,
    end: () => `+=${Math.round(run())}`,
    release() {
      ScrollTrigger.removeEventListener("refreshInit", apply);
      track.style.removeProperty("height");
      el.style.removeProperty("position");
      el.style.removeProperty("top");
      delete el.dataset.lhHeld;
    },
  };
}
