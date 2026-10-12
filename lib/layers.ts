"use client";

import { useId, useLayoutEffect, useRef, useSyncExternalStore } from "react";

export type LayerKind = "overlay" | "popover";

export type LayerTarget = (() => Element | null) | { readonly current: Element | null };

export type LayerOptions = {
  kind: LayerKind;
  el: LayerTarget;
  trigger?: LayerTarget;
  backdrop?: LayerTarget;
  onEscape?: () => void;
  onOutside?: () => void;
  scrim?: boolean;
  id?: string;
};

export type LayerHandle = { id: string; z: number; pop: () => void };

export type LayerInfo = { id: string; kind: LayerKind; z: number };

export const LAYER_OVERLAY_BASE = 200;
export const LAYER_POPOVER_FLOOR = 260;
export const LAYER_STEP = 10;
export const LAYER_IGNORE = "[data-layer-ignore]";
export const LAYER_SOFT = "[data-layer-soft]";

const FLOATING = '[role="listbox"],[role="menu"],[role="dialog"],[role="alertdialog"],[role="tooltip"]';
const SWALLOW_MS = 600;

type Layer = LayerOptions & { id: string; z: number };

const stack: Layer[] = [];
const subs = new Set<() => void>();
let seq = 0;
let installed = false;
let pending: { event: KeyboardEvent; id: string } | null = null;
let armed = false;
let disarmTimer = 0;

function resolve(t: LayerTarget | undefined): Element | null {
  if (!t) return null;
  return typeof t === "function" ? t() : t.current;
}

function within(t: LayerTarget | undefined, n: Node | null): boolean {
  const el = resolve(t);
  return !!el && !!n && el.contains(n);
}

function elementOf(n: Node | null): Element | null {
  if (!n) return null;
  return n instanceof Element ? n : n.parentElement;
}

function pageRoot(n: Node | null): boolean {
  return !n || n === document || n === document.body || n === document.documentElement;
}

function sourceOf(e: Event): Node | null {
  const path = typeof e.composedPath === "function" ? e.composedPath() : [];
  const first = path[0] ?? e.target;
  return first instanceof Node ? first : null;
}

function ignoredFor(layer: Layer | undefined, n: Node | null): boolean {
  const zone = elementOf(n)?.closest(LAYER_IGNORE);
  if (!zone) return false;
  if (!layer) return true;
  const el = resolve(layer.el);
  const trigger = resolve(layer.trigger);
  return !((el && zone.contains(el)) || (trigger && zone.contains(trigger)));
}

function touches(layer: Layer, n: Node | null): boolean {
  return pageRoot(n) || within(layer.el, n) || within(layer.trigger, n) || within(layer.backdrop, n);
}

function claims(layer: Layer, n: Node | null): boolean {
  if (touches(layer, n)) return true;
  if (layer.kind !== "popover") return false;
  return stack.some((l) => l !== layer && (within(l.el, n) || within(l.trigger, n) || within(l.backdrop, n)));
}

function top(): Layer | undefined {
  return stack[stack.length - 1];
}

function emit(): void {
  subs.forEach((fn) => fn());
}

function renderedZ(l: Layer): number {
  const el = resolve(l.backdrop) ?? resolve(l.el);
  if (!el || typeof getComputedStyle !== "function") return 0;
  return Number.parseInt(getComputedStyle(el).zIndex, 10) || 0;
}

function zFor(kind: LayerKind): number {
  const prev = top();
  const floor = prev ? Math.max(prev.z, renderedZ(prev)) + LAYER_STEP : 0;
  if (kind === "popover") return Math.max(LAYER_POPOVER_FLOOR, floor);
  const depth = stack.filter((l) => l.kind === "overlay").length;
  return Math.max(LAYER_OVERLAY_BASE + LAYER_STEP * depth, floor);
}

function disarm(): void {
  armed = false;
  window.clearTimeout(disarmTimer);
}

function onKeyCapture(e: KeyboardEvent): void {
  if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
  const layer = top();
  if (!layer?.onEscape) return;
  const src = sourceOf(e);
  const act = document.activeElement;
  if (ignoredFor(layer, src) || ignoredFor(layer, act)) return;
  if (layer.kind === "overlay" && (elementOf(src)?.closest(LAYER_SOFT) || elementOf(act)?.closest(LAYER_SOFT))) return;
  if (!claims(layer, src) && !claims(layer, act)) return;
  if (layer.kind === "overlay") {
    pending = { event: e, id: layer.id };
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  layer.onEscape();
}

function onKeyBubble(e: KeyboardEvent): void {
  const p = pending;
  if (!p || p.event !== e) return;
  pending = null;
  if (e.defaultPrevented) return;
  const layer = top();
  if (!layer || layer.id !== p.id || !layer.onEscape) return;
  e.preventDefault();
  e.stopPropagation();
  layer.onEscape();
}

function onPointerDown(e: PointerEvent): void {
  disarm();
  if (!e.isPrimary) return;
  const layer = top();
  if (!layer?.onOutside) return;
  const src = sourceOf(e);
  if (!src || ignoredFor(layer, src) || within(layer.el, src) || within(layer.trigger, src)) return;
  if (layer.kind === "overlay") {
    if (within(layer.backdrop, src) || elementOf(src)?.closest(FLOATING) || elementOf(src)?.closest(LAYER_SOFT)) return;
    layer.onOutside();
    return;
  }
  const onBackdrop =
    !!layer.scrim || stack.some((l) => l.kind === "overlay" && within(l.backdrop, src) && !within(l.el, src));
  layer.onOutside();
  if (!onBackdrop) return;
  armed = true;
  disarmTimer = window.setTimeout(disarm, SWALLOW_MS * 4);
}

function onPointerUp(): void {
  if (!armed) return;
  window.clearTimeout(disarmTimer);
  disarmTimer = window.setTimeout(disarm, SWALLOW_MS);
}

function onMouseCapture(e: MouseEvent): void {
  if (!armed) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}

function onClickCapture(e: MouseEvent): void {
  if (!armed) return;
  disarm();
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}

function install(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("keydown", onKeyCapture, true);
  window.addEventListener("keydown", onKeyBubble);
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerUp, true);
  window.addEventListener("mousedown", onMouseCapture, true);
  window.addEventListener("mouseup", onMouseCapture, true);
  window.addEventListener("click", onClickCapture, true);
}

export function subscribeLayers(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function pushLayer(opts: LayerOptions): LayerHandle {
  install();
  const id = opts.id || `layer-${++seq}`;
  const at = stack.findIndex((l) => l.id === id);
  if (at >= 0) stack.splice(at, 1);
  const z = zFor(opts.kind);
  stack.push({ ...opts, id, z });
  emit();
  return { id, z, pop: () => popLayer(id) };
}

export function popLayer(id: string): void {
  const at = stack.findIndex((l) => l.id === id);
  if (at < 0) return;
  stack.splice(at, 1);
  if (pending?.id === id) pending = null;
  emit();
}

export function layerZ(id: string): number | undefined {
  return stack.find((l) => l.id === id)?.z;
}

export function topLayer(): LayerInfo | null {
  const l = top();
  return l ? { id: l.id, kind: l.kind, z: l.z } : null;
}

export function isTopLayer(id: string): boolean {
  return top()?.id === id;
}

export function layerCount(kind?: LayerKind): number {
  return kind ? stack.filter((l) => l.kind === kind).length : stack.length;
}

export function isLayerIgnored(node: Node | null): boolean {
  return !!elementOf(node)?.closest(LAYER_IGNORE);
}

export function insideLayer(id: string, node: Node | null): boolean {
  if (!node) return false;
  const at = stack.findIndex((l) => l.id === id);
  if (at < 0) return false;
  if (ignoredFor(stack[at], node)) return true;
  return stack.slice(at).some((l) => within(l.el, node) || within(l.trigger, node));
}

export function useLayer(open: boolean, opts: LayerOptions): number {
  const auto = useId();
  const id = opts.id || auto;
  const latest = useRef(opts);
  useLayoutEffect(() => {
    latest.current = opts;
  });
  const kind = opts.kind;
  const scrim = !!opts.scrim;
  const escape = !!opts.onEscape;
  const outside = !!opts.onOutside;
  useLayoutEffect(() => {
    if (!open) return;
    const handle = pushLayer({
      id,
      kind,
      scrim,
      el: () => resolve(latest.current.el),
      trigger: () => resolve(latest.current.trigger),
      backdrop: () => resolve(latest.current.backdrop),
      onEscape: escape ? () => latest.current.onEscape?.() : undefined,
      onOutside: outside ? () => latest.current.onOutside?.() : undefined,
    });
    return handle.pop;
  }, [open, id, kind, scrim, escape, outside]);
  const fallback = kind === "popover" ? LAYER_POPOVER_FLOOR : LAYER_OVERLAY_BASE;
  return useSyncExternalStore(
    subscribeLayers,
    () => (open ? layerZ(id) : undefined) ?? fallback,
    () => fallback,
  );
}
