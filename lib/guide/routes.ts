import type { GuideRole } from "./types";

const SELLER_PAGES: Record<"lawyer" | "advocate", Set<string>> = {
  lawyer: new Set(["", "/ai", "/assistant", "/calendar", "/cases", "/chat", "/clients", "/document-requests", "/documents", "/files", "/marketplace", "/marketplace-orders", "/meetings", "/notifications", "/profile", "/promotion", "/referrals", "/services", "/subscription", "/support", "/tasks", "/urgent"]),
  advocate: new Set(["", "/assistant", "/calendar", "/cases", "/clients", "/document-requests", "/files", "/marketplace-orders", "/meetings", "/messages", "/notifications", "/opportunities", "/organization", "/profile", "/promotion", "/referrals", "/services", "/subscription", "/support", "/tasks", "/urgent"]),
};

const SELLER_TWIN: Record<"lawyer" | "advocate", Record<string, string>> = {
  lawyer: { "/messages": "/chat", "/opportunities": "/marketplace", "/assistant": "/ai" },
  advocate: { "/chat": "/messages", "/marketplace": "/opportunities", "/ai": "/assistant" },
};

const ADMIN_ALIAS: Record<string, string> = {
  dashboard: "/admin/dashboard",
  marketplace: "/admin/marketplace",
  subscriptions: "/admin/plans",
  support: "/admin/call-center/support",
};

const CLIENT_TO_SELLER: Record<string, Partial<Record<"lawyer" | "advocate", string>>> = {
  "": { lawyer: "", advocate: "" },
  "/subscription": { lawyer: "/subscription", advocate: "/subscription" },
  "/marketplace-orders": { lawyer: "/marketplace-orders", advocate: "/marketplace-orders" },
  "/notifications": { lawyer: "/notifications", advocate: "/notifications" },
  "/profile": { lawyer: "/profile", advocate: "/profile" },
  "/urgent": { lawyer: "/urgent", advocate: "/urgent" },
  "/messages": { lawyer: "/chat", advocate: "/messages" },
  "/works": { lawyer: "/cases", advocate: "/cases" },
  "/cases": { lawyer: "/cases", advocate: "/cases" },
  "/referrals": { lawyer: "/referrals", advocate: "/referrals" },
  "/document-requests": { lawyer: "/document-requests", advocate: "/document-requests" },
  "/support": { lawyer: "/support", advocate: "/support" },
};

const CLIENT_TO_STAFF: Record<string, string> = {
  "/support": "/admin/call-center/support",
  "/lawyers": "/admin/marketplace",
  "/marketplace-orders": "/admin/marketplace",
  "/urgent": "/admin/call-center",
  "/notifications": "/admin/notifications",
  "": "/admin",
};

const ALIAS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^\/portal\/client\/documents\/my$/, () => "/portal/client/documents"],
  [/^\/portal\/client\/subscriptions$/, () => "/portal/client/subscription"],
  [/^\/portal\/client\/marketplace$/, () => "/portal/client/lawyers"],
  [/^\/portal\/client\/marketplace\/([^/]+)$/, (m) => `/portal/client/lawyers/${m[1]}`],
  [/^\/portal\/client\/urgent-advokat$/, () => "/portal/client/urgent"],
  [/^\/portal\/client\/ai-help$/, () => ""],
  [/^\/marketplace\/lawyers\/([^/]+)$/, (m) => `/portal/client/lawyers/${m[1]}`],
  [/^\/marketplace(\/lawyers)?$/, () => "/portal/client/lawyers"],
  [/^\/(lawyers|services|subscription)$/, (m) => (m[1] === "lawyers" ? "/portal/client/lawyers" : m[1] === "services" ? "/portal/client/services" : "/portal/client/subscription")],
  [/^\/portal\/call-center\/support(\/[^/]+)?$/, (m) => `/admin/call-center/support${m[1] ?? ""}`],
  [/^\/portal\/call-center(\/.*)?$/, () => "/admin/call-center"],
  [/^\/portal\/organization\/([^/]+)\/dashboard$/, (m) => `/portal/advocate/organization/${m[1]}`],
  [/^\/portal\/organization\/(advocates|works|stats)$/, () => "/portal/advocate/organization"],
  [/^\/portal\/organization(\/.*)?$/, (m) => `/portal/advocate/organization${m[1] ?? ""}`],
  [/^\/portal\/seller(\/.*)?$/, (m) => `/portal/advocate${m[1] ?? ""}`],
  [/^\/portal\/admin\/(dashboard|marketplace|subscriptions|support)$/, (m) => ADMIN_ALIAS[m[1]]],
];

export function normPath(raw: string): string {
  const path = (raw || "").split(/[?#]/)[0].replace(/^\/(uz|ru|en)(?=\/|$)/, "").replace(/\/+$/, "");
  return path || "/";
}

export function samePath(a: string, b: string): boolean {
  return normPath(a) === normPath(b);
}

export function guideHref(raw: string, role: GuideRole): string {
  const href = (raw || "").trim();
  if (!href.startsWith("/") || href.startsWith("//")) return "";
  const qi = href.search(/[?#]/);
  const rest = qi >= 0 ? href.slice(qi) : "";
  let path = normPath(href);
  for (const [re, fn] of ALIAS) {
    const m = path.match(re);
    if (m) {
      path = fn(m);
      break;
    }
  }
  if (!path) return "";

  if (role === "client") return path === "/portal/client" || path.startsWith("/portal/client/") ? path + rest : "";

  if (role === "staff") {
    if (path === "/admin" || path.startsWith("/admin/")) return path + rest;
    if (path.startsWith("/portal/client")) {
      const mapped = CLIENT_TO_STAFF[path.slice("/portal/client".length)];
      return mapped ?? "";
    }
    return "";
  }

  const own = `/portal/${role}`;
  let suffix: string | undefined;
  if (path === "/portal/client" || path.startsWith("/portal/client/")) {
    const tail = path.slice("/portal/client".length);
    const base = tail.split("/").slice(0, 2).join("/");
    const mapped = CLIENT_TO_SELLER[base]?.[role];
    suffix = mapped === undefined ? undefined : mapped + tail.slice(base.length);
  } else if (/^\/portal\/(lawyer|advocate)(\/|$)/.test(path)) {
    suffix = path.replace(/^\/portal\/(lawyer|advocate)/, "");
  }
  if (suffix === undefined) return "";
  const head = "/" + (suffix.split("/")[1] ?? "");
  const key = head === "/" ? "" : head;
  if (!SELLER_PAGES[role].has(key)) {
    const twin = SELLER_TWIN[role][key];
    if (twin === undefined || suffix !== key || !SELLER_PAGES[role].has(twin)) return "";
    suffix = twin;
  }
  return own + suffix + rest;
}

const ROLE_ROOT = /^\/(portal\/[^/]+|admin)$/;

export function routeAllowed(href: string, allowed: string[], role: GuideRole): boolean {
  if (!allowed.length) return true;
  const path = normPath(href);
  for (const raw of allowed) {
    const mapped = guideHref(raw, role);
    if (!mapped) continue;
    const base = normPath(mapped);
    if (base === "/") continue;
    if (path === base) return true;
    if (path.startsWith(`${base}/`) && !ROLE_ROOT.test(base)) return true;
  }
  return false;
}

export function remapTarget(id: string, role: GuideRole): string {
  if (role === "client") return id;
  if (role === "staff") {
    if (id === "button:operator-support" || id === "support:ticket-list") return "support:ticket-list";
    return id;
  }
  return id;
}

const RULES: [RegExp, Partial<Record<GuideRole, string>>][] = [
  [/^(plan|button:buy-plan):/, { client: "/portal/client/subscription", lawyer: "/portal/lawyer/subscription", advocate: "/portal/advocate/subscription" }],
  [/^marketplace:(ai-search|ai-search-input|filters|lawyer-card:)/, { client: "/portal/client/lawyers", staff: "/admin/marketplace" }],
  [/^(button:create-document|documents:(category-list|template-list|constructor))$/, { client: "/portal/client/services" }],
  [/^documents:my-documents$/, { client: "/portal/client/documents" }],
  [/^(button:operator-support|support:|support-ticket:)/, { client: "/portal/client/support", lawyer: "/portal/lawyer/support", advocate: "/portal/advocate/support", staff: "/admin/call-center/support" }],
  [/^(section:urgent-services|urgent:)/, { client: "/portal/client/urgent" }],
  [/^dashboard:/, { client: "/portal/client" }],
  [/^list:document-requests$/, { lawyer: "/portal/lawyer/document-requests", advocate: "/portal/advocate/document-requests" }],
  [/^seller:marketplace-orders$/, { lawyer: "/portal/lawyer/marketplace-orders", advocate: "/portal/advocate/marketplace-orders" }],
  [/^client:marketplace-orders$/, { client: "/portal/client/marketplace-orders" }],
  [/^seller:meeting-list$/, { lawyer: "/portal/lawyer/meetings", advocate: "/portal/advocate/meetings", staff: "/admin/meetings" }],
  [/^seller:client-list$/, { lawyer: "/portal/lawyer/clients", advocate: "/portal/advocate/clients" }],
  [/^seller:profile-edit$/, { lawyer: "/portal/lawyer/profile", advocate: "/portal/advocate/profile" }],
];

export function targetHome(id: string, role: GuideRole, registryHome?: (id: string, role: GuideRole) => string): string {
  for (const [re, homes] of RULES) if (re.test(id)) return homes[role] ?? "";
  return registryHome ? registryHome(id, role) : "";
}

export const ROUTE_KEYS: Record<string, Partial<Record<GuideRole, string>>> = {
  dashboard: { client: "/portal/client", lawyer: "/portal/lawyer", advocate: "/portal/advocate", staff: "/admin" },
  subscription: { client: "/portal/client/subscription", lawyer: "/portal/lawyer/subscription", advocate: "/portal/advocate/subscription" },
  marketplace: { client: "/portal/client/lawyers", staff: "/admin/marketplace" },
  documents_create: { client: "/portal/client/services", lawyer: "/portal/lawyer/documents", staff: "/admin/templates" },
  my_documents: { client: "/portal/client/documents" },
  support: { client: "/portal/client/support", lawyer: "/portal/lawyer/support", advocate: "/portal/advocate/support", staff: "/admin/call-center/support" },
  complaints: { client: "/portal/client/complaints" },
  urgent: { client: "/portal/client/urgent", lawyer: "/portal/lawyer/urgent", advocate: "/portal/advocate/urgent", staff: "/admin/call-center" },
  my_works: { client: "/portal/client/works", lawyer: "/portal/lawyer/cases", advocate: "/portal/advocate/cases" },
  marketplace_orders: { client: "/portal/client/marketplace-orders", lawyer: "/portal/lawyer/marketplace-orders", advocate: "/portal/advocate/marketplace-orders", staff: "/admin/marketplace" },
  document_requests: { lawyer: "/portal/lawyer/document-requests", advocate: "/portal/advocate/document-requests", staff: "/admin/call-center" },
  organization: { advocate: "/portal/advocate/organization" },
  notifications: { client: "/portal/client/notifications", lawyer: "/portal/lawyer/notifications", advocate: "/portal/advocate/notifications", staff: "/admin/notifications" },
  profile: { client: "/portal/client/profile", lawyer: "/portal/lawyer/profile", advocate: "/portal/advocate/profile" },
  ai_chat: { client: "/portal/client/ai", lawyer: "/portal/lawyer/ai", advocate: "/portal/advocate/assistant" },
};

export function routeForKey(key: string, role: GuideRole): string {
  return ROUTE_KEYS[key]?.[role] ?? "";
}
