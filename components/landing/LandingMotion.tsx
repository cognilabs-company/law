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

// In page order: pinned sections add height, so later triggers must measure after them.
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
  commonMotion,
  cursorMotion,
];

/** Gives the browser a turn to paint and handle input. Not throttled like a timer. */
const breathe = () =>
  new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(0);
  });

/**
 * All scroll-driven motion for the landing, in one gsap.context.
 *
 * GSAP loads after hydration, so the first screen animates in CSS at paint and
 * everything here only ever adds to a page that is already complete.
 *
 * Setup runs one section per task. Every forced layout is slow on this site
 * because of its very large stylesheet, and doing all of it in one go blocked
 * the main thread for many seconds, long enough for "page not responding".
 *
 * useLayoutEffect matters: reverting before React removes the DOM puts pinned
 * nodes back where React expects them, otherwise leaving the page throws.
 */
export default function LandingMotion() {
  useLayoutEffect(() => {
    let dead = false;
    let teardown = () => {};

    (async () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      // Set up once, with the final fonts, so nothing is measured twice. A slow
      // font must not hold the motion back.
      await Promise.race([
        document.fonts?.ready,
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
      if (dead) return;
      const root = document.querySelector<HTMLElement>(".lhome");
      if (!root) return;

      gsap.registerPlugin(ScrollTrigger);
      // A refresh recalculates the style of the whole page and takes seconds here.
      // Images have fixed boxes and the fonts are already in, so only a real resize
      // needs one: by default it would also run on page load and on every return
      // to the tab, freezing the page each time.
      ScrollTrigger.config({ autoRefreshEvents: "resize" });

      const cleanups: (() => void)[] = [];
      const api: MotionApi = {
        gsap,
        ScrollTrigger,
        root,
        finePointer: window.matchMedia("(hover: hover) and (pointer: fine)").matches,
        onCleanup: (fn) => cleanups.push(fn),
      };
      const ctx = gsap.context(() => {}, root);

      // ScrollTrigger has no ResizeObserver of its own, and this page grows late:
      // lawyer cards, Finder results and FAQ answers all change its height.
      let timer: ReturnType<typeof setTimeout> | undefined;
      let lastHeight = 0;
      const observer = new ResizeObserver(() => {
        const height = root.offsetHeight;
        if (Math.abs(height - lastHeight) < 2) return;
        lastHeight = height;
        clearTimeout(timer);
        timer = setTimeout(() => {
          // true: if the visitor is scrolling, wait for them to stop.
          ScrollTrigger.refresh(true);
          lastHeight = root.offsetHeight;
        }, 400);
      });

      teardown = () => {
        clearTimeout(timer);
        observer.disconnect();
        cleanups.splice(0).forEach((fn) => fn());
        ctx.revert();
        // ScrollTrigger writes an inline scroll-behavior during refresh.
        document.documentElement.style.removeProperty("scroll-behavior");
      };

      for (const run of SECTIONS) {
        await breathe();
        if (dead) return;
        // One failing effect must not take the rest of the page with it.
        try {
          ctx.add(() => run(api));
        } catch (err) {
          console.warn("[landing] motion setup failed", err);
        }
      }
      await breathe();
      if (dead) return;
      ScrollTrigger.refresh();
      lastHeight = root.offsetHeight;
      observer.observe(root);
    })().catch((err) => console.warn("[landing] motion failed to load", err));

    return () => {
      dead = true;
      teardown();
    };
  }, []);

  return null;
}
