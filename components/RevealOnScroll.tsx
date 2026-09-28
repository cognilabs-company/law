"use client";

import { useEffect } from "react";
import { usePathname } from "@/i18n/navigation";

const SELECTOR =
  ".rvx, .head, .card, .qtile, .stat, .step, .plan, .wcard, .fstep, .phone, .dash, .faq details, .appcta, .advcard";

// 55ms per item is what the page shipped with and it still reads well; the cap
// keeps the slowest item in a row at 220ms, so a six-card row does not make the
// reader wait half a second for the tail.
const STEP_MS = 55;
const MAX_STEP = 4;

// Reveal when the top edge crosses the fold: measured on /uz, an element flips
// to .in with its top at 891-927px in a 1000px viewport. Nothing reveals
// off-screen and nothing reveals after the reader has passed it.
const PAGE_MARGIN = "0px 0px -6% 0px";

// The outermost ancestor that scrolls sideways, or null. Cards inside one — the
// lawyer carousel, .qtile inside .scroller, .step inside .steps on a phone —
// cannot be observed individually: IntersectionObserver intersects the target
// against the clip rect of every scroll container on the way up, so a card
// swiped off the side of its row has an empty intersection rect and no
// rootMargin on the root can bring it back. Measured consequence of observing
// them one by one: of 76 lawyer cards only the 5 inside the viewport ever
// revealed, and pressing the next arrow gave 0.4s of empty card followed by a
// 0.65s fade. The row is therefore revealed as one unit instead.
// The test reads computed overflow-x and never scrollWidth, because a section
// under content-visibility:auto is not laid out when its cards first mount, so
// every measured width would read 0 at exactly the moment this is asked.
function horizontalScroller(el: Element, cache: Map<Element, boolean>) {
  let node: Element | null = el.parentElement;
  let found: Element | null = null;
  while (node && node !== document.body) {
    let scrolls = cache.get(node);
    if (scrolls === undefined) {
      const ox = getComputedStyle(node).overflowX;
      scrolls = ox === "auto" || ox === "scroll";
      cache.set(node, scrolls);
    }
    if (scrolls) found = node;
    node = node.parentElement;
  }
  return found;
}

// Global reveal-on-scroll controller.
// Re-scans on every client navigation AND whenever new nodes appear, because
// several sections (the lawyer carousel, the service tabs) render their cards
// only after a fetch or a click — the old one-shot scan missed them entirely.
// Measured on /uz at 1440x1000: 105 of the 121 reveal targets on the landing
// page were lawyer cards that never got the class and therefore snapped in
// while every other card faded. That inconsistency is the thing the GM reads
// as a broken sequence.
export default function RevealOnScroll() {
  const pathname = usePathname();

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) return;

    const reveal: IntersectionObserverCallback = (entries, obs) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        obs.unobserve(e.target);
      });
    };
    const ioPage = new IntersectionObserver(reveal, {
      rootMargin: PAGE_MARGIN,
      threshold: 0.06,
    });

    // Horizontal rows reveal whole: when the row crosses the fold every card in
    // it lands, each still carrying its own stagger delay, so the ones already
    // in view arrive as a diagonal and the ones off to the side are opaque by
    // the time the reader swipes to them.
    const openRows = new WeakSet<Element>();
    const ioRow = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        openRows.add(e.target);
        ioRow.unobserve(e.target);
        e.target
          .querySelectorAll(".rv:not(.in)")
          .forEach((c) => c.classList.add("in"));
      });
    }, { rootMargin: PAGE_MARGIN, threshold: 0.02 });

    // Armed elements are tracked per effect instance rather than by looking for
    // the .rv class, because React's development double-invoke mounts, cleans
    // up and mounts again: on the second pass every element already carries .rv
    // from the first, so a class-based filter found nothing to observe and the
    // whole page stayed at opacity 0. A set that dies with the observers it
    // belongs to re-observes whatever the new observers have not seen yet.
    const armed = new WeakSet<Element>();

    const arm = () => {
      const fresh = Array.from(
        document.querySelectorAll<HTMLElement>(SELECTOR),
      ).filter((e) => !armed.has(e) && !e.classList.contains("in"));
      if (!fresh.length) return;

      // The stagger index has to restart inside each container. The old code
      // used the document-wide index (i % 5), so the phase of the diagonal
      // depended on how many targets happened to precede the grid: the five
      // stage cards measured 55/110/165/220/0ms, which means the fifth card
      // landed BEFORE the second, third and fourth. Counting per parent makes
      // every grid read left-to-right, top-to-bottom, and gives every section
      // heading 0ms so it always leads its own section.
      const seen = new Map<Element, number>();
      const scrollerCache = new Map<Element, boolean>();
      const vh = window.innerHeight;

      fresh.forEach((el) => {
        armed.add(el);
        const parent: Element = el.parentElement ?? document.body;
        const idx = seen.get(parent) ?? 0;
        seen.set(parent, idx + 1);
        const ms = Math.min(idx, MAX_STEP) * STEP_MS;
        el.style.transitionDelay = `${ms}ms`;
        // Pseudo-elements inherit custom properties, so a descendant's ::before
        // (the stage progress line) can ride the same delay as its card.
        el.style.setProperty("--rvd", `${ms}ms`);
        el.classList.add("rv");

        const row = horizontalScroller(el, scrollerCache);
        const r = el.getBoundingClientRect();
        if ((r.top < vh && r.bottom > 0 && r.width > 0) || (row && openRows.has(row))) {
          // Already on screen when we found it — or a late arrival in a row
          // that has already opened. Adding .in in the same style
          // recalculation keeps the computed opacity at 1 throughout, so the
          // browser never paints a blank frame. This is what stops content
          // above the fold, and any list that re-renders under the reader's
          // eyes, from blinking out and fading back in.
          el.classList.add("in");
        } else if (row) {
          ioRow.observe(row);
        } else {
          ioPage.observe(el);
        }
      });
    };

    arm();

    let raf = 0;
    const mo = new MutationObserver((records) => {
      if (raf) return;
      if (!records.some((r) => r.addedNodes.length)) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        arm();
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
      ioPage.disconnect();
      ioRow.disconnect();
    };
  }, [pathname]);

  return null;
}
