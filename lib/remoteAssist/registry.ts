import { collectAiElements, manifestElement, nativeField, aiLabel } from "@/lib/ai/manifest";
import { cssEsc, isShown, modalAiId, openModalRoot } from "@/lib/ai/dom";
import { aiField, aiModalIds, aiModalOpener } from "@/lib/ai/registry";
import type { RaElement, RaSensitivity, RaState } from "@/lib/services/remoteAssist";

// The client half of remote assistance (contract §9–§10, §18, §20).
//
// Components: the app's semantic registry — every element with a stable
// `data-ai-id` (the same ids the AI guide drives), the field adapters
// registered with useAiField and the modal openers registered with
// useAiModal. Nothing is matched by CSS selector, text or coordinates, and a
// component the registry doesn't know can't be targeted.
//
// Routes: only the client route families below can be published or opened.

// ---- route registry ----

export type RaPageDef = { pageId: string; match: RegExp; home?: string };

export const RA_PAGES: RaPageDef[] = [
  { pageId: "client.dashboard", match: /^\/portal\/client$/, home: "/portal/client" },
  { pageId: "client.subscription", match: /^\/portal\/client\/subscriptions?$/, home: "/portal/client/subscription" },
  { pageId: "client.pricing", match: /^\/subscription$/ },
  { pageId: "client.marketplace", match: /^\/(?:portal\/client\/)?lawyers$/, home: "/portal/client/lawyers" },
  { pageId: "client.marketplace.seller", match: /^\/(?:portal\/client\/)?lawyers\/[A-Za-z0-9_-]+$/ },
  { pageId: "client.marketplace.orders", match: /^\/portal\/client\/marketplace-orders(?:\/[A-Za-z0-9_-]+)?$/, home: "/portal/client/marketplace-orders" },
  { pageId: "client.documents", match: /^\/(?:portal\/client\/)?services(?:\/[A-Za-z0-9_-]+)*$/, home: "/portal/client/services" },
  { pageId: "client.my_documents", match: /^\/portal\/client\/documents$/, home: "/portal/client/documents" },
  { pageId: "client.my_works", match: /^\/portal\/client\/works$/, home: "/portal/client/works" },
  { pageId: "client.urgent_lawyer", match: /^\/portal\/client\/urgent(?:-advokat)?$/, home: "/portal/client/urgent" },
  { pageId: "client.support", match: /^\/portal\/client\/support(?:\/[A-Za-z0-9_-]+)?$/, home: "/portal/client/support" },
  { pageId: "client.messages", match: /^\/portal\/client\/messages$/, home: "/portal/client/messages" },
  { pageId: "client.profile", match: /^\/portal\/client\/profile$/, home: "/portal/client/profile" },
];

// Pages the operator can pick from (a fixed list — never a typed URL).
export const RA_NAV_TARGETS = RA_PAGES.filter((p) => p.home).map((p) => ({ pageId: p.pageId, route: p.home as string }));

const LOCALE = /^\/(uz|ru|en)(?=\/|$)/;

export function raPathOf(raw: string): string {
  return (raw.split(/[?#]/)[0].replace(LOCALE, "").replace(/\/+$/, "") || "/").slice(0, 500);
}

export function raPageOf(pathname: string): RaPageDef | null {
  const path = raPathOf(pathname);
  return RA_PAGES.find((p) => p.match.test(path)) ?? null;
}

// A route the operator may send the client to: a same-app path (optionally
// with a plain query) inside the registry. Protocol-relative, backslashes,
// encoded tricks, schemes and anything outside the registry are refused.
export function raSafeRoute(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || s.length > 500 || !/^\/[A-Za-z0-9/_-]*(\?[A-Za-z0-9=&_.%-]*)?$/.test(s) || s.startsWith("//") || s.includes("/../") || /%2f|%5c|%2e/i.test(s)) return "";
  const path = raPathOf(s);
  if (!raPageOf(path)) return "";
  const q = s.indexOf("?");
  return q >= 0 ? path + s.slice(q) : path;
}

// ---- sensitivity ----

const SECRET_SEGMENTS = new Set([
  "password", "parol", "otp", "sms", "pin", "cvv", "cvc", "cards", "iban", "sign", "signature", "esign", "imzo", "biometric",
  "passport", "pinfl", "jshshir", "identity", "myid", "token", "secret", "security", "2fa", "totp", "payment", "payments", "pay",
  "autopay", "checkout", "recovery",
]);
// Multi-word secrets ("card" alone is a UI card, not a bank card).
const SECRET_PHRASES = /(?:^|[.\-_])(?:bind-card|card-number|bank-card|two-factor|e-sign)(?=$|[.\-_])/i;
const PERSONAL_SEGMENTS = new Set(["phone", "tel", "telephone", "email", "mail", "name", "fullname", "firstname", "lastname", "surname", "address", "birth", "birthday", "dob"]);

const segments = (s: string) => s.toLowerCase().split(/[.\-_:\s]+/).filter(Boolean);

export function raSensitivityOfId(id: string): RaSensitivity {
  const segs = segments(id);
  if (SECRET_PHRASES.test(id) || segs.some((x) => SECRET_SEGMENTS.has(x))) return "secret";
  if (segs.some((x) => PERSONAL_SEGMENTS.has(x))) return "personal";
  return "normal";
}

export type RaFieldFacts = { type?: string; autocomplete?: string; inputmode?: string; private?: boolean; marked?: string };

// Sensitivity of one registered component: an explicit data-ra-sensitivity,
// else its id, else what its native field says. Secret components are never
// published.
export function raSensitivityOf(id: string, f: RaFieldFacts = {}): RaSensitivity {
  const marked = (f.marked ?? "").toLowerCase();
  if (marked === "secret" || marked === "personal" || marked === "normal") return marked;
  const byId = raSensitivityOfId(id);
  if (byId === "secret") return "secret";
  const type = (f.type ?? "").toLowerCase();
  const ac = (f.autocomplete ?? "").toLowerCase();
  if (type === "password" || type === "file" || ac.startsWith("cc-") || ac.includes("password") || ac === "one-time-code") return "secret";
  if (byId === "personal" || f.private || type === "email" || type === "tel" || f.inputmode === "tel" || /^(name|given-name|family-name|email|tel|street-address|address-line|postal-code|bday)/.test(ac)) return "personal";
  return "normal";
}

// ---- actions ----

const FINAL = /\.(buy|submit|generate|send|pay|confirm|checkout|accept|purchase|order|finish|complete)$/;
const NEXT = /\.(next|continue|forward)$/;
const BACK = /\.(back|prev|previous)$/;
const TOGGLE_TYPES = new Set(["checkbox", "switch", "toggle", "radio"]);

export type RaKind = "field" | "select" | "toggle" | "editor" | "button" | "other";

export function raActionsFor(id: string, kind: RaKind, o: { disabled?: boolean; fillable?: boolean; focusable?: boolean }): string[] {
  const out = ["element.highlight", "element.tooltip", "page.scroll_to"];
  if (o.disabled) return out;
  if (kind === "field" || kind === "select") {
    if (o.focusable !== false) out.push("element.focus");
    if (o.fillable !== false) out.push(kind === "select" ? "form.select_option" : "form.set_value");
    if (kind === "field" && o.fillable !== false) out.push("draft.prepare");
  }
  if (kind === "toggle") out.push("element.focus", "form.toggle");
  if (kind === "editor") out.push("editor.open", "editor.highlight");
  if (kind === "button" || kind === "other") {
    if (NEXT.test(id)) out.push("step.next");
    else if (BACK.test(id)) out.push("step.back");
    else if (FINAL.test(id)) out.push("confirmation.present");
    if (/(open-editor|editor\.open)$/.test(id)) out.push("editor.open");
  }
  return out;
}

// ---- collection (DOM side) ----

export type RaLive = { def: RaElement; el: HTMLElement; field: HTMLElement | null; kind: RaKind };

const FIELD_TYPES = new Set(["input", "textarea"]);

function kindOf(el: HTMLElement, field: HTMLElement | null, type: string): RaKind {
  const raw = (el.getAttribute("data-ai-type") || "").toLowerCase();
  const role = (el.getAttribute("role") || "").toLowerCase();
  const input = field instanceof HTMLInputElement ? field : el instanceof HTMLInputElement ? el : null;
  if (TOGGLE_TYPES.has(raw) || role === "switch" || role === "checkbox" || (input && (input.type === "checkbox" || input.type === "radio"))) return "toggle";
  if (type === "select" || field instanceof HTMLSelectElement) return "select";
  if (type === "editor") return "editor";
  if (FIELD_TYPES.has(type) || field) return "field";
  if (type === "button" || type === "call_button" || type === "link" || type === "tab" || el.tagName === "BUTTON" || role === "button") return "button";
  return "other";
}

function disabledOf(el: HTMLElement, field: HTMLElement | null): boolean {
  const t = field ?? el;
  return t.matches(":disabled,[aria-disabled=true]") || el.matches(":disabled,[aria-disabled=true]");
}

function checkedOf(el: HTMLElement, field: HTMLElement | null): boolean | null {
  const input = field instanceof HTMLInputElement ? field : el instanceof HTMLInputElement ? el : null;
  if (input && (input.type === "checkbox" || input.type === "radio")) return input.checked;
  for (const a of ["aria-checked", "aria-pressed", "aria-selected"]) {
    const v = el.getAttribute(a);
    if (v === "true" || v === "false") return v === "true";
  }
  return null;
}

function hasValue(id: string, field: HTMLElement | null, el: HTMLElement): boolean {
  const reg = aiField(id);
  if (reg) return reg.get().trim().length > 0;
  if (field && "value" in field) return String((field as HTMLInputElement).value ?? "").trim().length > 0;
  if (el.isContentEditable) return (el.textContent ?? "").trim().length > 0;
  return false;
}

// Coarse state only — a field reports filled/empty, never its value.
export function raStateOf(id: string, el: HTMLElement, field: HTMLElement | null, kind: RaKind): RaState {
  if (el.getAttribute("aria-busy") === "true") return "loading";
  if (disabledOf(el, field)) return "disabled";
  if ((field ?? el).getAttribute("aria-invalid") === "true") return "invalid";
  const checked = checkedOf(el, field);
  if (kind === "toggle" || (checked !== null && (el.getAttribute("role") === "tab" || el.getAttribute("data-ai-type") === "tab"))) return checked ? "selected" : "unselected";
  if (kind === "field" || kind === "select" || kind === "editor") return hasValue(id, field, el) ? "filled" : "empty";
  return "ready";
}

const humanize = (id: string) =>
  id
    .split(".")
    .slice(-2)
    .join(" › ")
    .replace(/[-_]+/g, " ")
    .slice(0, 200);

export const RA_MAX_ELEMENTS = 300;

// Everything the operator may see on the client's screen right now: the
// registered, visible components (inside the open modal when one is open),
// plus registered modals that can be opened. Secret components are left out.
export function raCollect(known?: Set<string>): RaLive[] {
  if (typeof document === "undefined") return [];
  const out: RaLive[] = [];
  for (const f of collectAiElements(RA_MAX_ELEMENTS)) {
    if (f.legacy || f.el.closest("[data-ra-ignore]")) continue;
    const id = f.id;
    if (id.length < 2 || id.length > 200) continue;
    const field = nativeField(f.el) ?? (f.el.isContentEditable ? f.el : null);
    const input = field instanceof HTMLInputElement ? field : null;
    const sensitivity = raSensitivityOf(id, {
      type: input?.type,
      autocomplete: field?.getAttribute("autocomplete") ?? undefined,
      inputmode: field?.getAttribute("inputmode") ?? undefined,
      private: Boolean(f.el.closest("[data-ai-private]")),
      marked: f.el.closest("[data-ra-sensitivity]")?.getAttribute("data-ra-sensitivity") ?? undefined,
    });
    if (sensitivity === "secret") continue;
    const m = manifestElement(f);
    const kind = kindOf(f.el, field, m.type);
    const reg = aiField(id);
    const disabled = disabledOf(f.el, field) || Boolean(reg?.disabled);
    const readOnly = Boolean(field?.matches("[readonly]"));
    const fillable = reg ? reg.fillable !== false && !reg.sensitive : Boolean(field) && !readOnly;
    let actions = raActionsFor(id, kind, { disabled, fillable, focusable: Boolean(field) && !readOnly });
    if (known) actions = actions.filter((a) => known.has(a));
    out.push({
      def: { componentId: id, label: (m.label || aiLabel(f.el) || humanize(id)).slice(0, 200), actions: actions.slice(0, 20), sensitivity, state: raStateOf(id, f.el, field, kind) },
      el: f.el,
      field,
      kind,
    });
  }
  // Openers registered for modals that are not open (and so not on screen).
  const openId = modalAiId(openModalRoot());
  if (!known || known.has("modal.open")) {
    for (const id of aiModalIds()) {
      if (out.length >= RA_MAX_ELEMENTS) break;
      if (id === openId || out.some((x) => x.def.componentId === id) || raSensitivityOfId(id) === "secret") continue;
      out.push({ def: { componentId: id, label: humanize(id), actions: ["modal.open"], sensitivity: "normal", state: "ready" }, el: document.body, field: null, kind: "other" });
    }
  }
  return out.slice(0, RA_MAX_ELEMENTS);
}

// Short hash of what the operator would see, to publish only real changes.
export function raSignature(pageId: string, route: string, elements: RaElement[]): string {
  let h = 2166136261;
  const s = `${pageId}|${route}|${elements.map((e) => `${e.componentId}:${e.state}:${e.actions.join("+")}`).join(",")}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// ---- adapters used by the executor ----

// Sets a field through its registered adapter, else the way typing would so
// React's onChange and the form's own validation run.
export function raSetValue(live: RaLive, value: string): void {
  const reg = aiField(live.def.componentId);
  if (reg) return reg.set(value);
  const el = live.field;
  if (!el) throw new Error("not_fillable");
  if (el.isContentEditable) {
    el.textContent = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    return;
  }
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export function raSelectOption(live: RaLive, value: string): void {
  const reg = aiField(live.def.componentId);
  if (reg) return reg.set(value);
  const el = live.field;
  if (!(el instanceof HTMLSelectElement)) throw new Error("not_selectable");
  const opt = Array.from(el.options).find((o) => !o.disabled && (o.value === value || o.text.trim().toLowerCase() === value.trim().toLowerCase()));
  if (!opt) throw new Error("option_not_found");
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(el, opt.value);
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

// Toggles through the control's own click handler (React's checkbox/switch
// state follows it); with an explicit target value it only clicks if needed.
export function raToggle(live: RaLive, want?: boolean): void {
  const input = live.field instanceof HTMLInputElement ? live.field : live.el instanceof HTMLInputElement ? live.el : null;
  const target = input ?? live.el;
  const now = checkedOf(live.el, live.field);
  if (want !== undefined && now === want) return;
  target.click();
}

export function raFieldValid(live: RaLive): boolean {
  const f = live.field;
  if (f && "checkValidity" in f && typeof (f as HTMLInputElement).checkValidity === "function") return (f as HTMLInputElement).checkValidity();
  return (f ?? live.el).getAttribute("aria-invalid") !== "true";
}

export async function raOpenModal(id: string): Promise<boolean> {
  const opener = aiModalOpener(id);
  if (!opener) return false;
  opener();
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (modalAiId(openModalRoot()) === id) return true;
    const el = document.querySelector<HTMLElement>(`[data-ai-id="${cssEsc(id)}"]`);
    if (el && isShown(el)) return true;
  }
  return false;
}

// ---- the pointer overlay ----

let ring: HTMLDivElement | null = null;
let ringTimer: ReturnType<typeof setTimeout> | undefined;
let ringRaf = 0;

export function raClearHighlight(): void {
  clearTimeout(ringTimer);
  cancelAnimationFrame(ringRaf);
  ring?.remove();
  ring = null;
}

// A pulsing ring (and the operator's text) glued to the component while the
// page scrolls. Pure decoration: it never changes the page itself.
export function raHighlight(el: HTMLElement, note: string, who: string, ms = 7000): void {
  raClearHighlight();
  el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  const box = document.createElement("div");
  box.className = "ra-ring";
  box.setAttribute("data-ra-ignore", "");
  box.setAttribute("data-ai-ignore", "");
  box.setAttribute("aria-hidden", "true");
  const tip = document.createElement("div");
  tip.className = "ra-ring__tip";
  const b = document.createElement("b");
  b.textContent = who;
  tip.appendChild(b);
  if (note) {
    const span = document.createElement("span");
    span.textContent = note;
    tip.appendChild(span);
  }
  box.appendChild(tip);
  document.body.appendChild(box);
  ring = box;
  const place = () => {
    if (!ring || !el.isConnected) return;
    const r = el.getBoundingClientRect();
    ring.style.transform = `translate(${Math.round(r.left - 6)}px, ${Math.round(r.top - 6)}px)`;
    ring.style.width = `${Math.round(r.width + 12)}px`;
    ring.style.height = `${Math.round(r.height + 12)}px`;
    ring.dataset.below = r.top < 90 ? "1" : "";
    ringRaf = requestAnimationFrame(place);
  };
  place();
  ringTimer = setTimeout(raClearHighlight, ms);
}
