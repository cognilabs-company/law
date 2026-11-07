import type gsapType from "gsap";
import type { ScrollTrigger as ScrollTriggerType } from "gsap/ScrollTrigger";
import type { SplitText as SplitTextType } from "gsap/SplitText";

/** What every section's motion function receives. Runs only when the visitor
 *  has not asked for reduced motion, inside one gsap.context on the root. */
export type MotionApi = {
  gsap: typeof gsapType;
  ScrollTrigger: typeof ScrollTriggerType;
  SplitText: typeof SplitTextType;
  root: HTMLElement;
  /** True on devices with a mouse or trackpad. Use for hover and pointer effects. */
  finePointer: boolean;
  /** Register teardown for anything gsap.context cannot revert (listeners, observers, rAF). */
  onCleanup: (fn: () => void) => void;
};

export type SectionMotion = (api: MotionApi) => void;
