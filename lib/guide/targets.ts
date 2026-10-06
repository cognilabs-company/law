"use client";

import { useEffect, useRef } from "react";
import { isAiId } from "@/lib/ai/ids";
import { aiAliases, aiRewrites, legacyAliases } from "@/lib/ai/aliases";
import { intersectsViewport, isShown, openModalRoot } from "@/lib/ai/dom";
import { parentIds, resolveAiTarget, type Resolved } from "@/lib/ai/resolve";
import type { TargetInfo } from "./types";

export { intersectsViewport, isShown, openModalRoot };

type RevealFn = (id: string) => void | Promise<void>;
type Reveal = { match: string | RegExp; fn: RevealFn };

const reveals = new Set<Reveal>();

export function registerReveal(match: string | RegExp, fn: RevealFn): () => void {
  const entry: Reveal = { match, fn };
  reveals.add(entry);
  return () => {
    reveals.delete(entry);
  };
}

function revealKeys(id: string): string[] {
  const keys = [id];
  const add = (k: string) => {
    if (k && !keys.includes(k)) keys.push(k);
  };
  if (isAiId(id)) {
    const chain = [id, ...parentIds(id)].flatMap((k) => [k, ...aiRewrites(k)]);
    for (const k of chain) {
      add(k);
      legacyAliases(k).forEach((a) => a.exact && add(a.id));
    }
    for (const k of chain) legacyAliases(k).forEach((a) => add(a.id));
  } else if (id.includes(":")) {
    aiAliases(id).forEach((a) => add(a.id));
  }
  return keys;
}

export async function revealTarget(id: string): Promise<boolean> {
  const list = Array.from(reveals).reverse();
  for (const key of revealKeys(id)) {
    for (const r of list) {
      const hit = typeof r.match === "string" ? r.match === key || (r.match.endsWith("*") && key.startsWith(r.match.slice(0, -1))) : r.match.test(key);
      if (!hit) continue;
      await r.fn(key);
      return true;
    }
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

export function findTarget(id: string, fresh = false, loose = true): HTMLElement | null {
  if (typeof document === "undefined" || !id) return null;
  return resolveAiTarget(id, fresh, loose)?.el ?? null;
}

export function targetMatch(id: string): Resolved | null {
  if (typeof document === "undefined" || !id) return null;
  return resolveAiTarget(id);
}

export function waitForTarget(id: string, ms: number, signal?: AbortSignal, loose = true): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const now = findTarget(id, true, loose);
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
      const el = findTarget(id, false, loose);
      if (el) finish(el);
    };
    const onAbort = () => finish(null);
    const obs = new MutationObserver(check);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-ai-target", "data-ai-id", "class", "style", "hidden"] });
    const poll = window.setInterval(check, 250);
    const timer = window.setTimeout(() => finish(findTarget(id, true, loose)), ms);
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
  [/^seller:profile-edit$/, "section"],
  [/:list$|^list:|-list$|^seller:/, "list"],
  [/input|search/, "input"],
  [/filter/, "filter"],
  [/^tab:|:tab:/, "tab"],
];

export function targetKind(id: string): string {
  return KIND.find(([re]) => re.test(id))?.[1] ?? "section";
}

export function collectTargets(limit = 120): TargetInfo[] {
  if (typeof document === "undefined") return [];
  const out = new Map<string, TargetInfo>();
  for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-ai-target]"))) {
    const id = el.dataset.aiTarget;
    if (!id || out.has(id) || !isShown(el)) continue;
    out.set(id, { id, label: targetLabel(el), kind: targetKind(id), in_view: intersectsViewport(el) });
    if (out.size >= limit) break;
  }
  return [...out.values()];
}

export function collectState(): Record<string, unknown> {
  if (typeof document === "undefined") return {};
  const modal = openModalRoot();
  const heading = modal?.querySelector("h1,h2,h3")?.textContent || modal?.getAttribute("aria-label") || "";
  const tabs = Array.from(document.querySelectorAll<HTMLElement>("[role=tab][aria-selected=true]"))
    .filter(isShown)
    .slice(0, 3)
    .map((el) => clean(el.textContent || "").slice(0, 40));
  const room = document.documentElement.scrollHeight - window.innerHeight;
  return {
    open_modal: Boolean(modal),
    modal_title: modal ? clean(heading).slice(0, 80) || null : null,
    active_tabs: tabs,
    viewport: window.innerWidth < 900 ? "mobile" : "desktop",
    scroll_pct: room > 0 ? Math.round((window.scrollY / room) * 100) : 0,
  };
}

const TEXT_ENTRY = "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]),textarea,[contenteditable=true]";

const TYPEABLE = "input:not([type]),input[type=text],input[type=search],input[type=email],input[type=tel],input[type=url],input[type=number],textarea";
const POPUP = ".mpick,.ssel,[aria-haspopup],[role=combobox]";
const FIDGETY = "input[type=radio],input[type=checkbox],input[type=range],input[type=date],input[type=time],input[type=file],select";
const ACTIONABLE = "a[href],button,[role=button],[role=link],[role=menuitem],input[type=submit],input[type=button],input[type=reset],summary";

function calmInput(el: HTMLElement): boolean {
  return el.matches(TYPEABLE) && !el.matches("[readonly],[disabled]") && !el.closest(POPUP);
}

export function focusTarget(el: HTMLElement): () => void {
  const touch = window.matchMedia("(pointer: coarse)").matches;
  if (el.matches(FIDGETY) || el.matches(ACTIONABLE) || (el.matches(TYPEABLE) && !calmInput(el))) return () => {};
  const own = el.matches("a[href],button,input,select,textarea,[tabindex]:not([tabindex='-1'])");
  const inner = own || touch ? null : Array.from(el.querySelectorAll<HTMLElement>(TYPEABLE)).find((x) => calmInput(x) && isShown(x)) ?? null;
  const focusable = own ? el : inner ?? el;
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

const FIELD = "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([type=file]),textarea,select,[contenteditable=true]";

export function fieldOf(el: HTMLElement): HTMLElement | null {
  if (el.matches(FIELD)) return el;
  return Array.from(el.querySelectorAll<HTMLElement>(FIELD)).find((x) => isShown(x)) ?? null;
}

export function focusInput(el: HTMLElement): boolean {
  const field = fieldOf(el);
  if (!field || field.matches("[disabled],[readonly],[aria-disabled=true]")) return false;
  field.focus({ preventScroll: true });
  return document.activeElement === field;
}

export async function settle(el: HTMLElement, signal: AbortSignal): Promise<void> {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const r0 = el.getBoundingClientRect();
  const pad = 96;
  const fits = r0.top >= pad && r0.bottom <= window.innerHeight - 140;
  if (!fits) el.scrollIntoView({ block: r0.height > window.innerHeight * 0.6 ? "start" : "center", inline: "nearest", behavior: reduce ? "auto" : "smooth" });
  let last = -1;
  let still = 0;
  const t0 = performance.now();
  while (!signal.aborted && performance.now() - t0 < 1200) {
    await new Promise((r) => window.requestAnimationFrame(r));
    const top = Math.round(el.getBoundingClientRect().top);
    still = top === last ? still + 1 : 0;
    last = top;
    if (still >= 4) break;
  }
}
