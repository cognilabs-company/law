import { FilesetResolver, ImageSegmenter, type ImageSegmenterResult } from "@mediapipe/tasks-vision";
import { COMPOSITE, COPY_MASK, DOWN, GUIDE, SMOOTH, UP, VERTEX } from "./shaders";
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
type Target = { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number };
type ImageEntry = { key: string; tex: WebGLTexture; w: number; h: number };
type Look = { kind: 0 | 1 | 2; depth: number; image: ImageEntry | null };
type Readback = { buf: WebGLBuffer; data: Uint8Array; fence: WebGLSync | null; ts: number };
type Programs = { copy: Program; guide: Program; smooth: Program; down: Program; up: Program; comp: Program };
type Candidate = { seg: ImageSegmenter; ms: number };
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
  rawSince: number;
  rendering: boolean;
};

const scope = self as unknown as Scope;
const apis = self as unknown as WorkerApis;

const FADE_MS = 260;
const DEPTH = { light: 3, strong: 5 } as const;
const MASK_LONG = 256;
const SMOOTH_RATIO = 0.7;
const EDGE_LOW = 0.32;
const EDGE_HIGH = 0.72;
const WRAP = 0.28;
const IMAGE_CACHE = 4;
const BUSY_WINDOW = 60;
const READBACK_SLOTS = 3;
const RAW_LIMIT_MS = 3000;
const GPU_SEGMENT_BUDGET_MS = 3;
const CPU_SEGMENT_BUDGET_MS = 14;
const NONE: Look = { kind: 0, depth: 0, image: null };

let canvas: OffscreenCanvas | null = null;
let gl: WebGL2RenderingContext | null = null;
let programs: Programs | null = null;
let vao: WebGLVertexArrayObject | null = null;
let camTex: WebGLTexture | null = null;
let blank: WebGLTexture | null = null;
let floatTargets = false;
let lost = false;

let frameW = 0;
let frameH = 0;
let maskW = 0;
let maskH = 0;
let maskRaw: Target | null = null;
let maskPing: Target[] = [];
let guide: Target | null = null;
let levels: Target[] = [];
let blurOut: Target[] = [];
let outTarget: Target | null = null;
let maskIndex = 0;
let haveMask = false;
let segInput: OffscreenCanvas | null = null;
let segInputCtx: OffscreenCanvasRenderingContext2D | null = null;
let segInputCpu = false;
let cpuBytes = new Uint8Array(0);

let readbacks: Readback[] = [];
let readbackAt = 0;
const pendingReads: Readback[] = [];
let writing: Promise<void> = Promise.resolve();
let drainTimer: ReturnType<typeof setTimeout> | null = null;

let assets: EngineAssets | null = null;
let segmenter: ImageSegmenter | null = null;
let segModel: "landscape" | "square" | null = null;
let segGpu = true;
let segLoading: Promise<void> | null = null;
let wantModel: "landscape" | "square" = "landscape";
let lastTs = 0;

let look: Look = NONE;
let prevLook: Look = NONE;
let fadeStart = -1e9;
let effectSeq = 0;
const images = new Map<string, ImageEntry>();

let attachment: Attachment | null = null;
let baseStride = 1;
let stride = 1;
let frameIndex = 0;
let costEma = 0;
const busyRing = new Uint8Array(BUSY_WINDOW);
let busyAt = 0;
let busyCount = 0;
let fence: WebGLSync | null = null;
let overloadSince = 0;

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : Number.NaN);

function post(message: FromWorker, transfer: Transferable[] = []) {
  scope.postMessage(message, transfer);
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

function drop(ctx: WebGL2RenderingContext, t: Target | null) {
  if (!t) return;
  ctx.deleteTexture(t.tex);
  ctx.deleteFramebuffer(t.fb);
}

function setupGl(): WebGL2RenderingContext {
  if (gl) return gl;
  const surface = new OffscreenCanvas(16, 16);
  const onLost = (event: Event) => {
    event.preventDefault();
    if (lost) return;
    lost = true;
    post({ type: "fatal", error: "graphics context lost" });
  };
  surface.addEventListener("webglcontextlost", onLost);
  surface.addEventListener("contextlost", onLost);
  const ctx = surface.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "default" });
  if (!ctx) throw new Error("webgl2 unavailable");
  floatTargets = !!ctx.getExtension("EXT_color_buffer_float");
  const nextPrograms: Programs = { copy: compile(ctx, COPY_MASK), guide: compile(ctx, GUIDE), smooth: compile(ctx, SMOOTH), down: compile(ctx, DOWN), up: compile(ctx, UP), comp: compile(ctx, COMPOSITE) };
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

function pass(ctx: WebGL2RenderingContext, prog: Program, out: Target, textures: Array<[string, WebGLTexture]>, set?: (u: Map<string, WebGLUniformLocation>) => void) {
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

function dropReadbacks(ctx: WebGL2RenderingContext) {
  for (const r of readbacks) {
    if (r.fence) ctx.deleteSync(r.fence);
    ctx.deleteBuffer(r.buf);
  }
  readbacks = [];
  readbackAt = 0;
  pendingReads.length = 0;
}

function ensureSize(ctx: WebGL2RenderingContext, w: number, h: number) {
  if (w === frameW && h === frameH) return;
  frameW = w;
  frameH = h;
  const format = floatTargets ? ctx.RGBA16F : ctx.RGBA8;
  for (const t of levels) drop(ctx, t);
  for (const t of blurOut) drop(ctx, t);
  drop(ctx, outTarget);
  dropReadbacks(ctx);
  levels = [];
  let lw = w / 2;
  let lh = h / 2;
  for (let i = 0; i < DEPTH.strong; i++) {
    levels.push(target(ctx, Math.max(1, Math.round(lw)), Math.max(1, Math.round(lh)), format));
    lw /= 2;
    lh /= 2;
  }
  blurOut = [0, 1].map(() => target(ctx, Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)), format));
  outTarget = target(ctx, w, h, ctx.RGBA8);
  for (let i = 0; i < READBACK_SLOTS; i++) {
    const buf = ctx.createBuffer();
    if (!buf) throw new Error("buffer allocation failed");
    ctx.bindBuffer(ctx.PIXEL_PACK_BUFFER, buf);
    ctx.bufferData(ctx.PIXEL_PACK_BUFFER, w * h * 4, ctx.STREAM_READ);
    readbacks.push({ buf, data: new Uint8Array(w * h * 4), fence: null, ts: 0 });
  }
  ctx.bindBuffer(ctx.PIXEL_PACK_BUFFER, null);
  const mw = w >= h ? MASK_LONG : Math.max(16, Math.round((MASK_LONG * w) / h));
  const mh = w >= h ? Math.max(16, Math.round((MASK_LONG * h) / w)) : MASK_LONG;
  if (mw === maskW && mh === maskH) return;
  maskW = mw;
  maskH = mh;
  drop(ctx, maskRaw);
  for (const t of maskPing) drop(ctx, t);
  drop(ctx, guide);
  maskRaw = target(ctx, mw, mh, ctx.R8);
  maskPing = [target(ctx, mw, mh, ctx.R8), target(ctx, mw, mh, ctx.R8)];
  guide = target(ctx, mw, mh, ctx.RGBA8);
  cpuBytes = new Uint8Array(mw * mh);
  haveMask = false;
}

function inputCanvas(w: number, h: number, cpu: boolean) {
  if (!segInput || !segInputCtx || segInput.width !== w || segInput.height !== h || segInputCpu !== cpu) {
    segInput = new OffscreenCanvas(w, h);
    segInputCtx = segInput.getContext("2d", { alpha: false, willReadFrequently: cpu });
    segInputCpu = cpu;
  }
  return segInputCtx ? segInput : null;
}

function segment(ctx: WebGL2RenderingContext, frame: VideoFrame): boolean {
  const seg = segmenter;
  const prog = programs;
  const raw = maskRaw;
  if (!seg || !prog || !raw || maskPing.length < 2) return false;
  const input = inputCanvas(maskW, maskH, !segGpu);
  const paint = segInputCtx;
  if (!input || !paint) return false;
  paint.drawImage(frame, 0, 0, maskW, maskH);
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
      const n = Math.min(cpuBytes.length, data.length);
      for (let i = 0; i < n; i++) cpuBytes[i] = data[i] * 255;
      ctx.bindTexture(ctx.TEXTURE_2D, raw.tex);
      ctx.pixelStorei(ctx.UNPACK_ALIGNMENT, 1);
      ctx.texSubImage2D(ctx.TEXTURE_2D, 0, 0, 0, maskW, maskH, ctx.RED, ctx.UNSIGNED_BYTE, cpuBytes);
      ctx.pixelStorei(ctx.UNPACK_ALIGNMENT, 4);
    }
    copied = true;
  });
  neutral(ctx);
  if (!copied) return false;
  const prev = maskPing[maskIndex];
  const next = maskPing[1 - maskIndex];
  pass(ctx, prog.smooth, next, [["cur", raw.tex], ["prev", prev.tex]], (u) => ctx.uniform1f(u.get("ratio") ?? null, haveMask ? SMOOTH_RATIO : 0));
  maskIndex = 1 - maskIndex;
  haveMask = true;
  return true;
}

function blurInto(ctx: WebGL2RenderingContext, prog: Programs, slot: number, mask: WebGLTexture, depth: number): WebGLTexture {
  let src = camTex as WebGLTexture;
  let sw = frameW;
  let sh = frameH;
  for (let i = 0; i < depth; i++) {
    const level = levels[i];
    pass(ctx, prog.down, level, [["src", src], ["mask", mask]], (u) => {
      ctx.uniform2f(u.get("h") ?? null, 0.5 / sw, 0.5 / sh);
      ctx.uniform1i(u.get("first") ?? null, i === 0 ? 1 : 0);
    });
    src = level.tex;
    sw = level.w;
    sh = level.h;
  }
  for (let i = depth - 2; i >= 0; i--) {
    const level = levels[i];
    pass(ctx, prog.up, level, [["src", src]], (u) => ctx.uniform2f(u.get("h") ?? null, 0.5 / sw, 0.5 / sh));
    src = level.tex;
    sw = level.w;
    sh = level.h;
  }
  const out = blurOut[slot];
  pass(ctx, prog.up, out, [["src", src]], (u) => ctx.uniform2f(u.get("h") ?? null, 0.5 / sw, 0.5 / sh));
  return out.tex;
}

function coverOf(image: ImageEntry | null): [number, number, number, number] {
  if (!image || !frameW || !frameH) return [0, 0, 1, 1];
  const ia = image.w / image.h;
  const fa = frameW / frameH;
  if (ia > fa) {
    const s = fa / ia;
    return [(1 - s) / 2, 0, s, 1];
  }
  const s = ia / fa;
  return [0, (1 - s) / 2, 1, s];
}

function compose(ctx: WebGL2RenderingContext, prog: Programs, frame: VideoFrame, into: Target) {
  const cam = camTex as WebGLTexture;
  const empty = blank as WebGLTexture;
  const maskTex = maskPing[maskIndex].tex;
  const guideTarget = guide as Target;
  neutral(ctx);
  ctx.bindTexture(ctx.TEXTURE_2D, cam);
  ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, ctx.RGBA, ctx.UNSIGNED_BYTE, frame);
  pass(ctx, prog.guide, guideTarget, [["src", cam]], (u) => ctx.uniform2f(u.get("h") ?? null, 0.25 / maskW, 0.25 / maskH));
  const progress = Math.min(1, (performance.now() - fadeStart) / FADE_MS);
  const fading = progress < 1;
  const a = fading ? prevLook : NONE;
  const t = fading ? progress * progress * (3 - 2 * progress) : 1;
  const blurA = fading && a.kind === 1 ? blurInto(ctx, prog, 0, maskTex, a.depth) : empty;
  const blurB = look.kind === 1 ? blurInto(ctx, prog, 1, maskTex, look.depth) : empty;
  const coverA = coverOf(a.image);
  const coverB = coverOf(look.image);
  pass(
    ctx,
    prog.comp,
    into,
    [["cam", cam], ["guide", guideTarget.tex], ["mask", maskTex], ["blurA", blurA], ["blurB", blurB], ["imgA", a.image ? a.image.tex : empty], ["imgB", look.image ? look.image.tex : empty]],
    (u) => {
      ctx.uniform1i(u.get("kindA") ?? null, a.kind);
      ctx.uniform1i(u.get("kindB") ?? null, look.kind);
      ctx.uniform1f(u.get("t") ?? null, t);
      ctx.uniform2f(u.get("texel") ?? null, 1 / maskW, 1 / maskH);
      ctx.uniform4f(u.get("coverA") ?? null, coverA[0], coverA[1], coverA[2], coverA[3]);
      ctx.uniform4f(u.get("coverB") ?? null, coverB[0], coverB[1], coverB[2], coverB[3]);
      ctx.uniform2f(u.get("edge") ?? null, EDGE_LOW, EDGE_HIGH);
      ctx.uniform1f(u.get("wrap") ?? null, WRAP);
    },
  );
  neutral(ctx);
}

function collectReads(ctx: WebGL2RenderingContext, force: boolean): VideoFrame[] {
  const out: VideoFrame[] = [];
  let forced = force;
  while (pendingReads.length) {
    const slot = pendingReads[0];
    const sync = slot.fence;
    if (!sync) {
      pendingReads.shift();
      continue;
    }
    if (!forced && ctx.getSyncParameter(sync, ctx.SYNC_STATUS) !== ctx.SIGNALED) break;
    forced = false;
    pendingReads.shift();
    ctx.deleteSync(sync);
    slot.fence = null;
    ctx.bindBuffer(ctx.PIXEL_PACK_BUFFER, slot.buf);
    ctx.getBufferSubData(ctx.PIXEL_PACK_BUFFER, 0, slot.data);
    ctx.bindBuffer(ctx.PIXEL_PACK_BUFFER, null);
    out.push(new VideoFrame(slot.data, { format: "RGBX", codedWidth: frameW, codedHeight: frameH, timestamp: slot.ts }));
  }
  return out;
}

function queueRead(ctx: WebGL2RenderingContext, from: Target, ts: number): VideoFrame[] {
  const slot = readbacks[readbackAt];
  readbackAt = (readbackAt + 1) % readbacks.length;
  const early = slot.fence ? collectReads(ctx, true) : [];
  ctx.bindFramebuffer(ctx.READ_FRAMEBUFFER, from.fb);
  ctx.bindBuffer(ctx.PIXEL_PACK_BUFFER, slot.buf);
  ctx.readPixels(0, 0, frameW, frameH, ctx.RGBA, ctx.UNSIGNED_BYTE, 0);
  ctx.bindBuffer(ctx.PIXEL_PACK_BUFFER, null);
  ctx.bindFramebuffer(ctx.READ_FRAMEBUFFER, null);
  slot.fence = ctx.fenceSync(ctx.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!slot.fence && !lost) {
    lost = true;
    post({ type: "fatal", error: "graphics context lost" });
  }
  slot.ts = ts;
  pendingReads.push(slot);
  ctx.flush();
  return early;
}

function flushReads(): VideoFrame[] {
  const ctx = gl;
  if (!ctx || !pendingReads.length) return [];
  const out: VideoFrame[] = [];
  while (pendingReads.length) out.push(...collectReads(ctx, true));
  return out;
}

function gpuWasBusy(ctx: WebGL2RenderingContext): boolean {
  const sync = fence;
  if (!sync) return false;
  fence = null;
  const busy = ctx.getSyncParameter(sync, ctx.SYNC_STATUS) !== ctx.SIGNALED;
  ctx.deleteSync(sync);
  return busy;
}

function adapt(att: Attachment, cost: number, busy: boolean) {
  costEma = costEma ? costEma * 0.9 + cost * 0.1 : cost;
  busyCount += (busy ? 1 : 0) - busyRing[busyAt];
  busyRing[busyAt] = busy ? 1 : 0;
  busyAt = (busyAt + 1) % BUSY_WINDOW;
  const busyRatio = busyCount / BUSY_WINDOW;
  const overloaded = costEma > 26 || busyRatio > 0.35;
  if ((frameIndex & 31) === 0) {
    if (overloaded && stride < 3) stride++;
    else if (!overloaded && costEma < 10 && busyRatio < 0.1 && stride > baseStride) stride--;
  }
  const now = performance.now();
  if (overloaded && stride >= 3) {
    if (!overloadSince) overloadSince = now;
    else if (now - overloadSince > 4000) trouble(att, "slow");
  } else {
    overloadSince = 0;
  }
}

function noteError(att: Attachment, error: unknown) {
  const now = performance.now();
  att.errors = att.errors.filter((at) => now - at < 2000);
  att.errors.push(now);
  if (att.errors.length >= 5) trouble(att, "failed", errorText(error));
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

function resetAdaptation() {
  const ctx = gl;
  if (fence && ctx) ctx.deleteSync(fence);
  fence = null;
  costEma = 0;
  busyRing.fill(0);
  busyCount = 0;
  busyAt = 0;
  overloadSince = 0;
  stride = baseStride;
}

function shouldRender() {
  return !lost && !!segmenter && !!programs && (look.kind !== 0 || performance.now() - fadeStart < FADE_MS);
}

function renderFrame(att: Attachment, frame: VideoFrame): VideoFrame[] {
  const ctx = gl;
  const prog = programs;
  if (!ctx || !prog) return [...flushReads(), frame];
  const started = performance.now();
  let closed = false;
  try {
    if (ctx.isContextLost()) {
      if (!lost) {
        lost = true;
        post({ type: "fatal", error: "graphics context lost" });
      }
      return [frame];
    }
    const busy = gpuWasBusy(ctx);
    const w = frame.displayWidth;
    const h = frame.displayHeight;
    if (!w || !h) return [...flushReads(), frame];
    ensureSize(ctx, w, h);
    if (!haveMask || frameIndex % stride === 0) segment(ctx, frame);
    frameIndex++;
    const into = outTarget;
    if (!haveMask || !into) return [...flushReads(), frame];
    compose(ctx, prog, frame, into);
    fence = ctx.fenceSync(ctx.SYNC_GPU_COMMANDS_COMPLETE, 0);
    const ready = collectReads(ctx, false);
    ready.push(...queueRead(ctx, into, frame.timestamp));
    frame.close();
    closed = true;
    adapt(att, performance.now() - started, busy);
    return ready;
  } catch (error) {
    noteError(att, error);
    return closed ? [] : [...flushReads(), frame];
  }
}

function emit(att: Attachment, frames: VideoFrame[]): Promise<void> {
  const run = writing.then(async () => {
    for (const frame of frames) {
      const writer = att.writer;
      if (!writer || attachment !== att) {
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
  writing = run.catch(() => {});
  return run;
}

function scheduleDrain(att: Attachment) {
  if (drainTimer !== null || !pendingReads.length) return;
  drainTimer = setTimeout(() => {
    drainTimer = null;
    const ctx = gl;
    if (!ctx || attachment !== att) return;
    const ready = collectReads(ctx, false);
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
    const writer = att.writer;
    if (attachment !== att || att.gen !== gen || !writer) {
      frame.close();
      break;
    }
    att.inFrames++;
    const rendering = shouldRender();
    if (rendering && !att.rendering) {
      resetAdaptation();
      att.rawSince = 0;
    }
    att.rendering = rendering;
    const outs = rendering ? renderFrame(att, frame) : [...flushReads(), frame];
    if (rendering && outs.length && outs[outs.length - 1] === frame) {
      const now = performance.now();
      if (!att.rawSince) att.rawSince = now;
      else if (now - att.rawSince > RAW_LIMIT_MS) trouble(att, "failed", "background effect is not being applied");
    } else {
      att.rawSince = 0;
    }
    await emit(att, outs);
    scheduleDrain(att);
  }
  try {
    reader.releaseLock();
  } catch {}
}

function makeAttachment(id: number): Attachment {
  return { id, gen: 0, writer: null, reader: null, clone: null, inFrames: 0, outFrames: 0, errors: [], slowSent: false, failedSent: false, rawSince: 0, rendering: false };
}

function resetForSource() {
  const ctx = gl;
  for (const r of pendingReads) {
    if (r.fence && ctx) ctx.deleteSync(r.fence);
    r.fence = null;
  }
  pendingReads.length = 0;
  haveMask = false;
  frameIndex = 0;
  resetAdaptation();
}

function detachCurrent() {
  const att = attachment;
  if (!att) return;
  attachment = null;
  att.gen++;
  const reader = att.reader;
  att.reader = null;
  if (reader) void reader.cancel().catch(() => {});
  if (att.clone) {
    att.clone.stop();
    att.clone = null;
  }
  const writer = att.writer;
  att.writer = null;
  if (writer) void writer.close().catch(() => {});
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

async function pickSegmenter(base: string, model: string): Promise<{ seg: ImageSegmenter; gpu: boolean }> {
  const fileset = await FilesetResolver.forVisionTasks(base);
  const gpu = await candidate(fileset, model, true);
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 0 : 0;
  if (gpu && !(gpu.ms > GPU_SEGMENT_BUDGET_MS && cores >= 6)) return { seg: gpu.seg, gpu: true };
  const cpu = await candidate(fileset, model, false);
  if (gpu && cpu) {
    if (cpu.ms < CPU_SEGMENT_BUDGET_MS) {
      gpu.seg.close();
      return { seg: cpu.seg, gpu: false };
    }
    cpu.seg.close();
    return { seg: gpu.seg, gpu: true };
  }
  if (gpu) return { seg: gpu.seg, gpu: true };
  if (cpu) return { seg: cpu.seg, gpu: false };
  throw new Error("segmenter unavailable");
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
      segmenter = made.seg;
      segGpu = made.gpu;
      segModel = model;
      haveMask = false;
      old?.close();
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
      prevLook = look;
      look = next;
      fadeStart = attachment && segmenter && haveMask ? performance.now() : -1e9;
      if (next.kind !== 0) {
        resetAdaptation();
        if (attachment) attachment.slowSent = false;
      }
    }
    post({ type: "effect-done", seq, ok: true });
  } catch (error) {
    post({ type: "effect-done", seq, ok: false, error: errorText(error) });
  }
}

function startPump(att: Attachment, readable: ReadableStream<VideoFrame>) {
  att.gen++;
  void pump(att, readable, att.gen);
}

async function handle(message: ToWorker) {
  switch (message.type) {
    case "warm": {
      assets = message.assets;
      baseStride = message.phone ? 2 : 1;
      stride = baseStride;
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
      detachCurrent();
      const att = makeAttachment(message.id);
      att.writer = message.writable.getWriter();
      attachment = att;
      fadeStart = -1e9;
      resetForSource();
      void ensureSegmenter(message.portrait ? "square" : "landscape").catch((error) => trouble(att, "failed", errorText(error)));
      startPump(att, message.readable);
      return;
    }
    case "attach-track": {
      detachCurrent();
      const Processor = apis.MediaStreamTrackProcessor;
      const Generator = apis.VideoTrackGenerator;
      if (!Processor || !Generator) {
        message.track.stop();
        post({ type: "output", id: message.id, track: null, error: "insertable streams unavailable" });
        return;
      }
      const generator = new Generator();
      const att = makeAttachment(message.id);
      att.writer = generator.writable.getWriter();
      att.clone = message.track;
      attachment = att;
      fadeStart = -1e9;
      resetForSource();
      post({ type: "output", id: message.id, track: generator.track }, [generator.track as unknown as Transferable]);
      void ensureSegmenter(message.portrait ? "square" : "landscape").catch((error) => trouble(att, "failed", errorText(error)));
      startPump(att, new Processor({ track: message.track }).readable);
      return;
    }
    case "source": {
      const att = attachment;
      if (!att || att.id !== message.id) {
        message.track?.stop();
        return;
      }
      const reader = att.reader;
      att.reader = null;
      if (reader) void reader.cancel().catch(() => {});
      if (att.clone) {
        att.clone.stop();
        att.clone = null;
      }
      resetForSource();
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
      const att = attachment;
      if (att && att.id === message.id && att.clone) {
        att.clone.stop();
        att.clone = null;
      }
      return;
    }
    case "detach": {
      if (attachment && attachment.id === message.id) detachCurrent();
      return;
    }
    case "effect": {
      await applyEffect(message.seq, message.effect);
      return;
    }
  }
}

setInterval(() => {
  const att = attachment;
  if (!att) return;
  post({
    type: "health",
    id: att.id,
    health: { inFrames: att.inFrames, outFrames: att.outFrames, stride, costMs: Math.round(costEma * 10) / 10, gpuBusy: busyCount / BUSY_WINDOW, delegate: segmenter ? (segGpu ? "gpu" : "cpu") : "none" },
  });
}, 1000);

scope.addEventListener("message", (event) => {
  void handle(event.data).catch((error) => post({ type: "fatal", error: errorText(error) }));
});
