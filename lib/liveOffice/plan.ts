// Top-down (¾ view) floor plan of the live office, in tiles. Nine rooms in a
// 3×3 block with hallways between them; each room shows its back wall face
// at the top and opens onto the hallway below through a door in its bottom
// wall. Everything here is plain geometry so it can be checked outside React.
import { ROOMS, type OfficeRoom } from "./model";

export const T = 32; // screen units per tile
export const ROOM_W = 10;
export const ROOM_H = 7; // floor depth
export const FACE = 1.6; // visible back-wall face above the floor
export const CAP = 0.5; // outer wall thickness
export const SIDE = 0.3; // side and bottom wall thickness
export const HALL = 2.6; // hallway width (between rooms)
export const DOOR_W = 2.2;
export const SEATS = 8;

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

const colX = (c: number) => CAP + c * (ROOM_W + HALL);
const rowY = (r: number) => CAP + r * (FACE + ROOM_H + HALL);

export const PLAN_W = 2 * CAP + 3 * ROOM_W + 2 * HALL;
export const PLAN_H = 2 * CAP + 3 * (FACE + ROOM_H + HALL);

// The drawing's bounds in screen units: the plan plus room for the name
// plates above the top row.
export const VIEW = { x: -8, y: -0.9 * T, w: PLAN_W * T + 16, h: PLAN_H * T + 0.9 * T + 8 };

// The floor of a room (x, y = top-left of the floor, below the wall face).
export function roomBox(r: OfficeRoom) {
  const [c, row] = GRID[r];
  const x = colX(c);
  const top = rowY(row);
  return { x, top, y: top + FACE, w: ROOM_W, h: ROOM_H, c, row };
}

// Centre line of the hallway under a room's row.
export function hallY(r: OfficeRoom): number {
  const b = roomBox(r);
  return b.y + b.h + SIDE + (HALL - SIDE) / 2;
}

export function doorOf(r: OfficeRoom): [number, number] {
  const b = roomBox(r);
  return [b.x + b.w / 2, hallY(r)];
}

export function inRoom(r: OfficeRoom, x: number, y: number): boolean {
  const b = roomBox(r);
  return x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h;
}

export function roomAt(x: number, y: number): OfficeRoom | null {
  return ROOMS.find((r) => inRoom(r, x, y)) ?? null;
}

// Desk pods: two desks side by side, a row facing down (we see faces) and a
// row facing up (we see backs and screens), with an aisle between the rows
// and a centre aisle down to the door.
export const POD_X = [3.1, 6.9, 1.3, 8.7];
export const DESK_W = 1.8;
export const DOWN_Y = 3.3; // bottom of a down-row desk (floor-local)
export const UP_Y = 6.35; // bottom of an up-row chair (floor-local)
export const AISLE_Y = 3.8; // the walkway between the two desk rows

export type Face = "down" | "up" | "left" | "right";
export type Spot = {
  room: OfficeRoom;
  x: number; // anchor: bottom centre of the sprite
  y: number;
  exit: [number, number]; // where the person stands up to walk
  kind: "down" | "up" | "sofa" | "stand" | "queue";
};

export function seatOf(r: OfficeRoom, i: number): Spot {
  const b = roomBox(r);
  const x = b.x + POD_X[i % 4];
  if (i < 4) return { room: r, x, y: b.y + DOWN_Y, exit: [x, b.y + AISLE_Y], kind: "down" };
  return { room: r, x, y: b.y + UP_Y, exit: [x, b.y + AISLE_Y], kind: "up" };
}

// The reception: people who just came in stand at the counter.
export function receptionSpot(i: number): Spot {
  const b = roomBox("lobby");
  const x = b.x + 1.8 + (i % 3) * 1.15;
  const y = b.y + 3.6 + Math.floor(i / 3) * 1.25;
  return { room: "lobby", x, y, exit: [x, y], kind: "stand" };
}

// The lounge: whoever is waiting (idle) takes a coffee here — three seats on
// the sofa, then standing by the coffee machine, the cooler, the vending
// machine.
export const LOUNGE = 7;
export function loungeSpot(i: number): Spot {
  const b = roomBox("lobby");
  if (i < 3) {
    const x = b.x + 6.5 + i * 1.3;
    return { room: "lobby", x, y: b.y + 4.4, exit: [x, b.y + 4.65], kind: "sofa" };
  }
  const xs = [5.9, 7.0, 8.4, 9.45];
  const x = b.x + xs[(i - 3) % 4];
  return { room: "lobby", x, y: b.y + 2.15, exit: [x, b.y + 2.15], kind: "stand" };
}

export const QUEUE = 4;
export function queueSpot(r: OfficeRoom, i: number): Spot {
  const b = roomBox(r);
  const x = b.x + 1.2 + i * 1.3;
  const y = b.y + b.h + SIDE + 0.95; // right outside the room, by its front wall
  return { room: r, x, y, exit: [x, y], kind: "queue" };
}

// Hallways that run between columns, used to change rows.
function sideHall(c: number): number {
  const k = c < 2 ? c : 1;
  return colX(k) + ROOM_W + SIDE + (HALL - 2 * SIDE) / 2;
}

// From one spot to another: stand up into the aisle, along it to the centre
// aisle, out through the door, along the hallways, and in the same way.
export function route(a: Spot, b: Spot): [number, number][] {
  const pa = a.exit;
  const pb = b.exit;
  if (a.room === b.room) {
    const ra = roomBox(a.room);
    const cx = ra.x + ra.w / 2;
    if (Math.abs(pa[1] - pb[1]) < 0.01) return [pa, pb];
    return [pa, [cx, pa[1]], [cx, pb[1]], pb];
  }
  const ra = roomBox(a.room);
  const rb = roomBox(b.room);
  const ca = ra.x + ra.w / 2;
  const cb = rb.x + rb.w / 2;
  const ya = hallY(a.room);
  const yb = hallY(b.room);
  const out: [number, number][] = [pa, [ca, pa[1]], [ca, ra.y + ra.h - 0.5], [ca, ya]];
  if (Math.abs(ya - yb) > 0.01) {
    const side = sideHall(ra.c);
    out.push([side, ya], [side, yb]);
  }
  out.push([cb, yb], [cb, rb.y + rb.h - 0.5], [cb, pb[1]], pb);
  return out;
}

export function pathLength(p: [number, number][]): number {
  let n = 0;
  for (let i = 1; i < p.length; i++) n += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return n;
}

export function faceOf(dx: number, dy: number): Face {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}
