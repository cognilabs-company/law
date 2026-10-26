// Drawn marks for remote assistance v2: the operator points or draws on the
// client's shared tab and the client sees the same mark on their own page.
// Marks travel only over the call's LiveKit data channel (topic RA_MARK_TOPIC),
// never to the remote-assistance API, and are never stored. Coordinates are
// normalized to 0..1 of the shared picture.

export const RA_MARK_TOPIC = "ra-mark";
export const RA_MARK_TTL_MS = 3000;
export const RA_MARK_FADE_MS = 400;
export const RA_MARK_MAX_POINTS = 200;
export const RA_MARK_MAX_BYTES = 8000;

export const RA_MARK_TOOLS = ["pointer", "arrow", "circle", "rect", "pen"] as const;
export type RaMarkTool = (typeof RA_MARK_TOOLS)[number];
// Three brand-safe colours, by name: each side paints its own token.
export const RA_MARK_COLORS = ["blue", "cyan", "warm"] as const;
export type RaMarkColor = (typeof RA_MARK_COLORS)[number];

export type RaPoint = [number, number];
export type RaMark = {
  v: 1;
  id: string;
  tool: RaMarkTool;
  color: RaMarkColor;
  points: RaPoint[];
  // The sender's picture size, so the stroke can keep its proportions.
  w: number;
  h: number;
};

// Every control message on the topic: a mark, "clear", the client's share
// state, and the operator asking the client to share again.
// `tab`: the captured tab's capture handle, so the operator can refuse to
// render a capture of their own tab.
export type RaShareState = { surface: string; hidden: boolean; on: boolean; tab?: string };
export type RaWire =
  | { t: "mark"; mark: RaMark }
  | { t: "clear" }
  | { t: "share"; state: RaShareState }
  | { t: "ask-share" };

const POINTS_FOR: Record<RaMarkTool, [number, number]> = { pointer: [1, 1], arrow: [2, 2], circle: [2, 2], rect: [2, 2], pen: [2, RA_MARK_MAX_POINTS] };

const isUnit = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
const round = (n: number) => Math.round(n * 10000) / 10000;

export function isRaMark(v: unknown): v is RaMark {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  if (m.v !== 1 || typeof m.id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(m.id)) return false;
  if (!(RA_MARK_TOOLS as readonly string[]).includes(m.tool as string)) return false;
  if (!(RA_MARK_COLORS as readonly string[]).includes(m.color as string)) return false;
  if (typeof m.w !== "number" || typeof m.h !== "number" || !(m.w > 0 && m.w <= 10000 && m.h > 0 && m.h <= 10000)) return false;
  if (!Array.isArray(m.points)) return false;
  const [min, max] = POINTS_FOR[m.tool as RaMarkTool];
  if (m.points.length < min || m.points.length > max) return false;
  return m.points.every((p) => Array.isArray(p) && p.length === 2 && isUnit(p[0]) && isUnit(p[1]));
}

// One received data-channel payload → a validated message, or null for
// anything malformed, oversized or not ours.
export function parseRaWire(payload: Uint8Array | string): RaWire | null {
  const size = typeof payload === "string" ? payload.length : payload.byteLength;
  if (size > RA_MARK_MAX_BYTES) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(typeof payload === "string" ? payload : new TextDecoder().decode(payload));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (d.t === "mark") return isRaMark(d.mark) ? { t: "mark", mark: d.mark } : null;
  if (d.t === "clear") return { t: "clear" };
  if (d.t === "ask-share") return { t: "ask-share" };
  if (d.t === "share" && d.state && typeof d.state === "object") {
    const s = d.state as Record<string, unknown>;
    const tab = typeof s.tab === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(s.tab) ? s.tab : "";
    return { t: "share", state: { surface: typeof s.surface === "string" ? s.surface.slice(0, 20) : "", hidden: s.hidden === true, on: s.on === true, ...(tab ? { tab } : {}) } };
  }
  return null;
}

export function encodeRaWire(msg: RaWire): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify(msg));
}

// Who may send what: marks, clear and ask-share only from the session's
// operator; share state only from its client.
export function raWireAllowed(msg: RaWire, from: string, ids: { operator: string; client: string }): boolean {
  if (!from) return false;
  return msg.t === "share" ? from === ids.client : from === ids.operator;
}

// A free pen line simplified (Ramer–Douglas–Peucker) and capped, in 0..1
// coordinates rounded to 4 places.
export function simplifyPath(points: RaPoint[], tolerance = 0.002, cap = RA_MARK_MAX_POINTS): RaPoint[] {
  const pts = points.filter((p) => isUnit(p[0]) && isUnit(p[1]));
  if (pts.length <= 2) return pts.map(([x, y]) => [round(x), round(y)]);
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let far = -1;
    let dist = tolerance;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > dist) {
        dist = d;
        far = i;
      }
    }
    if (far > 0) {
      keep[far] = true;
      stack.push([a, far], [far, b]);
    }
  }
  let out = pts.filter((_, i) => keep[i]);
  if (out.length > cap) {
    const step = (out.length - 1) / (cap - 1);
    out = Array.from({ length: cap }, (_, i) => out[Math.round(i * step)]);
  }
  return out.map(([x, y]) => [round(x), round(y)]);
}

// Opacity of a mark at `age` ms: a short fade-in, a soft fade-out in the last
// RA_MARK_FADE_MS, gone at RA_MARK_TTL_MS.
export function markOpacity(age: number, reduced = false): number {
  if (age < 0 || age >= RA_MARK_TTL_MS) return 0;
  if (reduced) return 1;
  if (age < 120) return age / 120;
  const left = RA_MARK_TTL_MS - age;
  return left < RA_MARK_FADE_MS ? left / RA_MARK_FADE_MS : 1;
}

export const markAlive = (bornAt: number, now: number): boolean => now - bornAt < RA_MARK_TTL_MS;

// Where a picture of size (vw, vh) is drawn inside a box (bw, bh) with
// object-fit: contain — so a click on the box maps to 0..1 of the picture.
export function containRect(bw: number, bh: number, vw: number, vh: number): { x: number; y: number; w: number; h: number } {
  if (!(bw > 0 && bh > 0 && vw > 0 && vh > 0)) return { x: 0, y: 0, w: bw, h: bh };
  const s = Math.min(bw / vw, bh / vh);
  const w = vw * s;
  const h = vh * s;
  return { x: (bw - w) / 2, y: (bh - h) / 2, w, h };
}

let seq = 0;
export function raMarkId(): string {
  seq = (seq + 1) % 1e6;
  return `m${Date.now().toString(36)}${seq.toString(36)}`;
}
