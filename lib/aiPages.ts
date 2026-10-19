export type AiRole = "client" | "lawyer" | "advocate";
export type AiRouteRole = AiRole | "staff";

const notificationsFor = (role: AiRouteRole) => (role === "staff" ? "/admin/notifications" : `/portal/${role}/notifications`);

const PAGE_ROUTE: Record<string, string | ((role: AiRouteRole) => string)> = {
  client_dashboard: "/portal/client",
  client_documents: "/portal/client/documents",
  client_works: "/portal/client/works",
  service_catalog: "/services",
  marketplace_lawyers: "/portal/client/lawyers",
  urgent_advokat: "/portal/client/urgent",
  notifications: notificationsFor,
  lawyer_dashboard: (role) => (role === "lawyer" ? "/portal/lawyer" : "/portal/advocate"),
  lawyer_document_requests: (role) => (role === "lawyer" ? "/portal/lawyer/document-requests" : "/portal/advocate/document-requests"),
  lawyer_clients: (role) => (role === "lawyer" ? "/portal/lawyer/clients" : "/portal/advocate/clients"),
  callcenter_urgent: "/admin/call-center",
  callcenter_quality: "/admin/call-center",
  admin_dashboard: "/admin/dashboard",
  admin_register_requests: "/admin/register-requests",
  admin_service_catalog: "/admin/services",
  admin_document_templates: "/admin/templates",
};

const LEGACY_ROUTE: Record<string, string | ((role: AiRouteRole) => string)> = {
  "/marketplace/lawyers": "/portal/client/lawyers",
  "/portal/client/urgent-advokat": "/portal/client/urgent",
  "/notifications": notificationsFor,
  "/portal/call-center/urgent-advokat": "/admin/call-center",
  "/portal/call-center/quality-complaints": "/admin/call-center",
  "/admin/service-categories": "/admin/services",
  "/admin/document-templates": "/admin/templates",
};

const LEGACY_LAWYER_PROFILE = /^\/marketplace\/lawyers\/([^/?#]+)(?:\/services)?$/;
const ADVOCATE_CABINET = /^\/portal\/advocate(?=\/|$)/;

function own<T>(o: Record<string, T>, k: string): T | undefined {
  return k && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
}

export function legacyAiRoute(route: string, role: AiRouteRole): string {
  const cut = route.search(/[?#]/);
  const raw = cut < 0 ? route : route.slice(0, cut);
  const rest = cut < 0 ? "" : route.slice(cut);
  const path = raw.length > 1 ? raw.replace(/\/+$/, "") || "/" : raw;
  const known = own(LEGACY_ROUTE, path);
  if (known) return (typeof known === "function" ? known(role) : known) + rest;
  const profile = role === "client" ? LEGACY_LAWYER_PROFILE.exec(path) : null;
  if (profile) return `/portal/client/lawyers/${profile[1]}${rest}`;
  if (role === "lawyer" && ADVOCATE_CABINET.test(path)) return path.replace(ADVOCATE_CABINET, "/portal/lawyer") + rest;
  return route;
}

const DOT_SEGMENT = /(^|\/|%2f|%5c)(\.|%2e){1,2}(\/|%2f|%5c|$)/i;

export function aiSafePath(route: string): boolean {
  if (!route.startsWith("/") || route.startsWith("//") || /[\s\\]/.test(route)) return false;
  const path = route.split(/[?#]/)[0];
  if (DOT_SEGMENT.test(path)) return false;
  try {
    return new URL(path, "http://x").pathname === path;
  } catch {
    return false;
  }
}

const ROUTE_ALLOW = [
  "/portal/client", "/portal/lawyer", "/portal/advocate", "/portal/chat",
  "/admin", "/services", "/lawyers", "/legal", "/academy", "/subscription",
];

const UNFILLED = /[{}[\]]|\/:/;

function allowedRoute(route: string): string {
  if (!aiSafePath(route) || UNFILLED.test(route.split(/[?#]/)[0])) return "";
  return ROUTE_ALLOW.some((a) => route === a || route.startsWith(a + "/") || route.startsWith(a + "?")) ? route : "";
}

export function aiRouteFor(pageId: string, rawRoute: string, role: AiRouteRole): string {
  const r = (rawRoute || "").trim();
  const direct = r ? allowedRoute(legacyAiRoute(r, role)) : "";
  if (direct) return direct;
  const known = own(PAGE_ROUTE, pageId);
  if (known) return typeof known === "function" ? known(role) : known;
  return "";
}

// ── The other direction: which page_id is the user standing on? ─────
// Longest prefix wins, so /portal/client/documents is not read as
// /portal/client. Routes with no registry entry send their own path and an
// empty page_id, which the backend tolerates — it is the route and title it
// uses to ground the answer, and a page_id it does not know is no worse than
// one we invented.
const PATH_PAGE: [string, string][] = [
  ["/portal/client/documents", "client_documents"],
  ["/portal/client/works", "client_works"],
  ["/portal/client/urgent", "urgent_advokat"],
  ["/portal/client/lawyers", "marketplace_lawyers"],
  ["/portal/client/notifications", "notifications"],
  ["/portal/client", "client_dashboard"],
  ["/portal/lawyer/document-requests", "lawyer_document_requests"],
  ["/portal/lawyer/clients", "lawyer_clients"],
  ["/portal/lawyer/notifications", "notifications"],
  ["/portal/lawyer", "lawyer_dashboard"],
  ["/portal/advocate/document-requests", "lawyer_document_requests"],
  ["/portal/advocate/clients", "lawyer_clients"],
  ["/portal/advocate/notifications", "notifications"],
  ["/portal/advocate", "lawyer_dashboard"],
  ["/admin/call-center", "callcenter_urgent"],
  ["/admin/register-requests", "admin_register_requests"],
  ["/admin/services", "admin_service_catalog"],
  ["/admin/templates", "admin_document_templates"],
  ["/admin", "admin_dashboard"],
  ["/services", "service_catalog"],
];

export function aiPageIdFor(pathname: string): string {
  const p = (pathname || "/").split("?")[0].replace(/\/+$/, "") || "/";
  let best = "";
  let bestLen = -1;
  for (const [prefix, id] of PATH_PAGE) {
    if ((p === prefix || p.startsWith(prefix + "/")) && prefix.length > bestLen) {
      best = id;
      bestLen = prefix.length;
    }
  }
  return best;
}
