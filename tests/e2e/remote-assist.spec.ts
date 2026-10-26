import { expect, test, type Browser, type Page, type WebSocketRoute } from "@playwright/test";
import { ADMIN, CALL_CENTER, CLIENT, mockBackend, signIn, type Mock } from "./mock";

// Remote assistance end to end (contract 2026-10-26), against a mocked
// backend: the operator and the client are two browsers; this file plays
// the server between them — REST answers, the session socket, and the
// events each side would get. No real backend is touched.

const TICKET = "t-ra-1";
const CALL = "c-ra-1";
const SID = "ra-s-1";
const OPERATOR = { id: CALL_CENTER.id, name: "Dilnoza Operator", lexgo_id: "LGC-77", role: "call_center" };
const CLIENT_PARTY = { id: CLIENT.id, name: CLIENT.name, lexgo_id: "LGC-55", role: "client" };

const ACTIONS: [string, string, string[], boolean][] = [
  ["route.navigate", "navigate", ["control", "guide", "prepare"], false],
  ["element.highlight", "highlight", ["control", "guide", "prepare"], false],
  ["element.tooltip", "tooltip", ["control", "guide", "prepare"], false],
  ["page.scroll_to", "scroll", ["control", "guide", "prepare"], false],
  ["element.focus", "focus", ["control", "prepare"], false],
  ["form.set_value", "form_fill", ["control", "prepare"], false],
  ["form.select_option", "form_select", ["control", "prepare"], false],
  ["form.toggle", "form_toggle", ["control", "prepare"], false],
  ["modal.open", "open_modal", ["control", "prepare"], false],
  ["step.next", "step_navigation", ["control", "prepare"], false],
  ["step.back", "step_navigation", ["control", "prepare"], false],
  ["draft.prepare", "prepare_draft", ["prepare"], true],
  ["confirmation.present", "present_confirmation", ["prepare"], true],
  ["editor.open", "navigate", ["control", "guide", "prepare"], false],
  ["editor.highlight", "highlight", ["control", "guide", "prepare"], false],
];
const CONTROL_SCOPES = ["focus", "form_fill", "form_select", "form_toggle", "highlight", "navigate", "open_modal", "personal_form_fill", "scroll", "step_navigation", "tooltip", "view_page_context"];
const meta = (caps: Record<string, boolean>) => ({
  contract_version: "1.0",
  consent_version: "1.0",
  modes: [
    { key: "guide", scopes: ["highlight", "navigate", "scroll", "tooltip", "view_page_context"] },
    { key: "control", scopes: CONTROL_SCOPES },
    { key: "prepare", scopes: [...CONTROL_SCOPES, "prepare_draft", "present_confirmation"] },
  ],
  actions: ACTIONS.map(([action_id, scope, modes, confirm]) => ({ action_id, scope, modes, component_required: action_id !== "route.navigate", requires_client_confirmation: confirm })),
  session: { max_minutes: 30, idle_pause_seconds: 90, command_ttl_seconds: 20 },
  security: { raw_dom: false, arbitrary_javascript: false, external_navigation: false, device_control: false, sensitive_values_shared: false, final_payment_by_operator: false },
  capabilities: caps,
});

type Cmd = Record<string, unknown> & { id: string; status: string };

// The server's view of one session, shared by both browsers.
function server() {
  const s = {
    status: "",
    mode: "control",
    reason: "",
    requested: [] as string[],
    granted: [] as string[],
    page: "",
    route: "",
    rev: 0,
    manifest: [] as unknown[],
    states: [] as string[],
    commands: [] as Cmd[],
    keys: new Map<string, Cmd>(),
    op: [] as WebSocketRoute[],
    cl: [] as WebSocketRoute[],
    endReason: "",
  };
  const session = (who: "op" | "client") => {
    const live = s.status === "active";
    return {
      id: SID,
      ticket_id: TICKET,
      call_id: CALL,
      client: CLIENT_PARTY,
      operator: OPERATOR,
      mode: s.mode,
      status: s.status,
      reason: s.reason,
      requested_scopes: s.requested,
      granted_scopes: s.granted,
      current_page_id: s.page,
      current_route: s.route,
      client_ui_revision: s.rev,
      manifest: s.manifest,
      consent_version: "1.0",
      duration_minutes: 20,
      created_at: new Date(Date.now() - 5000).toISOString(),
      expires_at: new Date(Date.now() + 20 * 60_000).toISOString(),
      last_client_seen_at: new Date().toISOString(),
      end_reason: s.endReason,
      capabilities:
        who === "op"
          ? { can_consent: false, can_pause: false, can_resume: false, can_revoke: false, can_command: live, can_end: s.status !== "ended" }
          : { can_consent: s.status === "pending_consent", can_pause: live, can_resume: s.status === "paused", can_revoke: true, can_command: false, can_end: true },
    };
  };
  const tell = (list: WebSocketRoute[], event: string, extra: Record<string, unknown>) => {
    for (const ws of list) ws.send(JSON.stringify({ event, ...extra, created_at: new Date().toISOString() }));
  };
  const both = (event: string) => {
    tell(s.op, event, { session: session("op") });
    tell(s.cl, event, { session: session("client") });
  };
  const socket = (who: "op" | "client") => (ws: WebSocketRoute) => {
    (who === "op" ? s.op : s.cl).push(ws);
    ws.send(JSON.stringify({ event: "remote_assist.connected", session: session(who) }));
    ws.onMessage((raw) => {
      const m = JSON.parse(String(raw)) as { event: string; payload?: Record<string, unknown> };
      if (m.event === "ping") return ws.send('{"event":"pong"}');
      if (who !== "client" || !m.payload) return;
      if (m.event === "client.state") {
        const p = m.payload;
        s.states.push(JSON.stringify(p));
        s.page = String(p.page_id);
        s.route = String(p.route);
        s.rev = Number(p.ui_revision);
        s.manifest = p.elements as unknown[];
        tell(s.op, "remote_assist.client_state", { payload: p });
      }
      if (m.event === "command.ack") {
        const c = s.commands.find((x) => x.id === m.payload?.command_id);
        if (!c) return;
        c.status = String(m.payload.status);
        c.failure_code = m.payload.failure_code;
        tell(s.op, `remote_assist.command_${c.status === "executed" ? "executed" : c.status}`, { payload: { command: c } });
      }
    });
  };
  return { s, session, both, socket };
}

async function opPage(browser: Browser, srv: ReturnType<typeof server>): Promise<{ page: Page; mock: Mock }> {
  const ctx = await browser.newContext({ colorScheme: "light" });
  const page = await ctx.newPage();
  const { s, session } = srv;
  // The console is opened from the support ticket after the call started.
  await page.addInitScript(
    ([ticketId, callId]) => {
      if (sessionStorage.getItem("lexgo_ra_console")) return;
      sessionStorage.setItem("lexgo_ra_calls", JSON.stringify({ [ticketId]: { callId, at: Date.now() } }));
      sessionStorage.setItem("lexgo_ra_console", JSON.stringify({ ticketId, callId, clientName: "Test Mijoz", workId: "SUP-1", sessionId: "", open: true }));
    },
    [TICKET, CALL],
  );
  const routes = await signIn(page, { ...CALL_CENTER, permissions: ["callcenter.access", "remote_assist.request", "remote_assist.guide", "remote_assist.control"] }, {
    "/remote-assistance/meta": meta({ request: true, guide: true, control: true, prepare: true, supervise: false, emergency_revoke: false }),
    "/remote-assistance/sessions/pending": { items: [], count: 0, limit: 20, offset: 0 },
    [`POST /call-center/support/tickets/${TICKET}/remote-assist/sessions`]: (body: unknown) => {
      const b = body as { mode: string; requested_scopes: string[]; reason: string; call_id: string };
      if (b.call_id !== CALL) return { status: 409, json: { detail: { code: "remote_assist_call_required" } } };
      s.status = "pending_consent";
      s.mode = b.mode;
      s.requested = b.requested_scopes;
      s.reason = b.reason;
      return { status: 201, json: session("op") };
    },
    [`/remote-assistance/sessions/${SID}`]: () => session("op"),
    [`/remote-assistance/sessions/${SID}/commands`]: () => ({ items: s.commands, count: s.commands.length }),
    [`/remote-assistance/sessions/${SID}/audit`]: () => ({
      items: [
        { id: "a1", event_type: "remote_assist.requested", actor: OPERATOR, metadata: { mode: s.mode }, created_at: new Date().toISOString(), previous_hash: "", event_hash: "9f2c1a0b7e" },
        { id: "a2", event_type: "remote_assist.consent_granted", actor: CLIENT_PARTY, metadata: { scopes: s.granted.length }, created_at: new Date().toISOString(), previous_hash: "9f2c1a0b7e", event_hash: "1b7d2e4c55" },
      ],
    }),
    [`POST /remote-assistance/sessions/${SID}/commands`]: (body: unknown) => {
      const b = body as Cmd & { idempotency_key: string; expected_ui_revision: number };
      const prev = s.keys.get(b.idempotency_key);
      if (prev) return { status: 201, json: prev };
      if (s.status !== "active") return { status: 409, json: { detail: { code: "remote_assist_session_not_active" } } };
      if (b.expected_ui_revision !== s.rev) return { status: 409, json: { detail: { code: "remote_assist_ui_revision_conflict" } } };
      const c: Cmd = { ...b, id: `cmd-${s.commands.length + 1}`, status: "pending", created_at: new Date().toISOString(), requires_confirmation: false };
      s.commands.push(c);
      s.keys.set(b.idempotency_key, c);
      for (const ws of s.cl) ws.send(JSON.stringify({ event: "remote_assist.command_requested", payload: { command: c } }));
      return { status: 201, json: c };
    },
    [`POST /remote-assistance/sessions/${SID}/end`]: () => {
      s.status = "ended";
      srv.both("remote_assist.ended");
      return session("op");
    },
  });
  const mock = await mockBackend(page, routes);
  await page.routeWebSocket(/\/ws\/remote-assistance\//, srv.socket("op"));
  return { page, mock };
}

async function clientPage(browser: Browser, srv: ReturnType<typeof server>): Promise<{ page: Page; mock: Mock }> {
  const ctx = await browser.newContext({ colorScheme: "light" });
  const page = await ctx.newPage();
  const { s, session, both } = srv;
  const routes = await signIn(page, CLIENT, {
    "/clients/me": { id: CLIENT.id, name: "Test Mijoz", phone: CLIENT.phone, email: "", region: "tashkent" },
    "/remote-assistance/meta": meta({ request: false, guide: false, control: false, prepare: false, supervise: false, emergency_revoke: false }),
    "/remote-assistance/sessions/pending": () => (s.status === "pending_consent" ? { items: [session("client")], count: 1, limit: 20, offset: 0 } : { items: [], count: 0, limit: 20, offset: 0 }),
    [`/remote-assistance/sessions/${SID}`]: () => session("client"),
    [`/remote-assistance/sessions/${SID}/commands`]: () => ({ items: s.commands, count: s.commands.length }),
    [`POST /remote-assistance/sessions/${SID}/consent`]: (body: unknown) => {
      const b = body as { decision: string; granted_scopes: string[]; device_session_id: string; consent_version: string };
      if (!b.device_session_id.startsWith("web-") || b.consent_version !== "1.0") return { status: 422, json: { detail: { code: "remote_assist_invalid_consent" } } };
      if (b.decision === "deny") {
        s.status = "denied";
        both("remote_assist.consent_denied");
        return session("client");
      }
      s.status = "active";
      s.granted = b.granted_scopes;
      both("remote_assist.consent_granted");
      return session("client");
    },
    [`POST /remote-assistance/sessions/${SID}/client-state`]: (body: unknown) => {
      const p = body as Record<string, unknown>;
      s.states.push(JSON.stringify(p));
      s.page = String(p.page_id);
      s.route = String(p.route);
      s.rev = Number(p.ui_revision);
      s.manifest = p.elements as unknown[];
      for (const ws of s.op) ws.send(JSON.stringify({ event: "remote_assist.client_state", payload: p }));
      return { ok: true };
    },
    [`POST /remote-assistance/sessions/${SID}/commands/[^/]+/ack`]: (body: unknown, url: URL) => {
      const id = url.pathname.split("/").at(-2);
      const c = s.commands.find((x) => x.id === id);
      if (c) c.status = String((body as { status: string }).status);
      return { ok: true };
    },
    [`POST /remote-assistance/sessions/${SID}/pause`]: () => {
      s.status = "paused";
      both("remote_assist.paused");
      return session("client");
    },
    [`POST /remote-assistance/sessions/${SID}/resume`]: () => {
      s.status = "active";
      both("remote_assist.resumed");
      return session("client");
    },
    [`POST /remote-assistance/sessions/${SID}/revoke`]: () => {
      s.status = "revoked";
      s.endReason = "Client stopped access";
      both("remote_assist.revoked");
      return session("client");
    },
  });
  const mock = await mockBackend(page, routes);
  await page.routeWebSocket(/\/ws\/remote-assistance\//, srv.socket("client"));
  return { page, mock };
}

test.describe.configure({ timeout: 180_000 });

test("operator asks, client consents to exact scopes, operator points and fills, client pauses, resumes and revokes", async ({ browser }) => {
  const srv = server();
  const op = await opPage(browser, srv);
  const cl = await clientPage(browser, srv);
  await cl.page.goto("/uz/portal/client/profile");
  await expect(cl.page.locator('[data-ai-id="profile.personal.edit"]')).toBeVisible();
  await op.page.goto("/uz");

  // Operator: mode + scopes come from /meta; only control is asked for.
  const con = op.page.locator(".ra-con");
  await expect(con).toBeVisible();
  await expect(con.getByText("Qo'ng'iroq faol")).toBeVisible();
  await con.getByRole("radio", { name: /Boshqarish/ }).click();
  await con.locator("label.ra-chip", { hasText: "Variant tanlash" }).click(); // the operator drops one scope
  await con.getByRole("textbox").first().fill("Profil ma'lumotlarini to'ldirishga yordam");
  await con.getByRole("button", { name: "Mijozdan ruxsat so'rash" }).click();
  await expect(con.getByText("Test Mijoz javobi kutilmoqda")).toBeVisible();
  expect(srv.s.requested).not.toContain("form_select");
  expect(srv.s.requested).toContain("personal_form_fill");

  // Client: the request arrives on the user socket; the sheet lists exactly what was asked.
  await cl.mock.push({ event: "remote_assist.requested", session_id: SID });
  const sheet = cl.page.getByRole("dialog", { name: "Operator ekraningizda yordam bermoqchi" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Dilnoza Operator");
  await expect(sheet).toContainText("LGC-77");
  await expect(sheet).toContainText("Boshqarish");
  await expect(sheet.locator(".ra-consent__scopes li")).toHaveCount(srv.s.requested.length);
  await expect(sheet).not.toContainText("Variant tanlash");
  await expect(sheet).toContainText("Parol, SMS kod, karta, elektron imzo");
  await expect(sheet).toContainText("Faqat LexGo sahifalari ichida");
  // The client keeps focus off (an optional scope) and allows the rest.
  await sheet.getByRole("switch", { name: "Maydonga o'tish" }).uncheck();
  if (process.env.RA_SHOTS) await cl.page.screenshot({ path: `${process.env.RA_SHOTS}/client-consent.png` });
  await sheet.getByRole("button", { name: "Ruxsat berish" }).click();
  await expect(sheet).toBeHidden();
  expect(srv.s.granted).not.toContain("focus");
  expect(srv.s.granted).toContain("form_fill");

  const bar = cl.page.getByRole("region", { name: "Masofaviy yordam" });
  await expect(bar).toContainText("Operator sizga yordam bermoqda");
  await expect(bar).toContainText("Dilnoza Operator");

  // The client opens the edit window; its fields reach the operator's mirror.
  await cl.page.locator('[data-ai-id="profile.personal.edit"]').click();
  const nameInput = cl.page.locator('[data-ai-id="profile.personal.full_name"]');
  await expect(nameInput).toBeVisible();
  const row = con.locator(".ra-el", { hasText: "profile.personal.full_name" });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText("Shaxsiy");

  // Highlight: a ring appears around the field on the client's screen.
  await row.getByRole("button", { name: /^Belgilash:/ }).click();
  await expect(cl.page.locator(".ra-ring")).toBeVisible();
  await expect.poll(() => srv.s.commands[0]?.status).toBe("executed");
  if (process.env.RA_SHOTS) await cl.page.screenshot({ path: `${process.env.RA_SHOTS}/client-active.png` });

  // Fill: the value goes through the page's own state, and never back out.
  await expect(row.getByRole("button", { name: /^Belgilash:/ })).toBeEnabled();
  await row.getByRole("button", { name: /^To'ldirish:/ }).click();
  await row.getByRole("textbox").fill("Ali Valiyev");
  await row.getByRole("button", { name: "Yuborish" }).click();
  await expect(nameInput).toHaveValue("Ali Valiyev");
  await expect.poll(() => srv.s.commands[1]?.status).toBe("executed");
  await expect.poll(() => srv.s.states.length).toBeGreaterThan(2);
  for (const st of srv.s.states) expect(st).not.toContain("Ali Valiyev");
  expect(srv.s.states.join("")).not.toMatch(/identity\.myid|password|cards/);
  if (process.env.RA_SHOTS) await op.page.screenshot({ path: `${process.env.RA_SHOTS}/operator-console.png` });

  // Commands tab shows both, done.
  await con.getByRole("tab", { name: /Buyruqlar/ }).click();
  await expect(con.locator(".ra-cmd")).toHaveCount(2);
  await expect(con.locator(".ra-cmd").first()).toContainText("Bajarildi");
  await con.getByRole("tab", { name: /Audit/ }).click();
  await expect(con.locator(".ra-audit li")).toHaveCount(2);
  await expect(con).toContainText("#1b7d2e4c55");
  await con.getByRole("tab", { name: /Ekran/ }).click();

  // Pause: the operator's controls go dead until the client resumes.
  await bar.getByRole("button", { name: "To'xtatish" }).click();
  await expect(bar).toContainText("Yordam to'xtatilgan");
  await expect(con.getByText("Mijoz yordamni to'xtatdi")).toBeVisible();
  await expect(row.getByRole("button", { name: /^Belgilash:/ })).toBeDisabled();
  await bar.getByRole("button", { name: "Davom ettirish" }).click();
  await expect(bar).toContainText("Operator sizga yordam bermoqda");
  await expect(row.getByRole("button", { name: /^Belgilash:/ })).toBeEnabled();

  // Revoke: both sides end.
  await bar.getByRole("button", { name: "Ruxsatni olib qo'yish" }).click();
  await expect(cl.page.getByText("Ruxsat olib qo'yildi")).toBeVisible();
  await expect(bar).toBeHidden();
  await expect(con.getByText("Mijoz ruxsatni olib qo'ydi.")).toBeVisible();
  expect(op.mock.refused).toEqual([]);
  expect(cl.mock.refused).toEqual([]);
});

test("a denied request ends on both sides and nothing is shared", async ({ browser }) => {
  const srv = server();
  const op = await opPage(browser, srv);
  const cl = await clientPage(browser, srv);
  await cl.page.goto("/uz/portal/client/profile");
  await op.page.goto("/uz");
  const con = op.page.locator(".ra-con");
  await con.getByRole("textbox").first().fill("Sahifani ko'rsatish");
  await con.getByRole("button", { name: "Mijozdan ruxsat so'rash" }).click();
  await expect(con.getByText("javobi kutilmoqda")).toBeVisible();
  await cl.mock.push({ event: "remote_assist.requested" });
  const sheet = cl.page.getByRole("dialog", { name: "Operator ekraningizda yordam bermoqchi" });
  await expect(sheet).toContainText("Yo'l ko'rsatish");
  await sheet.getByRole("button", { name: "Rad etish" }).click();
  await expect(sheet).toBeHidden();
  await expect(con.getByText("Mijoz ruxsat bermadi.")).toBeVisible();
  await expect(cl.page.getByRole("region", { name: "Masofaviy yordam" })).toHaveCount(0);
  expect(srv.s.states).toEqual([]);
  expect(srv.s.granted).toEqual([]);
});

test("a supervisor sees the counters and emergency-revokes with a reason", async ({ page }) => {
  let revoked: unknown = null;
  const live = {
    id: SID,
    ticket_id: TICKET,
    call_id: CALL,
    client: CLIENT_PARTY,
    operator: OPERATOR,
    mode: "control",
    status: "active",
    reason: "Obuna shaklini to'ldirish",
    requested_scopes: ["view_page_context", "highlight", "form_fill"],
    granted_scopes: ["view_page_context", "highlight"],
    current_page_id: "client.subscription",
    current_route: "/portal/client/subscription",
    client_ui_revision: 14,
    created_at: "2026-10-26T09:10:00Z",
    expires_at: "2026-10-26T09:30:00Z",
  };
  const routes = await signIn(page, ADMIN, {
    "/remote-assistance/meta": meta({ request: true, guide: true, control: true, prepare: true, supervise: true, emergency_revoke: true }),
    "/remote-assistance/sessions/pending": { items: [], count: 0 },
    "/admin/remote-assistance/monitoring": { active: 1, pending_consent: 2, paused: 0, total_today: 7, rejected_commands_today: 3, sessions: [live] },
    "/admin/remote-assistance/sessions": { items: [live, { ...live, id: "ra-s-0", status: "denied", granted_scopes: [], client: { ...CLIENT_PARTY, name: "Boshqa Mijoz" } }], count: 2, limit: 50, offset: 0 },
    [`/remote-assistance/sessions/${SID}/audit`]: { items: [{ id: "a1", event_type: "remote_assist.requested", actor: OPERATOR, metadata: { mode: "control" }, created_at: "2026-10-26T09:10:00Z", previous_hash: "", event_hash: "abcdef123456789" }] },
    [`POST /admin/remote-assistance/sessions/${SID}/emergency-revoke`]: (body: unknown) => ((revoked = body), { ...live, status: "revoked" }),
  });
  const mock = await mockBackend(page, routes);
  await page.goto("/uz/admin/remote-assistance");
  await expect(page.getByRole("heading", { name: "Masofaviy yordam", level: 2 })).toBeVisible();
  const tiles = page.locator(".raa-tiles");
  await expect(tiles).toContainText("7");
  await expect(tiles).toContainText("3");
  await page.locator(".raa-row__head").first().click();
  await expect(page.locator(".raa-row.open")).toContainText("#abcdef123456");
  await page.locator(".raa-row.open").getByRole("button", { name: "Favqulodda to'xtatish" }).click();
  const dialog = page.getByRole("dialog", { name: "Sessiyani favqulodda to'xtatasizmi?" });
  const go = dialog.getByRole("button", { name: "Favqulodda to'xtatish" });
  await expect(go).toBeDisabled();
  await dialog.getByRole("textbox").fill("Xavfsizlik hodisasi");
  await go.click();
  await expect.poll(() => revoked).toEqual({ reason: "Xavfsizlik hodisasi" });
  expect(mock.refused).toEqual([]);
});
