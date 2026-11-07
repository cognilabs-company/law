import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The first version of the landing froze the browser in production ("page not
// responding"). Forced style recalculation is very slow on this site because of the
// size of globals.css, and each of these GSAP features forces it again and again.
// See "Animation and media" in docs/PERFORMANCE.md.

const dir = "components/landing/motion";
const motion = readdirSync(dir).map((f) => ({ file: f, text: readFileSync(join(dir, f), "utf8") }));
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("landing motion stays cheap", () => {
  it("never pins with ScrollTrigger: sections are held with CSS sticky", () => {
    for (const { file, text } of motion) expect(code(text), file).not.toMatch(/\bpin\s*:/);
  });

  it("never tweens clipPath through GSAP's string parser", () => {
    for (const { file, text } of motion) expect(code(text), file).not.toMatch(/\bclipPath\s*:/);
  });

  it("does not use SplitText", () => {
    for (const { file, text } of motion) expect(code(text), file).not.toMatch(/SplitText/);
    expect(readFileSync("components/landing/LandingMotion.tsx", "utf8")).not.toMatch(/SplitText/);
  });

  it("leaves refreshing to LandingMotion", () => {
    for (const { file, text } of motion) {
      // The stair rebuilds itself when a rotated tablet crosses into its other composition.
      if (file === "stages.ts") continue;
      expect(code(text), file).not.toMatch(/ScrollTrigger\.refresh\(/);
    }
  });

  it("refreshes only on a real resize, not on load or on returning to the tab", () => {
    expect(readFileSync("components/landing/LandingMotion.tsx", "utf8")).toMatch(/autoRefreshEvents:\s*"resize"/);
  });
});

describe("the home page's markup that tests and the shell rely on", () => {
  it("keeps exactly one hero, with its tags", () => {
    const hero = readFileSync("components/landing/LandingHero.tsx", "utf8");
    expect(hero).toMatch(/className="hero lh-hero"/);
    expect(hero).toMatch(/hero__tags/);
  });
});
