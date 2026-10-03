import { FilesetResolver, ImageSegmenter, type ImageSegmenterResult } from "@mediapipe/tasks-vision";
import { AB, BOX1, BOX4, COMPOSITE, COPY_MASK, DOWN, GUIDE, NEAR, PREP, SMOOTH, UP, VERTEX } from "./shaders";
import type { EngineAssets, EngineEffect, FromWorker, ToWorker } from "./protocol";

type Scope = {
  postMessage(message: FromWorker, transfer: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent<ToWorker>) => void): void;
};
type TrackGenerator = { readonly writable: WritableStream<VideoFrame>; readonly track: MediaStreamTrack };
type WorkerApis = {
  MediaStreamTrackProcessor?: new (init: { track: MediaStreamTrack }) => { readonly readable: ReadableStream<VideoFrame> };
  VideoTrackGenerator?: new () => TrackGenerator;
};
type TimerExtension = { readonly TIME_ELAPSED_EXT: number };
type Program = { program: WebGLProgram; uniforms: Map<string, WebGLUniformLocation> };
type Surface = { fb: WebGLFramebuffer; w: number; h: number };
type Target = Surface & { tex: WebGLTexture };
type Multi = Surface & { texs: WebGLTexture[] };
type ImageEntry = { key: string; tex: WebGLTexture; w: number; h: number };
type Look = { kind: 0 | 1 | 2; depth: number; image: ImageEntry | null };
type Readback = { buf: WebGLBuffer; data: Uint8Array; fence: WebGLSync | null; ts: number };
type Programs = { copy: Program; guide: Program; smooth: Program; prep: Program; box4: Program; box1: Program; ab: Program; near: Program; down: Program; up: Program; comp: Program };
type Candidate = { seg: ImageSegmenter; ms: number };
type Pipe = {
  frameW: number;
  frameH: number;
  halfW: number;
  halfH: number;
  maskW: number;
  maskH: number;
  levels: Target[];
  blurOut: Target[];
  half: Target | null;
  halfReady: boolean;
  outTarget: Target | null;
  readbacks: Readback[];
  readbackAt: number;
  pendingReads: Readback[];
  maskRaw: Target | null;
  maskPing: Target[];
  maskIndex: number;
  haveMask: boolean;
  guides: Target[];
  guideAt: number;
  stats: Multi[];
  abT: Target[];
  nearT: Target[];
  cpuBytes: Uint8Array;
  frameIndex: number;
  stride: number;
  costEma: number;
  busyRing: Uint8Array;
  busyAt: number;
  busyCount: number;
  fence: WebGLSync | null;
  segEma: number;
  restEma: number;
  lastFrameTs: number;
  gaps: number[];
};
type Attachment = {
  id: number;
  gen: number;
  writer: WritableStreamDefaultWriter<VideoFrame> | null;
  reader: ReadableStreamDefaultReader<VideoFrame> | null;
  clone: MediaStreamTrack | null;
  inFrames: number;
  outFrames: number;
  errors: number[];
  slowSent: boolean;
  failedSent: boolean;
  rendering: boolean;
  lastIn: number;
  lastOut: number;
  lowSeconds: number;
  writing: Promise<void>;
  drainTimer: ReturnType<typeof setTimeout> | null;
  pipe: Pipe;
};

const scope = self as unknown as Scope;
const apis = self as unknown as WorkerApis;

const FADE_MS = 150;
const DEPTH = { light: 2, strong: 4 } as const;
const LEVELS = 4;
const MASK_LONG = 256;
const SMOOTH_RATIO = 0.9;
const SMOOTH_BASE = 0.5;
const MOTION_LOW = 0.04;
const MOTION_HIGH = 0.12;
const GF_RADIUS = 2;
const GF_EPS = 0.002;
const NEAR_RADIUS = 2;
const EDGE_LOW = 0.4;
const EDGE_HIGH = 0.6;
const WRAP = 0.15;
const IMAGE_CACHE = 4;
const BUSY_WINDOW = 60;
const READBACK_SLOTS = 3;
const MAX_STRIDE = 3;
const DEFAULT_INTERVAL_MS = 33;
const STRIDE_UP_SHARE = 0.8;
const STRIDE_DOWN_SHARE = 0.65;
const SLOW_FPS = 8;
const SLOW_SECONDS = 6;
const GPU_SEGMENT_OK_MS = 8;
const SWAP_STRAIN_SECONDS = 6;
const SWAP_SETTLE_MS = 3000;
const SWAP_JUDGE_MS = 10000;
const SWAP_HOLD_MS = 300000;
const NONE: Look = { kind: 0, depth: 0, image: null };

let canvas: OffscreenCanvas | null = null;
let gl: WebGL2RenderingContext | null = null;
let programs: Programs | null = null;
let vao: WebGLVertexArrayObject | null = null;
let camTex: WebGLTexture | null = null;
let blank: WebGLTexture | null = null;
let lost = false;

let segInput: OffscreenCanvas | null = null;
let segInputCtx: OffscreenCanvasRenderingContext2D | null = null;
let segInputCpu = false;

let assets: EngineAssets | null = null;
let segmenter: ImageSegmenter | null = null;
let segModel: "landscape" | "square" | null = null;
let segGpu = true;
let spare: ImageSegmenter | null = null;
let strainRun = 0;
const strainSeen: number[] = [];
let judged: number[] = [];
let swapAt = 0;
let swapBefore = 0;
let swapHold = 0;
let segLoading: Promise<void> | null = null;
let wantModel: "landscape" | "square" = "landscape";
let lastTs = 0;

let look: Look = NONE;
let prevLook: Look = NONE;
let fadeStart = -1e9;
let effectSeq = 0;
const images = new Map<string, ImageEntry>();
const attachments = new Map<number, Attachment>();

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : Number.NaN);

function post(message: FromWorker, transfer: Transferable[] = []) {
  scope.postMessage(message, transfer);
}

function markLost() {
  if (lost) return;
  lost = true;
  post({ type: "fatal", error: "graphics context lost" });
}

function compile(ctx: WebGL2RenderingContext, fragment: string): Program {
  const shader = (type: number, source: string) => {
    const s = ctx.createShader(type);
    if (!s) throw new Error("shader allocation failed");
    ctx.shaderSource(s, source);
    ctx.compileShader(s);
    if (!ctx.getShaderParameter(s, ctx.COMPILE_STATUS)) throw new Error(ctx.getShaderInfoLog(s) || "shader compile failed");
    return s;
  };
  const program = ctx.createProgram();
  if (!program) throw new Error("program allocation failed");
  ctx.attachShader(program, shader(ctx.VERTEX_SHADER, VERTEX));
  ctx.attachShader(program, shader(ctx.FRAGMENT_SHADER, fragment));
  ctx.linkProgram(program);
  if (!ctx.getProgramParameter(program, ctx.LINK_STATUS)) throw new Error(ctx.getProgramInfoLog(program) || "program link failed");
  const uniforms = new Map<string, WebGLUniformLocation>();
  const count = ctx.getProgramParameter(program, ctx.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const info = ctx.getActiveUniform(program, i);
    if (!info) continue;
    const location = ctx.getUniformLocation(program, info.name);
    if (location) uniforms.set(info.name, location);
  }
  return { program, uniforms };
}

function texture(ctx: WebGL2RenderingContext, w: number, h: number, format: number) {
  const tex = ctx.createTexture();
  if (!tex) throw new Error("texture allocation failed");
  ctx.bindTexture(ctx.TEXTURE_2D, tex);
  ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR);
  ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.LINEAR);
  ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
  ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);
  if (w > 0 && h > 0) ctx.texStorage2D(ctx.TEXTURE_2D, 1, format, w, h);
  return tex;
}

function target(ctx: WebGL2RenderingContext, w: number, h: number, format: number): Target {
  const tex = texture(ctx, w, h, format);
  const fb = ctx.createFramebuffer();
  if (!fb) throw new Error("framebuffer allocation failed");
  ctx.bindFramebuffer(ctx.FRAMEBUFFER, fb);
  ctx.framebufferTexture2D(ctx.FRAMEBUFFER, ctx.COLOR_ATTACHMENT0, ctx.TEXTURE_2D, tex, 0);
  ctx.bindFramebuffer(ctx.FRAMEBUFFER, null);
  return { tex, fb, w, h };
}

function multiTarget(ctx: WebGL2RenderingContext, w: number, h: number, count: number, format: number): Multi {
  const fb = ctx.createFramebuffer();
  if (!fb) throw new Error("framebuffer allocation failed");
  const texs: WebGLTexture[] = [];
  const buffers: number[] = [];
  ctx.bindFramebuffer(ctx.FRAMEBUFFER, fb);
  for (let i = 0; i < count; i++) {
    const tex = texture(ctx, w, h, format);
    texs.push(tex);
    ctx.framebufferTexture2D(ctx.FRAMEBUFFER, ctx.COLOR_ATTACHMENT0 + i, ctx.TEXTURE_2D, tex, 0);
    buffers.push(ctx.COLOR_ATTACHMENT0 + i);
  }
  ctx.drawBuffers(buffers);
  ctx.bindFramebuffer(ctx.FRAMEBUFFER, null);
  return { texs, fb, w, h };
}

function drop(ctx: WebGL2RenderingContext, t: Target | null) {
  if (!t) return;
  ctx.deleteTexture(t.tex);
  ctx.deleteFramebuffer(t.fb);
}

function dropMulti(ctx: WebGL2RenderingContext, m: Multi) {
  for (const tex of m.texs) ctx.deleteTexture(tex);
  ctx.deleteFramebuffer(m.fb);
}

function setupGl(): WebGL2RenderingContext {
  if (gl) return gl;
  const surface = new OffscreenCanvas(16, 16);
  const onLost = (event: Event) => {
    event.preventDefault();
    markLost();
  };
  surface.addEventListener("webglcontextlost", onLost);
  surface.addEventListener("contextlost", onLost);
  const ctx = surface.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "default" });
  if (!ctx) throw new Error("webgl2 unavailable");
  if (!ctx.getExtension("EXT_color_buffer_float")) throw new Error("float render targets unavailable");
  const nextPrograms: Programs = {
    copy: compile(ctx, COPY_MASK),
    guide: compile(ctx, GUIDE),
    smooth: compile(ctx, SMOOTH),
    prep: compile(ctx, PREP),
    box4: compile(ctx, BOX4),
    box1: compile(ctx, BOX1),
    ab: compile(ctx, AB),
    near: compile(ctx, NEAR),
    down: compile(ctx, DOWN),
    up: compile(ctx, UP),
    comp: compile(ctx, COMPOSITE),
  };
  const nextVao = ctx.createVertexArray();
  if (!nextVao) throw new Error("vertex array allocation failed");
  ctx.bindVertexArray(nextVao);
  const buffer = ctx.createBuffer();
  ctx.bindBuffer(ctx.ARRAY_BUFFER, buffer);
  ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), ctx.STATIC_DRAW);
  ctx.enableVertexAttribArray(0);
  ctx.vertexAttribPointer(0, 2, ctx.FLOAT, false, 0, 0);
  ctx.bindVertexArray(null);
  ctx.bindBuffer(ctx.ARRAY_BUFFER, null);
  canvas = surface;
  gl = ctx;
  programs = nextPrograms;
  vao = nextVao;
  camTex = texture(ctx, 0, 0, ctx.RGBA8);
  blank = texture(ctx, 1, 1, ctx.RGBA8);
  return ctx;
}

function neutral(ctx: WebGL2RenderingContext) {
  ctx.bindFramebuffer(ctx.FRAMEBUFFER, null);
  ctx.bindVertexArray(null);
  ctx.bindBuffer(ctx.PIXEL_UNPACK_BUFFER, null);
  ctx.bindBuffer(ctx.PIXEL_PACK_BUFFER, null);
  ctx.disable(ctx.BLEND);
  ctx.disable(ctx.DEPTH_TEST);
  ctx.disable(ctx.SCISSOR_TEST);
  ctx.disable(ctx.CULL_FACE);
  ctx.disable(ctx.STENCIL_TEST);
  ctx.colorMask(true, true, true, true);
  ctx.pixelStorei(ctx.UNPACK_FLIP_Y_WEBGL, false);
  ctx.pixelStorei(ctx.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  ctx.pixelStorei(ctx.UNPACK_ALIGNMENT, 4);
  ctx.pixelStorei(ctx.PACK_ALIGNMENT, 4);
  ctx.activeTexture(ctx.TEXTURE0);
}

function pass(ctx: WebGL2RenderingContext, prog: Program, out: Surface, textures: Array<[string, WebGLTexture]>, set?: (u: Map<string, WebGLUniformLocation>) => void) {
  ctx.bindFramebuffer(ctx.FRAMEBUFFER, out.fb);
  ctx.viewport(0, 0, out.w, out.h);
  ctx.useProgram(prog.program);
  ctx.bindVertexArray(vao);
  let unit = 0;
  for (const [name, tex] of textures) {
    const location = prog.uniforms.get(name);
    if (!location) continue;
    ctx.activeTexture(ctx.TEXTURE0 + unit);
    ctx.bindTexture(ctx.TEXTURE_2D, tex);
    ctx.uniform1i(location, unit);
    unit++;
  }
  if (set) set(prog.uniforms);
  ctx.drawArrays(ctx.TRIANGLE_STRIP, 0, 4);
}

function newPipe(): Pipe {
  return {
    frameW: 0,
    frameH: 0,
    halfW: 0,
    halfH: 0,
    maskW: 0,
    maskH: 0,
    levels: [],
    blurOut: [],
    half: null,
    halfReady: false,
    outTarget: null,
    readbacks: [],
    readbackAt: 0,
    pendingReads: [],
    maskRaw: null,
    maskPing: [],
    maskIndex: 0,
    haveMask: false,
    guides: [],
    guideAt: 0,
    stats: [],
    abT: [],
    nearT: [],
    cpuBytes: new Uint8Array(0),
    frameIndex: 0,
    stride: 1,
    costEma: 0,
    busyRing: new Uint8Array(BUSY_WINDOW),
    busyAt: 0,
    busyCount: 0,
    fence: null,
    segEma: 0,
    restEma: 0,
    lastFrameTs: -1,
    gaps: [],
  };
}

function dropFrameTargets(ctx: WebGL2RenderingContext, pipe: Pipe) {
  for (const t of pipe.levels) drop(ctx, t);
  for (const t of pipe.blurOut) drop(ctx, t);
  drop(ctx, pipe.half);
  drop(ctx, pipe.outTarget);
  for (const r of pipe.readbacks) {
    if (r.fence) ctx.deleteSync(r.fence);
    ctx.deleteBuffer(r.buf);
  }
  pipe.levels = [];
  pipe.blurOut = [];
  pipe.half = null;
  pipe.outTarget = null;
  pipe.readbacks = [];
  pipe.readbackAt = 0;
  pipe.pendingReads.length = 0;
}

function dropMaskTargets(ctx: WebGL2RenderingContext, pipe: Pipe) {
  drop(ctx, pipe.maskRaw);
  for (const t of pipe.maskPing) drop(ctx, t);
  for (const t of pipe.guides) drop(ctx, t);
  for (const m of pipe.stats) dropMulti(ctx, m);
  for (const t of pipe.abT) drop(ctx, t);
  for (const t of pipe.nearT) drop(ctx, t);
  pipe.maskRaw = null;
  pipe.maskPing = [];
  pipe.guides = [];
  pipe.stats = [];
  pipe.abT = [];
  pipe.nearT = [];
}

function releasePipe(pipe: Pipe) {
  const ctx = gl;
  if (!ctx) return;
  if (pipe.fence) ctx.deleteSync(pipe.fence);
  pipe.fence = null;
  dropFrameTargets(ctx, pipe);
  dropMaskTargets(ctx, pipe);
  pipe.frameW = 0;
  pipe.frameH = 0;
  pipe.maskW = 0;
  pipe.maskH = 0;
  pipe.haveMask = false;
}

function ensureSize(ctx: WebGL2RenderingContext, pipe: Pipe, w: number, h: number) {
  if (w === pipe.frameW && h === pipe.frameH) return;
  dropFrameTargets(ctx, pipe);
  pipe.frameW = w;
  pipe.frameH = h;
  pipe.halfW = Math.max(1, Math.round(w / 2));
  pipe.halfH = Math.max(1, Math.round(h / 2));
  const float = ctx.RGBA16F;
  let lw = w / 4;
  let lh = h / 4;
  for (let i = 0; i < LEVELS; i++) {
    pipe.levels.push(target(ctx, Math.max(1, Math.round(lw)), Math.max(1, Math.round(lh)), float));
    lw /= 2;
    lh /= 2;
  }
  pipe.blurOut = [0, 1].map(() => target(ctx, pipe.halfW, pipe.halfH, float));
  pipe.half = target(ctx, pipe.halfW, pipe.halfH, ctx.RGBA8);
  pipe.outTarget = target(ctx, w, h, ctx.RGBA8);
  for (let i = 0; i < READBACK_SLOTS; i++) {
    const buf = ctx.createBuffer();
    if (!buf) throw new Error("buffer allocation failed");
    ctx.bindBuffer(ctx.PIXEL_PACK_BUFFER, buf);
    ctx.bufferData(ctx.PIXEL_PACK_BUFFER, w * h * 4, ctx.STREAM_READ);
    pipe.readbacks.push({ buf, data: new Uint8Array(w * h * 4), fence: null, ts: 0 });
  }
  ctx.bindBuffer(ctx.PIXEL_PACK_BUFFER, null);
  const mw = w >= h ? MASK_LONG : Math.max(16, Math.round((MASK_LONG * w) / h));
  const mh = w >= h ? Math.max(16, Math.round((MASK_LONG * h) / w)) : MASK_LONG;
  if (mw === pipe.maskW && mh === pipe.maskH) return;
  dropMaskTargets(ctx, pipe);
  pipe.maskW = mw;
  pipe.maskH = mh;
  pipe.maskRaw = target(ctx, mw, mh, ctx.R8);
  pipe.maskPing = [target(ctx, mw, mh, ctx.R8), target(ctx, mw, mh, ctx.R8)];
  pipe.guides = [target(ctx, mw, mh, ctx.RGBA8), target(ctx, mw, mh, ctx.RGBA8)];
  pipe.stats = [multiTarget(ctx, mw, mh, 4, float), multiTarget(ctx, mw, mh, 4, float)];
  pipe.abT = [target(ctx, mw, mh, float), target(ctx, mw, mh, float)];
  pipe.nearT = [target(ctx, mw, mh, float), target(ctx, mw, mh, float)];
  pipe.cpuBytes = new Uint8Array(mw * mh);
  pipe.haveMask = false;
}

function inputCanvas(w: number, h: number, cpu: boolean) {
  if (!segInput || !segInputCtx || segInput.width !== w || segInput.height !== h || segInputCpu !== cpu) {
    segInput = new OffscreenCanvas(w, h);
    segInputCtx = segInput.getContext("2d", { alpha: false, willReadFrequently: cpu });
    segInputCpu = cpu;
  }
  return segInputCtx ? segInput : null;
}

function prepare(ctx: WebGL2RenderingContext, prog: Programs, pipe: Pipe, frame: VideoFrame) {
  neutral(ctx);
  ctx.bindTexture(ctx.TEXTURE_2D, camTex as WebGLTexture);
  ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, ctx.RGBA, ctx.UNSIGNED_BYTE, frame);
  pass(ctx, prog.guide, pipe.guides[pipe.guideAt], [["src", camTex as WebGLTexture]], (u) => ctx.uniform2f(u.get("h") ?? null, 0.25 / pipe.maskW, 0.25 / pipe.maskH));
  pipe.halfReady = false;
}

function segment(ctx: WebGL2RenderingContext, prog: Programs, pipe: Pipe, frame: VideoFrame): boolean {
  const seg = segmenter;
  const raw = pipe.maskRaw;
  if (!seg || !raw || pipe.maskPing.length < 2) return false;
  const input = inputCanvas(pipe.maskW, pipe.maskH, !segGpu);
  const paint = segInputCtx;
  if (!input || !paint) return false;
  paint.imageSmoothingEnabled = true;
  paint.imageSmoothingQuality = "high";
  paint.drawImage(frame, 0, 0, pipe.maskW, pipe.maskH);
  lastTs = Math.max(lastTs + 1, Math.round(performance.now()));
  neutral(ctx);
  let copied = false;
  seg.segmentForVideo(input, lastTs, (result: ImageSegmenterResult) => {
    const mask = result.confidenceMasks?.[0];
    if (!mask) return;
    if (segGpu) {
      const tex = mask.getAsWebGLTexture();
      neutral(ctx);
      pass(ctx, prog.copy, raw, [["src", tex]]);
    } else {
      const data = mask.getAsFloat32Array();
      const bytes = pipe.cpuBytes;
      const n = Math.min(bytes.length, data.length);
      for (let i = 0; i < n; i++) bytes[i] = data[i] * 255;
      ctx.bindTexture(ctx.TEXTURE_2D, raw.tex);
      ctx.pixelStorei(ctx.UNPACK_ALIGNMENT, 1);
      ctx.texSubImage2D(ctx.TEXTURE_2D, 0, 0, 0, pipe.maskW, pipe.maskH, ctx.RED, ctx.UNSIGNED_BYTE, bytes);
      ctx.pixelStorei(ctx.UNPACK_ALIGNMENT, 4);
    }
    copied = true;
  });
  neutral(ctx);
  if (!copied) return false;
  const prev = pipe.maskPing[pipe.maskIndex];
  const next = pipe.maskPing[1 - pipe.maskIndex];
  const smoothing = pipe.haveMask;
  pass(ctx, prog.smooth, next, [["cur", raw.tex], ["prev", prev.tex], ["gCur", pipe.guides[pipe.guideAt].tex], ["gPrev", pipe.guides[1 - pipe.guideAt].tex]], (u) => {
    ctx.uniform1f(u.get("ratio") ?? null, smoothing ? SMOOTH_RATIO : 0);
    ctx.uniform1f(u.get("base") ?? null, smoothing ? SMOOTH_BASE : 0);
    ctx.uniform2f(u.get("motion") ?? null, MOTION_LOW, MOTION_HIGH);
  });
  pipe.maskIndex = 1 - pipe.maskIndex;
  pipe.guideAt = 1 - pipe.guideAt;
  pipe.haveMask = true;
  return true;
}

function refine(ctx: WebGL2RenderingContext, prog: Programs, pipe: Pipe, mask: WebGLTexture, image: WebGLTexture): WebGLTexture {
  const [a, b] = pipe.stats;
  const box4 = (from: Multi, to: Multi, dx: number, dy: number) =>
    pass(ctx, prog.box4, to, [["s0", from.texs[0]], ["s1", from.texs[1]], ["s2", from.texs[2]], ["s3", from.texs[3]]], (u) => {
      ctx.uniform2i(u.get("dir") ?? null, dx, dy);
      ctx.uniform1i(u.get("r") ?? null, GF_RADIUS);
    });
  const box1 = (from: Target, to: Target, dx: number, dy: number) =>
    pass(ctx, prog.box1, to, [["s0", from.tex]], (u) => {
      ctx.uniform2i(u.get("dir") ?? null, dx, dy);
      ctx.uniform1i(u.get("r") ?? null, GF_RADIUS);
    });
  pass(ctx, prog.prep, a, [["img", image], ["mask", mask]]);
  box4(a, b, 1, 0);
  box4(b, a, 0, 1);
  pass(ctx, prog.ab, pipe.abT[0], [["s0", a.texs[0]], ["s1", a.texs[1]], ["s2", a.texs[2]], ["s3", a.texs[3]]], (u) => ctx.uniform1f(u.get("eps") ?? null, GF_EPS));
  box1(pipe.abT[0], pipe.abT[1], 1, 0);
  box1(pipe.abT[1], pipe.abT[0], 0, 1);
  return pipe.abT[0].tex;
}

function nearBackground(ctx: WebGL2RenderingContext, prog: Programs, pipe: Pipe, ab: WebGLTexture, image: WebGLTexture): WebGLTexture {
  const [a, b] = pipe.nearT;
  pass(ctx, prog.near, a, [["img", image], ["ab", ab]]);
  pass(ctx, prog.box1, b, [["s0", a.tex]], (u) => {
    ctx.uniform2i(u.get("dir") ?? null, 1, 0);
    ctx.uniform1i(u.get("r") ?? null, NEAR_RADIUS);
  });
  pass(ctx, prog.box1, a, [["s0", b.tex]], (u) => {
    ctx.uniform2i(u.get("dir") ?? null, 0, 1);
    ctx.uniform1i(u.get("r") ?? null, NEAR_RADIUS);
  });
  return a.tex;
}

function blurInto(ctx: WebGL2RenderingContext, prog: Programs, pipe: Pipe, slot: number, ab: WebGLTexture, steps: number): WebGLTexture {
  const half = pipe.half as Target;
  if (!pipe.halfReady) {
    pass(ctx, prog.guide, half, [["src", camTex as WebGLTexture]], (u) => ctx.uniform2f(u.get("h") ?? null, 0.25 / pipe.halfW, 0.25 / pipe.halfH));
    pipe.halfReady = true;
  }
  let src = half.tex;
  let sw = half.w;
  let sh = half.h;
  for (let i = 0; i < steps; i++) {
    const level = pipe.levels[i];
    pass(ctx, prog.down, level, [["src", src], ["ab", ab]], (u) => {
      ctx.uniform2f(u.get("h") ?? null, 0.5 / sw, 0.5 / sh);
      ctx.uniform1i(u.get("first") ?? null, i === 0 ? 1 : 0);
    });
    src = level.tex;
    sw = level.w;
    sh = level.h;
  }
  for (let i = steps - 2; i >= 0; i--) {
    const level = pipe.levels[i];
    pass(ctx, prog.up, level, [["src", src]], (u) => ctx.uniform2f(u.get("h") ?? null, 0.5 / sw, 0.5 / sh));
    src = level.tex;
    sw = level.w;
    sh = level.h;
  }
  const out = pipe.blurOut[slot];
  pass(ctx, prog.up, out, [["src", src]], (u) => ctx.uniform2f(u.get("h") ?? null, 0.5 / sw, 0.5 / sh));
  return out.tex;
}

function coverOf(pipe: Pipe, image: ImageEntry | null): [number, number, number, number] {
  if (!image || !pipe.frameW || !pipe.frameH) return [0, 0, 1, 1];
  const ia = image.w / image.h;
  const fa = pipe.frameW / pipe.frameH;
  if (ia > fa) {
    const s = fa / ia;
    return [(1 - s) / 2, 0, s, 1];
  }
  const s = ia / fa;
  return [0, (1 - s) / 2, 1, s];
}

function compose(ctx: WebGL2RenderingContext, prog: Programs, pipe: Pipe, into: Target) {
  const cam = camTex as WebGLTexture;
  const empty = blank as WebGLTexture;
  const image = pipe.guides[1 - pipe.guideAt].tex;
  neutral(ctx);
  const ab = refine(ctx, prog, pipe, pipe.maskPing[pipe.maskIndex].tex, image);
  const near = nearBackground(ctx, prog, pipe, ab, image);
  const progress = Math.min(1, (performance.now() - fadeStart) / FADE_MS);
  const fading = progress < 1;
  const a = fading ? prevLook : NONE;
  const t = fading ? progress * progress * (3 - 2 * progress) : 1;
  const blurA = fading && a.kind === 1 ? blurInto(ctx, prog, pipe, 0, ab, a.depth) : empty;
  const blurB = look.kind === 1 ? blurInto(ctx, prog, pipe, 1, ab, look.depth) : empty;
  const coverA = coverOf(pipe, a.image);
  const coverB = coverOf(pipe, look.image);
  pass(
    ctx,
    prog.comp,
    into,
    [["cam", cam], ["ab", ab], ["near", near], ["blurA", blurA], ["blurB", blurB], ["imgA", a.image ? a.image.tex : empty], ["imgB", look.image ? look.image.tex : empty]],
    (u) => {
      ctx.uniform1i(u.get("kindA") ?? null, a.kind);
      ctx.uniform1i(u.get("kindB") ?? null, look.kind);
      ctx.uniform1f(u.get("t") ?? null, t);
      ctx.uniform4f(u.get("coverA") ?? null, coverA[0], coverA[1], coverA[2], coverA[3]);
      ctx.uniform4f(u.get("coverB") ?? null, coverB[0], coverB[1], coverB[2], coverB[3]);
      ctx.uniform2f(u.get("edge") ?? null, EDGE_LOW, EDGE_HIGH);
      ctx.uniform1f(u.get("wrap") ?? null, WRAP);
    },
  );
  neutral(ctx);
}

function collectReads(ctx: WebGL2RenderingContext, pipe: Pipe, force: boolean, out: VideoFrame[]) {
  let forced = force;
  while (pipe.pendingReads.length) {
    const slot = pipe.pendingReads[0];
    const sync = slot.fence;
    if (!sync) {
      pipe.pendingReads.shift();
      continue;
    }
    if (!forced && ctx.getSyncParameter(sync, ctx.SYNC_STATUS) !== ctx.SIGNALED) break;
    forced = false;
    pipe.pendingReads.shift();
    ctx.deleteSync(sync);
    slot.fence = null;
    ctx.bindBuffer(ctx.PIXEL_PACK_BUFFER, slot.buf);
    ctx.getBufferSubData(ctx.PIXEL_PACK_BUFFER, 0, slot.data);
    ctx.bindBuffer(ctx.PIXEL_PACK_BUFFER, null);
    out.push(new VideoFrame(slot.data, { format: "RGBX", codedWidth: pipe.frameW, codedHeight: pipe.frameH, timestamp: slot.ts }));
  }
}

function queueRead(ctx: WebGL2RenderingContext, pipe: Pipe, from: Target, ts: number, out: VideoFrame[]) {
  const slot = pipe.readbacks[pipe.readbackAt];
  pipe.readbackAt = (pipe.readbackAt + 1) % pipe.readbacks.length;
  if (slot.fence) collectReads(ctx, pipe, true, out);
  ctx.bindFramebuffer(ctx.READ_FRAMEBUFFER, from.fb);
  ctx.bindBuffer(ctx.PIXEL_PACK_BUFFER, slot.buf);
  ctx.readPixels(0, 0, pipe.frameW, pipe.frameH, ctx.RGBA, ctx.UNSIGNED_BYTE, 0);
  ctx.bindBuffer(ctx.PIXEL_PACK_BUFFER, null);
  ctx.bindFramebuffer(ctx.READ_FRAMEBUFFER, null);
  slot.fence = ctx.fenceSync(ctx.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!slot.fence) markLost();
  slot.ts = ts;
  pipe.pendingReads.push(slot);
  ctx.flush();
}

function flushReads(pipe: Pipe): VideoFrame[] {
  const ctx = gl;
  if (!ctx || !pipe.pendingReads.length) return [];
  const out: VideoFrame[] = [];
  try {
    while (pipe.pendingReads.length) collectReads(ctx, pipe, true, out);
  } catch {
    pipe.pendingReads.length = 0;
  }
  return out;
}

function gpuWasBusy(ctx: WebGL2RenderingContext, pipe: Pipe): boolean {
  const sync = pipe.fence;
  if (!sync) return false;
  pipe.fence = null;
  const busy = ctx.getSyncParameter(sync, ctx.SYNC_STATUS) !== ctx.SIGNALED;
  ctx.deleteSync(sync);
  return busy;
}

function trouble(att: Attachment, reason: "slow" | "failed", error?: string) {
  if (reason === "slow") {
    if (att.slowSent || att.failedSent) return;
    att.slowSent = true;
  } else {
    if (att.failedSent) return;
    att.failedSent = true;
  }
  post({ type: "trouble", id: att.id, reason, error });
}

function frameInterval(pipe: Pipe, timestamp: number) {
  const gap = (timestamp - pipe.lastFrameTs) / 1000;
  pipe.lastFrameTs = timestamp;
  if (gap > 4 && gap < 250) {
    pipe.gaps.push(gap);
    if (pipe.gaps.length > 30) pipe.gaps.shift();
  }
}

function cameraInterval(pipe: Pipe) {
  if (pipe.gaps.length < 8) return DEFAULT_INTERVAL_MS;
  const sorted = [...pipe.gaps].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.2)];
}

function adapt(pipe: Pipe, cost: number, busy: boolean, segmented: boolean) {
  pipe.costEma = pipe.costEma ? pipe.costEma * 0.9 + cost * 0.1 : cost;
  if (segmented) pipe.segEma = pipe.segEma ? pipe.segEma * 0.85 + cost * 0.15 : cost;
  else pipe.restEma = pipe.restEma ? pipe.restEma * 0.85 + cost * 0.15 : cost;
  const gpuBusy = segGpu && busy;
  pipe.busyCount += (gpuBusy ? 1 : 0) - pipe.busyRing[pipe.busyAt];
  pipe.busyRing[pipe.busyAt] = gpuBusy ? 1 : 0;
  pipe.busyAt = (pipe.busyAt + 1) % BUSY_WINDOW;
  if ((pipe.frameIndex & 15) !== 0) return;
  const busyRatio = pipe.busyCount / BUSY_WINDOW;
  const rest = pipe.restEma || pipe.segEma * 0.4;
  const costAt = (stride: number) => (pipe.segEma + (stride - 1) * rest) / stride;
  const interval = cameraInterval(pipe);
  if ((costAt(pipe.stride) > interval * STRIDE_UP_SHARE || busyRatio > 0.35) && pipe.stride < MAX_STRIDE) pipe.stride++;
  else if (pipe.stride > 1 && costAt(pipe.stride - 1) < interval * STRIDE_DOWN_SHARE && busyRatio < 0.1) pipe.stride--;
}

function noteError(att: Attachment, error: unknown) {
  const now = performance.now();
  att.errors = att.errors.filter((at) => now - at < 2000);
  att.errors.push(now);
  if (att.errors.length >= 5) trouble(att, "failed", errorText(error));
}

function resetAdaptation(pipe: Pipe) {
  const ctx = gl;
  if (pipe.fence && ctx) ctx.deleteSync(pipe.fence);
  pipe.fence = null;
  pipe.costEma = 0;
  pipe.busyRing.fill(0);
  pipe.busyCount = 0;
  pipe.busyAt = 0;
  pipe.segEma = 0;
  pipe.restEma = 0;
  pipe.stride = 1;
}

function shouldRender() {
  return !lost && !!segmenter && !!programs && (look.kind !== 0 || performance.now() - fadeStart < FADE_MS);
}

function renderFrame(att: Attachment, frame: VideoFrame): VideoFrame[] {
  const ctx = gl;
  const prog = programs;
  const pipe = att.pipe;
  if (!ctx || !prog) {
    frame.close();
    return flushReads(pipe);
  }
  const started = performance.now();
  const ready: VideoFrame[] = [];
  try {
    if (ctx.isContextLost()) {
      markLost();
      frame.close();
      return [];
    }
    const busy = gpuWasBusy(ctx, pipe);
    const w = frame.displayWidth;
    const h = frame.displayHeight;
    if (!w || !h) {
      frame.close();
      return flushReads(pipe);
    }
    ensureSize(ctx, pipe, w, h);
    frameInterval(pipe, frame.timestamp);
    prepare(ctx, prog, pipe, frame);
    const segmented = !pipe.haveMask || pipe.frameIndex % pipe.stride === 0;
    if (segmented) segment(ctx, prog, pipe, frame);
    pipe.frameIndex++;
    const into = pipe.outTarget;
    if (!pipe.haveMask || !into) {
      frame.close();
      return flushReads(pipe);
    }
    compose(ctx, prog, pipe, into);
    pipe.fence = ctx.fenceSync(ctx.SYNC_GPU_COMMANDS_COMPLETE, 0);
    collectReads(ctx, pipe, false, ready);
    queueRead(ctx, pipe, into, frame.timestamp, ready);
    frame.close();
    adapt(pipe, performance.now() - started, busy, segmented);
    return ready;
  } catch (error) {
    try {
      frame.close();
    } catch {}
    noteError(att, error);
    return ready;
  }
}

function emit(att: Attachment, frames: VideoFrame[]): Promise<void> {
  const run = att.writing.then(async () => {
    for (const frame of frames) {
      const writer = att.writer;
      if (!writer || attachments.get(att.id) !== att) {
        frame.close();
        continue;
      }
      try {
        await writer.write(frame);
        att.outFrames++;
      } catch {
        try {
          frame.close();
        } catch {}
      }
    }
  });
  att.writing = run.catch(() => {});
  return run;
}

function scheduleDrain(att: Attachment) {
  if (att.drainTimer !== null || !att.pipe.pendingReads.length) return;
  att.drainTimer = setTimeout(() => {
    att.drainTimer = null;
    const ctx = gl;
    if (!ctx || attachments.get(att.id) !== att) return;
    const ready: VideoFrame[] = [];
    try {
      collectReads(ctx, att.pipe, false, ready);
    } catch (error) {
      noteError(att, error);
    }
    if (ready.length) void emit(att, ready);
    scheduleDrain(att);
  }, 3);
}

async function pump(att: Attachment, readable: ReadableStream<VideoFrame>, gen: number) {
  const reader = readable.getReader();
  att.reader = reader;
  for (;;) {
    let result: ReadableStreamReadResult<VideoFrame>;
    try {
      result = await reader.read();
    } catch {
      break;
    }
    if (result.done) break;
    const frame = result.value;
    if (attachments.get(att.id) !== att || att.gen !== gen || !att.writer) {
      frame.close();
      break;
    }
    att.inFrames++;
    const rendering = shouldRender();
    if (rendering && !att.rendering) resetAdaptation(att.pipe);
    att.rendering = rendering;
    const outs = rendering ? renderFrame(att, frame) : [...flushReads(att.pipe), frame];
    await emit(att, outs);
    scheduleDrain(att);
  }
  try {
    reader.releaseLock();
  } catch {}
}

function makeAttachment(id: number): Attachment {
  return { id, gen: 0, writer: null, reader: null, clone: null, inFrames: 0, outFrames: 0, errors: [], slowSent: false, failedSent: false, rendering: false, lastIn: 0, lastOut: 0, lowSeconds: 0, writing: Promise.resolve(), drainTimer: null, pipe: newPipe() };
}

function startPump(att: Attachment, readable: ReadableStream<VideoFrame>) {
  att.gen++;
  void pump(att, readable, att.gen);
}

function stopSource(att: Attachment) {
  const reader = att.reader;
  att.reader = null;
  if (reader) void reader.cancel().catch(() => {});
  if (att.clone) {
    att.clone.stop();
    att.clone = null;
  }
}

function resetForSource(att: Attachment) {
  const ctx = gl;
  const pipe = att.pipe;
  for (const r of pipe.pendingReads) {
    if (r.fence && ctx) ctx.deleteSync(r.fence);
    r.fence = null;
  }
  pipe.pendingReads.length = 0;
  pipe.haveMask = false;
  pipe.frameIndex = 0;
  pipe.lastFrameTs = -1;
  pipe.gaps.length = 0;
  att.lowSeconds = 0;
  resetAdaptation(pipe);
}

function detach(att: Attachment) {
  if (attachments.get(att.id) === att) attachments.delete(att.id);
  att.gen++;
  stopSource(att);
  if (att.drainTimer !== null) clearTimeout(att.drainTimer);
  att.drainTimer = null;
  const writer = att.writer;
  att.writer = null;
  if (writer) void writer.close().catch(() => {});
  releasePipe(att.pipe);
}

function adopt(att: Attachment) {
  const prior = attachments.get(att.id);
  if (prior) detach(prior);
  if (!attachments.size) fadeStart = -1e9;
  attachments.set(att.id, att);
}

function probeCanvas(cpu: boolean) {
  const sample = new OffscreenCanvas(MASK_LONG, Math.round((MASK_LONG * 9) / 16));
  const paint = sample.getContext("2d", { alpha: false, willReadFrequently: cpu });
  if (paint) {
    const g = paint.createLinearGradient(0, 0, sample.width, sample.height);
    g.addColorStop(0, "#1e293b");
    g.addColorStop(1, "#cbd5e1");
    paint.fillStyle = g;
    paint.fillRect(0, 0, sample.width, sample.height);
    paint.fillStyle = "#7c5e4a";
    paint.beginPath();
    paint.arc(sample.width / 2, sample.height * 0.42, sample.height * 0.22, 0, Math.PI * 2);
    paint.fill();
    paint.fillRect(sample.width * 0.3, sample.height * 0.62, sample.width * 0.4, sample.height * 0.38);
  }
  return sample;
}

async function readQueries(ctx: WebGL2RenderingContext, queries: WebGLQuery[]): Promise<number[]> {
  const out: number[] = [];
  const deadline = performance.now() + 700;
  while (queries.length && performance.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    while (queries.length && ctx.getQueryParameter(queries[0], ctx.QUERY_RESULT_AVAILABLE)) {
      const query = queries.shift();
      if (!query) break;
      out.push((ctx.getQueryParameter(query, ctx.QUERY_RESULT) as number) / 1e6);
      ctx.deleteQuery(query);
    }
  }
  for (const query of queries) ctx.deleteQuery(query);
  return out;
}

async function probe(seg: ImageSegmenter, gpu: boolean): Promise<number> {
  const ctx = gl;
  const sample = probeCanvas(!gpu);
  const timer = gpu && ctx ? (ctx.getExtension("EXT_disjoint_timer_query_webgl2") as TimerExtension | null) : null;
  const queries: WebGLQuery[] = [];
  const cpuTimes: number[] = [];
  for (let i = 0; i < 5; i++) {
    if (ctx) neutral(ctx);
    lastTs = Math.max(lastTs + 1, Math.round(performance.now()));
    const query = timer && ctx && i > 0 ? ctx.createQuery() : null;
    if (query && ctx && timer) ctx.beginQuery(timer.TIME_ELAPSED_EXT, query);
    const started = performance.now();
    let ok = false;
    seg.segmentForVideo(sample, lastTs, (result: ImageSegmenterResult) => {
      const mask = result.confidenceMasks?.[0];
      if (!mask) return;
      if (gpu) mask.getAsWebGLTexture();
      else mask.getAsFloat32Array();
      ok = true;
    });
    if (query && ctx && timer) {
      ctx.endQuery(timer.TIME_ELAPSED_EXT);
      queries.push(query);
    }
    if (i > 0) cpuTimes.push(performance.now() - started);
    if (!ok) throw new Error("segmenter produced no mask");
  }
  if (ctx) neutral(ctx);
  if (!gpu) return average(cpuTimes);
  if (!ctx || !queries.length) return Number.NaN;
  return average(await readQueries(ctx, queries));
}

async function candidate(fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>, model: string, gpu: boolean): Promise<Candidate | null> {
  const surface = canvas;
  if (gpu && !surface) return null;
  let seg: ImageSegmenter | null = null;
  try {
    seg = await ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: model, delegate: gpu ? "GPU" : "CPU" },
      ...(gpu && surface ? { canvas: surface } : {}),
      runningMode: "VIDEO",
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
    return { seg, ms: await probe(seg, gpu) };
  } catch {
    seg?.close();
    return null;
  }
}

async function pickSegmenter(base: string, model: string): Promise<{ seg: ImageSegmenter; gpu: boolean; spare: ImageSegmenter | null }> {
  const fileset = await FilesetResolver.forVisionTasks(base);
  const gpu = await candidate(fileset, model, true);
  const cpu = await candidate(fileset, model, false);
  if (gpu && cpu) return gpu.ms > GPU_SEGMENT_OK_MS && cpu.ms < gpu.ms ? { seg: cpu.seg, gpu: false, spare: gpu.seg } : { seg: gpu.seg, gpu: true, spare: cpu.seg };
  if (gpu) return { seg: gpu.seg, gpu: true, spare: null };
  if (cpu) return { seg: cpu.seg, gpu: false, spare: null };
  throw new Error("segmenter unavailable");
}

function resetBalance() {
  strainRun = 0;
  strainSeen.length = 0;
  judged = [];
  swapAt = 0;
}

function swapSegmenters() {
  const next = spare;
  if (!next || !segmenter) return;
  spare = segmenter;
  segmenter = next;
  segGpu = !segGpu;
  for (const att of attachments.values()) resetAdaptation(att.pipe);
}

function balance() {
  let strain = 0;
  let active = false;
  for (const att of attachments.values()) {
    if (!att.rendering) continue;
    active = true;
    strain = Math.max(strain, att.pipe.stride);
  }
  if (!spare || !active) {
    strainRun = 0;
    strainSeen.length = 0;
    return;
  }
  const now = performance.now();
  if (swapAt) {
    if (now - swapAt < SWAP_SETTLE_MS) return;
    judged.push(strain);
    if (now - swapAt < SWAP_JUDGE_MS) return;
    const after = average(judged);
    judged = [];
    swapAt = 0;
    if (after > swapBefore - 0.5) swapSegmenters();
    swapHold = now + SWAP_HOLD_MS;
    return;
  }
  strainSeen.push(strain);
  if (strainSeen.length > SWAP_STRAIN_SECONDS) strainSeen.shift();
  strainRun = strain >= MAX_STRIDE ? strainRun + 1 : 0;
  if (strainRun < SWAP_STRAIN_SECONDS || now < swapHold) return;
  swapBefore = average(strainSeen);
  strainRun = 0;
  strainSeen.length = 0;
  judged = [];
  swapAt = now;
  swapSegmenters();
}

async function loadSegmenter(model: "landscape" | "square") {
  setupGl();
  const a = assets;
  if (!a) throw new Error("engine assets missing");
  const paths = model === "landscape" ? a.landscape : a.square;
  const bases = a.fallbackBase && a.fallbackBase !== a.base ? [a.base, a.fallbackBase] : [a.base];
  let failure: unknown = null;
  for (let i = 0; i < bases.length; i++) {
    try {
      const made = await pickSegmenter(bases[i], paths[Math.min(i, paths.length - 1)]);
      const old = segmenter;
      const oldSpare = spare;
      segmenter = made.seg;
      segGpu = made.gpu;
      spare = made.spare;
      segModel = model;
      resetBalance();
      for (const att of attachments.values()) att.pipe.haveMask = false;
      old?.close();
      oldSpare?.close();
      return;
    } catch (error) {
      failure = error;
    }
  }
  throw failure instanceof Error ? failure : new Error("segmenter unavailable");
}

async function ensureSegmenter(model: "landscape" | "square") {
  wantModel = model;
  while (segLoading) await segLoading.catch(() => {});
  if (segmenter && segModel === wantModel) return;
  const loading = loadSegmenter(wantModel);
  segLoading = loading;
  try {
    await loading;
  } finally {
    if (segLoading === loading) segLoading = null;
  }
}

async function loadImage(ctx: WebGL2RenderingContext, src: string, key: string): Promise<ImageEntry> {
  const hit = images.get(key);
  if (hit) {
    images.delete(key);
    images.set(key, hit);
    return hit;
  }
  const response = await fetch(src);
  if (!response.ok) throw new Error(`background ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  const tex = ctx.createTexture();
  if (!tex) {
    bitmap.close();
    throw new Error("texture allocation failed");
  }
  neutral(ctx);
  ctx.bindTexture(ctx.TEXTURE_2D, tex);
  ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR_MIPMAP_LINEAR);
  ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.LINEAR);
  ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
  ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);
  ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, ctx.RGBA, ctx.UNSIGNED_BYTE, bitmap);
  ctx.generateMipmap(ctx.TEXTURE_2D);
  const entry: ImageEntry = { key, tex, w: bitmap.width, h: bitmap.height };
  bitmap.close();
  images.set(key, entry);
  for (const [k, v] of images) {
    if (images.size <= IMAGE_CACHE) break;
    if (v === entry || v === look.image || v === prevLook.image) continue;
    ctx.deleteTexture(v.tex);
    images.delete(k);
  }
  return entry;
}

async function applyEffect(seq: number, effect: EngineEffect) {
  effectSeq = seq;
  try {
    const ctx = setupGl();
    let next: Look;
    if (effect.kind === "none") next = NONE;
    else if (effect.kind === "blur") next = { kind: 1, depth: DEPTH[effect.level], image: null };
    else next = { kind: 2, depth: 0, image: await loadImage(ctx, effect.src, effect.key) };
    if (seq === effectSeq) {
      const live = [...attachments.values()].some((att) => att.pipe.haveMask);
      prevLook = look;
      look = next;
      fadeStart = live && segmenter ? performance.now() : -1e9;
      if (next.kind !== 0) {
        for (const att of attachments.values()) {
          resetAdaptation(att.pipe);
          att.slowSent = false;
          att.lowSeconds = 0;
        }
      }
    }
    post({ type: "effect-done", seq, ok: true });
  } catch (error) {
    post({ type: "effect-done", seq, ok: false, error: errorText(error) });
  }
}

async function handle(message: ToWorker) {
  switch (message.type) {
    case "warm": {
      assets = message.assets;
      try {
        setupGl();
        await ensureSegmenter(message.portrait ? "square" : "landscape");
        post({ type: "ready", ok: true });
      } catch (error) {
        post({ type: "ready", ok: false, error: errorText(error) });
      }
      return;
    }
    case "attach": {
      const att = makeAttachment(message.id);
      att.writer = message.writable.getWriter();
      adopt(att);
      void ensureSegmenter(message.portrait ? "square" : "landscape").catch((error) => trouble(att, "failed", errorText(error)));
      if (message.readable) startPump(att, message.readable);
      return;
    }
    case "attach-track": {
      const Processor = apis.MediaStreamTrackProcessor;
      const Generator = apis.VideoTrackGenerator;
      if (!Processor || !Generator) {
        message.track?.stop();
        post({ type: "output", id: message.id, track: null, error: "insertable streams unavailable" });
        return;
      }
      const generator = new Generator();
      const att = makeAttachment(message.id);
      att.writer = generator.writable.getWriter();
      att.clone = message.track;
      adopt(att);
      post({ type: "output", id: message.id, track: generator.track }, [generator.track as unknown as Transferable]);
      void ensureSegmenter(message.portrait ? "square" : "landscape").catch((error) => trouble(att, "failed", errorText(error)));
      if (message.track) startPump(att, new Processor({ track: message.track }).readable);
      return;
    }
    case "source": {
      const att = attachments.get(message.id);
      if (!att) {
        message.track?.stop();
        void message.readable?.cancel().catch(() => {});
        return;
      }
      stopSource(att);
      resetForSource(att);
      const model = message.portrait ? "square" : "landscape";
      if (model !== segModel) void ensureSegmenter(model).catch(() => {});
      if (message.readable) {
        startPump(att, message.readable);
      } else if (message.track) {
        const Processor = apis.MediaStreamTrackProcessor;
        if (!Processor) {
          message.track.stop();
          return;
        }
        att.clone = message.track;
        startPump(att, new Processor({ track: message.track }).readable);
      }
      return;
    }
    case "pause-source": {
      const att = attachments.get(message.id);
      if (att?.clone) {
        att.clone.stop();
        att.clone = null;
      }
      return;
    }
    case "detach": {
      const att = attachments.get(message.id);
      if (att) detach(att);
      return;
    }
    case "effect": {
      await applyEffect(message.seq, message.effect);
      return;
    }
  }
}

setInterval(() => {
  balance();
  for (const att of attachments.values()) {
    const pipe = att.pipe;
    const inRate = att.inFrames - att.lastIn;
    const outRate = att.outFrames - att.lastOut;
    att.lastIn = att.inFrames;
    att.lastOut = att.outFrames;
    if (att.rendering && inRate > 0 && outRate < SLOW_FPS && pipe.stride >= MAX_STRIDE) att.lowSeconds++;
    else att.lowSeconds = 0;
    if (att.lowSeconds >= SLOW_SECONDS) trouble(att, "slow");
    post({
      type: "health",
      id: att.id,
      health: { inFrames: att.inFrames, outFrames: att.outFrames, stride: pipe.stride, costMs: Math.round(pipe.costEma * 10) / 10, gpuBusy: pipe.busyCount / BUSY_WINDOW, delegate: segmenter ? (segGpu ? "gpu" : "cpu") : "none" },
    });
  }
}, 1000);

scope.addEventListener("message", (event) => {
  void handle(event.data).catch((error) => post({ type: "fatal", error: errorText(error) }));
});
