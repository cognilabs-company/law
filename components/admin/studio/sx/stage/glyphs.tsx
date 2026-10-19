"use client";

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { BadgeCheckIcon, CheckIcon, HourglassIcon, PencilIcon, PencilLineIcon, RadioIcon, SendIcon, Undo2Icon, XIcon } from "../icons";
import type { SxIcon } from "../types";

const GLYPHS = {
  draft: PencilLineIcon,
  pencil: PencilIcon,
  submitted: SendIcon,
  in_review: HourglassIcon,
  approved: BadgeCheckIcon,
  published: RadioIcon,
  returned: Undo2Icon,
  rejected: XIcon,
  check: CheckIcon,
  close: XIcon,
} as const satisfies Record<string, SxIcon>;

export type StageGlyph = keyof typeof GLYPHS;

const NAMES = Object.keys(GLYPHS) as StageGlyph[];
const EMPTY = Object.fromEntries(NAMES.map((k) => [k, ""])) as Record<StageGlyph, string>;

let cache: Record<StageGlyph, string> | null = null;

export function stageGlyphs(): Record<StageGlyph, string> {
  if (cache) return cache;
  if (typeof document === "undefined") return EMPTY;
  const box = document.createElement("div");
  const root = createRoot(box);
  try {
    flushSync(() =>
      root.render(
        <>
          {NAMES.map((k) => {
            const Icon = GLYPHS[k];
            return <Icon key={k} data-g={k} size={24} strokeWidth={2} aria-hidden="true" focusable="false" />;
          })}
        </>,
      ),
    );
    const out = { ...EMPTY };
    box.querySelectorAll<SVGElement>("svg[data-g]").forEach((svg) => {
      const k = svg.getAttribute("data-g") as StageGlyph;
      svg.removeAttribute("data-g");
      out[k] = svg.outerHTML;
    });
    if (NAMES.every((k) => out[k])) cache = out;
    return out;
  } catch {
    return EMPTY;
  } finally {
    root.unmount();
  }
}
