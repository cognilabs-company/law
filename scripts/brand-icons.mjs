import sharp from "sharp";
import { readdirSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";

const NAVY = [10, 21, 38];
const BLUE = [0, 88, 248];
const SRC = "public/img/xizmatlar";
const OUT = process.argv[2] ?? SRC;
const ONLY = process.argv.slice(3);

const INK_LUMA = 110;
const ALPHA_MIN = 60;
const SIGMA = 4.2;
const FILL_CUT = 96;

async function recolor(file) {
  const src = join(SRC, file);
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const n = width * height;

  const ink = Buffer.alloc(n);
  for (let p = 0; p < n; p++) {
    const i = p * channels;
    const a = data[i + 3];
    if (a < ALPHA_MIN) continue;
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (l < INK_LUMA) ink[p] = 255;
  }

  const spread = await sharp(ink, { raw: { width, height, channels: 1 } })
    .blur(SIGMA)
    .raw()
    .toBuffer();

  let blue = 0;
  let navy = 0;
  for (let p = 0; p < n; p++) {
    if (!ink[p]) continue;
    const i = p * channels;
    const thick = spread[p] >= FILL_CUT;
    const c = thick ? BLUE : NAVY;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
    if (thick) blue++;
    else navy++;
  }

  mkdirSync(OUT, { recursive: true });
  const stem = basename(file, ".png");
  await sharp(data, { raw: { width, height, channels } }).png({ compressionLevel: 9 }).toFile(join(OUT, `${stem}.png`));
  await sharp(data, { raw: { width, height, channels } }).webp({ quality: 92 }).toFile(join(OUT, `${stem}.webp`));
  return { stem, blue, navy, share: blue / (blue + navy) };
}

const files = readdirSync(SRC)
  .filter((f) => f.endsWith(".png"))
  .filter((f) => !ONLY.length || ONLY.includes(basename(f, ".png")));

for (const f of files) {
  const r = await recolor(f);
  console.log(`${r.stem.padEnd(30)} ko'k ${(r.share * 100).toFixed(0).padStart(3)}%  navy ${(100 - r.share * 100).toFixed(0).padStart(3)}%`);
}
