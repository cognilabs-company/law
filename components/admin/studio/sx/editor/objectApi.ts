import { ApiError, asDict, http } from "@/lib/http";
import { normStudioDetail, type StudioComment, type StudioDetail } from "@/lib/services/studio";

type Dict = Record<string, unknown>;

export type SxLifecycleAction = "withdraw" | "restore";
export type SxObjectAction = SxLifecycleAction | "save" | "submit";
export type SxLifecycle = {
  contract: boolean;
  canEdit: boolean | null;
  canSubmit: boolean | null;
  canWithdraw: boolean | null;
  canRestore: boolean | null;
  saveUrl: string;
  submitUrl: string;
  withdrawUrl: string;
  restoreUrl: string;
  offered: Readonly<Record<SxObjectAction, boolean>>;
};
export type SxComment = StudioComment & { authorId: string; editedAt: string; deleted: boolean; deletedAt: string; deletedBy: string; canEdit: boolean | null; canDelete: boolean | null };
export type SxLockError = { code: string; withdrawUrl: string; message: string };

const enc = encodeURIComponent;
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const first = (...vals: unknown[]): string => {
  for (const v of vals) {
    const s = str(v);
    if (s) return s;
  }
  return "";
};
const boolOf = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const personOf = (v: unknown): string => {
  if (typeof v === "string" || typeof v === "number") return str(v);
  const d = asDict(v);
  return first(d.full_name, d.name, d.display_name, [str(d.first_name), str(d.last_name)].filter(Boolean).join(" "));
};

export function objectPath(url: string, action: SxObjectAction): string {
  const raw = str(url)
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/api\/backend(?=\/)/, "");
  if (!raw.startsWith("/studio/objects/") || raw.includes("..") || raw.startsWith("//")) return "";
  const path = raw.split(/[?#]/)[0];
  return new RegExp(`^/studio/objects/[^/]+/${action}$`).test(path) ? path : "";
}

export function lifecycleUrl(id: string, action: SxLifecycleAction): string {
  return id ? `/studio/objects/${enc(id)}/${action}` : "";
}

function rawActionUrl(raw: Dict, action: SxObjectAction): string {
  const actions = asDict(raw.actions);
  const links = asDict(raw.links);
  const a = actions[action];
  const fromAction = typeof a === "string" ? a : first(asDict(a).url, asDict(a).href);
  return first(raw[`${action}_url`], fromAction, links[action]);
}

export function lifecycleOf(detail: StudioDetail | null): SxLifecycle {
  const raw: Dict = detail?.raw ?? {};
  const caps = asDict(raw.capabilities ?? raw.permissions);
  const urls = { save: rawActionUrl(raw, "save"), submit: rawActionUrl(raw, "submit"), withdraw: rawActionUrl(raw, "withdraw"), restore: rawActionUrl(raw, "restore") };
  return {
    contract: typeof raw.can_edit === "boolean" || typeof raw.can_submit === "boolean" || Boolean(urls.save) || Boolean(urls.submit),
    canEdit: boolOf(raw.can_edit),
    canSubmit: boolOf(raw.can_submit),
    canWithdraw: boolOf(raw.can_withdraw ?? caps.can_withdraw ?? caps.withdraw),
    canRestore: boolOf(raw.can_restore ?? caps.can_restore ?? caps.restore),
    saveUrl: objectPath(urls.save, "save"),
    submitUrl: objectPath(urls.submit, "submit"),
    withdrawUrl: objectPath(urls.withdraw, "withdraw"),
    restoreUrl: objectPath(urls.restore, "restore"),
    offered: { save: Boolean(urls.save), submit: Boolean(urls.submit), withdraw: Boolean(urls.withdraw), restore: Boolean(urls.restore) },
  };
}

export async function runLifecycle(id: string, action: SxLifecycleAction, url = ""): Promise<StudioDetail> {
  const path = objectPath(url, action) || lifecycleUrl(id, action);
  if (!path) throw new Error(`studio_${action}_url`);
  return normStudioDetail(await http(path, { method: "POST" }));
}

export function lockErrorOf(e: unknown): SxLockError | null {
  if (!(e instanceof ApiError)) return null;
  const detail = asDict(e.data.detail);
  const code = first(e.code, detail.code, e.data.code);
  if (code !== "studio_version_locked" && code !== "studio_object_archived") return null;
  return { code, withdrawUrl: objectPath(first(detail.withdraw_url, e.data.withdraw_url), "withdraw"), message: first(detail.message) };
}

export function structuredFieldOf(e: unknown): { field: string; code: string } | null {
  if (!(e instanceof ApiError)) return null;
  const detail = asDict(e.data.detail);
  const code = first(e.code, detail.code, e.data.code);
  const field = first(detail.field, detail.path, e.data.field).replace(/^(body|payload)\./, "");
  return code && field ? { field, code } : null;
}

function editedAtOf(r: Dict, createdAt: string): string {
  const own = first(r.edited_at, r.editedAt);
  if (own) return own;
  if (r.is_edited !== true && r.edited !== true) return "";
  const at = first(r.updated_at, r.updatedAt);
  return at && at !== createdAt ? at : "";
}

export function normComment(raw: unknown): SxComment {
  const r = asDict(raw);
  const user = asDict(r.author ?? r.user ?? r.created_by);
  const createdAt = first(r.created_at, r.createdAt);
  const deletedAt = first(r.deleted_at, r.deletedAt);
  const deleted = r.is_deleted === true || r.deleted === true || Boolean(deletedAt) || str(r.status).toLowerCase() === "deleted";
  return {
    id: first(r.id, r.comment_id, r.uuid),
    text: deleted ? "" : first(r.comment, r.text, r.body, r.message),
    author: first(r.author_name, personOf(r.author ?? r.user ?? r.created_by), r.user_name),
    authorRole: first(r.author_role, r.role, user.role),
    authorId: first(r.author_user_id, r.author_id, r.user_id, user.id),
    versionId: first(r.version_id, r.versionId),
    createdAt,
    editedAt: deleted ? "" : editedAtOf(r, createdAt),
    deleted,
    deletedAt,
    deletedBy: first(r.deleted_by_name, personOf(r.deleted_by)),
    canEdit: boolOf(r.can_edit),
    canDelete: boolOf(r.can_delete),
    raw: r,
  };
}

function listOf(res: unknown): unknown[] {
  if (Array.isArray(res)) return res;
  const d = asDict(res);
  for (const k of ["items", "comments", "data", "results"]) if (Array.isArray(d[k])) return d[k] as unknown[];
  return [];
}

function oneOf(res: unknown): unknown {
  const d = asDict(res);
  if (d.comment && typeof d.comment === "object") return d.comment;
  if (d.item && typeof d.item === "object") return d.item;
  return d;
}

export async function listComments(objectId: string): Promise<SxComment[]> {
  return listOf(await http(`/studio/objects/${enc(objectId)}/comments`))
    .map(normComment)
    .filter((c) => c.text || c.deleted);
}

export async function createComment(objectId: string, text: string): Promise<SxComment> {
  const c = normComment(oneOf(await http(`/studio/objects/${enc(objectId)}/comments`, { method: "POST", body: JSON.stringify({ comment: text }) })));
  return c.text || c.deleted ? c : { ...c, text };
}

export async function updateComment(objectId: string, commentId: string, text: string): Promise<SxComment> {
  const c = normComment(oneOf(await http(`/studio/objects/${enc(objectId)}/comments/${enc(commentId)}`, { method: "PATCH", body: JSON.stringify({ comment: text }) })));
  return { ...c, id: c.id || commentId, text: c.text || (c.deleted ? "" : text) };
}

export async function deleteComment(objectId: string, commentId: string): Promise<SxComment | null> {
  const res = await http(`/studio/objects/${enc(objectId)}/comments/${enc(commentId)}`, { method: "DELETE" });
  const body = oneOf(res);
  const c = normComment(body);
  return c.id ? { ...c, deleted: true, text: "" } : null;
}

export function commentFromEvent(data: unknown): SxComment | null {
  const d = asDict(data);
  const inner = d.comment && typeof d.comment === "object" ? d.comment : null;
  if (!inner) return null;
  const c = normComment(inner);
  return c.id ? c : null;
}

export function upsertComment(list: readonly SxComment[] | null, c: SxComment): SxComment[] {
  const items = list ?? [];
  const at = items.findIndex((x) => x.id && x.id === c.id);
  if (at < 0) return [c, ...items];
  const out = items.slice();
  const prev = items[at];
  out[at] = { ...prev, ...c, author: c.author || prev.author, authorRole: c.authorRole || prev.authorRole, authorId: c.authorId || prev.authorId, createdAt: c.createdAt || prev.createdAt, versionId: c.versionId || prev.versionId };
  return out;
}

export function liveComments(list: readonly SxComment[] | null): SxComment[] {
  return (list ?? []).filter((c) => !c.deleted);
}

export function commentAllowed(c: SxComment, kind: "edit" | "delete", me: string, admin: boolean): boolean {
  if (c.deleted || !c.id) return false;
  const flag = kind === "edit" ? c.canEdit : c.canDelete;
  if (flag !== null) return flag;
  return admin || (Boolean(me) && c.authorId === me);
}

