import { TrackEvent, type LocalTrack, type ProcessorOptions, type Track, type TrackProcessor } from "livekit-client";
import type { EngineAssets, EngineEffect, FromWorker, ToWorker, WorkerHealth } from "./protocol";

export type { EngineEffect } from "./protocol";
export type EngineTrouble = "slow" | "failed";
export type TroubleHandler = (reason: EngineTrouble, error: string | undefined, track: LocalTrack | null) => void;

export const ENGINE_NAME = "lexgo-background";

type Transport = "streams" | "track";
type WarmResult = "ok" | "failed" | "cancelled";

const READY_TIMEOUT_MS = 30000;
const OUTPUT_TIMEOUT_MS = 8000;
const STALL_MS = 2500;
const SILENT_MS = 5000;

export class EngineStoppedError extends Error {
  constructor() {
    super("background engine stopped");
    this.name = "EngineStoppedError";
  }
}

export const isEngineStopped = (e: unknown) => e instanceof EngineStoppedError;

let transport: Transport | null | undefined;
let worker: Worker | null = null;
let ready: Promise<boolean> | null = null;
let readyResolve: ((result: WarmResult) => void) | null = null;
let broken = false;
let users = 0;
let generation = 0;
let effectSeq = 0;
let lastEffect: EngineEffect = { kind: "none" };
let attachSeq = 0;
const effectWaiters = new Map<number, { resolve: () => void; reject: (e: Error) => void }>();
const outputWaiters = new Map<number, (track: MediaStreamTrack | null, error?: string) => void>();
const live = new Map<number, BackgroundEngineProcessor>();

function hardwareWebgl2(): boolean {
  try {
    const probe = document.createElement("canvas");
    const ctx = probe.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (!ctx) return false;
    const ok = !!ctx.getExtension("EXT_color_buffer_float");
    ctx.getExtension("WEBGL_lose_context")?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

function trackTransferable(): boolean {
  try {
    const source = document.createElement("canvas");
    source.width = 2;
    source.height = 2;
    source.getContext("2d");
    const track = source.captureStream(1).getVideoTracks()[0];
    if (!track) return false;
    const channel = new MessageChannel();
    try {
      channel.port1.postMessage(track, [track as unknown as Transferable]);
      return true;
    } catch {
      track.stop();
      return false;
    } finally {
      channel.port1.close();
      channel.port2.close();
    }
  } catch {
    return false;
  }
}

export function engineTransport(): Transport | null {
  if (broken) return null;
  if (transport !== undefined) return transport;
  if (typeof window === "undefined") return null;
  transport = null;
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined" || typeof VideoFrame === "undefined" || !hardwareWebgl2()) return transport;
  const w = window as unknown as { MediaStreamTrackProcessor?: unknown; MediaStreamTrackGenerator?: unknown };
  if (typeof w.MediaStreamTrackProcessor === "function" && typeof w.MediaStreamTrackGenerator === "function") transport = "streams";
  else if (trackTransferable()) transport = "track";
  return transport;
}

const isPhone = () => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

function isPortrait(track: MediaStreamTrack) {
  const s = track.getSettings();
  return (s.height ?? 0) > (s.width ?? 0);
}

function engineAssets(): EngineAssets {
  const version = process.env.MEDIAPIPE_VERSION || "";
  const model = (name: string) => `https://storage.googleapis.com/mediapipe-models/image_segmenter/${name}/float16/latest/${name}.tflite`;
  const base = `/mediapipe/wasm/${version}`;
  return {
    base,
    fallbackBase: version ? `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}/wasm` : base,
    landscape: ["/mediapipe/models/selfie_segmenter_landscape.tflite", model("selfie_segmenter_landscape")],
    square: ["/mediapipe/models/selfie_segmenter.tflite", model("selfie_segmenter")],
  };
}

function send(message: ToWorker, transfer: Transferable[] = []) {
  worker?.postMessage(message, transfer);
}

function reset(result: WarmResult) {
  worker?.terminate();
  worker = null;
  ready = null;
  const settle = readyResolve;
  readyResolve = null;
  settle?.(result);
  for (const [, waiter] of effectWaiters) waiter.reject(new EngineStoppedError());
  effectWaiters.clear();
  for (const [, done] of outputWaiters) done(null, "engine stopped");
  outputWaiters.clear();
}

function fail(error: string) {
  const victims = [...live.values()];
  reset("cancelled");
  for (const p of victims) p.trouble("failed", error);
}

function onMessage(message: FromWorker) {
  switch (message.type) {
    case "ready": {
      const settle = readyResolve;
      readyResolve = null;
      settle?.(message.ok ? "ok" : "failed");
      return;
    }
    case "output": {
      const done = outputWaiters.get(message.id);
      outputWaiters.delete(message.id);
      done?.(message.track, message.error);
      return;
    }
    case "effect-done": {
      const waiter = effectWaiters.get(message.seq);
      effectWaiters.delete(message.seq);
      if (!waiter) return;
      if (message.ok) waiter.resolve();
      else waiter.reject(new Error(message.error || "background effect failed"));
      return;
    }
    case "health":
      live.get(message.id)?.health(message.health);
      return;
    case "trouble":
      live.get(message.id)?.trouble(message.reason, message.error);
      return;
    case "fatal":
      fail(message.error);
      return;
  }
}

function spawn(): Worker {
  const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "lexgo-background" });
  w.addEventListener("message", (event: MessageEvent<FromWorker>) => onMessage(event.data));
  w.addEventListener("error", (event) => {
    event.preventDefault();
    fail("background worker crashed");
  });
  return w;
}

export function warmEngine(): Promise<boolean> {
  if (!engineTransport()) return Promise.resolve(false);
  if (ready) return ready;
  worker = worker ?? spawn();
  const pending = new Promise<WarmResult>((resolve) => {
    readyResolve = resolve;
    setTimeout(() => {
      if (readyResolve === resolve) {
        readyResolve = null;
        resolve("cancelled");
      }
    }, READY_TIMEOUT_MS);
  });
  const portrait = isPhone() && typeof matchMedia !== "undefined" && matchMedia("(orientation: portrait)").matches;
  send({ type: "warm", assets: engineAssets(), portrait, phone: isPhone() });
  send({ type: "effect", seq: ++effectSeq, effect: lastEffect });
  const current = pending.then((result) => {
    if (result === "ok") return true;
    if (result === "failed") broken = true;
    if (ready === current) reset("cancelled");
    return false;
  });
  ready = current;
  return current;
}

export function setEngineEffect(effect: EngineEffect): Promise<void> {
  lastEffect = effect;
  const w = worker;
  if (!w) return Promise.resolve();
  const seq = ++effectSeq;
  return new Promise<void>((resolve, reject) => {
    effectWaiters.set(seq, {
      resolve: () => {
        if (effect.kind !== "none") for (const p of live.values()) p.armSlow();
        resolve();
      },
      reject,
    });
    w.postMessage({ type: "effect", seq, effect } satisfies ToWorker);
  });
}

export const engineGeneration = () => generation;

export function disposeEngine() {
  generation++;
  for (const p of live.values()) p.orphan();
  live.clear();
  reset("cancelled");
}

export function retainEngine() {
  users++;
}

export function releaseEngine() {
  users = Math.max(0, users - 1);
  if (!users) disposeEngine();
}

export class BackgroundEngineProcessor implements TrackProcessor<Track.Kind.Video> {
  readonly name = ENGINE_NAME;
  processedTrack?: MediaStreamTrack;
  private readonly id = ++attachSeq;
  private destroyed = false;
  private inert = false;
  private slowSent = false;
  private failedSent = false;
  private paused = false;
  private stream: unknown = null;
  private source: MediaStreamTrack | null = null;
  private localTrack: LocalTrack | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastIn = 0;
  private lastOut = 0;
  private progressAt = 0;
  private healthAt = 0;

  constructor(private readonly onTrouble: TroubleHandler) {}

  private readonly onMuted = () => {
    if (transport !== "track" || this.paused || this.destroyed) return;
    this.paused = true;
    send({ type: "pause-source", id: this.id });
  };

  async init(opts: ProcessorOptions<Track.Kind.Video>) {
    this.localTrack = opts.localTrack ?? null;
    const ok = await warmEngine();
    if (!ok || !worker || this.destroyed) {
      this.inert = true;
      if (!this.destroyed) queueMicrotask(() => this.trouble("failed", "background engine unavailable"));
      return;
    }
    live.set(this.id, this);
    this.localTrack?.on(TrackEvent.Muted, this.onMuted);
    try {
      await this.connect(opts.track, true);
    } catch (error) {
      this.inert = true;
      this.processedTrack = undefined;
      queueMicrotask(() => this.trouble("failed", error instanceof Error ? error.message : "background output unavailable"));
      return;
    }
    this.progressAt = performance.now();
    this.healthAt = this.progressAt;
    this.timer = setInterval(() => this.watch(), 1000);
  }

  async restart(opts: ProcessorOptions<Track.Kind.Video>) {
    if (this.destroyed) {
      opts.track.stop();
      return;
    }
    if (this.inert || !worker) return;
    await this.connect(opts.track, false);
    this.progressAt = performance.now();
    if (this.destroyed) {
      opts.track.stop();
      return;
    }
    if (transport === "track") setTimeout(() => this.checkMuted(), 0);
  }

  async destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cleanup();
    send({ type: "detach", id: this.id });
    this.processedTrack?.stop();
  }

  orphan() {
    this.destroyed = true;
    this.cleanup();
    this.processedTrack?.stop();
  }

  armSlow() {
    this.slowSent = false;
  }

  health(h: WorkerHealth) {
    const now = performance.now();
    this.healthAt = now;
    if (h.outFrames > this.lastOut || h.inFrames === this.lastIn) this.progressAt = now;
    this.lastIn = h.inFrames;
    this.lastOut = h.outFrames;
  }

  trouble(reason: EngineTrouble, error?: string) {
    if (this.destroyed) return;
    if (reason === "slow") {
      if (this.slowSent || this.failedSent) return;
      this.slowSent = true;
    } else {
      if (this.failedSent) return;
      this.failedSent = true;
    }
    this.onTrouble(reason, error, this.localTrack);
  }

  private checkMuted() {
    const source = this.source;
    if (!source) return;
    if (source.readyState === "ended" || (this.localTrack?.isMuted && !source.enabled)) this.onMuted();
  }

  private watch() {
    if (this.destroyed) return;
    const now = performance.now();
    if (transport === "track") this.checkMuted();
    if (now - this.progressAt > STALL_MS) this.trouble("failed", "background output stalled");
    else if (now - this.healthAt > SILENT_MS && this.source?.readyState === "live") this.trouble("failed", "background engine silent");
  }

  private cleanup() {
    live.delete(this.id);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.localTrack?.off(TrackEvent.Muted, this.onMuted);
    this.localTrack = null;
    this.stream = null;
  }

  private async connect(track: MediaStreamTrack, first: boolean) {
    this.source = track;
    this.paused = false;
    const portrait = isPortrait(track);
    if (transport === "streams") {
      const processor = new MediaStreamTrackProcessor({ track: track as MediaStreamVideoTrack, maxBufferSize: 1 });
      this.stream = processor;
      if (first) {
        const generator = new MediaStreamTrackGenerator({ kind: "video" });
        this.processedTrack = generator;
        send({ type: "attach", id: this.id, readable: processor.readable, writable: generator.writable, portrait }, [processor.readable, generator.writable]);
      } else {
        send({ type: "source", id: this.id, readable: processor.readable, portrait }, [processor.readable]);
      }
      return;
    }
    const clone = track.clone();
    if (!first) {
      send({ type: "source", id: this.id, track: clone, portrait }, [clone as unknown as Transferable]);
      return;
    }
    const output = new Promise<MediaStreamTrack>((resolve, reject) => {
      const timeout = setTimeout(() => {
        outputWaiters.delete(this.id);
        reject(new Error("background output timed out"));
      }, OUTPUT_TIMEOUT_MS);
      outputWaiters.set(this.id, (out, error) => {
        clearTimeout(timeout);
        if (out) resolve(out);
        else reject(new Error(error || "background output unavailable"));
      });
    });
    send({ type: "attach-track", id: this.id, track: clone, portrait }, [clone as unknown as Transferable]);
    this.processedTrack = await output;
  }
}
