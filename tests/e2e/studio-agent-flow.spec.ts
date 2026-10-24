import { expect, test } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";
import studio from "./fixtures/studio-k17.json";

// The Studio AI agent: the latest tasks sit in a dock at the top, one click
// apart, and the open task's work reads as a pipeline with what it is
// doing right now.
const SHOTS = "/tmp/claude-1000/-home-abdurahmon-Desktop-law/1b23aff7-656c-46a8-a16f-81213b23ff98/scratchpad/shots";
const iso = (s: number) => new Date(Date.now() - s * 1000).toISOString();
const tool = (name: string, s: number, ok = true) => ({ tool: name, status: ok ? "ok" : "error", ok, duration_ms: 800 + s * 10, at: iso(s) });
const running = {
  id: "job-run",
  status: "running",
  stage: "legal_research",
  progress_percent: 38,
  prompt: "Oila huquqi xizmatlari",
  constructor_codes: ["K17"],
  target_drafts: 3,
  saved_count: 0,
  requested_at: iso(300),
  tool_call_count: 5,
  sources: [{ title: "Oila kodeksi", url: "https://lex.uz/docs/104723", official: true }],
  drafts: [],
  tool_history: [tool("list_studio_constructors", 240), tool("get_constructor_contract", 200), tool("search_existing_catalog", 150), tool("search_official_legal_sources", 60), tool("read_legal_source", 10)],
};
const done = { ...running, id: "job-done", status: "completed", stage: "completed", progress_percent: 100, saved_count: 3, draft_count: 3, requested_at: iso(86400), tool_history: [tool("save_studio_draft", 86000)] };

test("the task dock opens a task in one click and the pipeline shows where it is", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    localStorage.setItem(
      "lexgo:studio-agent:u-admin",
      JSON.stringify({
        current: "job-run",
        recent: [
          { id: "job-run", at: new Date().toISOString(), codes: ["K17"], drafts: 3 },
          { id: "job-done", at: new Date(Date.now() - 86400000).toISOString(), codes: [], drafts: 3 },
        ],
      }),
    );
  });
  const routes = await signIn(page, ADMIN, {
    "/studio/constructors": studio.constructors,
    "/studio/ai/agent-jobs/job-run": running,
    "/studio/ai/agent-jobs/job-done": done,
  });
  await mockBackend(page, routes);
  await page.goto("/uz/admin/studio/ai");
  const dock = page.locator(".sx-agd");
  await expect(dock.locator(".sx-agd__job")).toHaveCount(2);
  await expect(dock.locator(".sx-agd__job[aria-current=true]")).toContainText("Ishlamoqda");
  await expect(dock.locator(".sx-agd__job").nth(1)).toContainText("3/3 qoralama");
  const flow = page.locator(".sx-agf");
  await expect(flow.locator(".sx-agf__step[data-state=now]")).toContainText("Tadqiqot");
  await expect(flow.locator(".sx-agf__step[data-state=now]")).toContainText("Rasmiy huquqiy manbalar qidirilmoqda");
  await expect(flow.locator(".sx-agf__step[data-state=done]")).toHaveCount(1);
  await expect(flow.locator(".sx-agf__feed li").first()).toContainText("Huquqiy manbani o'qish");
  await page.screenshot({ path: `${SHOTS}/agent-running.png` });

  await dock.locator(".sx-agd__job").nth(1).click();
  await expect(flow.locator(".sx-agf__step[data-state=done]")).toHaveCount(5);
  await page.screenshot({ path: `${SHOTS}/agent-done.png` });
});
