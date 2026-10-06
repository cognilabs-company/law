import type { GuideRole } from "@/lib/guide/types";
import { guideHref, normPath, routeAllowed } from "@/lib/guide/routes";
import { registryTargets } from "@/lib/guide/pages";
import { canonicalAiId } from "./aliases";
import { AI_LAUNCHER_ID, isSelfTarget } from "./self";
import type { AiTargetDecl } from "./types";

export const CROSS_TARGETS_MAX = 40;

const LABEL_MAX = 80;

type Dest = { id: string; type: string; route: string; key: string; sellers?: boolean };

const SUB = "/portal/client/subscription";
const DOCS = "/portal/client/services";
const MY_DOCS = "/portal/client/documents";
const MARKET = "/portal/client/lawyers";
const SUPPORT = "/portal/client/support";
const URGENT = "/portal/client/urgent";
const WORKS = "/portal/client/works";

const DESTS: Dest[] = [
  { id: "pricing.plan.lexgo-ai-pro", type: "card", route: SUB, key: "planPro", sellers: true },
  { id: "documents.create.open", type: "button", route: DOCS, key: "docCreate" },
  { id: "marketplace.ai-search.input", type: "input", route: MARKET, key: "aiSearch" },
  { id: "support.operator-handoff.button", type: "button", route: SUPPORT, key: "operator", sellers: true },
  { id: "urgent_advokat.services", type: "section", route: URGENT, key: "urgentServices" },
  { id: "pricing.plan.lexgo-ai-free", type: "card", route: SUB, key: "planFree", sellers: true },
  { id: "pricing.plan.lexgo-ai-lite", type: "card", route: SUB, key: "planLite", sellers: true },
  { id: "pricing.plan.shaxsiy-advokat-standard", type: "card", route: SUB, key: "planStandard", sellers: true },
  { id: "pricing.plan.shaxsiy-advokat-premium", type: "card", route: SUB, key: "planPremium", sellers: true },
  { id: "documents.catalog.search", type: "input", route: DOCS, key: "docSearch" },
  { id: "documents.catalog.category.fuqarolik", type: "card", route: DOCS, key: "catCivil" },
  { id: "documents.catalog.category.jinoiy", type: "card", route: DOCS, key: "catCriminal" },
  { id: "documents.catalog.category.mamuriy", type: "card", route: DOCS, key: "catAdmin" },
  { id: "documents.catalog.category.iqtisodiy", type: "card", route: DOCS, key: "catEconomic" },
  { id: "documents.my.list", type: "list", route: MY_DOCS, key: "myDocs" },
  { id: "marketplace.search.input", type: "input", route: MARKET, key: "search" },
  { id: "marketplace.filters.seller-type", type: "select", route: MARKET, key: "sellerType" },
  { id: "support.new-ticket", type: "section", route: SUPPORT, key: "newTicket", sellers: true },
  { id: "urgent_advokat.service.video-consultation", type: "card", route: URGENT, key: "urgentVideo" },
  { id: "urgent_advokat.service.chat-consultation", type: "card", route: URGENT, key: "urgentChat" },
  { id: "urgent_advokat.service.second-opinion-single", type: "card", route: URGENT, key: "urgentSingle" },
  { id: "urgent_advokat.service.second-opinion-group", type: "card", route: URGENT, key: "urgentGroup" },
  { id: "works.list", type: "list", route: WORKS, key: "works" },
  { id: "pricing.telegram-request-modal", type: "modal", route: SUB, key: "telegramModal", sellers: true },
];

const ID_TYPES: [RegExp, string][] = [
  [/(-modal|\.modal)$/, "modal"],
  [/\.(input|search)$/, "input"],
  [/(^|\.)(list|results|queue|categories|subcategories|templates|history|members|requests)$/, "list"],
  [/\.(open|buy|submit|create|add|cta|conflict-check|toggle|button)$/, "button"],
  [/^pricing\.plan\.[^.]+$/, "card"],
  [/(^|\.)tabs$/, "tab"],
];

function typeOfId(id: string): string {
  return ID_TYPES.find(([re]) => re.test(id))?.[1] ?? "section";
}

const clip = (s: string) => {
  const v = s.replace(/\s+/g, " ").trim();
  return v.length > LABEL_MAX ? `${v.slice(0, LABEL_MAX - 1).trimEnd()}…` : v;
};

export type DestLabels = { dest: (key: string) => string; tour: (key: string) => string };

export type CrossTargetOpts = {
  role: GuideRole;
  path: string;
  allowed: string[];
  labels: DestLabels;
  exclude?: Iterable<string>;
  selfHelp?: boolean;
  max?: number;
};

export function crossPageTargets(opts: CrossTargetOpts): AiTargetDecl[] {
  const { role, labels } = opts;
  const max = opts.max ?? CROSS_TARGETS_MAX;
  const here = normPath(opts.path);
  const skip = new Set(opts.exclude ?? []);
  const out: AiTargetDecl[] = [];
  const seen = new Set<string>();
  if (opts.selfHelp) {
    out.push({ ai_id: AI_LAUNCHER_ID, type: "button", label: clip(labels.dest("launcher") || AI_LAUNCHER_ID), route: here });
    seen.add(AI_LAUNCHER_ID);
  }
  const push = (id: string, route: string, type: string, label: string) => {
    if (out.length >= max || !id || seen.has(id) || skip.has(id) || isSelfTarget(id)) return;
    const to = guideHref(route, role);
    if (!to || normPath(to) === here || !routeAllowed(to, opts.allowed, role)) return;
    seen.add(id);
    out.push({ ai_id: id, type, label: clip(label || id), route: normPath(to) });
  };
  const seller = role === "lawyer" || role === "advocate";
  for (const d of DESTS) if (role === "client" || (seller && d.sellers)) push(d.id, d.route, d.type, labels.dest(d.key));
  for (const r of registryTargets(role, opts.path)) {
    const id = canonicalAiId(r.id);
    if (id) push(id, r.route, typeOfId(id), labels.tour(r.text));
  }
  return out;
}
