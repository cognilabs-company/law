export type GuideRole = "client" | "lawyer" | "advocate" | "staff";

export type GuideMark = { id: number; kind: "ring" | "tip"; target: string; text: string; until: number };

let seq = 0;
let marks: GuideMark[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function guideMarks(): GuideMark[] {
  return marks;
}

export function subscribeGuide(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function addGuideMark(kind: GuideMark["kind"], target: string, ms: number, text = ""): void {
  const id = ++seq;
  marks = [...marks.filter((m) => !(m.kind === kind && m.target === target)), { id, kind, target, text, until: Date.now() + ms }];
  emit();
  window.setTimeout(() => {
    marks = marks.filter((m) => m.id !== id);
    emit();
  }, ms);
}

export function clearGuideMarks(): void {
  if (!marks.length) return;
  marks = [];
  emit();
}

const esc = (v: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(v) : v.replace(/["\\]/g, "\\$&"));

export function findTarget(target: string): HTMLElement | null {
  if (typeof document === "undefined" || !target) return null;
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-ai-target="${esc(target)}"]`));
  return all.find((el) => el.getClientRects().length > 0) ?? all[0] ?? null;
}

export function visibleTargets(limit = 80): string[] {
  if (typeof document === "undefined") return [];
  const out = new Set<string>();
  for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-ai-target]"))) {
    if (!el.getClientRects().length) continue;
    const v = el.dataset.aiTarget;
    if (v) out.add(v);
    if (out.size >= limit) break;
  }
  return [...out];
}

export function waitForTarget(target: string, ms: number): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      const el = findTarget(target);
      if (el && el.getClientRects().length) return resolve(el);
      if (Date.now() - t0 >= ms) return resolve(el);
      window.setTimeout(tick, 120);
    };
    tick();
  });
}

const seller = (role: GuideRole) => (role === "lawyer" ? "lawyer" : "advocate");

const HREF_ALIAS: [RegExp, (role: GuideRole, m: RegExpMatchArray) => string][] = [
  [/^\/portal\/client\/subscriptions?$/, () => "/portal/client/subscription"],
  [/^\/portal\/client\/marketplace$/, () => "/portal/client/lawyers"],
  [/^\/marketplace\/lawyers\/([^/?#]+)$/, (_r, m) => `/portal/client/lawyers/${m[1]}`],
  [/^\/marketplace(\/lawyers)?$/, () => "/portal/client/lawyers"],
  [/^\/portal\/client\/urgent-advokat$/, () => "/portal/client/urgent"],
  [/^\/portal\/call-center\/support(\/[^/?#]+)?$/, (_r, m) => `/admin/call-center/support${m[1] ?? ""}`],
  [/^\/portal\/call-center(\/.*)?$/, () => "/admin/call-center"],
  [/^\/portal\/organization\/([^/?#]+)\/dashboard$/, (_r, m) => `/portal/advocate/organization/${m[1]}`],
  [/^\/portal\/organization(\/.*)?$/, (_r, m) => `/portal/advocate/organization${m[1] ?? ""}`],
  [/^\/portal\/(advocate|lawyer|seller)(\/.*)?$/, (role, m) => `/portal/${seller(role)}${m[2] ?? ""}`],
];

const ROUTE_ALLOW = ["/portal/client", "/portal/lawyer", "/portal/advocate", "/portal/chat", "/admin", "/services", "/lawyers", "/subscription"];

export function guideHref(raw: string, role: GuideRole): string {
  let href = (raw || "").trim();
  if (!href.startsWith("/") || href.startsWith("//")) return "";
  href = href.replace(/^\/(uz|ru|en)(?=\/|$)/, "") || "/";
  const [path, rest = ""] = href.split(/(?=[?#])/);
  let mapped = path.replace(/\/+$/, "") || "/";
  for (const [re, fn] of HREF_ALIAS) {
    const m = mapped.match(re);
    if (m) {
      mapped = fn(role, m);
      break;
    }
  }
  if (!ROUTE_ALLOW.some((a) => mapped === a || mapped.startsWith(a + "/"))) return "";
  return mapped + rest;
}

export function targetHome(target: string, role: GuideRole): string {
  const s = seller(role);
  const own = role === "client" || role === "staff" ? "client" : s;
  if (/^(plan|button:buy-plan):/.test(target)) return `/portal/${own}/subscription`;
  if (target === "marketplace:ai-search" || target === "marketplace:ai-search-input" || target === "marketplace:filters" || target.startsWith("marketplace:lawyer-card:")) return "/portal/client/lawyers";
  if (target === "button:create-document" || target === "documents:category-list" || target === "documents:template-list" || target === "documents:constructor") return "/portal/client/services";
  if (target === "documents:my-documents") return "/portal/client/documents";
  if (target === "button:operator-support" || target.startsWith("support:") || target.startsWith("support-ticket:")) return role === "staff" ? "/admin/call-center/support" : "/portal/client/support";
  if (target === "section:urgent-services" || target.startsWith("urgent:")) return "/portal/client/urgent";
  if (target === "list:document-requests") return `/portal/${s}/document-requests`;
  if (target === "seller:marketplace-orders") return `/portal/${s}/marketplace-orders`;
  if (target === "seller:meeting-list") return `/portal/${s}/meetings`;
  if (target === "seller:client-list") return `/portal/${s}/clients`;
  if (target === "seller:profile-edit") return `/portal/${s}/profile`;
  if (target.startsWith("organization:")) return "/portal/advocate/organization";
  return "";
}

export function samePath(a: string, b: string): boolean {
  const n = (x: string) => (x.split(/[?#]/)[0].replace(/^\/(uz|ru|en)(?=\/|$)/, "").replace(/\/+$/, "") || "/");
  return n(a) === n(b);
}
