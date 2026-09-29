// The page registry, from this app's side.
//
// LEXGO_AI_SYSTEM_ASSISTANT_FRONTEND_BACKEND_2026-09-29.md asks for two
// things: send the current page with every question, and check any route the
// answer returns against a whitelist before pushing it.
//
// The whitelist has to be a MAPPING, not a filter. The backend's registry
// names routes that do not exist in this app — measured against the live
// /api/ai/pages on 2026-09-29, six of its sixteen are wrong for us:
//
//   marketplace_lawyers       /marketplace/lawyers             → /portal/client/lawyers
//   urgent_advokat            /portal/client/urgent-advokat    → /portal/client/urgent
//   notifications             /notifications                   → per-role notifications
//   callcenter_urgent         /portal/call-center/urgent-advokat → /admin/call-center
//   callcenter_quality        /portal/call-center/quality-complaints → /admin/call-center
//   admin_service_catalog     /admin/service-categories        → /admin/services
//   admin_document_templates  /admin/document-templates        → /admin/templates
//
// Pushing `navigation.route` straight through would 404 the client on the
// single most likely question there is ("advokatni qayerdan tanlayman?" →
// /marketplace/lawyers). So the page_id is what is trusted, and the route is
// ours. A page_id we do not know yields no button at all rather than a guess.

export type AiRole = "client" | "lawyer" | "advocate";

// page_id → the route in THIS app. A function where the answer depends on
// who is asking.
const PAGE_ROUTE: Record<string, string | ((role: AiRole) => string)> = {
  client_dashboard: "/portal/client",
  client_documents: "/portal/client/documents",
  client_works: "/portal/client/works",
  service_catalog: "/services",
  // The client browses advocates at their own marketplace page; the public
  // /lawyers page is the logged-out one.
  marketplace_lawyers: "/portal/client/lawyers",
  urgent_advokat: "/portal/client/urgent",
  notifications: (role) => `/portal/${role}/notifications`,
  // The registry calls the seller "lawyer" and routes to /portal/advocate.
  // Both cabinets exist here and a yurist must not be sent to the advocate's.
  lawyer_dashboard: (role) => (role === "lawyer" ? "/portal/lawyer" : "/portal/advocate"),
  lawyer_document_requests: (role) => (role === "lawyer" ? "/portal/lawyer/document-requests" : "/portal/advocate/document-requests"),
  lawyer_clients: (role) => (role === "lawyer" ? "/portal/lawyer/clients" : "/portal/advocate/clients"),
  // Both call-centre pages are one console here.
  callcenter_urgent: "/admin/call-center",
  callcenter_quality: "/admin/call-center",
  admin_dashboard: "/admin/dashboard",
  admin_register_requests: "/admin/register-requests",
  admin_service_catalog: "/admin/services",
  admin_document_templates: "/admin/templates",
};

// A route the answer named directly, with no page_id we recognise. Allowed
// only when it is one of ours — the assistant is not a way to reach an
// arbitrary URL.
const ROUTE_ALLOW = [
  "/portal/client", "/portal/lawyer", "/portal/advocate", "/portal/chat",
  "/admin", "/services", "/lawyers", "/legal", "/academy", "/subscription",
];

/**
 * Where a navigation or action should actually take the user, or "" when it
 * should not take them anywhere.
 */
export function aiRouteFor(pageId: string, rawRoute: string, role: AiRole): string {
  const known = PAGE_ROUTE[pageId];
  if (known) return typeof known === "function" ? known(role) : known;
  const r = (rawRoute || "").trim();
  if (!r.startsWith("/") || r.startsWith("//")) return "";
  // Exact match or a path segment under an allowed root — "/servicesX" must
  // not pass because "/services" does.
  if (ROUTE_ALLOW.some((a) => r === a || r.startsWith(a + "/") || r.startsWith(a + "?"))) return r;
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
