import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { ApiError, asArr, asDict, asNum, asStr, currentTokenOwner, errDetail, http, httpBlob, isForbidden, isRouteMissing, parseServerTime, type Dict } from "@/lib/http";
import { saveBlob } from "@/lib/download";
import { sessionRoles, useAuth } from "@/lib/auth";

export type StudioStatus = "draft" | "submitted" | "in_review" | "changes_requested" | "approved" | "published" | "archived";
export const STUDIO_STATUSES: StudioStatus[] = ["draft", "submitted", "in_review", "changes_requested", "approved", "published", "archived"];
export type StudioDecision = "approve" | "changes_requested" | "reject";
export type StudioAvailability = "checking" | "on" | "off";
export type StudioFieldErrors = Record<string, string>;

export const STUDIO_ROLES = ["studio_editor", "studio_reviewer", "studio_publisher", "studio_admin"] as const;
export type StudioRole = (typeof STUDIO_ROLES)[number];
export const STUDIO_APPROVAL_FREE = ["K16"];
export const STUDIO_FILE_EXT = [".docx", ".doc", ".pdf", ".xlsx", ".xls", ".txt"];
export const STUDIO_FILE_ACCEPT = STUDIO_FILE_EXT.join(",");
export const STUDIO_HEARTBEAT_MS = 25_000;

export type StudioConstructor = {
  code: string;
  title: string;
  runtimeTarget: string;
  schema: { required: string[]; fields: string[] };
  approvalRequired: boolean;
  raw: Dict;
};

export type StudioObject = {
  id: string;
  code: string;
  title: string;
  status: StudioStatus;
  statusRaw: string;
  currentVersionId: string;
  currentVersion: string;
  publishedVersionId: string;
  assignedTo: string;
  createdBy: string;
  updatedAt: string;
  createdAt: string;
  hasFile: boolean;
  raw: Dict;
};

export type StudioVersion = {
  id: string;
  version: string;
  status: StudioStatus;
  statusRaw: string;
  payload: Dict;
  summary: string;
  fileUrl: string;
  fileName: string;
  hasFile: boolean;
  createdAt: string;
  createdBy: string;
};

export type StudioStep = {
  id: string;
  order: number;
  role: string;
  title: string;
  status: string;
  decidedBy: string;
  decidedAt: string;
  comment: string;
};

export type StudioDetail = StudioObject & {
  payload: Dict;
  versions: StudioVersion[];
  steps: StudioStep[];
};

export type StudioComment = {
  id: string;
  text: string;
  author: string;
  authorRole: string;
  versionId: string;
  createdAt: string;
  raw: Dict;
};

export type StudioActivity = {
  sessionId: string;
  userId: string;
  userName: string;
  role: string;
  constructorCode: string;
  objectId: string;
  objectName: string;
  versionId: string;
  screen: string;
  online: boolean;
  startedAt: string;
  lastSeenAt: string;
  endedAt: string;
  durationSec: number;
  saveCount: number;
  raw: Dict;
};

export type StudioMonitoring = { items: StudioActivity[]; online: number; total: number; raw: Dict };

export type StudioRouteStep = { role: string; title: string };
export type StudioRoute = {
  id: string;
  constructorCode: string;
  title: string;
  steps: StudioRouteStep[];
  status: string;
  updatedAt: string;
  raw: Dict;
};
export type StudioRouteInput = { constructorCode: string; title: string; steps: StudioRouteStep[]; status: string };

export type StudioAccessGrant = {
  id: string;
  userId: string;
  userName: string;
  phone: string;
  roles: string[];
  constructorCodes: string[];
  active: boolean;
  createdAt: string;
  raw: Dict;
};
export type StudioAccessInput = { userId: string; roles: string[]; constructorCodes?: string[]; active?: boolean; id?: string };

export type StudioList<T> = { items: T[]; total: number };
export type StudioRegistry = { items: StudioConstructor[]; userRoles: string[] };
export type StudioListQuery = { constructorCode?: string; status?: string; assignedToMe?: boolean; limit?: number; offset?: number };
export type StudioSaveInput = { title?: string; payload?: Dict; summary?: string; version?: string };
export type StudioCreateInput = { constructorCode: string; title: string; payload: Dict };
export type StudioUploadResult = { versionId: string; hasFile: boolean; fileUrl: string; fileName: string };
export type StudioHeartbeatInput = {
  sessionId?: string | null;
  constructorCode: string;
  objectId?: string;
  versionId?: string;
  saveCountDelta?: number;
  meta?: Dict;
};

export type StudioErrorKind =
  | "payload_invalid"
  | "submit_invalid"
  | "publish_requires_approved"
  | "publish_failed"
  | "forbidden"
  | "missing"
  | "not_found"
  | "conflict"
  | "validation"
  | "network"
  | "other";
export type StudioError = { status: number; code: string; kind: StudioErrorKind; message: string; fieldErrors: StudioFieldErrors };

const OFF_TTL = 10 * 60 * 1000;
const FRESH_MS = 5 * 60 * 1000;
const LIST_KEYS = ["items", "data", "results", "objects", "rows", "list"];

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const first = (...vals: unknown[]): string => {
  for (const v of vals) {
    const s = str(v).trim();
    if (s) return s;
  }
  return "";
};
const strings = (v: unknown): string[] =>
  asArr(v)
    .map((x) => (typeof x === "string" ? x : first(asDict(x).name, asDict(x).key, asDict(x).code, asDict(x).field)))
    .map((s) => s.trim())
    .filter(Boolean);

function listOf(raw: unknown, keys: string[] = LIST_KEYS): unknown[] {
  if (Array.isArray(raw)) return raw;
  const d = asDict(raw);
  for (const k of keys) if (Array.isArray(d[k])) return d[k] as unknown[];
  for (const k of keys) {
    const inner = asDict(d[k]);
    for (const k2 of keys) if (Array.isArray(inner[k2])) return inner[k2] as unknown[];
  }
  return [];
}

function totalOf(raw: unknown, fallback: number): number {
  const d = asDict(raw);
  const meta = asDict(d.meta ?? d.pagination);
  for (const v of [d.total, d.count, d.total_count, meta.total, meta.count]) {
    const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? parseInt(v, 10) : NaN;
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return fallback;
}

function personOf(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  const d = asDict(v);
  return first(d.full_name, d.name, d.display_name, [str(d.first_name), str(d.last_name)].filter(Boolean).join(" "), d.phone, d.email, d.id);
}

function boolOf(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === 1 || v === "1" || v === "true") return true;
  if (v === 0 || v === "0" || v === "false") return false;
  return null;
}

function timeOf(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      const ms = parseServerTime(v);
      if (Number.isFinite(ms)) return new Date(ms).toISOString();
    }
  }
  return "";
}

export function normStudioStatus(v: unknown): StudioStatus {
  const s = asStr(v).trim().toLowerCase().replace(/[\s-]+/g, "_");
  switch (s) {
    case "draft":
    case "new":
      return "draft";
    case "submitted":
    case "pending":
    case "sent":
    case "waiting":
      return "submitted";
    case "in_review":
    case "review":
    case "reviewing":
    case "under_review":
    case "in_progress":
      return "in_review";
    case "changes_requested":
    case "needs_changes":
    case "returned":
    case "rework":
    case "rejected":
    case "declined":
      return "changes_requested";
    case "approved":
      return "approved";
    case "published":
    case "active":
    case "live":
      return "published";
    case "archived":
    case "inactive":
      return "archived";
    default:
      return "draft";
  }
}

export function normStudioConstructor(raw: unknown): StudioConstructor {
  const r = asDict(raw);
  const schema = asDict(r.schema ?? r.payload_schema ?? r.json_schema);
  const props = asDict(schema.properties);
  const code = first(r.code, r.constructor_code, r.key, r.id);
  let fields = strings(schema.fields ?? r.fields);
  if (!fields.length) fields = Object.keys(props);
  const required = strings(schema.required ?? r.required_fields ?? r.required);
  for (const f of required) if (!fields.includes(f)) fields.push(f);
  const approval = boolOf(r.approval_required ?? r.approvalRequired ?? r.requires_approval);
  return {
    code,
    title: first(r.title, r.name, r.label, code),
    runtimeTarget: first(r.runtime_target, r.runtimeTarget, r.target),
    schema: { required, fields },
    approvalRequired: approval ?? !STUDIO_APPROVAL_FREE.includes(code),
    raw: r,
  };
}

export function normStudioVersion(raw: unknown): StudioVersion {
  const r = asDict(raw);
  const file = asDict(r.file);
  const fileUrl = first(r.file_url, r.fileUrl, file.url, file.file_url);
  const fileName = first(r.file_name, r.fileName, r.original_filename, r.filename, file.name, file.file_name);
  const has = boolOf(r.has_file ?? r.hasFile);
  return {
    id: first(r.id, r.version_id, r.versionId, r.uuid),
    version: first(r.version, r.version_label, r.label, r.version_number, r.number),
    status: normStudioStatus(r.status),
    statusRaw: asStr(r.status),
    payload: asDict(r.payload ?? r.data ?? r.content),
    summary: first(r.summary, r.note, r.change_summary, r.comment),
    fileUrl,
    fileName,
    hasFile: has ?? Boolean(fileUrl || fileName),
    createdAt: timeOf(r.created_at, r.createdAt, r.updated_at),
    createdBy: personOf(r.created_by ?? r.createdBy ?? r.author ?? r.created_by_name ?? r.user),
  };
}

export function normStudioStep(raw: unknown, index = 0): StudioStep {
  const r = asDict(raw);
  return {
    id: first(r.id, r.step_id, r.uuid, `step-${index + 1}`),
    order: asNum(r.order ?? r.step_order ?? r.position ?? r.step ?? r.index, index + 1),
    role: first(r.role, r.required_role, r.reviewer_role),
    title: first(r.title, r.name, r.label),
    status: asStr(r.status ?? r.decision, "pending").trim().toLowerCase() || "pending",
    decidedBy: personOf(r.decided_by ?? r.reviewed_by ?? r.reviewer ?? r.decided_by_name ?? r.user),
    decidedAt: timeOf(r.decided_at, r.reviewed_at, r.completed_at),
    comment: first(r.comment, r.note),
  };
}

function versionLabelOf(v: unknown): string {
  if (typeof v === "string" || typeof v === "number") return str(v);
  const d = asDict(v);
  return first(d.version, d.version_label, d.label, d.number);
}

export function normStudioObject(raw: unknown): StudioObject {
  const r = asDict(raw);
  const cur = asDict(r.current_version);
  const pub = asDict(r.published_version);
  const ctor = asDict(r.constructor);
  const status = r.status ?? r.state;
  const has = boolOf(r.has_file ?? r.hasFile ?? cur.has_file);
  return {
    id: first(r.id, r.object_id, r.objectId, r.uuid),
    code: first(r.constructor_code, r.constructorCode, r.code, ctor.code),
    title: first(r.title, r.name, r.object_name),
    status: normStudioStatus(status),
    statusRaw: asStr(status),
    currentVersionId: first(r.current_version_id, r.currentVersionId, cur.id, cur.version_id, r.version_id),
    currentVersion: first(r.current_version_label, r.version_label, versionLabelOf(r.current_version), r.version),
    publishedVersionId: first(r.published_version_id, r.publishedVersionId, pub.id, pub.version_id),
    assignedTo: personOf(r.assigned_to ?? r.assignee ?? r.assigned_to_name),
    createdBy: personOf(r.created_by ?? r.author ?? r.created_by_name ?? r.owner),
    updatedAt: timeOf(r.updated_at, r.updatedAt, r.last_saved_at, r.created_at),
    createdAt: timeOf(r.created_at, r.createdAt),
    hasFile: has ?? Boolean(first(cur.file_url, cur.file_name, r.file_url, r.file_name)),
    raw: r,
  };
}

function sortVersions(list: StudioVersion[]): StudioVersion[] {
  return list
    .map((v, i) => ({ v, i, t: parseServerTime(v.createdAt) }))
    .sort((a, b) => {
      const at = Number.isFinite(a.t) ? a.t : -Infinity;
      const bt = Number.isFinite(b.t) ? b.t : -Infinity;
      return at === bt ? a.i - b.i : bt - at;
    })
    .map((x) => x.v);
}

export function normStudioDetail(raw: unknown): StudioDetail {
  const outer = asDict(raw);
  const base = asDict(outer.object ?? outer.item ?? (outer.data && !Array.isArray(outer.data) && asDict(outer.data).id ? outer.data : null) ?? outer);
  const obj = normStudioObject(base);
  const cur = asDict(base.current_version);
  const versions = sortVersions(
    listOf(outer.versions ?? base.versions ?? outer.version_history ?? base.version_history ?? base.history, ["items", "versions", "data"]).map(normStudioVersion),
  );
  const steps = listOf(outer.steps ?? base.steps ?? outer.approval_steps ?? base.approval_steps ?? base.approvals, ["items", "steps", "data"])
    .map((s, i) => normStudioStep(s, i))
    .sort((a, b) => a.order - b.order);
  const currentId = obj.currentVersionId || versions[0]?.id || "";
  const curVer = versions.find((v) => v.id === currentId) ?? null;
  const payloadRaw = base.payload ?? cur.payload ?? outer.payload ?? curVer?.payload;
  return {
    ...obj,
    currentVersionId: currentId,
    currentVersion: obj.currentVersion || curVer?.version || "",
    hasFile: obj.hasFile || Boolean(curVer?.hasFile),
    payload: asDict(payloadRaw),
    versions,
    steps,
  };
}

export function normStudioComment(raw: unknown): StudioComment {
  const r = asDict(raw);
  const user = asDict(r.author ?? r.user ?? r.created_by);
  return {
    id: first(r.id, r.comment_id, r.uuid),
    text: first(r.comment, r.text, r.body, r.message),
    author: first(personOf(r.author ?? r.user ?? r.created_by), r.author_name, r.user_name),
    authorRole: first(r.author_role, r.role, user.role),
    versionId: first(r.version_id, r.versionId),
    createdAt: timeOf(r.created_at, r.createdAt),
    raw: r,
  };
}

export function normStudioActivity(raw: unknown, now = 0): StudioActivity {
  const r = asDict(raw);
  const meta = asDict(r.meta);
  const user = asDict(r.user);
  const startedAt = timeOf(r.started_at, r.startedAt, r.created_at);
  const lastSeenAt = timeOf(r.last_seen_at, r.last_heartbeat_at, r.lastSeenAt, r.updated_at);
  const endedAt = timeOf(r.ended_at, r.endedAt, r.closed_at);
  const st = asStr(r.status).toLowerCase();
  const flag = boolOf(r.online ?? r.is_online ?? r.active);
  const seen = parseServerTime(lastSeenAt);
  const online =
    flag ??
    (st === "online" || st === "active" ? true : st === "offline" || st === "ended" ? false : !endedAt && now > 0 && Number.isFinite(seen) && now - seen < 90_000);
  const started = parseServerTime(startedAt);
  const until = parseServerTime(endedAt || lastSeenAt);
  const computed = Number.isFinite(started) && Number.isFinite(until) && until > started ? Math.round((until - started) / 1000) : 0;
  const dur = r.duration_seconds ?? r.worked_seconds ?? r.active_seconds ?? r.duration;
  return {
    sessionId: first(r.session_id, r.sessionId, r.id),
    userId: first(r.user_id, r.userId, user.id),
    userName: first(r.user_name, r.full_name, personOf(r.user), r.phone),
    role: first(r.role, r.user_role, user.role),
    constructorCode: first(r.constructor_code, r.constructorCode, r.code),
    objectId: first(r.object_id, r.objectId),
    objectName: first(r.object_name, meta.object_name, r.object_title, r.title),
    versionId: first(r.version_id, r.versionId),
    screen: first(r.screen, meta.screen),
    online,
    startedAt,
    lastSeenAt,
    endedAt,
    durationSec: dur != null ? asNum(dur, computed) : computed,
    saveCount: asNum(r.save_count ?? r.saves ?? r.saveCount, 0),
    raw: r,
  };
}

export function normStudioRoute(raw: unknown): StudioRoute {
  const r = asDict(raw);
  return {
    id: first(r.id, r.route_id, r.uuid),
    constructorCode: first(r.constructor_code, r.constructorCode, r.code),
    title: first(r.title, r.name),
    steps: listOf(r.steps, ["items", "steps"]).map((s) => {
      const d = asDict(s);
      return { role: first(d.role, d.required_role), title: first(d.title, d.name, d.label) };
    }),
    status: asStr(r.status, "active").toLowerCase() || "active",
    updatedAt: timeOf(r.updated_at, r.created_at),
    raw: r,
  };
}

export function normStudioAccess(raw: unknown): StudioAccessGrant {
  const r = asDict(raw);
  const user = asDict(r.user);
  const roles = strings(r.roles);
  if (!roles.length) {
    const one = first(r.role, r.studio_role);
    if (one) roles.push(one);
  }
  const active = boolOf(r.active ?? r.is_active);
  const st = asStr(r.status).toLowerCase();
  return {
    id: first(r.id, r.grant_id, r.uuid),
    userId: first(r.user_id, r.userId, user.id),
    userName: first(r.user_name, r.full_name, personOf(r.user), r.name),
    phone: first(r.phone, user.phone),
    roles,
    constructorCodes: strings(r.constructor_codes ?? r.constructors ?? r.codes ?? r.scope),
    active: active ?? (st ? st === "active" : true),
    createdAt: timeOf(r.created_at, r.granted_at),
    raw: r,
  };
}

type RegState = {
  avail: StudioAvailability;
  owner: string;
  items: StudioConstructor[];
  userRoles: string[];
  error: unknown;
  at: number;
};

let reg: RegState = { avail: "checking", owner: "", items: [], userRoles: [], error: null, at: 0 };
let inflight: Promise<StudioRegistry | null> | null = null;
let offTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function setReg(next: Partial<RegState>): void {
  reg = { ...reg, ...next };
  listeners.forEach((fn) => fn());
}

function ownerMatches(): boolean {
  return reg.owner === currentTokenOwner();
}

function snapshot(): RegState {
  if (!ownerMatches() && reg.avail !== "checking") {
    reg = { avail: "checking", owner: currentTokenOwner(), items: [], userRoles: [], error: null, at: 0 };
  }
  return reg;
}

export function subscribeStudio(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function studioAvailable(): StudioAvailability {
  return snapshot().avail;
}

export function studioRegistrySnapshot(): StudioRegistry & { avail: StudioAvailability; error: unknown } {
  const s = snapshot();
  return { avail: s.avail, items: s.items, userRoles: s.userRoles, error: s.error };
}

function markOff(owner: string): void {
  clearTimeout(offTimer);
  offTimer = setTimeout(() => {
    if (reg.avail === "off") setReg({ avail: "checking", at: 0 });
  }, OFF_TTL);
  setReg({ avail: "off", owner, items: [], userRoles: [], error: null, at: Date.now() });
}

function parseRegistry(res: unknown): StudioRegistry {
  const d = asDict(res);
  const items = listOf(res, ["items", "constructors", "data", "results"]).map(normStudioConstructor).filter((c) => c.code);
  const userRoles = strings(d.user_roles ?? d.roles ?? d.userRoles).map((r) => r.toLowerCase());
  return { items, userRoles };
}

export async function listStudioConstructors(): Promise<StudioRegistry> {
  const owner = currentTokenOwner();
  try {
    const out = parseRegistry(await http("/studio/constructors"));
    clearTimeout(offTimer);
    setReg({ avail: "on", owner, items: out.items, userRoles: out.userRoles, error: null, at: Date.now() });
    return out;
  } catch (e) {
    if (isRouteMissing(e)) markOff(owner);
    else if (isForbidden(e)) setReg({ avail: "on", owner, items: [], userRoles: [], error: e, at: Date.now() });
    else setReg({ avail: reg.avail === "checking" ? "on" : reg.avail, owner, error: e, at: Date.now() });
    throw e;
  }
}

export function ensureStudioRegistry(force = false): Promise<StudioRegistry | null> {
  const s = snapshot();
  if (!force && s.avail === "off") return Promise.resolve(null);
  if (!force && s.avail === "on" && !s.error && Date.now() - s.at < FRESH_MS) return Promise.resolve({ items: s.items, userRoles: s.userRoles });
  if (inflight) return inflight;
  inflight = listStudioConstructors()
    .then((r) => r as StudioRegistry | null)
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function recheckStudio(): Promise<StudioRegistry | null> {
  clearTimeout(offTimer);
  setReg({ avail: "checking", error: null, at: 0 });
  return ensureStudioRegistry(true);
}

const serverReg: RegState = { avail: "checking", owner: "", items: [], userRoles: [], error: null, at: 0 };

export function useStudioRegistry(enabled = true): RegState & { reload: () => Promise<StudioRegistry | null> } {
  const s = useSyncExternalStore(subscribeStudio, snapshot, () => serverReg);
  const need = enabled && s.avail === "checking";
  useEffect(() => {
    if (need) void ensureStudioRegistry();
  }, [need]);
  return { ...s, reload: recheckStudio };
}

export function useStudioAvailability(enabled = true): StudioAvailability {
  return useStudioRegistry(enabled).avail;
}

export function isStudioRole(r: string): boolean {
  return (STUDIO_ROLES as readonly string[]).includes(r.trim().toLowerCase());
}

function rolesOf(userRoles: string[], sess: string[]): Set<string> {
  return new Set([...userRoles, ...sess].map((r) => r.trim().toLowerCase()).filter(Boolean));
}
const anyOf = (set: Set<string>, list: string[]) => list.some((r) => set.has(r));
const FULL = ["admin", "superadmin", "studio_admin"];

export function isStudioAdmin(userRoles: string[], sess: string[]): boolean {
  return anyOf(rolesOf(userRoles, sess), FULL);
}
export function canEdit(userRoles: string[], sess: string[]): boolean {
  return anyOf(rolesOf(userRoles, sess), [...FULL, "studio_editor"]);
}
export function canReview(userRoles: string[], sess: string[]): boolean {
  return anyOf(rolesOf(userRoles, sess), [...FULL, "studio_reviewer", "studio_publisher"]);
}
export function canPublish(userRoles: string[], sess: string[]): boolean {
  return anyOf(rolesOf(userRoles, sess), [...FULL, "studio_publisher"]);
}
export function canArchive(userRoles: string[], sess: string[]): boolean {
  return canPublish(userRoles, sess);
}
export function hasStudioAccess(userRoles: string[], sess: string[]): boolean {
  const set = rolesOf(userRoles, sess);
  return anyOf(set, FULL) || [...set].some(isStudioRole);
}

export type StudioAccess = {
  avail: StudioAvailability;
  known: boolean;
  roles: string[];
  any: boolean;
  isAdmin: boolean;
  canEdit: boolean;
  canReview: boolean;
  canPublish: boolean;
  canArchive: boolean;
  error: unknown;
  reload: () => Promise<StudioRegistry | null>;
};

export function useStudioAccess(enabled = true): StudioAccess {
  const { session } = useAuth();
  const st = useStudioRegistry(enabled);
  const sess = sessionRoles(session);
  const ur = st.userRoles;
  return {
    avail: st.avail,
    known: st.avail !== "checking",
    roles: [...rolesOf(ur, sess)],
    any: hasStudioAccess(ur, sess),
    isAdmin: isStudioAdmin(ur, sess),
    canEdit: canEdit(ur, sess),
    canReview: canReview(ur, sess),
    canPublish: canPublish(ur, sess),
    canArchive: canArchive(ur, sess),
    error: st.error,
    reload: st.reload,
  };
}

export function findStudioConstructor(code: string): StudioConstructor | null {
  return snapshot().items.find((c) => c.code === code) ?? null;
}

export function isApprovalFree(code: string, ctor?: StudioConstructor | null): boolean {
  if (ctor) return !ctor.approvalRequired;
  return STUDIO_APPROVAL_FREE.includes(code);
}

export function isStudioEvent(name: unknown): boolean {
  return typeof name === "string" && name.startsWith("studio.");
}

export async function syncStudioConstructors(): Promise<{ count: number }> {
  const res = await http("/admin/studio/constructors/sync", { method: "POST" });
  const d = asDict(res);
  const reg2 = await listStudioConstructors().catch(() => null);
  const n = d.count ?? d.synced ?? d.total;
  return { count: typeof n === "number" ? n : listOf(res, ["items", "constructors"]).length || reg2?.items.length || 0 };
}

const enc = encodeURIComponent;

export async function listStudioObjects(q: StudioListQuery = {}): Promise<StudioList<StudioObject>> {
  const p = new URLSearchParams();
  if (q.constructorCode) p.set("constructor_code", q.constructorCode);
  if (q.status) p.set("status", q.status);
  if (q.assignedToMe) p.set("assigned_to_me", "true");
  if (q.limit != null) p.set("limit", String(q.limit));
  if (q.offset != null) p.set("offset", String(q.offset));
  const qs = p.toString();
  const res = await http(`/studio/objects${qs ? `?${qs}` : ""}`);
  const items = listOf(res).map(normStudioObject).filter((o) => o.id);
  return { items, total: totalOf(res, items.length) };
}

export async function getStudioObject(id: string): Promise<StudioDetail> {
  return normStudioDetail(await http(`/studio/objects/${enc(id)}`));
}

export async function createStudioObject(input: StudioCreateInput): Promise<StudioDetail> {
  const res = await http("/studio/objects", {
    method: "POST",
    body: JSON.stringify({ constructor_code: input.constructorCode, title: input.title, payload: input.payload }),
  });
  return normStudioDetail(res);
}

export async function saveStudioObject(id: string, input: StudioSaveInput): Promise<StudioDetail> {
  const body: Dict = {};
  if (input.title !== undefined) body.title = input.title;
  if (input.payload !== undefined) body.payload = input.payload;
  if (input.summary) body.summary = input.summary;
  if (input.version) body.version = input.version;
  return normStudioDetail(await http(`/studio/objects/${enc(id)}/save`, { method: "POST", body: JSON.stringify(body) }));
}

export async function submitStudioObject(id: string): Promise<StudioDetail> {
  return normStudioDetail(await http(`/studio/objects/${enc(id)}/submit`, { method: "POST" }));
}

export async function reviewStudioObject(id: string, input: { decision: StudioDecision; comment?: string }): Promise<StudioDetail> {
  return normStudioDetail(
    await http(`/admin/studio/objects/${enc(id)}/review`, {
      method: "POST",
      body: JSON.stringify({ decision: input.decision, comment: input.comment ?? "" }),
    }),
  );
}

export async function publishStudioObject(id: string, input: { note?: string } = {}): Promise<StudioDetail> {
  return normStudioDetail(
    await http(`/admin/studio/objects/${enc(id)}/publish`, { method: "POST", body: JSON.stringify({ note: input.note ?? "" }) }),
  );
}

export async function rollbackStudioObject(id: string, input: { versionId: string; note?: string }): Promise<StudioDetail> {
  return normStudioDetail(
    await http(`/admin/studio/objects/${enc(id)}/rollback`, {
      method: "POST",
      body: JSON.stringify({ version_id: input.versionId, note: input.note ?? "" }),
    }),
  );
}

export async function archiveStudioObject(id: string): Promise<StudioDetail> {
  return normStudioDetail(await http(`/studio/objects/${enc(id)}/archive`, { method: "POST" }));
}

export async function listStudioComments(id: string): Promise<StudioComment[]> {
  const res = await http(`/studio/objects/${enc(id)}/comments`);
  return listOf(res, ["items", "comments", "data", "results"]).map(normStudioComment).filter((c) => c.text);
}

export async function addStudioComment(id: string, text: string): Promise<StudioComment> {
  const res = await http(`/studio/objects/${enc(id)}/comments`, { method: "POST", body: JSON.stringify({ comment: text }) });
  const d = asDict(res);
  const c = normStudioComment(d.comment && typeof d.comment === "object" ? d.comment : d.item ?? d);
  return c.text ? c : { ...c, text };
}

export async function uploadStudioFile(id: string, file: File): Promise<StudioUploadResult> {
  const form = new FormData();
  form.append("file", file);
  const res = asDict(await http(`/studio/objects/${enc(id)}/file`, { method: "POST", body: form }));
  const v = normStudioVersion(res.version ?? res);
  return { versionId: v.id, hasFile: true, fileUrl: v.fileUrl, fileName: v.fileName || file.name };
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function downloadStudioVersionFile(versionId: string, fileName: string): Promise<void> {
  const blob = await httpBlob(`/studio/versions/${enc(versionId)}/file`);
  saveBlob(blob, fileName || `studio-${versionId}`);
}

export async function studioHeartbeat(body: StudioHeartbeatInput): Promise<{ sessionId: string }> {
  const res = asDict(
    await http("/studio/activity/heartbeat", {
      method: "POST",
      body: JSON.stringify({
        session_id: body.sessionId || null,
        constructor_code: body.constructorCode,
        object_id: body.objectId || null,
        version_id: body.versionId || null,
        save_count_delta: body.saveCountDelta ?? 0,
        meta: body.meta ?? {},
      }),
    }),
  );
  return { sessionId: first(res.session_id, res.sessionId, asDict(res.session).id, res.id) || asStr(body.sessionId) };
}

export async function endStudioActivity(sessionId: string): Promise<void> {
  if (!sessionId) return;
  await http(`/studio/activity/${enc(sessionId)}/end`, { method: "POST", keepalive: true });
}

export async function listStudioApprovals(q: { constructorCode?: string; status?: string } = {}): Promise<StudioList<StudioDetail>> {
  const p = new URLSearchParams();
  if (q.constructorCode) p.set("constructor_code", q.constructorCode);
  if (q.status) p.set("status", q.status);
  const qs = p.toString();
  const res = await http(`/admin/studio/approvals${qs ? `?${qs}` : ""}`);
  const items = listOf(res, ["items", "approvals", "objects", "data", "results"]).map(normStudioDetail).filter((o) => o.id);
  return { items, total: totalOf(res, items.length) };
}

export async function getStudioMonitoring(): Promise<StudioMonitoring> {
  const res = await http("/admin/studio/monitoring");
  const d = asDict(res);
  const now = Date.now();
  const items = listOf(res, ["items", "sessions", "activity", "activities", "active", "data", "results"]).map((r) => normStudioActivity(r, now));
  const onlineRaw = d.online ?? d.online_count ?? asDict(d.summary).online;
  return {
    items,
    online: typeof onlineRaw === "number" ? onlineRaw : items.filter((a) => a.online).length,
    total: totalOf(res, items.length),
    raw: d,
  };
}

export async function listStudioAccess(): Promise<StudioList<StudioAccessGrant> & { raw: unknown }> {
  const res = await http("/admin/studio/access");
  const items = listOf(res, ["items", "grants", "access", "users", "data", "results"]).map(normStudioAccess);
  return { items, total: totalOf(res, items.length), raw: res };
}

export async function saveStudioAccess(input: StudioAccessInput): Promise<StudioAccessGrant> {
  const body: Dict = {
    user_id: input.userId,
    roles: input.roles,
    role: input.roles[0] ?? "",
  };
  if (input.id) body.id = input.id;
  if (input.constructorCodes) body.constructor_codes = input.constructorCodes;
  if (input.active !== undefined) {
    body.is_active = input.active;
    body.status = input.active ? "active" : "inactive";
  }
  const res = asDict(await http("/admin/studio/access", { method: "POST", body: JSON.stringify(body) }));
  return normStudioAccess(res.grant ?? res.item ?? res);
}

export async function listApprovalRoutes(): Promise<StudioRoute[]> {
  const res = await http("/admin/studio/approval-routes");
  return listOf(res, ["items", "routes", "data", "results"]).map(normStudioRoute);
}

export async function saveApprovalRoute(input: StudioRouteInput): Promise<StudioRoute> {
  const res = asDict(
    await http("/admin/studio/approval-routes", {
      method: "POST",
      body: JSON.stringify({ constructor_code: input.constructorCode, title: input.title, steps: input.steps, status: input.status }),
    }),
  );
  return normStudioRoute(res.route ?? res.item ?? res);
}

export async function exportStudioXlsx(): Promise<void> {
  const blob = await httpBlob("/admin/studio/export.xlsx");
  saveBlob(blob, `lexgo-studio-${stamp()}.xlsx`);
}

export async function exportStudioVersionsXlsx(id: string, name = ""): Promise<void> {
  const blob = await httpBlob(`/admin/studio/objects/${enc(id)}/versions/export.xlsx`);
  const safe = name.trim().replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, "-").slice(0, 60);
  saveBlob(blob, `lexgo-studio-${safe || id}-versions-${stamp()}.xlsx`);
}

function errorsListOf(d: Dict): StudioFieldErrors {
  const out: StudioFieldErrors = {};
  const list = asArr(d.errors ?? d.field_errors ?? d.fields);
  for (const it of list) {
    const e = asDict(it);
    const loc = Array.isArray(e.loc) ? e.loc.map(str).filter((s) => s && s !== "body" && s !== "payload").join(".") : "";
    const key = first(e.field, e.path, e.name, loc) || "_";
    const msg = first(e.message, e.msg, e.error, e.detail);
    if (!msg) continue;
    out[key] = out[key] ? `${out[key]}; ${msg}` : msg;
  }
  if (!list.length && d.errors && typeof d.errors === "object") {
    for (const [k, v] of Object.entries(d.errors as Dict)) {
      const msg = Array.isArray(v) ? v.map(str).filter(Boolean).join("; ") : str(v);
      if (msg) out[k] = msg;
    }
  }
  return out;
}

export function studioErrorOf(e: unknown): StudioError {
  if (!(e instanceof ApiError)) return { status: 0, code: "", kind: "network", message: "", fieldErrors: {} };
  const dd = asDict(e.data.detail);
  const code = first(e.code, dd.code, e.data.code);
  let fieldErrors = errorsListOf(dd);
  if (!Object.keys(fieldErrors).length) fieldErrors = errorsListOf(e.data);
  if (!Object.keys(fieldErrors).length && Array.isArray(e.data.detail)) fieldErrors = errorsListOf({ errors: e.data.detail });
  if (!Object.keys(fieldErrors).length && e.status === 422 && !code) fieldErrors = { ...e.fieldErrors };
  const message = first(dd.message, errDetail(e) && errDetail(e) !== code ? errDetail(e) : "");
  let kind: StudioErrorKind = "other";
  if (code === "studio_payload_invalid") kind = "payload_invalid";
  else if (code === "studio_submit_invalid") kind = "submit_invalid";
  else if (code === "studio_publish_requires_approved") kind = "publish_requires_approved";
  else if (code === "studio_publish_failed") kind = "publish_failed";
  else if (e.status === 0 || e.status === 502) kind = "network";
  else if (e.status === 403) kind = "forbidden";
  else if (isRouteMissing(e)) kind = "missing";
  else if (e.status === 404) kind = "not_found";
  else if (e.status === 409) kind = "conflict";
  else if (e.status === 422) kind = "validation";
  return { status: e.status, code, kind, message, fieldErrors };
}

export type StudioHeartbeatOptions = {
  enabled: boolean;
  constructorCode: string;
  objectId: string;
  versionId: string;
  objectName: string;
  screen?: string;
};

export function useStudioHeartbeat(opts: StudioHeartbeatOptions): { markSaved: () => void } {
  const meta = useRef(opts);
  const saves = useRef(0);
  useEffect(() => {
    meta.current = opts;
  });
  const on = opts.enabled && Boolean(opts.constructorCode);
  const key = `${opts.constructorCode}|${opts.objectId}`;
  useEffect(() => {
    if (!on || !key) return;
    let sid = "";
    let closed = false;
    let dead = false;
    const beat = async () => {
      if (dead || closed || document.hidden) return;
      const m = meta.current;
      const delta = saves.current;
      saves.current = 0;
      try {
        const r = await studioHeartbeat({
          sessionId: sid || null,
          constructorCode: m.constructorCode,
          objectId: m.objectId,
          versionId: m.versionId,
          saveCountDelta: delta,
          meta: { screen: m.screen || `${m.constructorCode.toLowerCase()}-editor`, object_name: m.objectName },
        });
        if (closed) {
          if (r.sessionId && r.sessionId !== sid) void endStudioActivity(r.sessionId).catch(() => undefined);
          return;
        }
        sid = r.sessionId || sid;
      } catch (e) {
        saves.current += delta;
        if (isRouteMissing(e) || isForbidden(e)) {
          dead = true;
          clearInterval(timer);
        }
      }
    };
    const end = () => {
      if (!sid) return;
      const s = sid;
      sid = "";
      void endStudioActivity(s).catch(() => undefined);
    };
    const onVisible = () => {
      if (!document.hidden) void beat();
    };
    const timer = setInterval(() => void beat(), STUDIO_HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", end);
    void beat();
    return () => {
      closed = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", end);
      end();
    };
  }, [on, key]);
  return { markSaved: useCallback(() => void (saves.current += 1), []) };
}
