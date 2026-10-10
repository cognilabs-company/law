// Isometric floor plan of the live office: world units on the floor (x, y)
// and height (z), projected to screen. Nine rooms in a 3×3 block with
// hallways between them; each room is a cut-away with two back walls, so the
// viewer looks in from the front.
import { ROOMS, type OfficeRoom } from "./model";

export const U = 20; // screen px per world unit at scale 1
const C = U * Math.cos(Math.PI / 6);
const S = U * 0.5;

export const ROOM_W = 11; // along x
export const ROOM_D = 9; // along y
export const HALL = 2.4; // hallway width
export const WALL_H = 2.6;
export const SEATS = 6;

export type Pt = [number, number];
export type W3 = [number, number, number];

export function project(x: number, y: number, z = 0): Pt {
  return [(x - y) * C, (x + y) * S - z * U];
}

export const pts = (list: Pt[]) => list.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ");

const GRID: Record<OfficeRoom, [number, number]> = {
  lobby: [0, 0],
  talk: [1, 0],
  urgent: [2, 0],
  documents: [0, 1],
  desk: [1, 1],
  ai: [2, 1],
  market: [0, 2],
  studio: [1, 2],
  admin: [2, 2],
};

export function roomOrigin(r: OfficeRoom): [number, number] {
  const [c, row] = GRID[r];
  return [c * (ROOM_W + HALL), row * (ROOM_D + HALL)];
}

export const WORLD_X = 3 * ROOM_W + 3 * HALL;
export const WORLD_Y = 3 * ROOM_D + 3 * HALL;

// Seats form two screen-level rows (x + y constant), staggered, clear of the
// furniture along the back walls. The front row fills first, so a quiet room
// keeps its back wall — name, poster, furniture — in view.
const LOCAL_SEATS: [number, number][] = [
  [8, 6],
  [10, 4],
  [6, 8],
  [6.5, 2.5],
  [4.5, 4.5],
  [2.5, 6.5],
];
export const FRONT_ROW = 3;

export function seatOf(r: OfficeRoom, i: number): [number, number] {
  const [x0, y0] = roomOrigin(r);
  const [lx, ly] = LOCAL_SEATS[i % SEATS];
  return [x0 + lx, y0 + ly];
}

// Who does not fit at a desk waits in the hallway in front of the room.
export const QUEUE = 4;
export function queueSpot(r: OfficeRoom, i: number): [number, number] {
  const [x0, y0] = roomOrigin(r);
  return [x0 + 2.4 + i * 2.2, y0 + ROOM_D + HALL * 0.5];
}

// The front opening of a room, on the hallway's centre line.
export function doorOf(r: OfficeRoom): [number, number] {
  const [x0, y0] = roomOrigin(r);
  return [x0 + ROOM_W / 2, y0 + ROOM_D + HALL / 2];
}

// Walk out of the room, along the hallway in front of it, down the side
// hallway to the other row, along that hallway and in: never through a room.
export function route(from: OfficeRoom, a: [number, number], to: OfficeRoom, b: [number, number]): [number, number][] {
  if (from === to) return [a, b];
  const da = doorOf(from);
  const db = doorOf(to);
  // just inside each door, so the walk goes through the doorway itself
  const ia: [number, number] = [da[0], da[1] - HALL / 2 - 0.7];
  const ib: [number, number] = [db[0], db[1] - HALL / 2 - 0.7];
  if (da[1] === db[1]) return [a, ia, da, db, ib, b];
  const [x0] = roomOrigin(from);
  const side = x0 + ROOM_W + HALL / 2;
  return [a, ia, da, [side, da[1]], [side, db[1]], db, ib, b];
}

export function pathLength(p: [number, number][]): number {
  let n = 0;
  for (let i = 1; i < p.length; i++) n += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return n;
}

export function inRoom(r: OfficeRoom, x: number, y: number): boolean {
  const [x0, y0] = roomOrigin(r);
  return x > x0 && x < x0 + ROOM_W && y > y0 && y < y0 + ROOM_D;
}

export function roomAt(x: number, y: number): OfficeRoom | null {
  return ROOMS.find((r) => inRoom(r, x, y)) ?? null;
}

// The drawing's bounds: the slab under the building plus the wall height.
const SLAB = 0.7;
export const VIEW = (() => {
  const xs = [project(0, WORLD_Y)[0], project(WORLD_X, 0)[0]];
  const top = project(0, 0, WALL_H + 1.6)[1];
  const bottom = project(WORLD_X, WORLD_Y, -SLAB)[1];
  const pad = 14;
  return { x: xs[0] - pad, y: top - pad, w: xs[1] - xs[0] + pad * 2, h: bottom - top + pad * 2, slab: SLAB };
})();

// The three visible faces of a box: top, the +y face (lit) and the +x face (shade).
export function box(x: number, y: number, z: number, w: number, d: number, h: number) {
  return {
    top: pts([project(x, y, z + h), project(x + w, y, z + h), project(x + w, y + d, z + h), project(x, y + d, z + h)]),
    left: pts([project(x, y + d, z), project(x + w, y + d, z), project(x + w, y + d, z + h), project(x, y + d, z + h)]),
    right: pts([project(x + w, y, z), project(x + w, y + d, z), project(x + w, y + d, z + h), project(x + w, y, z + h)]),
  };
}

// A flat rectangle on a back wall: plane y = const (runs down-right) or
// x = const (runs down-left); a, b along the wall, z1..z2 height.
export function onWallY(y: number, a: number, b: number, z1: number, z2: number): string {
  return pts([project(a, y, z1), project(b, y, z1), project(b, y, z2), project(a, y, z2)]);
}
export function onWallX(x: number, a: number, b: number, z1: number, z2: number): string {
  return pts([project(x, a, z1), project(x, b, z1), project(x, b, z2), project(x, a, z2)]);
}
