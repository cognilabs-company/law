"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { findTarget, guideMarks, subscribeGuide, type GuideMark } from "@/lib/aiGuide";
import { IconSparkle } from "@/components/icons";

const EMPTY: GuideMark[] = [];
const PAD = 6;
const GAP = 12;

function place(m: GuideMark, node: HTMLElement) {
  const target = findTarget(m.target);
  if (!target || !target.getClientRects().length) {
    node.style.opacity = "0";
    return;
  }
  const r = target.getBoundingClientRect();
  node.style.opacity = "1";
  if (m.kind === "ring") {
    node.style.transform = `translate(${r.left - PAD}px, ${r.top - PAD}px)`;
    node.style.width = `${r.width + PAD * 2}px`;
    node.style.height = `${r.height + PAD * 2}px`;
    return;
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(300, vw - 24);
  node.style.width = `${w}px`;
  const h = node.offsetHeight || 60;
  const below = r.bottom + GAP + h <= vh - 8 || r.top - GAP - h < 8;
  const top = below ? Math.min(r.bottom + GAP, vh - h - 8) : r.top - GAP - h;
  const left = Math.max(12, Math.min(vw - w - 12, r.left + r.width / 2 - w / 2));
  node.style.transform = `translate(${left}px, ${Math.max(8, top)}px)`;
  node.dataset.side = below ? "below" : "above";
  const arrow = Math.max(16, Math.min(w - 16, r.left + r.width / 2 - left));
  node.style.setProperty("--tip-x", `${arrow}px`);
}

export default function AiGuideLayer() {
  const marks = useSyncExternalStore(subscribeGuide, guideMarks, () => EMPTY);
  const nodes = useRef(new Map<number, HTMLElement>());

  useEffect(() => {
    if (!marks.length) return;
    let raf = 0;
    const loop = () => {
      for (const m of marks) {
        const node = nodes.current.get(m.id);
        if (node) place(m, node);
      }
      raf = window.requestAnimationFrame(loop);
    };
    loop();
    return () => window.cancelAnimationFrame(raf);
  }, [marks]);

  if (!marks.length || typeof document === "undefined") return null;
  return createPortal(
    <div className="aiguide" aria-live="polite">
      {marks.map((m) =>
        m.kind === "ring" ? (
          <span
            key={m.id}
            className="aiguide__ring"
            ref={(el) => {
              if (el) nodes.current.set(m.id, el);
              else nodes.current.delete(m.id);
            }}
            aria-hidden="true"
          />
        ) : (
          <span
            key={m.id}
            className="aiguide__tip"
            role="tooltip"
            ref={(el) => {
              if (el) nodes.current.set(m.id, el);
              else nodes.current.delete(m.id);
            }}
          >
            <IconSparkle />
            <span>{m.text}</span>
          </span>
        ),
      )}
    </div>,
    document.body,
  );
}
