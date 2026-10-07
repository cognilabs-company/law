import { asArr, http, isRouteMissing, parseServerTime, type Dict } from "@/lib/http";

export type ReglamentStatus = "active" | "draft" | "archived";
export const REGLAMENT_STATUSES: ReglamentStatus[] = ["active", "draft", "archived"];
export const REGLAMENT_CATEGORIES = ["support", "payment", "marketplace", "documents", "urgent", "other"] as const;
export const REGLAMENT_FILE_EXT = [".docx", ".doc", ".pdf"] as const;
export const REGLAMENT_FILE_ACCEPT =
  ".docx,.doc,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/pdf";
export const REGLAMENT_MAX_BYTES = 20 * 1024 * 1024;

export type ReglamentVersion = {
  key: string;
  id: string;
  version: string;
  status: ReglamentStatus | "";
  content: string;
  createdAt: string;
  author: string;
  source: string;
  fileName: string;
  note: string;
};

export type Reglament = {
  id: string;
  title: string;
  category: string;
  version: string;
  status: ReglamentStatus;
  statusRaw: string;
  content: string;
  updatedAt: string;
  createdAt: string;
  author: string;
  source: string;
  fileName: string;
  versions: ReglamentVersion[];
};

export type ReglamentGap = {
  key: string;
  id: string;
  question: string;
  count: number;
  lastAskedAt: string;
  sessionId: string;
  userName: string;
  userPhone: string;
  role: string;
  status: string;
  category: string;
  reason: string;
  missing: string[];
};

export type ReglamentInput = {
  title: string;
  category: string;
  version: string;
  content: string;
  status: ReglamentStatus;
};

export type ReglamentUploadInput = {
  title: string;
  category: string;
  version: string;
  file: File;
};

export type GapFilter = "open" | "all";
export type ReglamentGate = "list" | "gaps" | "details" | "create" | "update" | "upload";
export type Loaded<T> = { kind: "ok"; data: T } | { kind: "missing" };

const BASE = "/admin/ai/support/reglaments";
const MISSING_TTL = 10 * 60 * 1000;
const LIST_KEYS = ["items", "reglaments", "results", "data", "rows", "list"];
const GAP_KEYS = ["items", "gaps", "results", "data", "rows", "list"];
const VERSION_KEYS = ["versions", "history", "version_history", "versions_history"];

const missing = new Set<ReglamentGate>();
const timers = new Map<ReglamentGate, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

function markMissing(key: ReglamentGate): void {
  const prev = timers.get(key);
  if (prev) clearTimeout(prev);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      if (missing.delete(key)) emit();
    }, MISSING_TTL),
  );
  if (!missing.has(key)) {
    missing.add(key);
    emit();
  }
}

function markPresent(key: ReglamentGate): void {
  const prev = timers.get(key);
  if (prev) {
    clearTimeout(prev);
    timers.delete(key);
  }
  if (missing.delete(key)) emit();
}

export function reglamentGateMissing(key: ReglamentGate): boolean {
  return missing.has(key);
}

export function subscribeReglamentGate(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function recheckReglamentGate(key: ReglamentGate): void {
  markPresent(key);
}

async function gated<T>(key: ReglamentGate, run: () => Promise<T>): Promise<Loaded<T>> {
  if (missing.has(key)) return { kind: "missing" };
  try {
    const data = await run();
    markPresent(key);
    return { kind: "ok", data };
  } catch (e) {
    if (isRouteMissing(e)) {
      markMissing(key);
      return { kind: "missing" };
    }
    throw e;
  }
}

const isDict = (v: unknown): v is Dict => Boolean(v) && typeof v === "object" && !Array.isArray(v);

function pick(...vals: unknown[]): string {
  for (const v of vals) {
    const s = typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
    if (s) return s;
  }
  return "";
}

function text(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.replace(/\r\n/g, "\n").replace(/^\n+|\s+$/g, "");
  }
  return "";
}

function amount(...vals: unknown[]): number {
  for (const v of vals) {
    const n = typeof v === "number" ? v : typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim()) ? parseFloat(v) : NaN;
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  return 0;
}

function when(...vals: unknown[]): string {
  for (const v of vals) {
    const ms = parseServerTime(v);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return "";
}

function personOf(v: unknown): string {
  if (typeof v === "string") {
    const s = v.trim();
    return /^[0-9a-f-]{16,}$/i.test(s) || /^\d+$/.test(s) ? "" : s;
  }
  if (!isDict(v)) return "";
  const full = [pick(v.first_name), pick(v.last_name)].filter(Boolean).join(" ");
  return pick(v.full_name, v.name, v.display_name, full, v.phone, v.email);
}

function strings(v: unknown): string[] {
  const out: string[] = [];
  for (const item of asArr(v)) {
    const s = typeof item === "string" ? item.trim() : isDict(item) ? pick(item.text, item.title, item.label, item.message, item.name) : "";
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

function listOf(raw: unknown, keys: string[], depth = 0): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!isDict(raw) || depth > 2) return [];
  for (const k of keys) if (Array.isArray(raw[k])) return raw[k] as unknown[];
  for (const k of ["data", "result", "payload"]) {
    if (isDict(raw[k])) {
      const inner = listOf(raw[k], keys, depth + 1);
      if (inner.length) return inner;
    }
  }
  return [];
}

function versionText(v: unknown): string {
  if (isDict(v)) return versionText(v.version ?? v.version_label ?? v.version_number ?? v.number);
  const s = pick(v).replace(/^v(?=\d)/i, "");
  return s.length <= 16 ? s : "";
}

export function normReglamentStatus(v: unknown, active?: unknown): ReglamentStatus {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (["active", "published", "enabled", "live", "current", "on"].includes(s)) return "active";
  if (["archived", "archive", "inactive", "disabled", "deprecated", "off", "deleted"].includes(s)) return "archived";
  if (s) return "draft";
  if (active === false) return "archived";
  return "active";
}

export function knownReglamentStatus(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  return !s || ["active", "published", "enabled", "live", "current", "on", "archived", "archive", "inactive", "disabled", "deprecated", "off", "deleted", "draft"].includes(s);
}

function normVersion(raw: unknown, i: number): ReglamentVersion | null {
  if (typeof raw === "string" || typeof raw === "number") {
    const version = versionText(raw);
    return version ? { key: `v${version}-${i}`, id: "", version, status: "", content: "", createdAt: "", author: "", source: "", fileName: "", note: "" } : null;
  }
  if (!isDict(raw)) return null;
  const version = versionText(raw);
  const content = text(raw.content, raw.text, raw.body, raw.content_text, raw.extracted_text);
  const createdAt = when(raw.created_at, raw.createdAt, raw.updated_at, raw.published_at, raw.at, raw.date);
  if (!version && !content && !createdAt) return null;
  const file = isDict(raw.file) ? raw.file : {};
  const id = pick(raw.id, raw.version_id, raw.uuid);
  const rawStatus = pick(raw.status, raw.state);
  return {
    key: id || `v${version || i}-${i}`,
    id,
    version,
    status: rawStatus || typeof raw.is_active === "boolean" ? normReglamentStatus(rawStatus, raw.is_active) : "",
    content,
    createdAt,
    author: personOf(raw.created_by ?? raw.author ?? raw.updated_by ?? raw.created_by_name ?? raw.user),
    source: pick(raw.source, raw.source_type, raw.origin, raw.kind).toLowerCase(),
    fileName: pick(raw.file_name, raw.filename, raw.original_filename, raw.source_file, file.name, file.filename),
    note: pick(raw.note, raw.change_note, raw.comment, raw.changelog, raw.summary),
  };
}

export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return x ? 1 : y ? -1 : 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

export function parseVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d{1,6})(?:\.(\d{1,6}))?(?:\.(\d{1,6}))?$/i.exec((v || "").trim());
  if (!m) return null;
  return [parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : 0, m[3] ? parseInt(m[3], 10) : 0];
}

export function isVersionFormat(v: string): boolean {
  return /^\d{1,3}\.\d{1,3}$/.test(v.trim());
}

export function nextVersion(v: string, kind: "minor" | "major"): string {
  const p = parseVersion(v);
  if (!p) return "1.0";
  return kind === "major" ? `${p[0] + 1}.0` : `${p[0]}.${p[1] + 1}`;
}

export function latestVersion(r: Pick<Reglament, "version" | "versions">): string {
  const all = [r.version, ...r.versions.map((x) => x.version)].filter((v) => parseVersion(v));
  all.sort((a, b) => compareVersions(b, a));
  return all[0] ?? r.version;
}

function sortVersions(list: ReglamentVersion[]): ReglamentVersion[] {
  return [...list].sort((a, b) => {
    const byVersion = compareVersions(b.version, a.version);
    if (byVersion) return byVersion;
    return (parseServerTime(b.createdAt) || 0) - (parseServerTime(a.createdAt) || 0);
  });
}

function unwrapReglament(raw: Dict): Dict {
  if ("title" in raw || "id" in raw || "reglament_id" in raw) return raw;
  for (const k of ["reglament", "item", "data", "result"]) {
    const inner = raw[k];
    if (isDict(inner) && ("title" in inner || "id" in inner || "reglament_id" in inner || "name" in inner)) return inner;
  }
  return raw;
}

export function normReglament(raw: unknown): Reglament | null {
  if (!isDict(raw)) return null;
  const d = unwrapReglament(raw);
  const curRaw = [d.current_version, d.latest_version, d.active_version, d.version, raw.version].find(isDict);
  const cur: Dict = isDict(curRaw) ? curRaw : {};
  const listed = VERSION_KEYS.map((k) => d[k] ?? raw[k]).find(Array.isArray);
  const versions = sortVersions(
    asArr(listed)
      .map(normVersion)
      .filter((v): v is ReglamentVersion => v !== null),
  );
  const id = pick(d.id, d.reglament_id, d.uuid, d._id, cur.reglament_id);
  const title = pick(d.title, d.name, cur.title);
  if (!id && !title) return null;
  const version =
    versionText(d.current_version) ||
    versionText(d.version) ||
    versionText(d.latest_version) ||
    versionText(d.active_version) ||
    versionText(cur) ||
    pick(d.version_label, d.version_number).replace(/^v(?=\d)/i, "") ||
    versions[0]?.version ||
    "";
  const match = versions.find((v) => v.version === version);
  const file = isDict(d.file) ? d.file : {};
  const statusRaw = pick(d.status, d.state, cur.status);
  return {
    id,
    title: title || id,
    category: pick(d.category, d.category_slug, d.type, d.kind, cur.category).toLowerCase(),
    version,
    status: normReglamentStatus(statusRaw, d.is_active ?? cur.is_active),
    statusRaw,
    content: text(d.content, d.text, d.body, d.content_text, d.extracted_text, cur.content, cur.text, cur.body, cur.extracted_text) || match?.content || "",
    updatedAt: when(d.updated_at, d.updatedAt, d.last_updated_at, cur.created_at, cur.updated_at, d.created_at, d.createdAt) || match?.createdAt || versions[0]?.createdAt || "",
    createdAt: when(d.created_at, d.createdAt) || versions[versions.length - 1]?.createdAt || "",
    author: personOf(d.updated_by ?? d.created_by ?? d.author ?? cur.created_by ?? d.updated_by_name ?? d.created_by_name),
    source: pick(d.source, d.source_type, cur.source, cur.source_type).toLowerCase(),
    fileName: pick(d.file_name, d.filename, d.original_filename, cur.file_name, cur.filename, cur.original_filename, file.name, file.filename),
    versions,
  };
}

export function mergeReglament(base: Reglament, more: Reglament | null): Reglament {
  if (!more) return base;
  return {
    ...base,
    title: more.title || base.title,
    category: more.category || base.category,
    version: more.version || base.version,
    status: more.statusRaw ? more.status : base.status,
    statusRaw: more.statusRaw || base.statusRaw,
    content: more.content || base.content,
    updatedAt: more.updatedAt || base.updatedAt,
    createdAt: more.createdAt || base.createdAt,
    author: more.author || base.author,
    source: more.source || base.source,
    fileName: more.fileName || base.fileName,
    versions: more.versions.length ? more.versions : base.versions,
  };
}

export function reglamentNeedsDetails(r: Reglament): boolean {
  return Boolean(r.id) && (!r.content || !r.versions.length);
}

function normGap(raw: unknown, i: number): ReglamentGap | null {
  if (typeof raw === "string") {
    const question = raw.trim();
    return question ? { key: `gap-${i}`, id: "", question, count: 1, lastAskedAt: "", sessionId: "", userName: "", userPhone: "", role: "", status: "open", category: "", reason: "", missing: [] } : null;
  }
  if (!isDict(raw)) return null;
  const question = text(raw.question, raw.message, raw.text, raw.query, raw.prompt, raw.user_message, raw.content, raw.title);
  if (!question) return null;
  const user = raw.user ?? raw.client ?? raw.asked_by ?? raw.requester ?? raw.actor;
  const session = isDict(raw.session) ? raw.session : {};
  const fallback = isDict(raw.support_fallback) ? raw.support_fallback : {};
  const id = pick(raw.id, raw.gap_id, raw.uuid);
  return {
    key: id || `gap-${i}`,
    id,
    question,
    count: Math.max(1, amount(raw.count, raw.times, raw.asked_count, raw.ask_count, raw.occurrences, raw.hits, raw.frequency)),
    lastAskedAt: when(raw.last_asked_at, raw.last_seen_at, raw.last_at, raw.asked_at, raw.updated_at, raw.created_at),
    sessionId: pick(raw.session_id, raw.ai_session_id, raw.chat_session_id, raw.conversation_id, session.id),
    userName: personOf(user) || pick(raw.user_name, raw.client_name, raw.full_name),
    userPhone: pick(isDict(user) ? user.phone : "", raw.user_phone, raw.phone),
    role: pick(raw.role, raw.user_role, raw.actor_role, isDict(user) ? user.role : "").toLowerCase(),
    status: pick(raw.status, raw.state).toLowerCase() || "open",
    category: pick(raw.category, raw.intent, raw.topic).toLowerCase(),
    reason: pick(raw.reason, fallback.reason, raw.note),
    missing: strings(raw.missing_requirements ?? raw.missing),
  };
}

export function isOpenGap(g: ReglamentGap): boolean {
  return !g.status || g.status === "open" || g.status === "new" || g.status === "pending";
}

export function listReglaments(): Promise<Loaded<Reglament[]>> {
  return gated("list", async () =>
    listOf(await http(BASE), LIST_KEYS)
      .map(normReglament)
      .filter((r): r is Reglament => r !== null),
  );
}

export async function getReglament(id: string): Promise<Reglament | null> {
  if (!id) return null;
  try {
    const res = await gated("details", async () => normReglament(await http(`${BASE}/${encodeURIComponent(id)}`)));
    return res.kind === "ok" ? res.data : null;
  } catch {
    return null;
  }
}

export function createReglament(input: ReglamentInput): Promise<Loaded<Reglament | null>> {
  return gated("create", async () => normReglament(await http(BASE, { method: "POST", body: JSON.stringify(input) })));
}

export function updateReglament(id: string, input: ReglamentInput): Promise<Loaded<Reglament | null>> {
  return gated("update", async () =>
    normReglament(await http(`${BASE}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) })),
  );
}

export function uploadReglament(input: ReglamentUploadInput, signal?: AbortSignal): Promise<Loaded<Reglament | null>> {
  const form = new FormData();
  form.append("title", input.title);
  form.append("category", input.category);
  form.append("version", input.version);
  form.append("file", input.file, input.file.name);
  return gated("upload", async () => normReglament(await http(`${BASE}/upload`, { method: "POST", body: form, signal })));
}

export function listReglamentGaps(filter: GapFilter): Promise<Loaded<ReglamentGap[]>> {
  const qs = filter === "open" ? "?status=open" : "";
  return gated("gaps", async () =>
    listOf(await http(`${BASE}/gaps${qs}`), GAP_KEYS)
      .map(normGap)
      .filter((g): g is ReglamentGap => g !== null),
  );
}

export function reglamentFileExt(name: string): string {
  const m = /\.[^.]+$/.exec(name.toLowerCase());
  return m ? m[0] : "";
}

export function reglamentFileOk(name: string): boolean {
  return (REGLAMENT_FILE_EXT as readonly string[]).includes(reglamentFileExt(name));
}

export function titleFromFile(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
