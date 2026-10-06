type Kind = "x" | "f" | "a";

const RULES: [string, string, Kind][] = [
  ["dashboard.quick-actions.marketplace", "dashboard:findSpecialist", "x"],
  ["dashboard.quick-actions.urgent-advokat", "dashboard:urgent", "x"],
  ["dashboard.quick-actions.describe", "dashboard:describe", "x"],
  ["dashboard.quick-actions.consultation", "dashboard:consultation", "x"],
  ["dashboard.quick-actions.ask-ai", "dashboard:askAi", "x"],
  ["dashboard.quick-actions.doc-analysis", "dashboard:upload", "x"],
  ["dashboard.ai-service-finder", "dashboard:ask", "x"],
  ["dashboard.requests", "dashboard:requests", "x"],
  ["dashboard.ai-card", "dashboard:ai-card", "x"],
  ["dashboard.quick-actions.subscriptions", "nav:subscription", "a"],
  ["dashboard.quick-actions.documents", "nav:services", "a"],
  ["dashboard.quick-actions.support", "header:support", "a"],
  ["dashboard.quick-actions.support", "nav:support", "a"],
  ["dashboard.ai-instructor.open", "button:open-instructor", "f"],
  ["pricing.plan.{slug}.buy", "button:buy-plan:{slug}", "x"],
  ["pricing.plan.{slug}.features", "plan:{slug}", "a"],
  ["pricing.plan.{slug}", "plan:{slug}", "x"],
  ["pricing.billing.monthly", "plans:period", "a"],
  ["pricing.billing.six-month", "plans:period", "a"],
  ["pricing.billing.yearly", "plans:period", "a"],
  ["pricing.billing.prepaid-yearly", "plans:period", "a"],
  ["pricing.billing.upfront", "plans:period", "a"],
  ["pricing.current", "plans:current", "x"],
  ["pricing.compare", "plans:compare", "x"],
  ["pricing.billing-history", "plans:billing", "x"],
  ["pricing.gift", "plans:gift", "x"],
  ["pricing.autopay", "plans:autopay", "x"],
  ["marketplace.ai-search.input", "marketplace:ai-search-input", "x"],
  ["marketplace.search.input", "marketplace:ai-search-input", "a"],
  ["marketplace.ai-search", "marketplace:ai-search", "x"],
  ["marketplace.filters.{name}", "marketplace:filters", "a"],
  ["marketplace.filters", "marketplace:filters", "x"],
  ["marketplace.results", "marketplace:lawyer-list", "x"],
  ["marketplace.seller.{uid}.service.{sid}.buy", "button:marketplace-purchase:{uid}:{sid}", "x"],
  ["marketplace.seller.{uid}.service.{sid}", "marketplace:service-card:{sid}", "f"],
  ["marketplace.service.{sid}", "marketplace:service-card:{sid}", "f"],
  ["marketplace.seller.{uid}.services", "marketplace:seller-services", "a"],
  ["marketplace.seller.{uid}.detail", "marketplace:seller-summary", "a"],
  ["marketplace.seller.{uid}", "marketplace:lawyer-card:{uid}", "x"],
  ["marketplace.purchase.channel", "marketplace:purchase-channel", "x"],
  ["marketplace.purchase.note", "marketplace:purchase-note", "x"],
  ["marketplace.purchase.time", "marketplace:purchase-time", "x"],
  ["marketplace.purchase.submit", "button:marketplace-purchase-submit", "x"],
  ["urgent_advokat.services", "section:urgent-services", "x"],
  ["urgent_advokat.request.direction", "urgent:form-directions", "x"],
  ["urgent_advokat.request.description", "urgent:form-need", "x"],
  ["urgent_advokat.request.submit", "button:urgent-submit", "x"],
  ["urgent_advokat.terms", "urgent:terms", "x"],
  ["urgent_advokat.my-requests", "urgent:my-requests", "x"],
  ["urgent_advokat.service.express-video-consultation", "urgent:video-consultation", "a"],
  ["urgent_advokat.service.{kind}", "urgent:{kind}", "x"],
  ["support.chat", "support:chat", "x"],
  ["support.ticket.{id}.messages", "support:chat", "a"],
  ["support.ticket.{id}.message-input", "support:message-input", "a"],
  ["support.ticket.{id}", "support-ticket:{id}", "x"],
  ["support.operator-handoff.button", "button:operator-support", "x"],
  ["support.new-ticket.form", "support:new-chat", "x"],
  ["support.channels", "support:channels", "x"],
  ["support.channels.complaint", "support:complaints", "x"],
  ["call_center.support.queue", "support:ticket-list", "f"],
  ["call_center.support.ticket.{id}.claim", "support-ticket:{id}", "a"],
  ["call_center.support.ticket.{id}.assist.{kind}", "support:assist", "a"],
  ["call_center.support.ticket.{id}.messages", "support:chat", "a"],
  ["call_center.support.ticket.{id}.message-input", "support:message-input", "a"],
  ["call_center.support.ticket.{id}", "support-ticket:{id}", "f"],
  ["call_center.urgent-advokat.queue", "callcenter:urgent", "x"],
  ["call_center.urgent-advokat.item.{id}", "callcenter:urgent-list", "a"],
  ["call_center.leads.queue", "callcenter:queue", "x"],
  ["call_center.complaints", "callcenter:complaints", "x"],
  ["documents.create.open", "button:create-document", "x"],
  ["documents.search.input", "documents:catalog-search", "x"],
  ["documents.categories", "documents:category-list", "x"],
  ["documents.catalog.category.{slug}", "documents:category-list", "a"],
  ["documents.category.{id}", "documents:category-list", "a"],
  ["documents.subcategories", "documents:direction-list", "x"],
  ["documents.subcategory.{slug}", "documents:direction-list", "a"],
  ["documents.templates", "documents:template-list", "x"],
  ["documents.template.{id}.{mode}", "documents:template-list", "a"],
  ["documents.template.{id}", "documents:template-list", "a"],
  ["documents.my.list", "documents:my-documents", "x"],
  ["documents.my.item.{id}", "documents:my-documents", "a"],
  ["documents.request.{id}", "documents:my-documents", "a"],
  ["documents.constructor.preview", "documents:fill-preview", "x"],
  ["documents.constructor.generate", "button:document-submit", "x"],
  ["documents.constructor.form", "documents:fill-form", "x"],
  ["documents.constructor.step.{id}", "documents:fill-form", "a"],
  ["documents.constructor.field.{name}", "documents:fill-form", "a"],
  ["advocate.document-requests.list", "list:document-requests", "x"],
  ["advocate.document-requests.tabs", "document-requests:tabs", "x"],
  ["advocate.document-requests.filters", "document-requests:filters", "x"],
  ["advocate.document-requests.item.{id}.editor", "doc-editor:document", "a"],
  ["advocate.document-requests.item.{id}.meeting", "button:editor-meeting", "a"],
  ["advocate.document-requests.item.{id}.finalize", "button:editor-finalize", "a"],
  ["advocate.document-requests.item.{id}.source", "button:editor-source", "a"],
  ["advocate.document-requests.item.{id}", "list:document-requests", "a"],
  ["advocate.marketplace-orders.list", "seller:marketplace-orders", "x"],
  ["advocate.marketplace-orders.item.{id}", "seller:marketplace-orders", "a"],
  ["advocate.messages", "messages:inbox", "x"],
  ["advocate.clients", "seller:client-list", "x"],
  ["advocate.clients.add", "button:add-client", "x"],
  ["advocate.clients.conflict-check", "button:conflict-check", "x"],
  ["advocate.meetings", "seller:meeting-list", "x"],
  ["advocate.opportunities.list", "open-orders:list", "x"],
  ["advocate.urgent.list", "urgent-assigned:list", "x"],
  ["organization.list", "organization:list", "x"],
  ["organization.create", "button:create-organization", "x"],
  ["organization.item.{id}", "organization:list", "a"],
  ["organization.dashboard.summary", "organization:summary", "x"],
  ["organization.dashboard.members", "organization:members", "x"],
  ["organization.member.{id}", "organization:members", "a"],
  ["organization.dashboard.works", "organization:active-orders", "x"],
  ["organization.workload.filters", "organization:workload-filter", "x"],
  ["organization.workload.list", "organization:workload-list", "x"],
  ["admin.dashboard.kpis", "overview:kpis", "x"],
  ["admin.marketplace.orders", "marketplace:orders-list", "x"],
  ["admin.plans.list", "plans:list", "x"],
  ["admin.plans.item.{slug}", "plans:list", "a"],
  ["admin.templates.list", "templates:list", "x"],
  ["admin.register-requests.list", "register-requests:list", "x"],
  ["admin.payouts.list", "payouts:list", "x"],
  ["admin.approvals.queue", "approvals:queue", "x"],
  ["payments.history", "payments:history", "x"],
  ["payments.filters", "payments:filters", "x"],
  ["payments.search.input", "payments:filters", "a"],
  ["payments.item.{id}", "payments:history", "a"],
  ["profile.{section}.edit", "profile:{section}", "a"],
  ["profile.{section}", "profile:{section}", "x"],
  ["services.card.{id}", "services:card", "a"],
  ["advocate.services.summary", "services:summary", "x"],
  ["advocate.services.add", "button:add-service", "x"],
  ["advocate.services.filters", "services:filters", "x"],
  ["advocate.services.list", "services:list", "x"],
  ["works.list", "works:list", "x"],
  ["works.filters", "works:filters", "x"],
  ["complaints.new", "button:new-complaint", "x"],
  ["complaints.list", "complaints:list", "x"],
  ["complaints.filters.{name}", "complaints:filters", "a"],
  ["complaints.filters", "complaints:filters", "x"],
];

type Compiled = { re: RegExp; names: string[]; tpl: string };
type Rule = { ai: Compiled; legacy: Compiled; kind: Kind; lossy: boolean };

export type AliasHit = { id: string; exact: boolean; lossy: boolean; tpl: string; params: string[] };

const REWRITES: [RegExp, string][] = [
  [/^documents\.request\.([^.:]+)((?:\.[^.:]+)*)$/, "documents.my.item.$1$2"],
  [/^documents\.catalog\.search(\.input)?$/, "documents.search.input"],
  [/^documents\.my\.tab\.[^.]+$/, "documents.my.filters.mode"],
  [/^documents\.filters\.clear$/, "documents.filters.reset"],
  [/^advocate\.document-requests\.tab\.(progress|done)$/, "advocate.document-requests.filters.status"],
  [/^advocate\.dashboard\.tasks\.tab\.[^.]+$/, "advocate.dashboard.tasks.filters.period"],
  [/^organization\.dashboard\.works\.tab\.[^.]+$/, "organization.dashboard.works.filters.kind"],
  [/^call_center\.urgent-advokat\.tab\.[a-z_]+$/, "call_center.urgent-advokat.tabs"],
  [/^call_center\.support\.queue\.tab\.[a-z]+$/, "call_center.support.queue.tabs"],
  [/^(marketplace\.orders|advocate\.marketplace-orders)\.tab\.[a-z]+$/, "$1.tabs"],
  [/^support\.tickets\.tab\.(active|closed)$/, "support.tickets.tabs"],
  [/^admin\.register-requests\.tab\.[a-z-]+$/, "admin.register-requests.role-tabs"],
  [/^(advocate|organization\.member\.[^.]+)\.services\.filter\.(all|active|paused|inactive)$/, "$1.services.filters.status"],
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compile(pattern: string, sep: string): Compiled {
  const names: string[] = [];
  const body = pattern
    .split(sep)
    .map((seg) => {
      const m = /^\{(\w+)\}$/.exec(seg);
      if (!m) return esc(seg);
      names.push(m[1]);
      return sep === "." ? "([^.:]+)" : "([^:]+)";
    })
    .join(esc(sep));
  return { re: new RegExp(`^${body}$`), names, tpl: pattern };
}

const COMPILED: Rule[] = RULES.map(([ai, legacy, kind]) => {
  const a = compile(ai, ".");
  const l = compile(legacy, ":");
  return { ai: a, legacy: l, kind, lossy: kind === "a" && a.names.some((n) => !l.names.includes(n)) };
});

function fill(tpl: string, params: Record<string, string>): string | null {
  let ok = true;
  const out = tpl.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = params[name];
    if (!v) ok = false;
    return v ?? "";
  });
  return ok ? out : null;
}

function capture(c: Compiled, id: string): Record<string, string> | null {
  const m = c.re.exec(id);
  if (!m) return null;
  const params: Record<string, string> = {};
  c.names.forEach((n, i) => {
    params[n] = m[i + 1];
  });
  return params;
}

const toLegacyCache = new Map<string, AliasHit[]>();
const toAiCache = new Map<string, AliasHit[]>();

export function legacyAliases(aiId: string): AliasHit[] {
  const hit = toLegacyCache.get(aiId);
  if (hit) return hit;
  const out: AliasHit[] = [];
  for (const r of COMPILED) {
    const params = capture(r.ai, aiId);
    if (!params) continue;
    const id = fill(r.legacy.tpl, params);
    if (id && !out.some((x) => x.id === id)) out.push({ id, exact: r.kind !== "a", lossy: r.lossy, tpl: r.ai.tpl, params: Object.values(params) });
  }
  if (toLegacyCache.size > 500) toLegacyCache.clear();
  toLegacyCache.set(aiId, out);
  return out;
}

export function aiRewrites(aiId: string): string[] {
  const out: string[] = [];
  for (const [re, to] of REWRITES) if (re.test(aiId)) out.push(aiId.replace(re, to));
  return out;
}

export function aiAliases(legacy: string): AliasHit[] {
  const hit = toAiCache.get(legacy);
  if (hit) return hit;
  const out: AliasHit[] = [];
  for (const r of COMPILED) {
    if (r.kind !== "x") continue;
    const params = capture(r.legacy, legacy);
    if (!params) continue;
    const id = fill(r.ai.tpl, params);
    if (!id) continue;
    out.push({ id, exact: true, lossy: false, tpl: r.ai.tpl, params: Object.values(params) });
    break;
  }
  if (toAiCache.size > 500) toAiCache.clear();
  toAiCache.set(legacy, out);
  return out;
}

export function canonicalAiId(legacy: string): string {
  return aiAliases(legacy)[0]?.id ?? "";
}

export function aliasRules(): { ai: string; legacy: string; exact: boolean; reverse: boolean }[] {
  return RULES.map(([ai, legacy, kind]) => ({ ai, legacy, exact: kind !== "a", reverse: kind === "x" }));
}
