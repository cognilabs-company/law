import { asDict } from "@/lib/http";
import type { LiveRoom } from "@/lib/services/internalLive";
import { BENCH, benchSeats } from "@/components/live/floorArt";

export type Dict = Record<string, unknown>;

// A bench for four with the room it needs around it.
const CELL_W = BENCH.w + 1.5;
const CELL_D = BENCH.d + 3;
const PAD = 0.7;

// The desks a room gets for `want` seats, benches of four in a near-square
// grid, in the room's own floor units (its corner at 0, 0).
export function deskGrid(want: number) {
  const deskCount = Math.max(1, Math.ceil(want / 4));
  const cols = Math.ceil(Math.sqrt(deskCount));
  const rows = Math.ceil(deskCount / cols);
  const desks: { x: number; y: number }[] = [];
  const seats: { x: number; y: number }[] = [];
  for (let i = 0; i < deskCount; i++) {
    const cx = PAD + (i % cols) * CELL_W;
    const cy = PAD + Math.floor(i / cols) * CELL_D;
    desks.push({ x: cx + 0.75, y: cy + 1.6 });
    for (const b of benchSeats(cx + 0.75, cy + 1.6)) seats.push({ x: b.x, y: b.y });
  }
  return { desks, seats, w: cols * CELL_W + PAD * 2, d: rows * CELL_D + PAD * 2 };
}

// The six floor colours a room can wear (lf-room--t0…t5).
export const TINTS = [0, 1, 2, 3, 4, 5] as const;

// Where a room stands on the floor and in what colour, kept in its meta.
export const floorOf = (meta: Dict) => {
  const f = asDict(meta.floor);
  return typeof f.x === "number" && typeof f.y === "number" ? { x: f.x, y: f.y } : null;
};
export const tintOf = (meta: Dict) => (typeof meta.tint === "number" && meta.tint >= 0 && meta.tint < TINTS.length ? meta.tint : null);

// Everything PATCH /rooms/{id} wants, from a room as read, with its meta
// replaced.
export const roomPayload = (room: LiveRoom, meta: Dict) => ({ org_unit_id: room.unitId, code: room.code, name: room.name, room_type: room.type, capacity: room.capacity, status: room.status, order_index: room.order, meta });

const LATIN: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya", ў: "o", қ: "q", ғ: "g", ҳ: "h" };

// A room's code from its name: "Studio asosiy xona" → STUDIO-ASOSIY-XONA.
export const codeFrom = (name: string) =>
  [...name.toLocaleLowerCase()].map((c) => LATIN[c] ?? c).join("").normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32).toUpperCase();
