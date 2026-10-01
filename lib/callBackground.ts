import type { LocalVideoTrack } from "livekit-client";
import type { BackgroundOptions, BackgroundProcessorWrapper, SwitchBackgroundProcessorOptions } from "@livekit/track-processors";

export type BlurLevel = "light" | "strong";
export type BgEffect = { kind: "none" } | { kind: "blur"; level: BlurLevel } | { kind: "image"; id: string };
export type BgImage = { id: string; src: string; thumb: string };
export type BgStatus = { pending: boolean; custom: string | null };
export type BgHooks = { onSlow?: () => void; onError?: (e: unknown) => void };

export const CUSTOM_BG = "custom";
export const NO_BG: BgEffect = { kind: "none" };
export const BG_IMAGES: BgImage[] = ["lexgo-blue", "study", "library", "office", "home", "openspace", "tashkent", "chimgan", "bokeh", "dawn", "night"].map((id) => ({
  id,
  src: `/meeting-bg/${id}.webp`,
  thumb: `/meeting-bg/thumbs/${id}.webp`,
}));

const EFFECT_KEY = "lexgo_call_bg";
const CUSTOM_KEY = "lexgo_call_bg_custom";
const PROCESSOR_NAME = "lexgo-background";
const BLUR_RADIUS: Record<BlurLevel, number> = { light: 6, strong: 14 };
const ASSETS = { tasksVisionFileSet: `/mediapipe/wasm/${process.env.MEDIAPIPE_VERSION}`, modelAssetPath: "/mediapipe/models/selfie_segmenter.tflite" };
const PASSTHROUGH: BackgroundOptions = { blurRadius: undefined, imagePath: undefined, backgroundDisabled: true };
const SLOW_FRAME_MS = 85;
const SLOW_WINDOW = 120;
const WARMUP_FRAMES = 60;
const GAP_MS = 1000;
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

let supported: boolean | null = null;

export function bgSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (supported !== null) return supported;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    const transformer = typeof OffscreenCanvas !== "undefined" && typeof VideoFrame !== "undefined" && typeof createImageBitmap !== "undefined" && !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    const modern = typeof MediaStreamTrackGenerator !== "undefined" && typeof MediaStreamTrackProcessor !== "undefined";
    const fallback = typeof HTMLCanvasElement !== "undefined" && typeof VideoFrame !== "undefined" && "captureStream" in HTMLCanvasElement.prototype;
    supported = transformer && (modern || fallback);
  } catch {
    supported = false;
  }
  return supported;
}

let assetCheck: Promise<typeof ASSETS | undefined> | null = null;

function localAssets(): Promise<typeof ASSETS | undefined> {
  if (!assetCheck) {
    const ok = (url: string) =>
      fetch(url, { cache: "force-cache" })
        .then((r) => (r.ok ? r.arrayBuffer().then(() => true) : false))
        .catch(() => false);
    const base = ASSETS.tasksVisionFileSet;
    assetCheck = Promise.all([ok(`${base}/vision_wasm_internal.js`), ok(`${base}/vision_wasm_internal.wasm`), ok(ASSETS.modelAssetPath)]).then((all) =>
      all.every(Boolean) ? ASSETS : undefined,
    );
  }
  return assetCheck;
}

export function preloadBgAssets() {
  if (!bgSupported()) return;
  void import("@livekit/track-processors").catch(() => null);
  void localAssets();
}

function optionsOf(e: BgEffect): SwitchBackgroundProcessorOptions | null {
  if (e.kind === "blur") return { mode: "background-blur", blurRadius: BLUR_RADIUS[e.level] };
  if (e.kind === "image") {
    const src = bgImageSrc(e.id);
    return src ? { mode: "virtual-background", imagePath: src } : null;
  }
  return null;
}

type Watch = { reset: () => void; onSlow?: () => void };
const watches = new WeakMap<BackgroundProcessorWrapper, Watch>();
const applied = new WeakMap<BackgroundProcessorWrapper, string>();

function watcher(hooks: BgHooks) {
  let samples: number[] = [];
  let fired = false;
  let seen = 0;
  let last = 0;
  const restart = () => {
    samples = [];
    seen = 0;
  };
  const w: Watch = {
    onSlow: hooks.onSlow,
    reset: () => {
      restart();
      fired = false;
    },
  };
  const onFrame = (s: { processingTimeMs: number }) => {
    if (fired) return;
    const now = performance.now();
    if (now - last > GAP_MS) restart();
    last = now;
    seen += 1;
    if (seen <= WARMUP_FRAMES) return;
    samples.push(s.processingTimeMs);
    if (samples.length > SLOW_WINDOW) samples = samples.slice(-SLOW_WINDOW);
    if (samples.length < SLOW_WINDOW) return;
    const median = [...samples].sort((a, b) => a - b)[samples.length >> 1];
    if (median > SLOW_FRAME_MS) {
      fired = true;
      w.onSlow?.();
    }
  };
  return { w, onFrame };
}

function guard(proc: BackgroundProcessorWrapper) {
  const restart = proc.restart.bind(proc);
  const destroy = proc.destroy.bind(proc);
  let restarting = false;
  let dropped = false;
  proc.destroy = async (opts) => {
    if (restarting && !opts?.willProcessorRestart) dropped = true;
    await destroy(opts);
  };
  proc.restart = async (opts) => {
    restarting = true;
    dropped = false;
    try {
      await restart(opts);
    } finally {
      restarting = false;
      if (dropped) {
        await destroy().catch(() => null);
        opts.track.stop();
      }
    }
  };
}

const keyOf = (e: BgEffect) =>
  e.kind === "blur" ? `blur:${e.level}` : e.kind === "image" ? `image:${e.id}${e.id === CUSTOM_BG ? `:${customVersion}` : ""}` : "none";

async function createProcessor(e: BgEffect, hooks: BgHooks): Promise<BackgroundProcessorWrapper | null> {
  const opts = optionsOf(e);
  if (!opts) return null;
  const [{ BackgroundProcessor }, assetPaths] = await Promise.all([import("@livekit/track-processors"), localAssets()]);
  const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const { w, onFrame } = watcher(hooks);
  const proc = BackgroundProcessor({ ...opts, assetPaths, maxFps: coarse ? 24 : 30, onFrameProcessed: onFrame }, PROCESSOR_NAME) as BackgroundProcessorWrapper;
  guard(proc);
  watches.set(proc, w);
  return proc;
}

async function release(track: LocalVideoTrack, proc: BackgroundProcessorWrapper) {
  if (!track.isMuted) {
    await track.stopProcessor();
    return;
  }
  if (applied.get(proc) === "none") return;
  await proc.updateTransformerOptions(PASSTHROUGH);
  applied.set(proc, "none");
}

let chain: Promise<unknown> = Promise.resolve();

function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => null);
  return run;
}

function oursOn(track: LocalVideoTrack): BackgroundProcessorWrapper | undefined {
  const current = track.getProcessor() as BackgroundProcessorWrapper | undefined;
  return current && current.name === PROCESSOR_NAME ? current : undefined;
}

async function syncOnce(track: LocalVideoTrack, hooks: BgHooks): Promise<boolean> {
  const want = getBgEffect();
  const ours = oursOn(track);
  const opts = optionsOf(want);
  if (!opts) {
    if (ours) await release(track, ours);
    return true;
  }
  if (ours) {
    const w = watches.get(ours);
    if (w) w.onSlow = hooks.onSlow;
    if (applied.get(ours) === keyOf(want)) return true;
    await ours.switchTo(opts);
    applied.set(ours, keyOf(want));
    w?.reset();
    return true;
  }
  if (track.getProcessor() || track.isMuted || !track.sender || !bgSupported()) return false;
  const proc = await createProcessor(want, hooks);
  if (!proc || getBgEffect() !== want || track.getProcessor() || track.isMuted || !track.sender) return false;
  await track.pauseUpstream();
  try {
    await track.setProcessor(proc);
    applied.set(proc, keyOf(want));
  } finally {
    await track.resumeUpstream();
  }
  return true;
}

export function syncBackground(track: LocalVideoTrack | undefined, hooks: BgHooks = {}): Promise<boolean> {
  if (!track) return Promise.resolve(false);
  return serial(async () => {
    patchStatus({ pending: true });
    try {
      return await syncOnce(track, hooks);
    } catch (e) {
      if (!track.sender) return false;
      setBgEffect(NO_BG);
      const ours = oursOn(track);
      if (ours) await release(track, ours).catch(() => null);
      hooks.onError?.(e);
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
