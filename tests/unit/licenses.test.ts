import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import notices from "@/lib/licenses/notices.json";

// Launch checklist items 11 and 23: what LexGo ships is listed with its
// licence on /legal/licenses, and nothing copyleft slips in unnoticed.
type Pkg = { name: string; version: string; license: string; usedAs?: string; copyright: string[]; url: string; text: number };
const PACKAGES = notices.packages as Pkg[];
const root = join(__dirname, "..", "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { dependencies: Record<string, string> };

// Reviewed one by one (see the audit): libvips is LGPL but runs only on the
// server inside sharp and is never sent to a browser; GSAP has its own
// no-charge licence; protobuf's licence is named in package.json only.
const REVIEWED = new Set(["@img/sharp-libvips-linux-x64", "@img/sharp-libvips-linuxmusl-x64", "gsap", "@bufbuild/protobuf"]);

describe("open-source notices", () => {
  it("list every direct dependency", () => {
    const names = new Set(PACKAGES.map((p) => p.name));
    for (const dep of Object.keys(pkg.dependencies)) expect(names, dep).toContain(dep);
  });

  it("give every package a licence text, or one reviewed by hand", () => {
    const missing = PACKAGES.filter((p) => p.text < 0 && !REVIEWED.has(p.name)).map((p) => p.name);
    expect(missing).toEqual([]);
    for (const p of PACKAGES) if (p.text >= 0) expect(notices.texts[p.text].body.length, p.name).toBeGreaterThan(200);
  });

  it("carry no copyleft licence except the reviewed server-only one, and use dual licences on their permissive side", () => {
    const copyleft = PACKAGES.filter((p) => /\b(A?GPL|LGPL|MPL|EPL|CDDL|SSPL)/i.test(p.license));
    for (const p of copyleft) {
      if (REVIEWED.has(p.name)) continue;
      expect(p.usedAs, `${p.name} (${p.license})`).toMatch(/^(MIT|ISC|Apache-2\.0|BSD-[23]-Clause)$/);
    }
    expect(PACKAGES.some((p) => p.license === "UNKNOWN")).toBe(false);
  });

  it("include the font licence that must travel with the self-hosted fonts", () => {
    expect(notices.texts.some((t) => t.license === "OFL-1.1" && /SIL Open Font License/.test(t.body))).toBe(true);
    expect(readFileSync(join(root, "public", "fonts", "LICENSE.txt"), "utf8")).toMatch(/Bitstream Vera/);
  });

  it("match the installed packages' versions for the direct dependencies", () => {
    for (const dep of Object.keys(pkg.dependencies)) {
      const installed = JSON.parse(readFileSync(join(root, "node_modules", dep, "package.json"), "utf8")) as { version: string };
      expect(PACKAGES.some((p) => p.name === dep && p.version === installed.version), `${dep}@${installed.version}: run node scripts/gen-licenses.mjs`).toBe(true);
    }
  });
});

// Launch checklist item 8: every <img> and next/image in the app names its
// alt text — a description, or alt="" when the picture is decoration.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

describe("alt text", () => {
  it("is written on every image tag in app/ and components/", () => {
    const bad: string[] = [];
    for (const f of [...files(join(root, "app")), ...files(join(root, "components"))]) {
      // Comments may name a tag in prose; they are not markup.
      const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const m of src.matchAll(/<(img|Image)\s/g)) {
        // The tag runs to the first ">" outside a {…} expression.
        let depth = 0;
        let end = m.index + m[0].length;
        for (; end < src.length; end++) {
          const c = src[end];
          if (c === "{") depth++;
          else if (c === "}") depth--;
          else if (c === ">" && depth === 0) break;
        }
        const tag = src.slice(m.index, end + 1);
        if (!/\balt=/.test(tag)) bad.push(`${f.slice(root.length + 1)}: ${tag.slice(0, 80)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
