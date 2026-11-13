import sharp from "sharp";
import { mkdirSync } from "node:fs";

const SRC = process.argv[2];
const OUT = process.argv[3];
const NAMES = process.argv.slice(4);

const WHITE_CUT = 238;
const PAD = 0.06;
const CANVAS = 512;

const base = sharp(SRC);
const meta = await base.metadata();
const cellW = Math.round(meta.width / NAMES.length);

mkdirSync(OUT, { recursive: true });

for (let k = 0; k < NAMES.length; k++) {
  const left = k * cellW;
  const width = k === NAMES.length - 1 ? meta.width - left : cellW;
  const { data, info } = await base
    .clone()
    .extract({ left, top: 0, width, height: meta.height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      const near = data[i] >= WHITE_CUT && data[i + 1] >= WHITE_CUT && data[i + 2] >= WHITE_CUT;
      if (near) {
        data[i + 3] = 0;
        continue;
      }
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) {
    console.log(`${NAMES[k]}: bo'sh`);
    continue;
  }

  const cut = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .png()
    .toBuffer();

  const box = Math.round(CANVAS * (1 - PAD * 2));
  const fitted = await sharp(cut).resize(box, box, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  const out = sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fitted, gravity: "center" }]);

  await out.clone().png({ compressionLevel: 9 }).toFile(`${OUT}/${NAMES[k]}.png`);
  await out.clone().webp({ quality: 92 }).toFile(`${OUT}/${NAMES[k]}.webp`);
  console.log(`${NAMES[k].padEnd(24)} ${maxX - minX + 1}x${maxY - minY + 1} -> ${CANVAS}x${CANVAS}`);
}
