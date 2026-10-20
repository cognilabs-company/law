"use client";

import { useSyncExternalStore } from "react";

export type YProps = Record<string, unknown>;
export type YEntity = { update?: (props: YProps) => void };
export type YMapInstance = YEntity & {
  addChild: (child: YEntity) => unknown;
  removeChild: (child: YEntity) => unknown;
  update: (props: YProps) => void;
  destroy: () => void;
  readonly bounds?: unknown;
  readonly zoom?: number;
  readonly center?: unknown;
};
export type Ymaps3 = {
  ready: Promise<unknown>;
  YMap: new (root: HTMLElement, props: YProps, children?: YEntity[]) => YMapInstance;
  YMapDefaultSchemeLayer: new (props?: YProps) => YEntity;
  YMapDefaultFeaturesLayer: new (props?: YProps) => YEntity;
  YMapMarker: new (props: YProps, element?: HTMLElement) => YEntity;
  YMapListener: new (props: YProps) => YEntity;
};

export const YMAPS_SRC = "https://api-maps.yandex.ru/v3/";
const LOAD_TIMEOUT_MS = 15000;

let pending: Promise<Ymaps3> | null = null;

export function ymapsScriptUrl(apiKey: string, lang: string): string {
  return `${YMAPS_SRC}?apikey=${encodeURIComponent(apiKey)}&lang=${encodeURIComponent(lang)}`;
}

function globalYmaps(): Ymaps3 | null {
  const y = (window as unknown as { ymaps3?: Partial<Record<keyof Ymaps3, unknown>> }).ymaps3;
  return y && typeof y === "object" && y.ready && typeof y.YMap === "function" ? (y as Ymaps3) : null;
}

export function loadYmaps3(apiKey: string, lang: string, timeoutMs = LOAD_TIMEOUT_MS): Promise<Ymaps3> {
  if (pending) return pending;
  const p = new Promise<Ymaps3>((resolve, reject) => {
    let script: HTMLScriptElement | null = null;
    let settled = false;
    const finish = (err: Error | null, y?: Ymaps3) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (err) {
        if (script && !globalYmaps()) script.remove();
        reject(err);
      } else resolve(y as Ymaps3);
    };
    const timer = window.setTimeout(() => finish(new Error("ymaps3_timeout")), timeoutMs);
    const whenReady = () => {
      const y = globalYmaps();
      if (!y) return finish(new Error("ymaps3_missing"));
      Promise.resolve(y.ready).then(
        () => finish(null, y),
        () => finish(new Error("ymaps3_not_ready")),
      );
    };
    if (globalYmaps()) return whenReady();
    script = document.createElement("script");
    script.src = ymapsScriptUrl(apiKey, lang);
    script.async = true;
    script.dataset.lexgoMap = "yandex";
    script.onload = whenReady;
    script.onerror = () => finish(new Error("ymaps3_load"));
    document.head.appendChild(script);
  });
  pending = p;
  p.catch(() => {
    if (pending === p) pending = null;
  });
  return p;
}

export function resetYmaps3(): void {
  pending = null;
}

function subscribeTheme(cb: () => void): () => void {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

const readTheme = (): "light" | "dark" => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

export function useHtmlTheme(): "light" | "dark" {
  return useSyncExternalStore(subscribeTheme, readTheme, () => "light");
}

function subscribeMotion(cb: () => void): () => void {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener?.("change", cb);
  return () => mq.removeEventListener?.("change", cb);
}

const readMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, readMotion, () => false);
}
