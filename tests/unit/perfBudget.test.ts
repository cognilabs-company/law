import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Guards for the performance fixes of 2026-10-25 (docs/PERFORMANCE.md):
// what every page pays for must stay small, heavy features must stay behind
// a dynamic import, and every app shell must answer a navigation at once.

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

// --- static import graph ---------------------------------------------------
// `import x from`, `import {x} from`, `export … from` and side-effect imports;
// `import type` and dynamic import() (next/dynamic, lazy) are not edges.
const IMPORT_RE = /^\s*(?:import|export)\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']/gm;

function resolveLocal(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(ROOT, spec.slice(2)) : path.resolve(path.dirname(from), spec);
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

// Every package and local file reachable from `entry` by static imports, with
// the chain that reaches it.
function staticGraph(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const queue: Array<[string, string[]]> = [[path.join(ROOT, entry), [entry]]];
  while (queue.length) {
    const [file, chain] = queue.shift()!;
    if (seen.has(file)) continue;
    seen.set(file, chain);
    if (!/\.(ts|tsx)$/.test(file)) continue;
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[1];
      if (spec.startsWith(".") || spec.startsWith("@/")) {
        const next = resolveLocal(file, spec);
        if (next && !seen.has(next)) queue.push([next, [...chain, path.relative(ROOT, next)]]);
      } else if (!seen.has(`pkg:${spec}`)) {
        seen.set(`pkg:${spec}`, [...chain, spec]);
      }
    }
  }
  return seen;
}

// Loaded on every page (root layout) or on every portal/admin page (shells,
// the shared modal). three.js + the robot (~1 MB) and LiveKit + the call room
// (~600 KB) must load only where they are used, through a dynamic import.
const EVERY_PAGE = ["app/[locale]/layout.tsx", "components/portal/PortalShell.tsx", "components/admin/AdminShell.tsx", "components/admin/Modal.tsx"];
const HEAVY = [/^pkg:three($|\/)/, /^pkg:@react-three\//, /^pkg:livekit-client/, /^pkg:@livekit\//, /components\/chat\/CallRoom\.tsx$/, /components\/lexgo\/robot\/RobotCanvas\.tsx$/];

describe("bundle budget: what every page loads", () => {
  for (const entry of EVERY_PAGE) {
    it(`${entry} reaches no heavy module statically`, () => {
      const graph = staticGraph(entry);
      const hits = [...graph.entries()].filter(([k]) => HEAVY.some((re) => re.test(k))).map(([, chain]) => chain.join(" → "));
      expect(hits).toEqual([]);
    });
  }

  it("the root layout does not serialize the messages into every page", () => {
    const src = read("app/[locale]/layout.tsx");
    expect(src).toMatch(/<NextIntlClientProvider[^>]*messages=\{null\}/);
    expect(src).not.toMatch(/getMessages\(/);
    // …and nothing else hands the whole catalogue to a client provider.
    expect(read("components/IntlProvider.tsx")).not.toMatch(/useMessages\(/);
  });
});

// --- navigation feedback ---------------------------------------------------
function layoutsUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = path.join(dir, name);
    if (statSync(path.join(ROOT, rel)).isDirectory()) out.push(...layoutsUnder(rel));
    else if (name === "layout.tsx") out.push(rel);
  }
  return out;
}

describe("navigation answers at once", () => {
  it("every layout under app/[locale] has a loading.tsx beside it", () => {
    const missing = layoutsUnder("app/[locale]").filter((l) => !existsSync(path.join(ROOT, path.dirname(l), "loading.tsx")));
    expect(missing).toEqual([]);
  });

  it("the shared Link and router carry the pending signal", () => {
    const src = read("i18n/navigation.ts");
    expect(src).toMatch(/NavPendingSignal/);
    expect(src).toMatch(/startNavPending\(\)/);
    expect(read("app/[locale]/layout.tsx")).toMatch(/<NavProgress \/>/);
  });
});

// --- the robot companion -----------------------------------------------------
describe("robot companion stays light", () => {
  it("production loads the web copy of the model, within budget", () => {
    expect(read("components/lexgo/robot/robot-config.ts")).toMatch(/"production" \? "\/models\/lexgo-robot\.web\.glb"/);
    expect(statSync(path.join(ROOT, "public/models/lexgo-robot.web.glb")).size).toBeLessThan(2.5 * 1024 * 1024);
  });

  it("the model is not fetched at module load, and the canvas pauses while scrolling", () => {
    expect(read("components/lexgo/robot/LexGoRobot.tsx")).toMatch(/dynamic\(\(\) => import\("\.\/RobotCanvas"\)/);
    expect(read("components/lexgo/robot/RobotCanvas.tsx")).toMatch(/frameloop=\{paused \? "never" : "always"\}/);
  });
});
