// Usage: node build-landing-images.mjs <rawDir> <projectRoot>
// Turns the raw generated images into the web assets the landing uses, and
// writes components/landing/images.ts with their real dimensions.
import { createRequire } from "node:module";
import path from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const [, , rawDir, projectRoot] = process.argv;
const require = createRequire(path.join(projectRoot, "package.json"));
const sharp = require("sharp");

const out = path.join(projectRoot, "public", "img", "landing");
mkdirSync(out, { recursive: true });

// width: final pixel width. Sources are about 1100-1700px, so the large photos
// are enlarged with Lanczos and a light sharpen. That keeps 4K screens from
// falling back to the browser's softer scaling.
const JOBS = [
  { key: "heroPhoto", raw: "lexgo-hero-photo.png", file: "hero-photo.webp", width: 1600, quality: 84 },
  { key: "problemMaze", raw: "lexgo-problem-maze.png", file: "problem-maze.webp", width: 2600, quality: 84 },
  { key: "problemDoors", raw: "lexgo-problem-doors.png", file: "problem-doors.webp", width: 2600, quality: 88 },
  { key: "problemTorn", raw: "lexgo-problem-torn.png", file: "problem-torn.webp", width: 2600, quality: 84 },
  { key: "problemStorm", raw: "lexgo-problem-storm.png", file: "problem-storm.webp", width: 2600, quality: 84 },
  { key: "trustSteps", raw: "lexgo-trust-steps.png", file: "trust-steps.webp", width: 1500, quality: 84 },
  { key: "trustWoman", raw: "lexgo-trust-woman.png", file: "trust-woman.webp", width: 1500, quality: 84 },
  { key: "svcContract", raw: "lexgo-svc-contract.png", file: "svc-contract.webp", width: 1500, quality: 84 },
  { key: "svcExpress", raw: "lexgo-svc-express.png", file: "svc-express.webp", width: 1400, quality: 84 },
  { key: "svcVideo", raw: "lexgo-svc-video.png", file: "svc-video.webp", width: 1400, quality: 84 },
  { key: "svcReview", raw: "lexgo-svc-review.png", file: "svc-review.webp", width: 1400, quality: 84 },
  // Head, shoulders and scales only.
  { key: "aiThemis", raw: "lexgo-ai-themis.png", file: "ai-themis.webp", crop: { left: 0, top: 0, width: 1086, height: 980 }, width: 1800, quality: 86 },
  { key: "warrantyShield", raw: "lexgo-warranty-shield.png", file: "warranty-shield.webp", trim: true, width: 1400, quality: 90, alpha: true },
  { key: "subFamily", raw: "lexgo-sub-family.png", file: "sub-family.webp", width: 2600, quality: 84 },
  { key: "ctaColumns", raw: "lexgo-cta-columns.png", file: "cta-columns.webp", width: 3200, quality: 86 },
];

const manifest = {};
for (const job of JOBS) {
  const input = path.join(rawDir, job.raw);
  if (!existsSync(input)) {
    console.log(`skip ${job.raw} (not generated yet)`);
    continue;
  }
  let img = sharp(input);
  if (job.crop) img = sharp(await img.extract(job.crop).toBuffer());
  if (job.trim) img = sharp(await img.trim({ threshold: 4 }).toBuffer());
  const meta = await img.metadata();
  const width = job.width ?? Math.round(meta.width * job.scale);
  if (width !== meta.width) {
    img = img.resize({ width, kernel: "lanczos3" });
    if (width > meta.width) img = img.sharpen({ sigma: 0.6, m1: 0.4, m2: 1.2 });
  }
  const buffer = await img
    .webp({ quality: job.quality, alphaQuality: job.alpha ? 95 : undefined, smartSubsample: true, effort: 6 })
    .toBuffer({ resolveWithObject: true });
  writeFileSync(path.join(out, job.file), buffer.data);
  manifest[job.key] = { src: `/img/landing/${job.file}`, width: buffer.info.width, height: buffer.info.height };
  console.log(`${job.file.padEnd(26)} ${buffer.info.width}x${buffer.info.height}  ${(buffer.data.length / 1024).toFixed(0)} KB`);
}

// Six icons cut from the sheet: 3 columns, 2 rows.
const sheet = path.join(rawDir, "lexgo-icons-1.png");
if (existsSync(sheet)) {
  const names = ["iconAnswer", "iconVerified", "iconShield", "iconFolders", "iconScale", "iconGlobe"];
  const meta = await sharp(sheet).metadata();
  const cw = Math.floor(meta.width / 3);
  const ch = Math.floor(meta.height / 2);
  for (let i = 0; i < names.length; i++) {
    const left = (i % 3) * cw;
    const top = Math.floor(i / 3) * ch;
    // The glass glow reaches the cell border, so fade it out with a radial mask
    // or each icon would show a square edge.
    const size = Math.min(cw, ch);
    const cell = await sharp(sheet)
      .extract({ left: left + Math.floor((cw - size) / 2), top: top + Math.floor((ch - size) / 2), width: size, height: size })
      .ensureAlpha()
      .toBuffer();
    const mask = Buffer.from(
      `<svg width="${size}" height="${size}"><defs><radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="72%" stop-color="#fff" stop-opacity="1"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
    );
    const faded = await sharp(cell).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
    const file = `${names[i].replace(/[A-Z]/, (c) => "-" + c.toLowerCase())}.webp`;
    const buffer = await sharp(faded)
      .resize({ width: 512, height: 512, kernel: "lanczos3" })
      .webp({ quality: 88, alphaQuality: 90, effort: 6 })
      .toBuffer({ resolveWithObject: true });
    writeFileSync(path.join(out, file), buffer.data);
    manifest[names[i]] = { src: `/img/landing/${file}`, width: buffer.info.width, height: buffer.info.height };
    console.log(`${file.padEnd(26)} ${buffer.info.width}x${buffer.info.height}  ${(buffer.data.length / 1024).toFixed(0)} KB`);
  }
}

const lines = Object.entries(manifest).map(
  ([key, v]) => `  ${key}: { src: "${v.src}", width: ${v.width}, height: ${v.height} },`,
);
writeFileSync(
  path.join(projectRoot, "components", "landing", "images.ts"),
  `// Generated from the source images; real pixel sizes keep every frame from shifting.\nexport const IMG = {\n${lines.join("\n")}\n} as const;\n`,
);
console.log("wrote images.ts with", lines.length, "entries");
