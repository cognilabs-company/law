#!/usr/bin/env node
// Upserts one top-level namespace into messages/{uz,ru,en}.json, kept on a
// single line so concurrent edits of different namespaces never collide and
// the rest of the (very large) files is left byte-for-byte untouched.
//
//   node scripts/lx-i18n.mjs <namespace> <source.json>
//
// <source.json> = { "uz": {...}, "ru": {...}, "en": {...} }
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [ns, src] = process.argv.slice(2);
if (!ns || !src || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(ns)) {
  console.error("usage: node scripts/lx-i18n.mjs <namespace> <source.json>");
  process.exit(1);
}
const data = JSON.parse(readFileSync(src, "utf8"));
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "messages");

for (const loc of ["uz", "ru", "en"]) {
  if (!data[loc]) throw new Error(`missing locale ${loc} in ${src}`);
  const file = join(root, `${loc}.json`);
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const line = `  ${JSON.stringify(ns)}: ${JSON.stringify(data[loc])}`;
  const at = lines.findIndex((l) => l.startsWith(`  ${JSON.stringify(ns)}: `));
  if (at >= 0) {
    // Same position, keep the trailing comma it had.
    lines[at] = line + (lines[at].trimEnd().endsWith(",") ? "," : "");
  } else {
    let end = lines.length - 1;
    while (end >= 0 && lines[end].trim() !== "}") end--;
    let prev = end - 1;
    while (prev >= 0 && lines[prev].trim() === "") prev--;
    if (!lines[prev].trimEnd().endsWith(",")) lines[prev] = lines[prev].trimEnd() + ",";
    lines.splice(end, 0, line);
  }
  const out = lines.join("\n");
  JSON.parse(out); // never write a broken file
  writeFileSync(file, out);
}
console.log(`upserted ${ns}`);
