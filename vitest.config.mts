import { defineConfig } from "vitest/config";

// Unit tests for the frontend's own rules: what it detects, parses and
// decides from backend data. Browser flows live in tests/e2e (Playwright).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // next-intl imports "next/navigation" without an extension, which Node's
    // ESM loader rejects; let Vite resolve it instead.
    server: { deps: { inline: ["next-intl"] } },
  },
});
