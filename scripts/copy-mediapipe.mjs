import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wasmRoot = join(root, "public", "mediapipe", "wasm");
const FILES = ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"];

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

const wanted = readJson(join(root, "package.json")).dependencies?.["@mediapipe/tasks-vision"] ?? "";
const source = join(root, "node_modules", "@mediapipe", "tasks-vision");

if (!wanted || !existsSync(join(source, "package.json"))) {
  console.warn("[mediapipe] @mediapipe/tasks-vision is not installed; skipping");
  process.exit(0);
}

const version = readJson(join(source, "package.json")).version;
if (version !== wanted) console.warn(`[mediapipe] installed tasks-vision ${version}, package.json asks for ${wanted}`);

const from = join(source, "wasm");
const missing = FILES.filter((name) => !existsSync(join(from, name)));
if (missing.length) {
  console.error(`[mediapipe] tasks-vision ${version} is missing ${missing.join(", ")}`);
  process.exit(1);
}

const target = join(wasmRoot, version);
const stamp = join(target, "VERSION");
if (existsSync(wasmRoot)) {
  for (const entry of readdirSync(wasmRoot)) if (entry !== version) rmSync(join(wasmRoot, entry), { recursive: true, force: true });
}
const fresh =
  existsSync(stamp) &&
  readFileSync(stamp, "utf8").trim() === version &&
  FILES.every((name) => existsSync(join(target, name)) && statSync(join(target, name)).size === statSync(join(from, name)).size);

if (fresh) {
  console.log(`[mediapipe] wasm ${version} already in place`);
  process.exit(0);
}

mkdirSync(target, { recursive: true });
for (const name of readdirSync(target)) if (!FILES.includes(name) && name !== "VERSION") rmSync(join(target, name), { force: true });
for (const name of FILES) copyFileSync(join(from, name), join(target, name));
writeFileSync(stamp, `${version}\n`);
console.log(`[mediapipe] copied ${FILES.length} wasm files (tasks-vision ${version})`);
