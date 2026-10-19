import { parseServerTime } from "@/lib/http";
import type { StudioAccess, StudioComment, StudioDetail, StudioStep, StudioVersion } from "@/lib/services/studio";
import type { SxPayload, SxValues } from "../contract";
import type { SxErrors, SxStatusKey } from "../types";
import { EN_WORDS, codeLike, isEnglishLooking } from "../labels";
import type { StudioLabels } from "../useStudioLabels";
import type { EditorMode, EditorPrimary, EditorState } from "./useEditorState";
import type { SxLifecycle } from "./objectApi";

export const SAVE_SHORTCUT = "Control+S Meta+S";

export function isSaveShortcut(e: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "key">): boolean {
  return (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && String(e.key ?? "").toLowerCase() === "s";
}

export function ctxModeOf(ctx: string): "" | "create" | "view" | "edit" | "clone" {
  const text = String(ctx ?? "").trim();
  if (!text) return "";
  const m = /[?&]mode=(view|edit|clone|create)(?=$|[&#])/.exec(text);
  return m ? (m[1] as "create" | "view" | "edit" | "clone") : "create";
}

export function editorModeOf(id: string | null, ctx: string): EditorMode {
  if (id) return "object";
  const m = ctxModeOf(ctx);
  if (m === "view") return "runtime-view";
  if (m === "edit") return "runtime-edit";
  if (m === "clone") return "clone";
  return "create";
}

function sortedValue(v: unknown, stack: object[]): unknown {
  if (typeof v === "bigint") throw new TypeError("bigint");
  if (v === null || typeof v !== "object") return v;
  const withJson = v as { toJSON?: () => unknown };
  if (typeof withJson.toJSON === "function") return sortedValue(withJson.toJSON(), stack);
  if (stack.includes(v)) throw new TypeError("cycle");
  stack.push(v);
  let out: unknown;
  if (Array.isArray(v)) out = v.map((x) => sortedValue(x, stack));
  else {
    const src = v as Record<string, unknown>;
    const obj: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) obj[k] = sortedValue(src[k], stack);
    out = obj;
  }
  stack.pop();
  return out;
}

export function stableJson(v: unknown): string {
  try {
    return JSON.stringify(sortedValue(v, [])) ?? "";
  } catch {
    return "";
  }
}

export function draftKey(title: string, payload: SxValues): string {
  return stableJson([String(title ?? "").trim(), payload]);
}

export function changedKeys(a: SxValues, b: SxValues): string[] {
  const keys = [...Object.keys(b), ...Object.keys(a).filter((k) => !(k in b))];
  return keys.filter((k) => stableJson(a[k]) !== stableJson(b[k]));
}

function pathParts(path: string): string[] {
  return path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
}

function valueAt(obj: unknown, parts: readonly string[]): unknown {
  return parts.reduce<unknown>((cur, p) => (cur && typeof cur === "object" ? (cur as Record<string, unknown>)[p] : undefined), obj);
}

export function pruneErrors(errors: SxErrors, prev: SxValues, next: SxValues): SxErrors {
  const keys = Object.keys(errors);
  if (!keys.length) return errors;
  const out: Record<string, string> = {};
  let changed = false;
  for (const k of keys) {
    const parts = pathParts(k);
    if (stableJson(valueAt(prev, parts)) !== stableJson(valueAt(next, parts))) {
      changed = true;
      continue;
    }
    out[k] = errors[k];
  }
  return changed ? out : errors;
}

const patches = new Map<string, SxPayload>();

export function seedPatch(id: string, patch: SxPayload): void {
  if (id) patches.set(id, { ...(patches.get(id) ?? {}), ...patch });
}

export function peekPatch(id: string): SxPayload | null {
  return id ? patches.get(id) ?? null : null;
}

export function takePatch(id: string): SxPayload | null {
  const hit = peekPatch(id);
  if (hit) patches.delete(id);
  return hit;
}

export function stepTone(status: string): "ok" | "warn" | "err" | "wait" {
  if (/approv|done|complete|pass/.test(status)) return "ok";
  if (/reject|declin/.test(status)) return "err";
  if (/change|return|rework/.test(status)) return "warn";
  return "wait";
}

export function stepPending(step: StudioStep): boolean {
  return !/approv|done|complete|pass|skip|reject|declin|change|return/.test(step.status);
}

const ROLE_ALIAS: Readonly<Record<string, string>> = {
  reviewer: "studio_reviewer",
  publisher: "studio_publisher",
  editor: "studio_editor",
};

export function normRole(role: string): string {
  const k = String(role ?? "").trim().toLowerCase();
  return ROLE_ALIAS[k] ?? k;
}

export function roleName(labels: Pick<StudioLabels, "role">, code: string): string {
  const c = String(code ?? "").trim();
  if (!c) return "";
  const out = labels.role(c);
  return out && out !== c ? out : "";
}

function mostlyEnglish(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return words.length > 0 && words.filter((w) => EN_WORDS.has(w)).length * 2 > words.length;
}

export function stepName(labels: Pick<StudioLabels, "role">, step: { role: string; title: string }): string {
  const byRole = roleName(labels, step.role) || roleName(labels, normRole(step.role));
  if (byRole) return byRole;
  const own = String(step.title ?? "").trim();
  return own && !codeLike(own) && !isEnglishLooking(own) && !mostlyEnglish(own) ? own : "";
}

export function routeStepNames(labels: Pick<StudioLabels, "role">, route: readonly { role: string; title: string }[], live: readonly Pick<StudioStep, "order" | "role" | "title">[]): string[] {
  return route.map((s, i) => {
    const title = String(s.title ?? "").trim();
    const twin = s.role ? null : live.find((x, j) => (x.order || j + 1) === i + 1 && !!title && String(x.title ?? "").trim() === title);
    return stepName(labels, { role: s.role || twin?.role || "", title });
  });
}

export function initials(name: string): string {
  return (
    String(name ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("") || "?"
  );
}

export function nextMinor(v: string): string {
  const m = /^(\d+)(?:\.(\d+))?/.exec(String(v ?? "").trim());
  if (!m) return "1.0";
  return `${m[1]}.${(m[2] ? parseInt(m[2], 10) : 0) + 1}`;
}

export function versionOk(v: string): boolean {
  const s = String(v ?? "").trim();
  return !s || /^\d{1,4}(\.\d{1,4}){0,2}$/.test(s);
}

export function currentVersionOf(d: StudioDetail | null): StudioVersion | null {
  if (!d) return null;
  return d.versions.find((v) => v.id && v.id === d.currentVersionId) ?? d.versions[0] ?? null;
}

export function liveVersionOf(d: StudioDetail | null): StudioVersion | null {
  if (!d || !d.publishedVersionId) return null;
  return d.versions.find((v) => v.id === d.publishedVersionId) ?? null;
}

export function versionRollbackable(v: StudioVersion, d: StudioDetail | null): boolean {
  if (!d || !v.id) return false;
  if (v.id === d.currentVersionId || v.id === d.publishedVersionId) return false;
  return v.status === "approved" || v.status === "published";
}

const BACK_RE = /change|reject|declin|return|rework/;

export function newestFirst<T extends StudioComment>(list: readonly T[]): T[] {
  return list
    .map((c, i) => ({ c, i, t: parseServerTime(c.createdAt) }))
    .sort((a, b) => {
      const at = Number.isFinite(a.t) ? a.t : -Infinity;
      const bt = Number.isFinite(b.t) ? b.t : -Infinity;
      return at === bt ? b.i - a.i : bt - at;
    })
    .map((x) => x.c);
}

export function reviewNoteOf(d: StudioDetail | null, comments: readonly StudioComment[] | null): { text: string; by: string; at: string; rejected: boolean } | null {
  if (!d) return null;
  const steps = d.steps
    .filter((s) => BACK_RE.test(s.status) && s.comment)
    .sort((a, b) => (parseServerTime(b.decidedAt) || 0) - (parseServerTime(a.decidedAt) || 0));
  const s = steps[0];
  if (s) return { text: s.comment, by: s.decidedBy, at: s.decidedAt, rejected: /reject|declin/.test(s.status) };
  const c = newestFirst(comments ?? []).find((x) => Boolean(x.text) && /review|publish|admin/.test(x.authorRole.toLowerCase())) ?? null;
  if (c) return { text: c.text, by: c.author, at: c.createdAt, rejected: false };
  return null;
}

export function fileExt(name: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(String(name ?? "").trim());
  return m ? m[1].toLowerCase() : "";
}

const seeds = new Map<string, StudioDetail>();

export function seedDetail(d: StudioDetail): void {
  if (d.id) seeds.set(d.id, d);
}

export function peekSeed(id: string): StudioDetail | null {
  return id ? seeds.get(id) ?? null : null;
}

const RUNTIME_STATUSES: ReadonlySet<string> = new Set(["active", "inactive", "archived", "deleted"]);

export function runtimeStatusOf(payload: SxValues): "active" | "inactive" | "archived" | "deleted" | "" {
  const raw = typeof payload.status === "string" ? payload.status.trim().toLowerCase() : "";
  if (RUNTIME_STATUSES.has(raw)) return raw as "active" | "inactive" | "archived" | "deleted";
  if (payload.is_active === true) return "active";
  if (payload.is_active === false) return "inactive";
  return "";
}

export type ActionsInput = {
  mode: EditorMode;
  status: string;
  statusKey: SxStatusKey;
  dirty: boolean;
  readOnly: boolean;
  readOnlyReason: EditorState["readOnlyReason"];
  blocked: boolean;
  direct: boolean;
  access: Pick<StudioAccess, "canEdit" | "canReview" | "canPublish" | "canArchive" | "any">;
  hasObject: boolean;
  versions: number;
  newVersion: boolean;
  lifecycle?: SxLifecycle;
};

const REVIEWING: ReadonlySet<string> = new Set(["submitted", "in_review"]);
export const LOCKED_STATUSES: ReadonlySet<string> = new Set(["submitted", "in_review", "approved"]);
const OPEN: ReadonlySet<string> = new Set(["draft", "changes_requested"]);

export function actionsOf(input: ActionsInput): { can: EditorState["can"]; primary: EditorPrimary } {
  const { mode, status, dirty, readOnly, blocked, direct, access, hasObject } = input;
  const save = access.canEdit && !readOnly && !blocked;
  const submit = save && (mode !== "object" || OPEN.has(status) || dirty);
  const publish = hasObject && status === "approved" && access.canPublish && !direct;
  const review = hasObject && REVIEWING.has(status) && access.canReview;
  const clone = access.canEdit && (mode === "object" || mode === "runtime-view" || mode === "runtime-edit");
  const life = input.lifecycle;
  const withdraw = hasObject && LOCKED_STATUSES.has(status) && (life?.canWithdraw ?? (Boolean(life?.withdrawUrl) || access.canEdit));
  const restore = hasObject && status === "archived" && (life?.canRestore ?? (Boolean(life?.restoreUrl) || access.canEdit));
  const can: EditorState["can"] = {
    save,
    submit,
    publish,
    archive: hasObject && access.canArchive && status !== "archived",
    review,
    rollback: hasObject && access.canPublish && status !== "archived",
    clone,
    newVersion: clone && mode === "object" && input.newVersion,
    comment: hasObject && access.any && status !== "archived",
    upload: hasObject && access.canEdit && !readOnly,
    exportVersions: hasObject && access.canReview && input.versions > 0,
    edit: mode === "runtime-view" && access.canEdit,
    withdraw,
    restore,
  };
  let primary: EditorPrimary = null;
  if (blocked) primary = null;
  else if (mode === "runtime-view") primary = can.edit ? "edit" : null;
  else if (submit) primary = direct ? "publishDirect" : mode !== "object" || dirty ? "saveSubmit" : "submit";
  else if (publish && !dirty) primary = "publish";
  else if (review) primary = "openReview";
  else if (save && dirty) primary = "save";
  else if (restore) primary = "restore";
  return { can, primary };
}

export function nextNoteOf(input: ActionsInput & { reviewNote: EditorState["reviewNote"] }): { key: string; values?: Record<string, string> } {
  const { mode, status, statusKey, dirty, readOnlyReason, blocked, direct, access, reviewNote } = input;
  if (blocked) return { key: "" };
  if (mode === "create") return { key: direct ? "sx.editor.next.newDirect" : "sx.editor.next.new" };
  if (mode === "clone") return { key: "sx.editor.next.clone" };
  if (mode === "runtime-view") return { key: "sx.editor.next.runtimeView" };
  if (mode === "runtime-edit") return { key: readOnlyReason === "access" ? "sx.editor.next.readOnly" : "sx.editor.next.runtimeEdit" };
  if (status === "archived") return { key: "sx.editor.next.archived" };
  if (status === "submitted") return { key: "sx.editor.next.submitted" };
  if (status === "in_review") return { key: "sx.editor.next.inReview" };
  if (readOnlyReason === "access") return { key: "sx.editor.next.readOnly" };
  if (status === "changes_requested") {
    const rejected = reviewNote ? reviewNote.rejected || statusKey === "rejected" : statusKey === "rejected";
    if (reviewNote && reviewNote.text.trim()) return { key: rejected ? "sx.editor.next.rejected" : "sx.editor.next.returned", values: { note: reviewNote.text.trim() } };
    return { key: rejected ? "sx.editor.next.rejectedNoNote" : "sx.editor.next.returnedNoNote" };
  }
  if (status === "approved") {
    if (dirty) return { key: "sx.editor.next.approvedDirty" };
    return { key: access.canPublish && !direct ? "sx.editor.next.approvedPublisher" : "sx.editor.next.approvedWait" };
  }
  if (status === "published") return { key: dirty ? "sx.editor.next.approvedDirty" : "sx.editor.next.published" };
  return { key: direct ? "sx.editor.next.draftDirect" : "sx.editor.next.draft" };
}
