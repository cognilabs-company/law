import { clipTween, insetClip } from "./clip";
import { hold } from "./hold";
import type { MotionApi } from "./types";

// Timeline units: one unit is one stage height of scroll.
const FIRST_HOLD = 0.3;
const STEP = 1;
const ENTRY = 0.7;
const TAIL = 0.4;

// A fixed seam, so the tear looks torn but never changes between visits.
const SEAM = Array.from({ length: 31 }, (_, i) => ({
  jag: Math.sin(i * 2.4) * 1.5 + Math.sin(i * 7.3 + 1) * 0.8,
  fray: Math.abs(Math.sin(i * 5.1 + 2)) * 5,
}));

/** A jagged seam from high right to low left, opened by `f` from 0 (no area at all)
 *  to 1 (past every edge). Same point count at every f, so GSAP can interpolate. */
function tear(f: number) {
  const last = SEAM.length - 1;
  const at = ({ jag, fray }: (typeof SEAM)[number], i: number, sign: number) => {
    const x = 57 - (18 * i) / last + jag + sign * f * (150 + fray * 2);
    const y = -2 + (104 * i) / last;
    return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
  };
  const left = SEAM.map((p, i) => at(p, i, -1));
  const right = SEAM.map((p, i) => at(p, i, 1)).reverse();
  return `polygon(${[...left, ...right].join(",")})`;
}

export function problemMotion(api: MotionApi) {
  const { gsap, ScrollTrigger, root, onCleanup } = api;
  const section = root.querySelector<HTMLElement>(".lh-prob");
  const stage = section?.querySelector<HTMLElement>(".lh-prob__stage");
  if (!section || !stage) return;

  // The h2 brightens word by word as it crosses the viewport.
  const title = section.querySelector<HTMLElement>(".lh-prob__title");
  const titleWords = gsap.utils.toArray<HTMLElement>(".lh-prob__tw", section);
  if (title && titleWords.length) {
    gsap.fromTo(
      titleWords,
      { opacity: 0.13 },
      {
        opacity: 1,
        ease: "none",
        stagger: 0.4,
        scrollTrigger: { trigger: title, start: "top 82%", end: "bottom 58%", scrub: 0.5 },
      },
    );
  }

  const scenes = gsap.utils.toArray<HTMLElement>(".lh-prob__scene", stage);
  if (scenes.length !== 4) return;

  stage.classList.add("is-staged");
  onCleanup(() => stage.classList.remove("is-staged"));

  const total = FIRST_HOLD + STEP * 3 + TAIL - (STEP - ENTRY);
  const track = stage.parentElement as HTMLElement;
  const held = hold(api, track, stage, () => stage.offsetHeight * total);
  onCleanup(held.release);

  // A scene behind a closed clip-path may count as out of view and stay unloaded,
  // so the photos start loading well before the stage arrives.
  ScrollTrigger.create({
    trigger: stage,
    start: "top 300%",
    once: true,
    onEnter: () => {
      stage.querySelectorAll("img").forEach((img) => {
        if (img.getClientRects().length) img.loading = "eager";
      });
    },
  });

  const parts = scenes.map((scene) => ({
    scene,
    media: scene.querySelector<HTMLElement>(".lh-prob__media")!,
    img: [...scene.querySelectorAll<HTMLElement>("img")],
    veil: scene.querySelector<HTMLElement>(".lh-prob__veil")!,
    copy: scene.querySelector<HTMLElement>(".lh-prob__copy")!,
    words: scene.querySelectorAll<HTMLElement>(".lh-prob__wi"),
    count: scene.querySelector<HTMLElement>(".lh-prob__count")!,
    text: scene.querySelector<HTMLElement>(".lh-prob__text")!,
  }));

  // The maze arrives first: the frame opens and the camera pulls back from the figure.
  const [maze, doors, torn, storm] = parts;
  gsap
    .timeline({
      defaults: { ease: "none" },
      scrollTrigger: { trigger: track, start: "top bottom", end: "top top", scrub: 0.6 },
    })
    .add(clipTween(api, maze.scene, insetClip([10, 7, 0, 7], [0, 0, 0, 0], 2.5, 0), { duration: 1 }), 0)
    .fromTo(maze.img, { scale: 1.35 }, { scale: 1, duration: 1 }, 0)
    .fromTo(maze.words, { yPercent: 118 }, { yPercent: 0, duration: 0.3, stagger: 0.03, ease: "power3.out" }, 0.48)
    .fromTo([maze.count, maze.text], { y: 26, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.3, ease: "power3.out" }, 0.62);

  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: { trigger: held.trigger, start: held.start, end: held.end, scrub: 0.7 },
  });

  // Keeps the last scene on screen for the tail, whatever the tweens below add up to.
  tl.set({}, {}, total);

  const fill = stage.querySelector<HTMLElement>(".lh-prob__fill");

  // Each entry is taken from its own metaphor. The image counter-scales inside.
  const enter = (next: (typeof parts)[number], t: number) => {
    switch (next) {
      case doors: {
        const [a, b] = gsap.utils.toArray<HTMLElement>(".lh-prob__slit i", stage);
        tl.add(
          clipTween(api, next.scene, insetClip([0, 50, 0, 50], [0, 0, 0, 0]), { duration: ENTRY, ease: "power2.inOut" }),
          t,
        );
        tl.fromTo(next.img, { scale: 1.22 }, { scale: 1, duration: STEP, ease: "power1.out" }, t);
        tl.fromTo([a, b], { opacity: 0 }, { opacity: 1, duration: 0.08 }, t - 0.04);
        tl.fromTo(a, { xPercent: 0 }, { xPercent: -100, duration: ENTRY, ease: "power2.inOut" }, t);
        tl.fromTo(b, { xPercent: 0 }, { xPercent: 100, duration: ENTRY, ease: "power2.inOut" }, t);
        tl.to([a, b], { opacity: 0, duration: 0.12 }, t + ENTRY - 0.12);
        break;
      }
      case torn:
        tl.add(clipTween(api, next.scene, tear, { duration: ENTRY, ease: "power3.in" }), t);
        tl.fromTo(next.img, { scale: 1.3, rotate: 3 }, { scale: 1, rotate: 0, duration: STEP, ease: "power1.out" }, t);
        break;
      case storm:
        tl.add(
          clipTween(api, next.scene, (p) => `circle(${(92 * p).toFixed(3)}% at 50% 58%)`, { duration: ENTRY, ease: "power2.in" }),
          t,
        );
        tl.fromTo(next.img, { scale: 1.55, rotate: -11 }, { scale: 1, rotate: 0, duration: STEP, ease: "power2.out" }, t);
        break;
    }
  };

  parts.slice(1).forEach((next, i) => {
    const prev = parts[i];
    const t = FIRST_HOLD + STEP * i;

    // The previous text lifts out and the previous photo sinks back.
    tl.to(prev.copy, { yPercent: -9, autoAlpha: 0, duration: 0.3, ease: "power2.in" }, t);
    tl.to(prev.media, { scale: 1.09, duration: ENTRY }, t);
    tl.to(prev.veil, { opacity: 0.62, duration: ENTRY }, t);

    // Hidden outright until its entry begins: a closed clip can still leave a stray pixel.
    gsap.set(next.scene, { visibility: "hidden" });
    tl.set(next.scene, { visibility: "visible" }, t);
    enter(next, t);

    // New lines rise once the opening has room for them.
    tl.fromTo(next.words, { yPercent: 118 }, { yPercent: 0, duration: 0.3, stagger: 0.028, ease: "power3.out" }, t + 0.36);
    tl.fromTo(
      [next.count, next.text],
      { y: 26, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: 0.28, stagger: 0.06, ease: "power3.out" },
      t + 0.46,
    );

    if (fill) {
      tl.fromTo(
        fill,
        { scaleY: i / 3 },
        { scaleY: (i + 1) / 3, duration: ENTRY, immediateRender: i === 0 },
        t,
      );
    }
  });

  // The storm's two words are flung in from the outside.
  const halves = gsap.utils.toArray<HTMLElement>(".lh-prob__half", storm.scene);
  if (halves.length === 2) {
    const t = FIRST_HOLD + STEP * 2 + 0.3;
    tl.fromTo(halves[0], { xPercent: -24, rotate: -6 }, { xPercent: 0, rotate: 0, duration: 0.5, ease: "power3.out" }, t);
    tl.fromTo(halves[1], { xPercent: 24, rotate: 6 }, { xPercent: 0, rotate: 0, duration: 0.5, ease: "power3.out" }, t);
  }
}
