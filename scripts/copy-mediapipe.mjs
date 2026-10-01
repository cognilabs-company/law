import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const processorDir = join(root, "node_modules", "@livekit", "track-processors");
const wasmRoot = join(root, "public", "mediapipe", "wasm");

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

if (!existsSync(processorDir)) {
  console.warn("[mediapipe] @livekit/track-processors is not installed; skipping");
  process.exit(0);
}

const wanted = readJson(join(processorDir, "package.json")).dependencies?.["@mediapipe/tasks-vision"] ?? "";
const candidates = [
  join(processorDir, "node_modules", "@mediapipe", "tasks-vision"),
  join(root, "node_modules", "@mediapipe", "tasks-vision"),
].filter((dir) => existsSync(join(dir, "package.json")));

const source = candidates.find((dir) => readJson(join(dir, "package.json")).version === wanted) ?? candidates[0];
if (!source) {
  console.error("[mediapipe] @mediapipe/tasks-vision was not found");
  process.exit(1);
}

const version = readJson(join(source, "package.json")).version;
if (wanted && version !== wanted) console.warn(`[mediapipe] using tasks-vision ${version}, the processor expects ${wanted}`);

const from = join(source, "wasm");
const target = join(wasmRoot, version);
const stamp = join(target, "VERSION");
if (existsSync(wasmRoot)) {
  for (const entry of readdirSync(wasmRoot)) if (entry !== version) rmSync(join(wasmRoot, entry), { recursive: true, force: true });
}
const files = readdirSync(from).filter((name) => /\.(js|wasm)$/.test(name));
const fresh =
  existsSync(stamp) &&
  readFileSync(stamp, "utf8").trim() === version &&
  files.every((name) => existsSync(join(target, name)) && statSync(join(target, name)).size === statSync(join(from, name)).size);

if (fresh) {
  console.log(`[mediapipe] wasm ${version} already in place`);
  process.exit(0);
}

mkdirSync(target, { recursive: true });
for (const name of files) copyFileSync(join(from, name), join(target, name));
writeFileSync(stamp, `${version}\n`);
console.log(`[mediapipe] copied ${files.length} wasm files (tasks-vision ${version})`);
