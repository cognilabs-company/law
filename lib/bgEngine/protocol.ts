export type EngineEffect = { kind: "none" } | { kind: "blur"; level: "light" | "strong" } | { kind: "image"; src: string; key: string };

export type EngineAssets = {
  base: string;
  fallbackBase: string;
  landscape: string[];
  square: string[];
};

export type ToWorker =
  | { type: "warm"; assets: EngineAssets; portrait: boolean }
  | { type: "attach"; id: number; readable: ReadableStream<VideoFrame> | null; writable: WritableStream<VideoFrame>; portrait: boolean }
  | { type: "attach-track"; id: number; track: MediaStreamTrack | null; portrait: boolean }
  | { type: "source"; id: number; readable?: ReadableStream<VideoFrame>; track?: MediaStreamTrack; portrait: boolean }
  | { type: "pause-source"; id: number }
  | { type: "detach"; id: number }
  | { type: "effect"; seq: number; effect: EngineEffect };

export type WorkerHealth = { inFrames: number; outFrames: number; stride: number; costMs: number; gpuBusy: number; delegate: "gpu" | "cpu" | "none" };

export type FromWorker =
  | { type: "ready"; ok: boolean; error?: string }
  | { type: "output"; id: number; track: MediaStreamTrack | null; error?: string }
  | { type: "effect-done"; seq: number; ok: boolean; error?: string }
  | { type: "health"; id: number; health: WorkerHealth }
  | { type: "trouble"; id: number; reason: "slow" | "failed"; error?: string }
  | { type: "fatal"; error: string };
