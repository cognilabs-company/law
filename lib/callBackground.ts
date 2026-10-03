import type { LocalTrack, LocalVideoTrack } from "livekit-client";
import { BackgroundEngineProcessor, engineGeneration, engineTransport, isEngineStopped, releaseEngine, retainEngine, setEngineEffect, warmEngine, type EngineEffect, type TroubleHandler } from "./bgEngine/engine";

export type BlurLevel = "light" | "strong";
export type BgEffect = { kind: "none" } | { kind: "blur"; level: BlurLevel } | { kind: "image"; id: string };
export type BgImage = { id: string; src: string; thumb: string };
export type BgStatus = { pending: boolean; custom: string | null };
export type BgHooks = { onSlow?: () => void; onError?: (e: unknown) => void };

export const CUSTOM_BG = "custom";
export const NO_BG: BgEffect = { kind: "none" };
export const BG_IMAGES: BgImage[] = ["law-library", "advocate-office", "modern-office", "calm-home", "tashkent", "blue-wall"].map((id) => ({
  id,
  src: `/meeting-bg/${id}.webp`,
  thumb: `/meeting-bg/thumbs/${id}.webp`,
}));

const EFFECT_KEY = "lexgo_call_bg";
const CUSTOM_KEY = "lexgo_call_bg_custom";
const CUSTOM_EDGE = 1280;
const CUSTOM_MAX_BYTES = 20 * 1024 * 1024;

const sameEffect = (a: BgEffect, b: BgEffect) =>
  a.kind === b.kind && (a.kind !== "blur" || b.kind !== "blur" || a.level === b.level) && (a.kind !== "image" || b.kind !== "image" || a.id === b.id);

let owner: string | null = null;

const scoped = (key: string) => (owner ? `${key}:${owner}` : null);

const store = (key: string, value: string | null) => {
  const k = scoped(key);
  if (!k) return false;
  try {
    if (value === null) localStorage.removeItem(k);
    else localStorage.setItem(k, value);
    return true;
  } catch {
    return false;
  }
};

const load = (key: string) => {
  const k = scoped(key);
  if (!k) return null;
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

function readCustom(): string | null {
  const v = load(CUSTOM_KEY);
  return v && v.startsWith("data:image/") ? v : null;
}

function readEffect(custom: string | null): BgEffect {
  try {
    const raw = load(EFFECT_KEY);
    if (!raw) return NO_BG;
    const v = JSON.parse(raw) as { kind?: unknown; level?: unknown; id?: unknown };
    if (v.kind === "blur" && (v.level === "light" || v.level === "strong")) return { kind: "blur", level: v.level };
    if (v.kind === "image" && typeof v.id === "string") {
      if (v.id === CUSTOM_BG) return custom ? { kind: "image", id: CUSTOM_BG } : NO_BG;
      if (BG_IMAGES.some((b) => b.id === v.id)) return { kind: "image", id: v.id };
    }
    return NO_BG;
  } catch {
    return NO_BG;
  }
}

let effect: BgEffect | null = null;
let status: BgStatus | null = null;
let memoryCustom: string | null = null;
let customVersion = 0;
const effectListeners = new Set<() => void>();
const statusListeners = new Set<() => void>();

function ensureLoaded() {
  if (status && effect) return;
  const custom = typeof window === "undefined" ? null : readCustom();
  status = { pending: false, custom };
  effect = typeof window === "undefined" ? NO_BG : readEffect(custom);
}

export function setBgOwner(id: string | null) {
  if (id === owner) return;
  owner = id;
  effect = null;
  status = null;
  memoryCustom = null;
  customVersion += 1;
  effectListeners.forEach((l) => l());
  statusListeners.forEach((l) => l());
}

export function getBgEffect(): BgEffect {
  ensureLoaded();
  return effect as BgEffect;
}

export function getBgStatus(): BgStatus {
  ensureLoaded();
  return status as BgStatus;
}

export const serverBgEffect = (): BgEffect => NO_BG;
const SERVER_STATUS: BgStatus = { pending: false, custom: null };
export const serverBgStatus = (): BgStatus => SERVER_STATUS;

export function subscribeBgEffect(fn: () => void): () => void {
  effectListeners.add(fn);
  return () => {
    effectListeners.delete(fn);
  };
}

export function subscribeBgStatus(fn: () => void): () => void {
  statusListeners.add(fn);
  return () => {
    statusListeners.delete(fn);
  };
}

function patchStatus(p: Partial<BgStatus>) {
  status = { ...getBgStatus(), ...p };
  statusListeners.forEach((l) => l());
}

export function setBgEffect(next: BgEffect) {
  if (sameEffect(getBgEffect(), next)) return;
  effect = next;
  store(EFFECT_KEY, JSON.stringify(next));
  effectListeners.forEach((l) => l());
}

export function bgImageSrc(id: string): string | null {
  if (id === CUSTOM_BG) return getBgStatus().custom ?? memoryCustom;
  return BG_IMAGES.find((b) => b.id === id)?.src ?? null;
}

export function bgSupported(): boolean {
  return engineTransport() !== null;
}

export function preloadBgAssets() {
  if (bgSupported()) void warmEngine();
}

export function retainBackgroundEngine() {
  retainEngine();
}

export function releaseBackgroundEngine() {
  releaseEngine();
}

let unavailableNoticed = false;

export function claimBgUnavailableNotice(): boolean {
  if (unavailableNoticed || bgSupported() || getBgEffect().kind === "none") return false;
  unavailableNoticed = true;
  setBgEffect(NO_BG);
  return true;
}

function engineEffectOf(e: BgEffect): EngineEffect | null {
  if (e.kind === "none") return { kind: "none" };
  if (e.kind === "blur") return { kind: "blur", level: e.level };
  const src = bgImageSrc(e.id);
  if (!src) return null;
  return { kind: "image", src, key: e.id === CUSTOM_BG ? `${CUSTOM_BG}:${customVersion}` : e.id };
}

const desiredEffect = () => engineEffectOf(getBgEffect());

let chain: Promise<unknown> = Promise.resolve();

function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => null);
  return run;
}

function engineProcessorOn(track: LocalTrack): BackgroundEngineProcessor | null {
  const current = track.getProcessor();
  return current instanceof BackgroundEngineProcessor ? current : null;
}

function troubleHandler(hooks: () => BgHooks, started: number): TroubleHandler {
  return (reason, error, track) => {
    if (engineGeneration() !== started) return;
    setBgEffect(NO_BG);
    if (reason === "slow") {
      hooks().onSlow?.();
      return;
    }
    hooks().onError?.(new Error(error || "background effect failed"));
    void serial(async () => {
      const current = track ? engineProcessorOn(track) : null;
      if (track && current && !current.healthy) await track.stopProcessor().catch(() => null);
    });
  };
}

export function cameraProcessor(hooks: () => BgHooks): BackgroundEngineProcessor | undefined {
  const fx = desiredEffect();
  if (!fx || fx.kind === "none" || !bgSupported()) return undefined;
  return new BackgroundEngineProcessor(troubleHandler(hooks, engineGeneration()), desiredEffect);
}

async function syncOnce(track: LocalVideoTrack, hooks: () => BgHooks, started: number): Promise<boolean> {
  const want = getBgEffect();
  const fx = engineEffectOf(want);
  if (!fx) return false;
  const current = engineProcessorOn(track);
  if (current && !current.healthy) {
    await track.stopProcessor().catch(() => null);
  } else if (current || fx.kind === "none") {
    await setEngineEffect(fx);
    return true;
  }
  if (fx.kind === "none" || track.getProcessor() || !track.sender || !bgSupported()) return false;
  if (!(await warmEngine())) throw new Error("background engine unavailable");
  await setEngineEffect(fx);
  if (getBgEffect() !== want || track.getProcessor() || !track.sender) return false;
  const processor = new BackgroundEngineProcessor(troubleHandler(hooks, started), desiredEffect);
  await track.pauseUpstream();
  try {
    await track.setProcessor(processor);
  } finally {
    await track.resumeUpstream();
  }
  return true;
}

export function syncBackground(track: LocalVideoTrack | undefined, hooks: () => BgHooks): Promise<boolean> {
  if (!track) return Promise.resolve(false);
  const started = engineGeneration();
  return serial(async () => {
    patchStatus({ pending: true });
    try {
      return await syncOnce(track, hooks, started);
    } catch (e) {
      if (isEngineStopped(e) || !track.sender || engineGeneration() !== started) return false;
      setBgEffect(NO_BG);
      if (engineProcessorOn(track)) await setEngineEffect({ kind: "none" }).catch(() => null);
      hooks().onError?.(e);
      return false;
    } finally {
      patchStatus({ pending: false });
    }
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = url;
  });
}

export async function storeCustomBackground(file: File): Promise<void> {
  if (!/^image\/(jpeg|png|webp|gif|bmp|avif)$/i.test(file.type)) throw new Error("type");
  if (file.size > CUSTOM_MAX_BYTES) throw new Error("size");
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("image");
    const scale = Math.min(1, CUSTOM_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.86);
    memoryCustom = data;
    customVersion += 1;
    store(CUSTOM_KEY, data);
    patchStatus({ custom: data });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function removeCustomBackground() {
  memoryCustom = null;
  customVersion += 1;
  store(CUSTOM_KEY, null);
  patchStatus({ custom: null });
  const e = getBgEffect();
  if (e.kind === "image" && e.id === CUSTOM_BG) setBgEffect(NO_BG);
}
