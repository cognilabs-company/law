"use client";

import { useLayoutEffect } from "react";
import { commonMotion, cursorMotion } from "./motion/common";
import { heroMotion } from "./motion/hero";
import { manifestoMotion } from "./motion/manifesto";
import { problemMotion } from "./motion/problem";
import { bandMotion } from "./motion/band";
import { aiMotion } from "./motion/ai";
import { stagesMotion } from "./motion/stages";
import { servicesMotion } from "./motion/services";
import { benefitsMotion } from "./motion/benefits";
import { warrantyMotion } from "./motion/warranty";
import { subscriptionMotion } from "./motion/subscription";
import { finalCtaMotion } from "./motion/finalCta";
import type { MotionApi, SectionMotion } from "./motion/types";

const SECTIONS: SectionMotion[] = [
  heroMotion,
  manifestoMotion,
  problemMotion,
  bandMotion,
  aiMotion,
  stagesMotion,
  servicesMotion,
  benefitsMotion,
  warrantyMotion,
  subscriptionMotion,
  finalCtaMotion,
];

/**
 * All scroll-driven motion for the landing, in one gsap.context.
 *
 * GSAP loads after hydration, so the first screen animates in CSS at paint and
 * everything here only ever adds to a page that is already complete.
 * useLayoutEffect matters: reverting before React removes the DOM puts pinned
 * nodes back where React expects them, otherwise leaving the page throws.
 */
export default function LandingMotion() {
  useLayoutEffect(() => {
    let dead = false;
    let teardown = () => {};

    (async () => {
      const [{ default: gsap }, { ScrollTrigger }, { SplitText }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
        import("gsap/SplitText"),
      ]);
      if (dead) return;
      const root = document.querySelector<HTMLElement>(".lhome");
      if (!root) return;

      gsap.registerPlugin(ScrollTrigger, SplitText);

      const cleanups: (() => void)[] = [];
      const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
      const api: MotionApi = {
        gsap,
        ScrollTrigger,
        SplitText,
        root,
        finePointer,
        onCleanup: (fn) => cleanups.push(fn),
      };

      const ctx = gsap.context(() => {
        const mm = gsap.matchMedia();
        mm.add("(prefers-reduced-motion: no-preference)", () => {
          for (const run of [...SECTIONS, commonMotion, cursorMotion]) {
            // One failing effect must not take the rest of the page with it.
            try {
              run(api);
            } catch (err) {
              console.warn("[landing] motion setup failed", err);
            }
          }
        });
      }, root);

      // ScrollTrigger has no ResizeObserver of its own, and this page grows late:
      // lawyer cards, Finder results and FAQ answers all change its height.
      let timer: ReturnType<typeof setTimeout> | undefined;
      let lastHeight = root.offsetHeight;
      const observer = new ResizeObserver(() => {
        const height = root.offsetHeight;
        if (Math.abs(height - lastHeight) < 2) return;
        lastHeight = height;
        clearTimeout(timer);
        timer = setTimeout(() => {
          ScrollTrigger.refresh();
          lastHeight = root.offsetHeight;
        }, 220);
      });
      observer.observe(root);
      document.fonts?.ready.then(() => {
        if (!dead) ScrollTrigger.refresh();
      });

      teardown = () => {
        clearTimeout(timer);
        observer.disconnect();
        cleanups.splice(0).forEach((fn) => fn());
        ctx.revert();
        // ScrollTrigger writes an inline scroll-behavior during refresh.
        document.documentElement.style.removeProperty("scroll-behavior");
      };
    })().catch((err) => console.warn("[landing] motion failed to load", err));

    return () => {
      dead = true;
      teardown();
    };
  }, []);

  return null;
}
