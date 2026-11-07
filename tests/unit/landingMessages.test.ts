import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The home landing's copy lives in the `landing` namespace. Nothing else checks
// that the three catalogues stay in step, and a missing key does not throw in
// production: it just prints the key's last segment on the page.

type Tree = Record<string, unknown>;
const landing = (l: string): Tree => (JSON.parse(readFileSync(`messages/${l}.json`, "utf8")) as { landing: Tree }).landing;

const paths = (o: unknown, prefix = ""): string[] => {
  if (Array.isArray(o)) return o.flatMap((v, i) => paths(v, `${prefix}[${i}]`));
  if (o && typeof o === "object") return Object.entries(o).flatMap(([k, v]) => paths(v, prefix ? `${prefix}.${k}` : k));
  return [prefix];
};
const strings = (o: unknown): string[] => {
  if (typeof o === "string") return [o];
  if (Array.isArray(o)) return o.flatMap(strings);
  if (o && typeof o === "object") return Object.values(o).flatMap(strings);
  return [];
};

const LOCALES = ["uz", "ru", "en"] as const;

describe("landing copy", () => {
  it("has the same keys in every language", () => {
    const expected = paths(landing("en")).sort();
    for (const l of LOCALES) expect(paths(landing(l)).sort()).toEqual(expected);
  });

  it("has no empty strings", () => {
    for (const l of LOCALES) expect(strings(landing(l)).filter((s) => !s.trim())).toEqual([]);
  });

  it("does not repeat claims the launch compliance audit removed", () => {
    const banned = [
      /\b14\b/, // "14 regions": the code lists fewer
      /24\/7/,
      /o'qitilgan|обученн|trained on/i,
      /5 (daqiqa|минут|minutes)/i,
      /g'alaba uchun|для победы|you need to win/i,
      /\bilova\b|приложени|\bmobile app\b/i, // no public app can be verified yet
    ];
    for (const l of LOCALES) {
      for (const s of strings(landing(l))) {
        for (const re of banned) expect(s, `${l}: ${s}`).not.toMatch(re);
      }
    }
  });
});

describe("landing images", () => {
  it("are not named like the client dashboard's hero rotation", () => {
    // next.config.ts feeds public/img/hero-img-<n>.* into the portal dashboard.
    const files = readdirSync("public/img/landing");
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(f).not.toMatch(/^hero-img-\d+/);
  });
});
