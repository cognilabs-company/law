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

// Screenshot runs only: RA_DARK=1 for the dark theme, RA_NARROW=1 for a phone width.
const LOOK = { colorScheme: process.env.RA_DARK ? ("dark" as const) : ("light" as const), ...(process.env.RA_NARROW ? { viewport: { width: 420, height: 860 } } : {}) };

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
  const ctx = await browser.newContext(LOOK);
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
      if ((b.payload as { route?: string } | undefined)?.route === "/portal/client/gifts") return { status: 409, json: { detail: { code: "remote_assist_sensitive_route_blocked" } } };
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
  const ctx = await browser.newContext(LOOK);
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

// The call link (lib/remoteAssist/callLink.ts) in place of LiveKit: data
// messages and the share's on/mute state are relayed between the two
// browsers by this file, and getDisplayMedia hands back a canvas stream.
async function linkPages(a: Page, aId: string, b: Page, bId: string): Promise<void> {
  const relay = (to: Page, from: string) => async (json: string) => {
    await to.evaluate(([j, f]) => (window as unknown as { __raIn?: (j: string, f: string) => void }).__raIn?.(j, f), [json, from] as const).catch(() => {});
  };
  await a.exposeFunction("__raRelayOut", relay(b, aId));
  await b.exposeFunction("__raRelayOut", relay(a, bId));
  for (const [page, self] of [[a, aId], [b, bId]] as const) {
    // The dev server's issue badge sits bottom-left, over the console.
    await page.addInitScript(() => {
      const css = document.createElement("style");
      css.textContent = "nextjs-portal{display:none!important}";
      document.addEventListener("DOMContentLoaded", () => document.head.appendChild(css));
    });
    await page.addInitScript((me: string) => {
      type Fn = (...a: unknown[]) => void;
      const w = window as unknown as Record<string, unknown>;
      const wire = new Set<Fn>();
      const change = new Set<Fn>();
      let local = { on: false, hidden: false, surface: "", tab: "" };
      let remote = { on: false, muted: false };
      let stream: MediaStream | null = null;
      const emit = () => change.forEach((f) => f());
      const out = (o: unknown) => void (w.__raRelayOut as (j: string) => Promise<void>)(JSON.stringify(o));
      const picture = () => {
        if (stream) return stream;
        const c = document.createElement("canvas");
        c.width = 1280;
        c.height = 720;
        const g = c.getContext("2d") as CanvasRenderingContext2D;
        const draw = () => {
          g.fillStyle = "#eef4ff";
          g.fillRect(0, 0, 1280, 720);
          g.fillStyle = "#0b3b8c";
          g.fillRect(0, 0, 1280, 84);
          g.fillStyle = "#fff";
          g.font = "bold 34px sans-serif";
          g.fillText("LexGo", 40, 54);
          g.fillStyle = "#0b1b3a";
          g.font = "bold 44px sans-serif";
          g.fillText("Profil", 80, 180);
          g.fillStyle = "#fff";
          g.fillRect(80, 230, 700, 70);
          g.fillRect(80, 330, 700, 70);
          g.fillStyle = "#1f6feb";
          g.fillRect(80, 440, 260, 64);
          g.fillStyle = "#94a3b8";
          g.fillRect(860 + ((Date.now() / 20) % 200), 230, 120, 12);
        };
        draw();
        setInterval(draw, 100);
        stream = c.captureStream(10);
        return stream;
      };
      const video = { attach: (el: HTMLVideoElement) => ((el.srcObject = picture()), void el.play().catch(() => {})), detach: (el: HTMLVideoElement) => void (el.srcObject = null) };
      w.__raIn = (json: string, from: string) => {
        const m = JSON.parse(json) as { __track?: string };
        if (m.__track) {
          remote = { on: m.__track !== "off", muted: m.__track === "mute" };
          return emit();
        }
        wire.forEach((f) => f(m, from));
      };
      navigator.mediaDevices.getDisplayMedia = async () => {
        if (w.__raDenyShare) throw new DOMException("Permission denied", "NotAllowedError");
        return picture();
      };
      w.__raTestLink = {
        self: () => me,
        send: (msg: unknown) => out(msg),
        onWire: (fn: Fn) => (wire.add(fn), () => wire.delete(fn)),
        onChange: (fn: Fn) => (change.add(fn), () => change.delete(fn)),
        startShare: async () => {
          await navigator.mediaDevices.getDisplayMedia({ video: true });
          // __raWrongTab: the person picked some other LexGo tab in the browser's picker.
          local = { on: true, hidden: false, surface: "browser", tab: w.__raWrongTab ? "lexgo-tab-someoneelse" : "" };
          out({ __track: "on" });
          emit();
          return "browser";
        },
        stopShare: async () => {
          local = { on: false, hidden: false, surface: "", tab: "" };
          out({ __track: "off" });
          emit();
        },
        setShareHidden: async (h: boolean) => {
          local = { ...local, hidden: h };
          out({ __track: h ? "mute" : "on" });
          emit();
        },
        localShare: () => local,
        remoteShare: () => ({ video: remote.on ? video : null, muted: remote.muted }),
      };
    }, self);
  }
}

const shot = async (page: Page, name: string) => {
  if (!process.env.RA_SHOTS) return;
  await page.waitForTimeout(400); // let the entry animation finish
  await page.screenshot({ path: `${process.env.RA_SHOTS}/${name}.png` });
};

test("one click to ask, one to allow: the operator sees the tab, draws, opens pages; marks fade; privacy hides; pause, resume, stop", async ({ browser }) => {
  const srv = server();
  const op = await opPage(browser, srv);
  const cl = await clientPage(browser, srv);
  await linkPages(op.page, CALL_CENTER.id, cl.page, CLIENT.id);
  await cl.page.goto("/uz/portal/client/profile");
  await expect(cl.page.locator('[data-ai-id="profile.personal.edit"]')).toBeVisible();
  await op.page.goto("/uz");

  // Operator: one button; the widest mode with all its scopes is asked for.
  const con = op.page.locator(".ra-con");
  await expect(con).toBeVisible();
  await expect(con.getByText("Qo'ng'iroq faol")).toBeVisible();
  await expect(con.locator(".ra-req")).toContainText("Tayyorlash");
  await shot(op.page, "operator-request");
  await con.getByRole("button", { name: "Mijozdan ruxsat so'rash" }).click();
  await expect(con.getByText("Test Mijoz javobi kutilmoqda")).toBeVisible();
  expect(srv.s.mode).toBe("prepare");
  expect(srv.s.requested).toContain("personal_form_fill");
  expect(srv.s.requested).toContain("form_select");
  expect(srv.s.reason).toBe("Mijozga sayt ichida yordam berish");

  // Client: a simple sheet, one Allow that grants exactly what was asked.
  await cl.mock.push({ event: "remote_assist.requested", session_id: SID });
  const sheet = cl.page.getByRole("dialog", { name: "Ekraningizda yordam bersinmi?" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Dilnoza Operator");
  await expect(sheet).toContainText("LexGo yordam xizmati");
  await expect(sheet).toContainText("Parol, SMS kod, karta");
  await expect(sheet.getByRole("switch")).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Ruxsat berish" })).toBeFocused();
  await shot(cl.page, "client-consent");
  await sheet.getByRole("button", { name: "Ruxsat berish" }).click();
  await expect(sheet).toBeHidden();
  expect([...srv.s.granted].sort()).toEqual([...srv.s.requested].sort());

  // The share starts by itself; the operator sees the picture large.
  const bar = cl.page.getByRole("region", { name: "Masofaviy yordam" });
  await expect(bar).toContainText("Dilnoza Operator yordam bermoqda");
  await expect(bar).toContainText("Ekraningiz operatorga ko'rinmoqda");
  const screen = con.locator(".ra-scr");
  await expect(screen).toHaveAttribute("data-state", "live");
  await expect.poll(() => screen.locator("video").evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
  await expect(screen.locator(".ra-scr__head")).toContainText("Profil");

  // Arrow: drag on the picture; it shows on the client's own page, then fades by 3 s.
  await screen.getByRole("radio", { name: "Strelka" }).click();
  const frame = screen.locator(".ra-scr__frame");
  const fb = (await frame.boundingBox())!;
  await op.page.mouse.move(fb.x + fb.width * 0.3, fb.y + fb.height * 0.3);
  await op.page.mouse.down();
  await op.page.mouse.move(fb.x + fb.width * 0.5, fb.y + fb.height * 0.5, { steps: 6 });
  await op.page.mouse.up();
  const clientMarks = cl.page.locator(".ra-mk--fixed .ra-mk__g");
  await expect(clientMarks).toHaveCount(1);
  await expect(clientMarks.first()).toHaveAttribute("data-tool", "arrow");
  await expect(screen.locator(".ra-mk__g")).toHaveCount(1);
  await shot(op.page, "operator-live");
  await shot(cl.page, "client-mark");
  await expect(clientMarks).toHaveCount(0, { timeout: 4500 });
  await expect(screen.locator(".ra-mk__g")).toHaveCount(0);

  // A circle, then Clear wipes both sides at once.
  await screen.getByRole("radio", { name: "Doira" }).click();
  await screen.getByRole("radio", { name: "To'q sariq" }).click();
  await op.page.mouse.move(fb.x + fb.width * 0.2, fb.y + fb.height * 0.4);
  await op.page.mouse.down();
  await op.page.mouse.move(fb.x + fb.width * 0.4, fb.y + fb.height * 0.6, { steps: 4 });
  await op.page.mouse.up();
  await expect(cl.page.locator(".ra-mk--fixed .ra-mk--warm")).toHaveCount(1);
  await screen.getByRole("button", { name: "Tozalash" }).click();
  await expect(clientMarks).toHaveCount(0);

  // The component mirror still drives fills; values never go back out.
  await cl.page.locator('[data-ai-id="profile.personal.edit"]').click();
  const nameInput = cl.page.locator('[data-ai-id="profile.personal.full_name"]');
  await expect(nameInput).toBeVisible();
  await con.getByRole("tab", { name: /Elementlar/ }).click();
  const row = con.locator(".ra-el", { hasText: "profile.personal.full_name" });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: /^To'ldirish:/ }).click();
  await row.getByRole("textbox").fill("Ali Valiyev");
  await row.getByRole("button", { name: "Yuborish" }).click();
  await expect(nameInput).toHaveValue("Ali Valiyev");
  for (const st of srv.s.states) expect(st).not.toContain("Ali Valiyev");
  await cl.page.keyboard.press("Escape");
  // Let the client's page settle so the next command matches its revision.
  let seen = -1;
  await expect
    .poll(
      () => {
        const same = srv.s.states.length === seen;
        seen = srv.s.states.length;
        return same;
      },
      { intervals: [1000] },
    )
    .toBe(true);

  // Page picker: grouped, searchable, opens the page for the client.
  await con.getByRole("tab", { name: /Sahifalar/ }).click();
  const pages = con.locator(".ra-pages");
  await expect(pages.locator(".ra-pages__now")).toContainText("Profil");
  await pages.getByRole("textbox", { name: "Sahifani qidirish" }).fill("obuna");
  await pages.getByRole("button", { name: /«Obuna»/ }).first().click();
  await expect(cl.page).toHaveURL(/\/portal\/client\/subscription$/);
  await expect(pages.locator(".ra-pages__now")).toContainText("/portal/client/subscription");

  // A route the backend refuses: a polite message, nothing opens.
  await pages.getByRole("textbox", { name: "Sahifani qidirish" }).fill("sovg'a");
  await pages.getByRole("button", { name: /«Sovg'alar»/ }).click();
  await expect(op.page.getByText("Bu sahifani xavfsizlik sababli masofadan ochib bo'lmaydi").first()).toBeVisible();
  await expect(cl.page).toHaveURL(/\/portal\/client\/subscription$/);

  // Click on the live picture: the client's side-nav link under that point opens.
  const navLink = cl.page.locator('a[href$="/portal/client/notifications"]').first();
  const at = await navLink.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight };
  });
  const pic = await screen.locator(".ra-scr__frame").evaluate((frame) => {
    const v = frame.querySelector("video") as HTMLVideoElement;
    const r = frame.getBoundingClientRect();
    const s = Math.min(r.width / v.videoWidth, r.height / v.videoHeight);
    const w = v.videoWidth * s;
    const h = v.videoHeight * s;
    return { x: r.left + (r.width - w) / 2, y: r.top + (r.height - h) / 2, w, h };
  });
  await screen.getByRole("radio", { name: "Bosish (ochish)" }).click();
  await op.page.mouse.click(pic.x + at.x * pic.w, pic.y + at.y * pic.h);
  await expect(cl.page).toHaveURL(/\/portal\/client\/notifications$/);
  // An empty spot: nothing opens, the operator is told so.
  await op.page.mouse.click(pic.x + pic.w * 0.98, pic.y + pic.h * 0.98);
  await expect(screen.locator(".ra-tools__hint")).toContainText(/Bu joyda ochiladigan narsa yo'q|Mijoz ekranidagi/);
  await expect(cl.page).toHaveURL(/\/portal\/client\/notifications$/);

  // Privacy: a secret field hides the picture until focus leaves it.
  await cl.page.evaluate(() => {
    const i = document.createElement("input");
    i.type = "password";
    i.id = "ra-secret-probe";
    document.body.appendChild(i);
    i.focus();
  });
  await expect(screen).toHaveAttribute("data-state", "hidden");
  await expect(screen).toContainText("Maxfiylik uchun yashirildi");
  await expect(bar).toContainText("Maxfiy joy — ekran vaqtincha yashirildi");
  await shot(op.page, "operator-hidden");
  await cl.page.evaluate(() => document.getElementById("ra-secret-probe")?.remove());
  await expect(screen).toHaveAttribute("data-state", "live");

  // Pause hides the picture and turns drawing off; resume brings both back.
  await bar.getByRole("button", { name: "To'xtatish" }).click();
  await expect(bar).toContainText("Yordam to'xtatilgan");
  await expect(screen).toHaveAttribute("data-state", "hidden");
  await expect(screen.getByRole("radio", { name: "Strelka" })).toBeDisabled();
  await bar.getByRole("button", { name: "Davom ettirish" }).click();
  await expect(screen).toHaveAttribute("data-state", "live");
  await expect(screen.getByRole("radio", { name: "Strelka" })).toBeEnabled();

  // The client hides the screen; the operator asks again; the client shares.
  await bar.getByRole("button", { name: "Ekranni yopish" }).click();
  await expect(screen).toHaveAttribute("data-state", "off");
  await screen.getByRole("button", { name: "Ekranni so'rash" }).click();
  await expect(bar.getByRole("button", { name: "Operator ekranni so'ramoqda" })).toBeVisible();
  // Another tab picked in the browser's picker: refused, nothing reaches the operator.
  await cl.page.evaluate(() => ((window as unknown as { __raWrongTab: boolean }).__raWrongTab = true));
  await bar.getByRole("button", { name: "Operator ekranni so'ramoqda" }).click();
  await expect(bar).toContainText("Boshqa tab tanlandi");
  await expect(screen).toHaveAttribute("data-state", "off");
  await cl.page.evaluate(() => ((window as unknown as { __raWrongTab: boolean }).__raWrongTab = false));
  await bar.getByRole("button", { name: "Operator ekranni so'ramoqda" }).click();
  await expect(screen).toHaveAttribute("data-state", "live");

  // Stop: both sides end and the share stops.
  await bar.getByRole("button", { name: "Ruxsatni olib qo'yish" }).click();
  await expect(cl.page.getByText("Ruxsat olib qo'yildi")).toBeVisible();
  await expect(bar).toBeHidden();
  await expect(con.getByText("Mijoz ruxsatni olib qo'ydi.")).toBeVisible();
  expect(await cl.page.evaluate(() => (window as unknown as { __raTestLink: { localShare: () => { on: boolean } } }).__raTestLink.localShare().on)).toBe(false);
  expect(srv.s.commands.filter((c) => c.action_id === "route.navigate").length).toBe(2);
  expect(op.mock.refused).toEqual([]);
  expect(cl.mock.refused).toEqual([]);
});

test("a denied request ends on both sides and nothing is shared", async ({ browser }) => {
  const srv = server();
  const op = await opPage(browser, srv);
  const cl = await clientPage(browser, srv);
  await linkPages(op.page, CALL_CENTER.id, cl.page, CLIENT.id);
  await cl.page.goto("/uz/portal/client/profile");
  await op.page.goto("/uz");
  const con = op.page.locator(".ra-con");
  await con.getByRole("button", { name: "Rejimni o'zgartirish" }).click();
  await con.getByRole("radio", { name: /Yo'l ko'rsatish/ }).click();
  await con.getByRole("textbox").first().fill("Sahifani ko'rsatish");
  await con.getByRole("button", { name: "Mijozdan ruxsat so'rash" }).click();
  await expect(con.getByText("javobi kutilmoqda")).toBeVisible();
  expect(srv.s.mode).toBe("guide");
  await cl.mock.push({ event: "remote_assist.requested" });
  const sheet = cl.page.getByRole("dialog", { name: "Ekraningizda yordam bersinmi?" });
  await expect(sheet).toContainText("Sahifani ko'rsatish");
  await expect(sheet).not.toContainText("Maydonlarni siz bilan birga to'ldiradi");
  await sheet.getByRole("button", { name: "Rad etish" }).click();
  await expect(sheet).toBeHidden();
  await expect(con.getByText("Mijoz ruxsat bermadi.")).toBeVisible();
  await expect(cl.page.getByRole("region", { name: "Masofaviy yordam" })).toHaveCount(0);
  expect(srv.s.states).toEqual([]);
  expect(srv.s.granted).toEqual([]);
  expect(await cl.page.evaluate(() => (window as unknown as { __raTestLink: { localShare: () => { on: boolean } } }).__raTestLink.localShare().on)).toBe(false);
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
