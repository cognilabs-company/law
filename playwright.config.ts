import { defineConfig } from "@playwright/test";

// Browser tests of the main role flows against a mocked backend
// (tests/e2e/mock.ts): no request reaches the real API, so nothing is
// written and no money moves. Uses the system Chrome; no browser download.
const PORT = 3120;

export default defineConfig({
  testDir: "tests/e2e",
  testIgnore: /[\\/](advocate-practice|callcenter-cancellation|cancellation-flow|cockpit|complaint-hold|contact-sla|design-audit-shots|double-submit|escalation|experience|orders-answers-shots|payouts|permissions-shots|redesign-tour|remote-assist|resolution-choice|role-menus|support-queue|warranty)\.spec\.ts$/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "test-results/e2e-report" }]],
  outputDir: "test-results/e2e",
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    locale: "ru-RU",
    colorScheme: "dark",
    viewport: { width: 1360, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/ru`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
