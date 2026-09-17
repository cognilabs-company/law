"use client";

import { useLayoutEffect, useRef } from "react";

// FLIP (First–Last–Invert–Play) for a container whose children carry a
// `data-flip` id: when a child moves or resizes because another child was
// added/removed, it glides from its old box to the new one with a
// compositor-only transform instead of jumping. New children fade/scale in via
// CSS; removed ones just unmount (React) — see .mtg__tile animation.
export function useFlip<T extends HTMLElement>(dep: unknown, duration = 380) {
  const ref = useRef<T | null>(null);
  const prev = useRef<Map<string, DOMRect>>(new Map());
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, DOMRect>();
    const kids = Array.from(root.querySelectorAll<HTMLElement>("[data-flip]"));
    for (const el of kids) {
      const id = el.dataset.flip || "";
      const rect = el.getBoundingClientRect();
      next.set(id, rect);
      const was = prev.current.get(id);
      if (!was || reduce || typeof el.animate !== "function") continue;
      const dx = was.left - rect.left;
      const dy = was.top - rect.top;
      const sx = was.width / Math.max(1, rect.width);
      const sy = was.height / Math.max(1, rect.height);
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) continue;
      el.style.transformOrigin = "top left";
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transform: "none" }],
        { duration, easing: "cubic-bezier(.2,.8,.2,1)", fill: "none" },
      );
    }
    prev.current = next;
  }, [dep, duration]);
  return ref;
}
