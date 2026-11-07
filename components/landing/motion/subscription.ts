import { clipTween, insetClip } from "./clip";
import { hold } from "./hold";
import type { MotionApi } from "./types";

/**
 * The band opens from a small rounded window to its full width while pinned.
 * Only the band moves: GSAP never touches SubscriptionSection, whose prices and
 * term switch belong to React.
 */
export function subscriptionMotion(api: MotionApi) {
  const { gsap, root, onCleanup } = api;
  const wrap = root.querySelector<HTMLElement>(".lh-sub");
  if (!wrap) return;
  const pin = wrap.querySelector<HTMLElement>(".lh-sub__pin");
  const frame = wrap.querySelector<HTMLElement>(".lh-sub__frame");
  const media = wrap.querySelector<HTMLElement>(".lh-sub__media");
  const ghost = wrap.querySelector<HTMLElement>(".lh-sub__ghost");
  const copy = wrap.querySelector<HTMLElement>(".lh-sub__copy");
  if (!pin || !frame || !media || !ghost || !copy) return;

  const fits = pin.offsetHeight <= window.innerHeight + 2;
  const radius = parseFloat(getComputedStyle(frame).borderTopLeftRadius) || 0;
  const pinLength = () => window.innerHeight * 1.15;
  const lead = () => window.innerHeight * 0.8;

  const track = pin.parentElement as HTMLElement;
  if (fits) onCleanup(hold(api, track, pin, pinLength).release);

  const portrait = window.matchMedia("(max-aspect-ratio: 1/1)").matches;
  const closed = portrait ? [23, 15, 23, 15] : [21, 31, 21, 31];

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: track,
      start: "top 80%",
      end: () => (fits ? `+=${lead() + pinLength()}` : "bottom 70%"),
      scrub: 0.7,
      invalidateOnRefresh: true,
    },
  });

  tl.add(
    clipTween(api, frame, insetClip(closed, [0, 0, 0, 0], radius * 1.2, radius, "px"), { ease: "power2.inOut", duration: 1 }),
    0,
  )
    .fromTo(media, { scale: 1.42 }, { scale: 1, ease: "power2.inOut", duration: 1 }, 0)
    .fromTo(ghost, { xPercent: 11 }, { xPercent: 0, ease: "power1.out", duration: 1 }, 0)
    .fromTo(
      Array.from(copy.children),
      { y: 54, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, ease: "expo.out", duration: 0.3, stagger: 0.07 },
      0.72,
    );
}
