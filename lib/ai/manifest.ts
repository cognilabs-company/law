import { isAiId, type AiElementType } from "./ids";
import { canonicalAiId } from "./aliases";
import { isSelfTarget } from "./self";
import { OVERLAY, cssEsc, intersectsViewport, isShown, modalAiId, openModalRoot } from "./dom";
import { aiField, aiFormState, aiSelections } from "./registry";
import type { ManifestElement, ManifestEntity, RuntimeState, UiManifest } from "./types";

export const ELEMENTS_MAX = 80;
export const VISIBLE_MAX = 100;
const LABEL_MAX = 80;
const DESCRIPTION_MAX = 200;

const TYPES = new Set<string>([
  "button",
  "input",
  "textarea",
  "select",
  "card",
  "section",
  "tab",
  "modal",
  "table",
  "list",
  "list_item",
  "link",
  "file_dropzone",
  "editor",
  "chat",
  "call_button",
  "rating",
  "payment_gate",
]);

const SENSITIVE_SEGMENTS = new Set([
  "password",
  "parol",
  "otp",
  "code",
  "sms",
  "pin",
  "card",
  "cards",
  "card-number",
  "cvv",
  "cvc",
  "passport",
  "pinfl",
  "jshshir",
  "phone",
  "tel",
  "telephone",
  "email",
  "mail",
]);

const NATIVE_FIELD = "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([type=file]),textarea,select";
const FOCUSABLE_FIELD = `${NATIVE_FIELD},[contenteditable=true]`;
const FREE_TEXT = "textarea,input:not([type]),input[type=text],input[type=search],[contenteditable=true]";

export type FoundElement = { id: string; el: HTMLElement; inView: boolean; legacy: boolean };

export function sensitiveName(name: string): boolean {
  return name
    .toLowerCase()
    .split(/[.\-_:\s]+/)
    .some((seg) => SENSITIVE_SEGMENTS.has(seg));
}

export function sensitiveInput(el: HTMLElement): boolean {
  if (el.closest("[data-ai-private]")) return true;
  if (el instanceof HTMLInputElement) {
    const type = el.type.toLowerCase();
    if (["password", "hidden", "file", "email", "tel"].includes(type)) return true;
  }
  const ac = (el.getAttribute("autocomplete") || "").toLowerCase();
  if (/one-time-code|cc-|new-password|current-password|tel|email/.test(ac)) return true;
  const names = [el.getAttribute("name"), el.id, el.getAttribute("data-ai-id"), el.getAttribute("data-ai-target"), el.getAttribute("inputmode") === "tel" ? "tel" : ""].filter(Boolean) as string[];
  return names.some(sensitiveName);
}

export function nativeField(el: HTMLElement): HTMLElement | null {
  if (el.matches(NATIVE_FIELD)) return el;
  return Array.from(el.querySelectorAll<HTMLElement>(NATIVE_FIELD)).find((x) => isShown(x)) ?? null;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function digitsIn(s: string): number {
  return s.replace(/\D/g, "").length;
}

export function redactLabel(raw: string, max = LABEL_MAX): string {
  const s = clean(raw)
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "***")
    .replace(/\+\d[\d\s()-]{6,}\d/g, "***")
    .replace(/\b[A-Z]{2}\s?\d{7}\b/g, "***")
    .replace(/\d{7,}/g, "***")
    .replace(/\d[\d\s-]{8,}\d/g, (m) => (digitsIn(m) >= 9 ? "***" : m));
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function isPrivate(node: Element, root: Element): boolean {
  const p = node.closest("[data-ai-private]");
  return Boolean(p && (p === root || root.contains(p) || p.contains(root)));
}

function textOf(from: Element, root: Element, max = 240): string {
  if (isPrivate(from, root)) return "";
  let out = "";
  const walker = document.createTreeWalker(from, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const parent = n.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest("textarea,input,select,option,script,style,[aria-hidden=true],[data-ai-private]")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n && out.length < max; n = walker.nextNode()) out += ` ${n.nodeValue ?? ""}`;
  return clean(out);
}

function fieldLabel(field: HTMLElement): string {
  const aria = field.getAttribute("aria-label");
  if (aria && clean(aria)) return aria;
  const ph = field.getAttribute("placeholder");
  if (ph && clean(ph)) return ph;
  const id = field.id;
  const lab = id ? document.querySelector(`label[for="${cssEsc(id)}"]`) : field.closest("label");
  return lab ? textOf(lab, lab) : "";
}

export function aiLabel(el: HTMLElement): string {
  const explicit = el.getAttribute("data-ai-label") || el.getAttribute("aria-label");
  if (explicit && clean(explicit)) return redactLabel(explicit);
  if (el.closest("[data-ai-private]")) return "";
  const field = el.matches(NATIVE_FIELD) ? el : null;
  if (field) return redactLabel(fieldLabel(field));
  const heading = el.querySelector<HTMLElement>("h1,h2,h3,h4,b,strong,label");
  const fromHeading = heading ? textOf(heading, el) : "";
  if (fromHeading) return redactLabel(fromHeading);
  const text = textOf(el, el);
  if (text) return redactLabel(text);
  const inner = nativeField(el);
  return inner ? redactLabel(fieldLabel(inner)) : "";
}

function typeOf(el: HTMLElement, id: string): AiElementType {
  const explicit = el.getAttribute("data-ai-type") || "";
  if (TYPES.has(explicit)) return explicit as AiElementType;
  const tag = el.tagName;
  const role = el.getAttribute("role") || "";
  if (role === "dialog" || tag === "DIALOG") return "modal";
  if (tag === "TEXTAREA") return "textarea";
  if (tag === "SELECT" || role === "combobox" || role === "listbox") return "select";
  if (tag === "INPUT") return (el as HTMLInputElement).type === "file" ? "file_dropzone" : "input";
  if (el.isContentEditable) return "editor";
  if (role === "tab") return "tab";
  if (tag === "A") return "link";
  if (tag === "BUTTON" || role === "button" || role === "switch") return /\.call\./.test(id) ? "call_button" : "button";
  if (tag === "TABLE" || role === "table" || role === "grid") return "table";
  if (tag === "UL" || tag === "OL" || role === "list") return "list";
  if (tag === "LI" || role === "listitem") return "list_item";
  if (/\.input$/.test(id)) return "input";
  if (/(^|\.)(list|results|queue|categories|history)$/.test(id)) return "list";
  if (/(^|\.)(chat|messages)$/.test(id)) return "chat";
  if (/\.rating$/.test(id)) return "rating";
  if (/(^|\.)editor$/.test(id)) return "editor";
  if (/(\.|-)modal$/.test(id)) return "modal";
  if (tag === "ARTICLE" || /^(pricing\.plan|marketplace\.seller|documents\.template|services\.card|support\.ticket)\.[^.]+$/.test(id)) return "card";
  return "section";
}

const ENTITY_RULES: [RegExp, string, "id" | "slug", number][] = [
  [/^pricing\.plan\.([^.]+)/, "subscription_plan", "slug", 1],
  [/^marketplace\.seller\.([^.]+)\.service\.([^.]+)/, "marketplace_service", "id", 2],
  [/^marketplace\.seller\.([^.]+)/, "seller", "id", 1],
  [/^marketplace\.service\.([^.]+)/, "marketplace_service", "id", 1],
  [/^services\.card\.([^.]+)/, "service", "id", 1],
  [/^documents\.template\.([^.]+)/, "document_template", "id", 1],
  [/^documents\.(?:request|my\.item)\.([^.]+)/, "document_request", "id", 1],
  [/^(?:call_center\.)?support\.ticket\.([^.]+)/, "support_ticket", "id", 1],
  [/^urgent_advokat\.request\.(?!(?:form|direction|description|submit|channel|kind|kind-picker|lawyer-count|total|modal)(?:\.|$))([^.]+)/, "urgent_advokat_request", "id", 1],
  [/^call_center\.urgent-advokat\.item\.([^.]+)/, "urgent_advokat_request", "id", 1],
  [/^works\.item\.([^.]+)/, "work", "id", 1],
  [/^advocate\.document-requests\.item\.([^.]+)/, "document_request", "id", 1],
  [/^advocate\.marketplace-orders\.item\.([^.]+)/, "marketplace_order", "id", 1],
  [/^payments\.item\.([^.]+)/, "payment", "id", 1],
];

function entityOf(el: HTMLElement, id: string): ManifestEntity | undefined {
  const type = el.getAttribute("data-ai-entity-type") || "";
  const eid = el.getAttribute("data-ai-entity-id") || "";
  const slug = el.getAttribute("data-ai-entity-slug") || "";
  if (type) return { type, ...(eid ? { id: eid } : {}), ...(slug ? { slug } : {}) };
  for (const [re, kind, key, group] of ENTITY_RULES) {
    const m = re.exec(id);
    if (m) return key === "slug" ? { type: kind, slug: m[group] } : { type: kind, id: m[group] };
  }
  return undefined;
}

function fillable(el: HTMLElement, id: string): boolean {
  const reg = aiField(id);
  if (reg) return reg.fillable !== false && !reg.disabled && !sensitiveName(id);
  const field = nativeField(el);
  return Boolean(field && field.tagName !== "TEXTAREA" && !sensitiveInput(field) && !field.matches("[disabled],[readonly]"));
}

function focusable(el: HTMLElement): boolean {
  const field = el.matches(FOCUSABLE_FIELD) ? el : (Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_FIELD)).find((x) => isShown(x)) ?? null);
  return Boolean(field && !field.matches("[disabled],[readonly],[aria-disabled=true]"));
}

function actionsOf(el: HTMLElement, id: string, type: AiElementType): string[] {
  const explicit = (el.getAttribute("data-ai-actions") || "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (explicit.length) return explicit;
  if (type === "modal") return ["highlight"];
  const out = ["highlight", "scroll_to"];
  if (type === "input" || type === "textarea" || type === "select" || type === "editor") {
    if (focusable(el)) out.push("focus_input");
    if (fillable(el, id)) out.push("fill_form");
  }
  if (type === "link") out.push("navigate");
  if (/\.(buy|submit|generate)$|operator-handoff\.button$/.test(id)) out.push("preview_action");
  return out;
}

function routeOf(el: HTMLElement): string | undefined {
  const link = el.tagName === "A" ? el : null;
  const href = link?.getAttribute("href") || "";
  if (!href.startsWith("/") || href.startsWith("//")) return undefined;
  const path = href.split(/[?#]/)[0].replace(/\/+$/, "");
  return path || "/";
}

export function currentRoute(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

export function pageTitle(): string {
  if (typeof document === "undefined") return "";
  const el = document.querySelector<HTMLElement>('[data-ai-target="ai-help:current-page"]');
  const own = el ? clean(el.getAttribute("data-ai-label") || el.textContent || "") : "";
  return redactLabel(own || document.title || "");
}

export function collectAiElements(limit = VISIBLE_MAX, keepSelf = false): FoundElement[] {
  if (typeof document === "undefined") return [];
  const modal = openModalRoot();
  const scope: ParentNode = modal ?? document;
  const seen = new Set<string>();
  const inView: FoundElement[] = [];
  const rest: FoundElement[] = [];
  for (const el of Array.from(scope.querySelectorAll<HTMLElement>("[data-ai-id],[data-ai-target]"))) {
    if (el.closest(OVERLAY)) continue;
    const own = el.getAttribute("data-ai-id") || "";
    const id = own && isAiId(own) ? own : canonicalAiId(el.getAttribute("data-ai-target") || "");
    if (!id || seen.has(id) || (!keepSelf && isSelfTarget(id)) || !isShown(el)) continue;
    seen.add(id);
    const item = { id, el, inView: intersectsViewport(el), legacy: !(own && isAiId(own)) };
    if (item.inView) inView.push(item);
    else rest.push(item);
  }
  return [...inView, ...rest].slice(0, limit);
}

export function manifestElement(f: FoundElement): ManifestElement {
  const type = typeOf(f.el, f.id);
  const description = clean(f.el.getAttribute("data-ai-description") || "");
  const route = routeOf(f.el);
  const entity = entityOf(f.el, f.id);
  return {
    ai_id: f.id,
    type,
    label: aiLabel(f.el),
    ...(description ? { description: redactLabel(description, DESCRIPTION_MAX) } : {}),
    actions: actionsOf(f.el, f.id, type),
    ...(route ? { route } : {}),
    ...(entity ? { entity } : {}),
  };
}

export function safeFormState(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, value] of Object.entries(aiFormState())) {
    if (sensitiveName(id)) continue;
    const el = typeof document === "undefined" ? null : document.querySelector<HTMLElement>(`[data-ai-id="${cssEsc(id)}"]`);
    const field = el ? (nativeField(el) ?? el) : null;
    if (field && sensitiveInput(field)) continue;
    const free = field ? field.matches(FREE_TEXT) : !/^\d+(\.\d+)?$/.test(value);
    out[id] = free ? redactLabel(value, 300) : value;
  }
  return out;
}

export function buildRuntimeState(found?: FoundElement[]): RuntimeState {
  const list = found ?? collectAiElements(VISIBLE_MAX);
  return {
    current_route: currentRoute(),
    visible_ai_ids: list.slice(0, VISIBLE_MAX).map((f) => f.id),
    selected_items: aiSelections(),
    form_state: safeFormState(),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    open_modal: modalAiId(openModalRoot()),
  };
}

export function buildUiManifest(opts: { role: string; description?: string }, found?: FoundElement[]): UiManifest {
  const list = found ?? collectAiElements(ELEMENTS_MAX);
  const description = opts.description ? redactLabel(opts.description, DESCRIPTION_MAX) : "";
  return {
    route: currentRoute(),
    role: opts.role,
    page_title: pageTitle(),
    ...(description ? { page_description: description } : {}),
    elements: list.slice(0, ELEMENTS_MAX).map(manifestElement),
  };
}

export function buildAiSnapshot(opts: { role: string; description?: string; selfHelp?: boolean }): { runtime_state: RuntimeState; ui_manifest: UiManifest } {
  const found = collectAiElements(VISIBLE_MAX, Boolean(opts.selfHelp));
  return { runtime_state: buildRuntimeState(found), ui_manifest: buildUiManifest(opts, found) };
}
