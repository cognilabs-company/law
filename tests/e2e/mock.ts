import type { Page, Route } from "@playwright/test";

// The backend, mocked. Every request the page makes to the API (through
// the /api/backend proxy or straight to the API host) is answered here;
// none reaches the real backend. Unknown GETs answer 404, and any other
// method is refused (and recorded) unless a test handles it, so a flow can
// never write real data or move money.

export type Handler = (body: unknown, url: URL) => { status?: number; json: unknown } | unknown;
export type Routes = Record<string, Handler | unknown>;
export type Mock = { calls: { method: string; path: string; body: unknown }[]; refused: string[]; sent: string[] };

const API = /\/api\/backend\/|lexgo\.api\.cognilabs\.org/;

// Background pings any signed-in page may send at any moment; answered so a
// test does not depend on their timing. A test's own routes take precedence.
const BACKGROUND: Routes = {
  "POST /internal/live-office/heartbeat": {},
  "POST /studio/constructors/[^/]+/visits": {},
};

export async function mockBackend(page: Page, routes: Routes): Promise<Mock> {
  const mock: Mock = { calls: [], refused: [], sent: [] };
  routes = { ...BACKGROUND, ...routes };
  // Realtime sockets open against no server: what the page sends is
  // recorded, nothing comes back. Next's own dev socket is not touched.
  await page.routeWebSocket(/\/ws\//, (ws) => {
    ws.onMessage((m) => {
      mock.sent.push(typeof m === "string" ? m : m.toString("utf8"));
    });
  });
  await page.route(API, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api\/backend/, "");
    const method = req.method();
    let body: unknown = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    mock.calls.push({ method, path, body });
    const key = Object.keys(routes).find((k) => {
      const [m, p] = k.includes(" ") ? k.split(" ") : ["GET", k];
      return m === method && new RegExp(`^${p}$`).test(path);
    });
    if (key) {
      const h = routes[key];
      const out = typeof h === "function" ? (h as Handler)(body, url) : h;
      const r = out && typeof out === "object" && "json" in (out as object) ? (out as { status?: number; json: unknown }) : { json: out };
      return route.fulfill({ status: r.status ?? 200, contentType: "application/json", body: JSON.stringify(r.json) });
    }
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return route.fulfill({ status: 404, contentType: "application/json", body: '{"detail":"Not Found"}' });
    mock.refused.push(`${method} ${path}`);
    return route.fulfill({ status: 503, contentType: "application/json", body: '{"detail":"mocked: not handled"}' });
  });
  return mock;
}

export type Role = "client" | "lawyer" | "advocate";
export type Who = { id: string; name: string; phone: string; role: Role; backendRole: string; permissions?: string[] };

export const CLIENT: Who = { id: "u-client", name: "Test Mijoz", phone: "+998900000005", role: "client", backendRole: "client" };
export const ADVOCATE: Who = { id: "u-adv", name: "Test Advokat", phone: "+998900000006", role: "advocate", backendRole: "advokat" };
export const ADMIN: Who = { id: "u-admin", name: "Test Superadmin", phone: "+998900000001", role: "client", backendRole: "superadmin" };
export const CALL_CENTER: Who = { id: "u-cc", name: "Test Operator", phone: "+998900000003", role: "client", backendRole: "call_center", permissions: ["callcenter.access", "leads.manage"] };

// Signs the browser in the way the app keeps a session (lib/auth.tsx), and
// answers /auth/me for it.
export async function signIn(page: Page, who: Who, routes: Routes): Promise<Routes> {
  const permissions = who.permissions ?? (who.backendRole === "superadmin" ? ["*"] : []);
  const session = { role: who.role, name: who.name, phone: who.phone, id: who.id, plan: "free", completeness: 100, token: "test-token", refreshToken: "test-refresh", backendRole: who.backendRole, roles: [who.backendRole], permissions };
  await page.addInitScript((s) => {
    localStorage.setItem("lexgo_session", JSON.stringify(s));
    localStorage.setItem("lexgo_token", "test-token");
  }, session);
  return {
    "/auth/me": { id: who.id, name: who.name, phone: who.phone, role: who.backendRole, roles: [who.backendRole], permissions },
    ...routes,
  };
}
