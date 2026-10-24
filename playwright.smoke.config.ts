import { defineConfig } from "@playwright/test";

// Read-only checks against a deployed site (tests/smoke). No dev server.
export default defineConfig({
  testDir: "tests/smoke",
  timeout: 60_000,
  workers: 2,
  reporter: [["list"]],
  outputDir: "test-results/smoke",
  use: { channel: "chrome", locale: "uz-UZ" },
});
