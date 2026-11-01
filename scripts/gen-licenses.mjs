// Writes lib/licenses/notices.json: every package that ships with LexGo
// (the production dependency tree) with its version, licence, copyright
// lines and home page, plus the full text of each distinct licence once.
// The /legal/licenses page renders it, which is how the attribution and
// notice duties of MIT, ISC, BSD, Apache-2.0, OFL and CC-BY are met.
//
//   node scripts/gen-licenses.mjs          rewrite the file
//   node scripts/gen-licenses.mjs --check  fail if it is out of date
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "lib", "licenses", "notices.json");

// Test tooling that npm lists only as an optional peer of next.
const SKIP = new Set(["playwright", "playwright-core", "@playwright/test"]);

const readJson = (f) => JSON.parse(readFileSync(f, "utf8"));

function licenseOf(p) {
  let l = p.license ?? (Array.isArray(p.licenses) ? p.licenses.map((x) => x.type ?? x).join(" OR ") : undefined);
  if (l && typeof l === "object") l = l.type;
  if (typeof l === "string" && /^Standard 'no charge' license/i.test(l)) return "GSAP-Standard";
  return typeof l === "string" && l.trim() ? l.trim() : "UNKNOWN";
}

function homeOf(p) {
  const repo = typeof p.repository === "string" ? p.repository : p.repository?.url;
  const raw = p.homepage || repo || "";
  const url = raw
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^github:/, "https://github.com/")
    .replace(/\.git(#.*)?$/, "")
    .replace(/^ssh:\/\/git@/, "https://");
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) return `https://github.com/${url}`;
  return /^https?:\/\//.test(url) ? url : "";
}

function authorOf(p) {
  const a = p.author;
  if (!a) return "";
  return typeof a === "string" ? a.replace(/\s*[<(].*$/, "").trim() : (a.name ?? "");
}

// Copyright lines are the per-package part of a licence; the rest of the
// text is shared and kept once per distinct body.
const COPY = /^\s*(\(c\)|©|copyright\b)/i;

function readLicense(dir) {
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt|markdown))?$/i.test(f) || /^licen[cs]e[-.]mit/i.test(f));
  if (!file) return null;
  const text = readFileSync(join(dir, file), "utf8").replace(/\r\n?/g, "\n").trim();
  const lines = text.split("\n");
  const copyright = lines.filter((l) => COPY.test(l)).map((l) => l.trim()).slice(0, 6);
  const body = lines
    .filter((l) => !COPY.test(l))
    .join("\n")
    .replace(/^#+\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { copyright, body };
}

function normalize(body) {
  return body.replace(/\s+/g, " ").replace(/^(the )?(mit|isc) licen[cs]e( \(mit\))?\s*/i, "").trim().toLowerCase();
}

// The standard texts differ between packages only in layout and headings;
// those are kept once under the licence's own name. Texts that add anything
// (extra notices, bundled third-party terms) are kept as written.
function canonical(license, body) {
  const flat = body.replace(/\s+/g, " ");
  if (/^MIT$/.test(license) && flat.length < 1300 && /Permission is hereby granted, free of charge/.test(flat)) return "MIT";
  if (/^ISC$/.test(license) && flat.length < 900) return "ISC";
  if (/^Apache-2\.0$/.test(license) && flat.length > 8000 && flat.length < 11500 && /TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION/.test(flat)) return "Apache-2.0";
  return null;
}

// A package offered under a choice of licences is used under the first
// permissive one ("MIT OR GPL-3.0-or-later" → MIT).
function chosen(license) {
  const m = /^\(?\s*(MIT|ISC|Apache-2\.0|BSD-[23]-Clause)\s+OR\s+/i.exec(license);
  return m ? m[1] : null;
}

function build() {
  const listed = execFileSync("npm", ["ls", "--omit=dev", "--all", "--parseable"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 })
    .trim()
    .split("\n")
    .slice(1);
  const seen = new Map();
  const standard = new Map();
  // The standard texts, read from packages that carry them verbatim, so a
  // package without a licence file (or used under one of two) points there.
  for (const [id, pkg] of [["MIT", "react"], ["Apache-2.0", "sharp"], ["ISC", "inherits"]]) {
    const lic = readLicense(join(root, "node_modules", pkg));
    if (lic) standard.set(id, lic.body);
  }
  const texts = [];
  const textIndex = new Map();
  for (const dir of [...new Set(listed)].sort()) {
    if (!existsSync(join(dir, "package.json"))) continue;
    const p = readJson(join(dir, "package.json"));
    if (!p.name || SKIP.has(p.name)) continue;
    const key = `${p.name}@${p.version}`;
    if (seen.has(key)) continue;
    let license = licenseOf(p);
    const lic = readLicense(dir);
    // No licence named in package.json, but the file is the MIT text.
    if (license === "UNKNOWN" && lic && canonical("MIT", lic.body)) license = "MIT";
    const usedAs = chosen(license);
    const add = (k, lic2, body) => {
      if (!textIndex.has(k)) {
        textIndex.set(k, texts.length);
        texts.push({ license: lic2, body });
      }
      return textIndex.get(k);
    };
    let text = -1;
    if (usedAs) text = standard.has(usedAs) ? add(`std:${usedAs}`, usedAs, standard.get(usedAs)) : -1;
    else if (lic && lic.body.length > 80) {
      const std = canonical(license, lic.body);
      if (std && !standard.has(std)) standard.set(std, lic.body);
      text = std ? add(`std:${std}`, std, standard.get(std)) : add(normalize(lic.body), license, lic.body);
    } else if (standard.has(license)) text = add(`std:${license}`, license, standard.get(license));
    seen.set(key, {
      name: p.name,
      version: p.version,
      license,
      ...(usedAs ? { usedAs } : {}),
      copyright: lic?.copyright.length ? lic.copyright : authorOf(p) ? [`Copyright (c) ${authorOf(p)}`] : [],
      url: homeOf(p),
      text,
    });
  }
  // The fonts next/font self-hosts (Inter, Onest, Poppins) are under the SIL
  // Open Font License, which has to travel with them.
  texts.push({ license: "OFL-1.1", body: readFileSync(join(root, "lib", "licenses", "OFL-1.1.txt"), "utf8").trim() });
  const packages = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  return { packages, texts };
}

const data = build();
const json = `${JSON.stringify(data, null, 1)}\n`;
if (process.argv.includes("--check")) {
  const now = existsSync(out) ? readFileSync(out, "utf8") : "";
  if (now !== json) {
    console.error("[licenses] lib/licenses/notices.json is out of date: run node scripts/gen-licenses.mjs");
    process.exit(1);
  }
  console.log(`[licenses] up to date: ${data.packages.length} packages, ${data.texts.length} licence texts`);
} else {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, json);
  console.log(`[licenses] wrote ${data.packages.length} packages, ${data.texts.length} licence texts`);
}
