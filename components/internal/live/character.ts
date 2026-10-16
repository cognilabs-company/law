import { asDict } from "@/lib/http";

// Live Office characters: every employee is drawn as a small person an
// admin can dress — 30 ready characters (15 men, 15 women) and 21 parts
// with 158 choices between them. The look is kept on the employee's HRM
// profile (profile.live_character); someone without one gets a ready
// character picked from their id, so the floor never shows a blank.

export const SKIN = { porcelain: "#FFE3CF", light: "#F6D2B8", fair: "#EDBF9C", warm: "#DDA67C", tan: "#C78E62", olive: "#B07A4E", brown: "#8C5A3A", deep: "#60402B" } as const;
export const HAIR_COLOR = { black: "#1F1B1A", espresso: "#3A2A22", brown: "#65422A", chestnut: "#8C5634", honey: "#B9803F", blonde: "#E2C17C", auburn: "#9C3B26", ginger: "#D2632B", grey: "#A3A7AE", white: "#EDEDEA", violet: "#7461D6", teal: "#2A9C9A" } as const;
export const CLOTH = { navy: "#24407A", blue: "#2F6FE0", sky: "#63B7F0", teal: "#14A898", green: "#2E9C5B", olive: "#7D8A3B", mustard: "#E1A626", orange: "#E8742C", red: "#D6453D", berry: "#B4357A", violet: "#7C5CD6", charcoal: "#3A4252", white: "#F1F3F6", beige: "#D8C29E" } as const;
export const PANTS = { black: "#1F2430", navy: "#283A5C", denim: "#3E6597", grey: "#6E7584", brown: "#7E5B3E", khaki: "#BFA77A", cream: "#EDE7DB", wine: "#7A2E3A" } as const;
export const BACKDROP = { sky: "#DCEBFF", mint: "#D6F3E9", peach: "#FDE3D3", lilac: "#E8E0FB", lemon: "#FBF1C7", rose: "#FBDDE3", cloud: "#E9EEF4", night: "#2B3550" } as const;

const keys = <T extends object>(o: T) => Object.keys(o) as (keyof T & string)[];

// Every part and what it can be, in the order the studio shows them.
export const PARTS = {
  body: ["m", "f"],
  skin: keys(SKIN),
  face: ["round", "oval", "square", "heart"],
  hair: ["buzz", "side", "quiff", "curly", "afro", "bald", "manbun", "spiky", "slick", "long", "bob", "pony", "bun", "braids", "pixie", "wavy", "bangs", "curlylong"],
  hairColor: keys(HAIR_COLOR),
  brows: ["soft", "straight", "arched", "bold"],
  eyes: ["dot", "round", "smile", "almond", "lashes", "wink"],
  mouth: ["smile", "grin", "calm", "open", "smirk"],
  cheeks: ["none", "blush", "freckles"],
  beard: ["none", "stubble", "mustache", "goatee", "short", "full"],
  glasses: ["none", "round", "square", "cateye", "halfrim", "shades"],
  hat: ["none", "cap", "beanie", "scarf", "headband", "doppi", "beret"],
  hatColor: keys(CLOTH),
  earrings: ["none", "studs", "hoops", "drops"],
  top: ["tee", "shirt", "suit", "blazer", "hoodie", "sweater", "polo", "cardigan", "turtleneck", "dress", "chapan"],
  topColor: keys(CLOTH),
  bottom: ["trousers", "jeans", "skirt", "maxi"],
  bottomColor: keys(PANTS),
  shoes: ["sneakers", "loafers", "boots", "heels", "flats"],
  extra: ["none", "headset", "badge", "scarf", "watch", "tie", "bowtie", "necklace", "mug"],
  bg: keys(BACKDROP),
} as const;

export type Part = keyof typeof PARTS;
export type Look = { [K in Part]: (typeof PARTS)[K][number] };
export const PART_KEYS = Object.keys(PARTS) as Part[];
export const OPTION_COUNT = PART_KEYS.reduce((n, k) => n + PARTS[k].length, 0);

// Parts that are colours (shown as swatches) and where their colours live.
export const SWATCH: Partial<Record<Part, Record<string, string>>> = { skin: SKIN, hairColor: HAIR_COLOR, hatColor: CLOTH, topColor: CLOTH, bottomColor: PANTS, bg: BACKDROP };

// The studio's tabs.
export const GROUPS: { id: string; parts: Part[] }[] = [
  { id: "body", parts: ["body", "skin", "face", "bg"] },
  { id: "hair", parts: ["hair", "hairColor", "beard"] },
  { id: "face", parts: ["eyes", "brows", "mouth", "cheeks"] },
  { id: "outfit", parts: ["top", "topColor", "bottom", "bottomColor", "shoes"] },
  { id: "extras", parts: ["glasses", "hat", "hatColor", "earrings", "extra"] },
];

// A choice that the rest of the look hides: the trousers under a dress,
// the hair under a headscarf, the colour of no hat.
export function hidden(look: Look, part: Part): boolean {
  if (part === "bottom" || part === "bottomColor") return look.top === "dress";
  if (part === "hair") return look.hat === "scarf";
  if (part === "hatColor") return look.hat === "none" || look.hat === "doppi";
  if (part === "earrings") return look.hat === "scarf";
  return false;
}

const BASE_M: Look = { body: "m", skin: "fair", face: "round", hair: "side", hairColor: "brown", brows: "soft", eyes: "round", mouth: "smile", cheeks: "none", beard: "none", glasses: "none", hat: "none", hatColor: "navy", earrings: "none", top: "shirt", topColor: "blue", bottom: "trousers", bottomColor: "navy", shoes: "loafers", extra: "none", bg: "sky" };
const BASE_F: Look = { body: "f", skin: "light", face: "oval", hair: "long", hairColor: "espresso", brows: "arched", eyes: "lashes", mouth: "smile", cheeks: "blush", beard: "none", glasses: "none", hat: "none", hatColor: "berry", earrings: "studs", top: "blazer", topColor: "berry", bottom: "trousers", bottomColor: "black", shoes: "flats", extra: "none", bg: "rose" };
const m = (name: string, o: Partial<Look>) => ({ name, look: { ...BASE_M, ...o } });
const f = (name: string, o: Partial<Look>) => ({ name, look: { ...BASE_F, ...o } });

export type Preset = { id: string; name: string; look: Look };
export const PRESETS: Preset[] = [
  m("Akmal", { top: "suit", topColor: "navy", hairColor: "black", brows: "straight", skin: "warm", beard: "stubble", extra: "tie" }),
  m("Bekzod", { top: "hoodie", topColor: "teal", hair: "curly", hairColor: "espresso", bottom: "jeans", bottomColor: "denim", shoes: "sneakers", extra: "headset", bg: "mint" }),
  m("Davron", { top: "chapan", topColor: "navy", hat: "doppi", hair: "buzz", hairColor: "black", beard: "short", skin: "tan", bottomColor: "black", shoes: "boots", bg: "lemon" }),
  m("Elyor", { top: "polo", topColor: "green", hair: "quiff", glasses: "square", bottom: "jeans", bottomColor: "denim", shoes: "sneakers", bg: "mint" }),
  m("Farrux", { top: "sweater", topColor: "mustard", hair: "slick", hairColor: "black", beard: "mustache", face: "square", bottomColor: "brown", bg: "peach" }),
  m("G'ayrat", { top: "blazer", topColor: "charcoal", hair: "bald", hairColor: "grey", beard: "full", glasses: "round", skin: "olive", extra: "watch", bottomColor: "grey", bg: "cloud" }),
  m("Jasur", { top: "tee", topColor: "red", hair: "spiky", hairColor: "black", eyes: "smile", mouth: "grin", bottom: "jeans", bottomColor: "denim", shoes: "sneakers", extra: "mug", bg: "rose" }),
  m("Kamron", { top: "shirt", topColor: "sky", hairColor: "honey", glasses: "halfrim", skin: "light", bottomColor: "grey", extra: "badge", bg: "sky" }),
  m("Laziz", { top: "turtleneck", topColor: "charcoal", hair: "manbun", hairColor: "espresso", beard: "goatee", face: "oval", bottomColor: "black", shoes: "boots", bg: "night" }),
  m("Murod", { top: "cardigan", topColor: "olive", hair: "buzz", hairColor: "grey", glasses: "round", brows: "bold", bottomColor: "brown", extra: "bowtie", bg: "lemon" }),
  m("Nodir", { top: "hoodie", topColor: "violet", hair: "afro", hairColor: "black", skin: "deep", bottom: "jeans", bottomColor: "denim", shoes: "sneakers", extra: "headset", bg: "lilac" }),
  m("Otabek", { top: "suit", topColor: "charcoal", hair: "quiff", hairColor: "black", beard: "short", face: "square", skin: "warm", bottomColor: "black", extra: "watch", bg: "cloud" }),
  m("Rustam", { top: "polo", topColor: "navy", hat: "cap", hatColor: "red", hair: "buzz", hairColor: "espresso", mouth: "smirk", bottom: "jeans", bottomColor: "denim", shoes: "sneakers", bg: "sky" }),
  m("Sardor", { top: "shirt", topColor: "white", hair: "curly", hairColor: "ginger", cheeks: "freckles", skin: "porcelain", extra: "tie", bg: "peach" }),
  m("Temur", { top: "sweater", topColor: "blue", hat: "beanie", hatColor: "mustard", beard: "stubble", eyes: "almond", bottomColor: "khaki", shoes: "boots", extra: "mug", bg: "mint" }),
  f("Aziza", {}),
  f("Barno", { hat: "scarf", hatColor: "teal", top: "cardigan", topColor: "beige", bottom: "maxi", bottomColor: "navy", earrings: "none", bg: "mint" }),
  f("Dilnoza", { top: "dress", topColor: "red", hair: "bun", hairColor: "black", earrings: "hoops", shoes: "heels", bg: "peach" }),
  f("Feruza", { top: "sweater", topColor: "sky", hair: "bob", hairColor: "chestnut", glasses: "round", bottom: "skirt", bottomColor: "grey", face: "round", bg: "sky" }),
  f("Gulnora", { top: "chapan", topColor: "berry", hat: "doppi", hair: "braids", hairColor: "black", bottom: "maxi", bottomColor: "wine", skin: "warm", bg: "lemon" }),
  f("Hilola", { top: "hoodie", topColor: "mustard", hair: "pony", hairColor: "honey", bottom: "jeans", bottomColor: "denim", shoes: "sneakers", extra: "headset", eyes: "smile", bg: "lemon" }),
  f("Iroda", { top: "suit", topColor: "navy", hair: "pixie", hairColor: "black", earrings: "drops", bottomColor: "navy", shoes: "heels", extra: "watch", face: "heart", bg: "cloud" }),
  f("Kamola", { top: "tee", topColor: "green", hair: "curlylong", hairColor: "brown", skin: "brown", bottom: "jeans", bottomColor: "denim", shoes: "sneakers", extra: "mug", mouth: "grin", bg: "mint" }),
  f("Laylo", { top: "polo", topColor: "violet", hair: "wavy", hairColor: "blonde", glasses: "cateye", bottom: "skirt", bottomColor: "cream", skin: "porcelain", bg: "lilac" }),
  f("Madina", { top: "turtleneck", topColor: "teal", hair: "bangs", hairColor: "auburn", bottom: "maxi", bottomColor: "brown", shoes: "boots", cheeks: "freckles", bg: "peach" }),
  f("Nigora", { top: "shirt", topColor: "teal", hair: "braids", hairColor: "espresso", bottomColor: "grey", extra: "badge", skin: "fair", bg: "sky" }),
  f("Ozoda", { top: "cardigan", topColor: "orange", hair: "bob", hairColor: "black", hat: "headband", hatColor: "orange", bottom: "skirt", bottomColor: "navy", extra: "necklace", bg: "peach" }),
  f("Sevara", { top: "blazer", topColor: "violet", hair: "curly", hairColor: "honey", skin: "deep", earrings: "hoops", shoes: "heels", face: "heart", bg: "lilac" }),
  f("Shahlo", { top: "dress", topColor: "blue", hair: "long", hairColor: "blonde", hat: "beret", hatColor: "red", extra: "scarf", eyes: "almond", bg: "sky" }),
  f("Zarina", { top: "sweater", topColor: "berry", hair: "bun", hairColor: "espresso", glasses: "halfrim", bottom: "jeans", bottomColor: "denim", shoes: "boots", extra: "necklace", bg: "rose" }),
].map((p, i) => ({ id: `${p.look.body}${String((i % 15) + 1).padStart(2, "0")}`, ...p }));

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Uzbek and Russian surnames and patronymics say who is a woman (-ova,
// -eva, qizi) and who a man (-ov, -ev, o'g'li); other names stay open.
export function guessBody(name: string): "m" | "f" | "" {
  const words = name.toLocaleLowerCase().split(/\s+/);
  if (words.some((w) => /(ova|eva|skaya|qizi)$/.test(w))) return "f";
  if (words.some((w) => /(ov|ev|skiy|o['‘’`]?g['‘’`]?li)$/.test(w))) return "m";
  return "";
}

// The ready character someone gets until an admin dresses them: the same
// one every time, a man's or a woman's when the name tells.
export function presetFor(id: string, name = ""): Preset {
  const body = guessBody(name);
  const pool = body ? PRESETS.filter((p) => p.look.body === body) : PRESETS;
  return pool[hash(id || "x") % pool.length];
}

// A look as kept on the profile, read back part by part: anything unknown
// falls back to the character it started from.
export function readLook(raw: unknown, fallbackId: string): Look | null {
  const d = asDict(raw);
  if (!Object.keys(d).length) return null;
  const from = PRESETS.find((p) => p.id === d.preset)?.look ?? presetFor(fallbackId).look;
  const out = { ...from } as Record<Part, string>;
  for (const k of PART_KEYS) {
    const v = d[k];
    if (typeof v === "string" && (PARTS[k] as readonly string[]).includes(v)) out[k] = v;
  }
  return out as Look;
}

// What goes on the profile: every part, and the ready character it began as.
export const storedLook = (look: Look, preset: string) => ({ v: 1, preset, ...look });

// Where an employee's look may arrive: their HRM profile (from the
// directory or the board card) or a flat field on the card.
export function lookFromRecord(rec: Record<string, unknown> | undefined, id: string): Look | null {
  if (!rec) return null;
  const emp = asDict(rec.employee);
  return readLook(asDict(rec.profile).live_character ?? asDict(emp.profile).live_character ?? rec.live_character ?? emp.live_character, id);
}

export function randomLook(rand: () => number = Math.random): Look {
  const out = {} as Record<Part, string>;
  for (const k of PART_KEYS) {
    const opts = PARTS[k] as readonly string[];
    out[k] = opts[Math.floor(rand() * opts.length)];
  }
  // Keep a random face from looking cluttered: most people wear no hat,
  // no glasses and carry nothing.
  const quiet = (k: Part, p: number) => {
    if (rand() < p) out[k] = "none";
  };
  quiet("hat", 0.6);
  quiet("glasses", 0.5);
  quiet("extra", 0.45);
  if (out.body === "f") out.beard = "none";
  else if (rand() < 0.5) out.beard = "none";
  return out as Look;
}

// A colour a little darker (k < 0) or lighter (k > 0), for folds and shade.
export function tone(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// Light cloth wants dark detail lines, dark cloth light ones.
export function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 170;
}
