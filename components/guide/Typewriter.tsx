"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const PAUSE = /[.,!?;:—–]$/;

function graphemes(text: string, locale: string): string[] {
  try {
    if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
      const seg = new Intl.Segmenter(locale, { granularity: "grapheme" });
      return Array.from(seg.segment(text), (s) => s.segment);
    }
  } catch {
    return Array.from(text);
  }
  return Array.from(text);
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function Typewriter({ text, locale, onDone, className = "" }: { text: string; locale: string; onDone?: () => void; className?: string }) {
  const parts = useMemo(() => graphemes(text, locale), [text, locale]);
  const [reduce] = useState(reducedMotion);
  const [count, setCount] = useState(() => (reduce ? parts.length : 0));
  const doneRef = useRef(onDone);
  const skipRef = useRef(false);

  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    if (reduce) {
      doneRef.current?.();
      return;
    }
    const per = Math.min(32, Math.max(14, 1800 / Math.max(1, parts.length)));
    const times: number[] = [];
    let acc = 0;
    for (let i = 0; i < parts.length; i++) {
      acc += per + (i > 0 && PAUSE.test(parts[i - 1]) ? 140 : 0);
      times.push(acc);
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      if (skipRef.current) {
        setCount(parts.length);
        doneRef.current?.();
        return;
      }
      const elapsed = now - start;
      let k = 0;
      while (k < times.length && times[k] <= elapsed) k++;
      setCount(k);
      if (k < parts.length) raf = window.requestAnimationFrame(tick);
      else doneRef.current?.();
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [parts, reduce]);

  const typing = count < parts.length;
  return (
    <span
      className={`twr${typing ? " is-typing" : ""}${className ? ` ${className}` : ""}`}
      onClick={() => {
        skipRef.current = true;
      }}
      aria-hidden="true"
    >
      <span className="twr__ghost">{text}</span>
      <span className="twr__live">
        {parts.slice(0, count).join("")}
        {typing ? <i className="twr__caret" /> : null}
      </span>
    </span>
  );
}
