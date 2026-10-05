"use client";

import { useEffect, useRef } from "react";
import type { TargetInfo } from "./types";

type RevealFn = (id: string) => void | Promise<void>;
type Reveal = { match: string | RegExp; fn: RevealFn };

const reveals = new Set<Reveal>();

const esc = (v: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(v) : v.replace(/["\\]/g, "\\$&"));

export function registerReveal(match: string | RegExp, fn: RevealFn): () => void {
  const entry: Reveal = { match, fn };
  reveals.add(entry);
  return () => {
    reveals.delete(entry);
  };
}

export async function revealTarget(id: string): Promise<boolean> {
  for (const r of Array.from(reveals).reverse()) {
    const hit = typeof r.match === "string" ? r.match === id || (r.match.endsWith("*") && id.startsWith(r.match.slice(0, -1))) : r.match.test(id);
    if (!hit) continue;
    await r.fn(id);
    return true;
  }
  return false;
}

export function useAiReveal(match: string | RegExp, fn: RevealFn) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  const source = typeof match === "string" ? match : match.source;
  const isPattern = typeof match !== "string";
  useEffect(() => registerReveal(isPattern ? new RegExp(source) : source, (id) => ref.current(id)), [source, isPattern]);
}

export function isShown(el: Element): boolean {
  if (!el.isConnected || !el.getClientRects().length) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = window.getComputedStyle(el);
  return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.02;
}

function openModalRoot(): Element | null {
  const all = Array.from(document.querySelectorAll(".amodal, [role=dialog][aria-modal=true], dialog[open]"));
  return all.length ? all[all.length - 1] : null;
}

function intersectsViewport(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
}

export function findTarget(id: string): HTMLElement | null {
  if (typeof document === "undefined" || !id) return null;
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-ai-target="${esc(id)}"]`)).filter(isShown);
  if (!all.length) return null;
  const modal = openModalRoot();
  if (modal) {
    const inside = all.find((el) => modal.contains(el));
    if (inside) return inside;
  }
  return all.find(intersectsViewport) ?? all[0];
}

export function waitForTarget(id: string, ms: number, signal?: AbortSignal): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const now = findTarget(id);
    if (now) return resolve(now);
    let done = false;
    const finish = (el: HTMLElement | null) => {
      if (done) return;
      done = true;
      obs.disconnect();
      window.clearTimeout(timer);
      window.clearInterval(poll);
      signal?.removeEventListener("abort", onAbort);
      resolve(el);
    };
    const check = () => {
      const el = findTarget(id);
      if (el) finish(el);
    };
    const onAbort = () => finish(null);
    const obs = new MutationObserver(check);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-ai-target", "class", "style", "hidden"] });
    const poll = window.setInterval(check, 250);
    const timer = window.setTimeout(() => finish(findTarget(id)), ms);
    signal?.addEventListener("abort", onAbort);
  });
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export function targetLabel(el: HTMLElement): string {
  const explicit = el.getAttribute("data-ai-label") || el.getAttribute("aria-label") || el.getAttribute("title");
  if (explicit && clean(explicit)) return clean(explicit).slice(0, 80);
  const heading = el.querySelector("h1,h2,h3,h4,b,strong,label");
  const text = clean((heading?.textContent || el.textContent || "").slice(0, 400));
  return text.slice(0, 80);
}

const KIND: [RegExp, string][] = [
  [/^nav:/, "nav"],
  [/^header:|^ai-help:/, "header"],
  [/^button:/, "button"],
  [/^plan:/, "card"],
  [/:list$|^list:|-list$|^seller:/, "list"],
  [/input|search/, "input"],
  [/filter/, "filter"],
  [/^tab:|:tab:/, "tab"],
];

export function collectTargets(limit = 120): TargetInfo[] {
  if (typeof document === "undefined") return [];
  const out = new Map<string, TargetInfo>();
  for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-ai-target]"))) {
    const id = el.dataset.aiTarget;
    if (!id || out.has(id) || !isShown(el)) continue;
    const kind = KIND.find(([re]) => re.test(id))?.[1] ?? "section";
    out.set(id, { id, label: targetLabel(el), kind, in_view: intersectsViewport(el) });
    if (out.size >= limit) break;
  }
  return [...out.values()];
}

const TEXT_ENTRY = "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]),textarea,[contenteditable=true]";

export function focusTarget(el: HTMLElement): () => void {
  const touch = window.matchMedia("(pointer: coarse)").matches;
  const inner = touch ? null : el.querySelector<HTMLElement>("input:not([type=hidden]),textarea,select");
  const focusable = el.matches("a[href],button,input,select,textarea,[tabindex]:not([tabindex='-1'])") ? el : inner ?? el;
  if (touch && focusable.matches(TEXT_ENTRY)) return () => {};
  let added = false;
  if (focusable === el && !el.matches("a[href],button,input,select,textarea,[tabindex]")) {
    el.setAttribute("tabindex", "-1");
    added = true;
  }
  focusable.focus({ preventScroll: true });
  return () => {
    if (added) el.removeAttribute("tabindex");
  };
}
