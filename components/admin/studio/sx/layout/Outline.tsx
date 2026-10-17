"use client";

import "../sx-core.css";
import "../sx-layout.css";
import { useEffect, useRef, useState, type MouseEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { aiId as aiIdOf } from "@/lib/ai/ids";
import { prefersReducedMotion } from "../hooks";
import { CheckIcon, WarningCircleIcon, glyph } from "../icons";
import { scrollParent } from "./util";

export type SxOutlineItem = { id: string; label: string; state?: "todo" | "done" | "error"; errors?: number };
export type SxOutlineProps = { items: readonly SxOutlineItem[]; label: string; activeId?: string; spy?: boolean; onSelect?: (id: string) => void; aiId?: string };

const HEADING = "h1,h2,h3,h4,h5,h6";
const HOLD_MS = 1000;
const END_SLACK = 2;
const SEEN_SLACK = 24;

export function focusSection(id: string): HTMLElement | null {
  const el = document.getElementById(id);
  if (!el) return null;
  const heading = el.matches(HEADING) ? el : el.querySelector<HTMLElement>(HEADING);
  const target = heading ?? el;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  el.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  target.focus({ preventScroll: true });
  return target;
}

export function SxOutline({ items, label, activeId, spy = false, onSelect, aiId }: SxOutlineProps): ReactElement {
  const t = useTranslations("studio");
  const nav = useRef<HTMLElement>(null);
  const hold = useRef(0);
  const [seen, setSeen] = useState<string | undefined>(undefined);
  const ids = items.map((i) => i.id).join("\n");
  const current = spy ? (seen && items.some((i) => i.id === seen) ? seen : (activeId ?? items[0]?.id)) : activeId;

  useEffect(() => {
    const box = nav.current;
    if (!spy || !box || typeof IntersectionObserver === "undefined") return;
    const targets = ids
      .split("\n")
      .filter(Boolean)
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    if (!targets.length) return;
    const root = scrollParent(box);
    const head = box.closest(".sx-page")?.querySelector<HTMLElement>(":scope > .sx-head[data-sticky]") ?? null;
    const shown = new Map<string, boolean>();
    const atEnd = () => {
      const el = root ?? document.scrollingElement;
      return !!el && el.scrollTop > 0 && el.scrollHeight - el.clientHeight - el.scrollTop <= END_SLACK;
    };
    const pick = () => {
      if (performance.now() < hold.current) return;
      if (atEnd()) {
        const bottom = root ? root.getBoundingClientRect().bottom : window.innerHeight;
        const last = [...targets].reverse().find((el) => el.getBoundingClientRect().top < bottom - SEEN_SLACK);
        if (last) {
          setSeen(last.id);
          return;
        }
      }
      const first = targets.find((el) => shown.get(el.id));
      if (first) setSeen(first.id);
    };
    let io: IntersectionObserver | null = null;
    let headH = -1;
    const build = () => {
      const h = head ? Math.round(head.getBoundingClientRect().height) : 0;
      if (h === headH) return;
      headH = h;
      io?.disconnect();
      shown.clear();
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) shown.set(e.target.id, e.isIntersecting);
          pick();
        },
        { root, rootMargin: `-${h}px 0px -60% 0px`, threshold: 0 },
      );
      for (const el of targets) io.observe(el);
    };
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (atEnd()) pick();
      });
    };
    const ro = head && typeof ResizeObserver !== "undefined" ? new ResizeObserver(build) : null;
    if (head) ro?.observe(head);
    build();
    const scroller: HTMLElement | Window = root ?? window;
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro?.disconnect();
      io?.disconnect();
      scroller.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [spy, ids]);

  const go = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!document.getElementById(id)) return;
    e.preventDefault();
    hold.current = e.timeStamp + HOLD_MS;
    focusSection(id);
    if (spy) setSeen(id);
    onSelect?.(id);
  };

  return (
    <nav ref={nav} className="sx-outline" aria-label={label}>
      <ol className="sx-outline__list">
        {items.map((it) => {
          const on = it.id === current;
          const errors = typeof it.errors === "number" && Number.isFinite(it.errors) && it.errors > 0 ? Math.floor(it.errors) : 0;
          return (
            <li key={it.id} className="sx-outline__item">
              <a
                href={`#${it.id}`}
                className="sx-outline__link"
                aria-current={on ? "location" : undefined}
                data-state={it.state}
                onClick={(e) => go(e, it.id)}
                data-ai-id={aiIdOf(aiId ?? "admin.studio.outline", it.id.toLowerCase())}
                data-ai-type="link"
                data-ai-label={it.label}
              >
                <span className="sx-outline__text">{it.label}</span>
                {it.state === "done" ? (
                  <span className="sx-outline__mark" data-mark="done">
                    {glyph(CheckIcon, { size: 14, weight: "bold" })}
                    <span className="sx-vh">{t("sx.guide.done")}</span>
                  </span>
                ) : it.state === "error" ? (
                  <span className="sx-outline__mark" data-mark="error">
                    {glyph(WarningCircleIcon, { size: 14 })}
                    {errors ? (
                      <span className="sx-num" aria-hidden="true">
                        {errors}
                      </span>
                    ) : null}
                    <span className="sx-vh">{t("sx.rep.errors", { n: errors || 1 })}</span>
                  </span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
