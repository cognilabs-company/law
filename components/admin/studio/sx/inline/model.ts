import type { StudioConstructor } from "@/lib/services/studio";
import type { UserEvent } from "@/lib/userSocket";
import type { SxPayload } from "../contract";
import { slugify } from "../editor/slug";

export type InlineKind = "factor" | "rule" | "guarantee" | "checklist" | "template";

export type InlineTarget =
  | { kind: "new"; code: string; title: string; context: InlineContext }
  | { kind: "edit"; code: string; ctx: string; label: string; value: string }
  | { kind: "object"; code: string; id: string; label: string; value: string; isNew: boolean };

// `audience` presets who a new service rule is for, when it is created from
// one side's rule list.
export type InlineContext = { categoryId: string; list?: boolean; serviceId?: string; audience?: "client" | "executor" };

export type InlinePending = {
  objectId: string;
  code: string;
  title: string;
  isNew: boolean;
  value: string;
  status: string;
  at: number;
};

const KIND_OF: Readonly<Record<string, InlineKind>> = { K34: "factor", K31: "rule", K32: "guarantee", K06: "template" };
const TEMPLATE_LANGUAGE = "uz-latn";
const LIVE: ReadonlySet<string> = new Set(["published", "active"]);
const GONE: ReadonlySet<string> = new Set(["archived", "deleted"]);
const RULE_KEY_MAX = 64;
const OPEN_AGAIN: ReadonlySet<string> = new Set(["draft", "changes_requested", "returned", "rejected"]);

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const dict = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function inlineKindOf(code: string): InlineKind | null {
  return KIND_OF[String(code ?? "").trim().toUpperCase()] ?? null;
}

const PICKS_PENDING: ReadonlySet<InlineKind> = new Set<InlineKind>(["template"]);

export function picksPending(kind: InlineKind | null): boolean {
  return !!kind && PICKS_PENDING.has(kind);
}

export function pendingPick(multiple: boolean, current: readonly string[], item: Pick<InlinePending, "objectId" | "isNew">): string[] | null {
  if (!item.isNew || !item.objectId || current.includes(item.objectId)) return null;
  return mergeValue(multiple, current, item.objectId);
}

export function publishedPick(multiple: boolean, current: readonly string[], item: Pick<InlinePending, "objectId">, runtimeId: string): string[] | null {
  if (!runtimeId) return null;
  if (current.includes(item.objectId)) return current.map((v) => (v === item.objectId ? runtimeId : v)).filter((v, i, all) => all.indexOf(v) === i);
  if (!multiple && current.length) return null;
  return mergeValue(multiple, current, runtimeId);
}

export function inlineKeys(kind: InlineKind): { add: string; newTitle: string; editTitle: string; empty: string } {
  return {
    add: `sx.inline.add.${kind}`,
    newTitle: `sx.inline.newTitle.${kind}`,
    editTitle: `sx.inline.editTitle.${kind}`,
    empty: `sx.inline.empty.${kind}`,
  };
}

export function isLiveStatus(status: string): boolean {
  return LIVE.has(String(status ?? "").trim().toLowerCase());
}

export function canReopen(status: string): boolean {
  return OPEN_AGAIN.has(String(status ?? "").trim().toLowerCase());
}

export function isGoneStatus(status: string): boolean {
  return GONE.has(String(status ?? "").trim().toLowerCase());
}

export function ruleKeyOf(title: string): string {
  return slugify(title, RULE_KEY_MAX).replace(/-/g, "_");
}

export function topKeysOf(ctor: Pick<StudioConstructor, "typed" | "schema"> | null): Set<string> {
  const out = new Set<string>();
  if (!ctor) return out;
  for (const f of ctor.typed) out.add(f.key);
  for (const k of ctor.schema.fields) out.add(k);
  return out;
}

export function prefillOf(code: string, keys: ReadonlySet<string>, title: string, context: InlineContext): SxPayload {
  const out: Record<string, unknown> = {};
  const name = title.trim();
  if (name && keys.has("title")) out.title = name;
  if (keys.has("is_active")) out.is_active = true;
  if (inlineKindOf(code) === "template") {
    if (keys.has("mode")) out.mode = "upload";
    if (keys.has("language")) out.language = TEMPLATE_LANGUAGE;
    const service = String(context.serviceId ?? "").trim();
    if (service && keys.has("service_id")) out.service_id = service;
    return out;
  }
  if (inlineKindOf(code) !== "rule") return out;
  // A rule made from a service is always a rule of its own; the hidden
  // creation_mode still has to say so.
  if (keys.has("creation_mode")) out.creation_mode = "new";
  if (name && keys.has("rule_key")) {
    const key = ruleKeyOf(name);
    if (key) out.rule_key = key;
  }
  if (context.audience && keys.has("audience")) out.audience = context.audience;
  if (!keys.has("scope_type")) return out;
  const cat = context.categoryId.trim();
  const catKey = keys.has("category_id") ? "category_id" : keys.has("scope_id") ? "scope_id" : "";
  if (cat && catKey) {
    out.scope_type = "category";
    out[catKey] = cat;
  } else out.scope_type = "global";
  return out;
}

export function withRuleKey(code: string, keys: ReadonlySet<string>, prev: SxPayload, next: SxPayload, path: string): SxPayload {
  if (inlineKindOf(code) !== "rule" || !keys.has("rule_key") || path !== "title") return next;
  const before = str(prev.rule_key);
  if (before && before !== ruleKeyOf(str(prev.title))) return next;
  const auto = ruleKeyOf(str(next.title));
  return auto === before ? next : { ...next, rule_key: auto };
}

export function editContextUrl(ctor: Pick<StudioConstructor, "code" | "operations"> | null, code: string, value: string): string {
  const base = ctor?.operations.formContextEndpoint || `/studio/constructors/${encodeURIComponent(code)}/form-context`;
  const p = new URLSearchParams({ mode: "edit", record_id: value, source: "runtime" });
  return `${base}${base.includes("?") ? "&" : "?"}${p}`;
}

export function eventRuntimeId(e: UserEvent): string {
  const d = dict(e.data && typeof e.data === "object" ? e.data : e);
  const obj = dict(d.object);
  return str(d.runtime_target_id) || str(d.runtimeTargetId) || str(obj.runtime_target_id) || str(obj.runtimeTargetId);
}

export function eventStatus(e: UserEvent): string {
  const d = dict(e.data && typeof e.data === "object" ? e.data : e);
  const obj = dict(d.object);
  return (str(d.status) || str(obj.status)).toLowerCase();
}

export function objectHref(id: string): string {
  return `/admin/studio/o/${encodeURIComponent(id)}`;
}

export function slotOf(owner: string, formCode: string, pattern: string): string {
  return `${owner}|${formCode.toUpperCase()}|${pattern}`;
}

const OBJECT_PATH = /^\/admin\/studio\/o\/([^/?#]+)\/?$/;
let draftSeq = 0;

export function objectOwner(id: string): string {
  const v = String(id ?? "").trim();
  return v ? `obj:${v}` : "";
}

export function isDraftOwner(owner: string): boolean {
  return owner.startsWith("draft:");
}

export function newDraftOwner(): string {
  draftSeq += 1;
  return `draft:${Date.now().toString(36)}.${draftSeq.toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
}

export function pathOwner(pathname: string): string {
  const m = OBJECT_PATH.exec(pathname || "");
  if (!m) return "";
  let id = m[1];
  try {
    id = decodeURIComponent(id);
  } catch {
    return "";
  }
  return id === "new" ? "" : objectOwner(id);
}

export function manageLeadKey(kind: string, category: boolean, service: boolean): string {
  if (kind !== "rule") return "sx.inline.guarantees.lead";
  if (category) return service ? "sx.inline.rules.leadService" : "sx.inline.rules.lead";
  return service ? "sx.inline.rules.leadGlobalService" : "sx.inline.rules.leadGlobal";
}

export function mergeValue(multiple: boolean, current: readonly string[], value: string): string[] {
  if (!value) return [...current];
  if (!multiple) return [value];
  return current.includes(value) ? [...current] : [...current, value];
}
