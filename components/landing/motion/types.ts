import type gsapType from "gsap";
import type { ScrollTrigger as ScrollTriggerType } from "gsap/ScrollTrigger";

/** What every section's motion function receives. Runs only when the visitor
 *  has not asked for reduced motion, inside one gsap.context on the root. */
export type MotionApi = {
  gsap: typeof gsapType;
  ScrollTrigger: typeof ScrollTriggerType;
  root: HTMLElement;
  /** True on devices with a mouse or trackpad. Use for hover and pointer effects. */
  finePointer: boolean;
  /** Register teardown for anything gsap.context cannot revert (listeners, observers, rAF). */
  onCleanup: (fn: () => void) => void;
};

export type SectionMotion = (api: MotionApi) => void;
