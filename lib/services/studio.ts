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

// What the full constructor schema says about one field: its type, the
// values a select may take, and a short help text.
export type StudioFieldMeta = { type: string; options: string[]; help: string };

// One field of a constructor's typed schema (definition version 3): its
// type, where it sits in the form (section, order), what it may hold
// (options, a reference source, min/max), and for a list or an object the
// schema of what is inside it.
export type StudioSchemaField = {
  key: string;
  label: string;
  type: string;
  component: string;
  required: boolean;
  section: string;
  order: number;
  help: string;
  options: string[];
  source: string;
  default: unknown;
  min: number | null;
  max: number | null;
  // An object: its fields, which of them are required, whether other keys
  // may be added (a key/value editor).
  properties: StudioSchemaField[];
  requiredFields: string[];
  additional: boolean;
  // A list: what one item is, how few items are allowed, which key keeps
  // items unique.
  item: StudioSchemaField | null;
  minItems: number;
  uniqueBy: string;
  // What the backend says to show the person filling it in.
  example: unknown;
  optionLabels: Record<string, string>;
  // Filled from the page the object is opened from, never typed.
  hidden: boolean;
  readOnly: boolean;
};
export type StudioSection = { key: string; title: string; order: number };

// What a constructor is for, in words a newcomer understands (spec 10-12 UX
// metadata): where its result shows, who runs it, the order to work in, the
// checks before publishing, how risky it is.
export type StudioRisk = "low" | "medium" | "high";
export type StudioSurface = { key: string; title: string; route: string; placement: string };
export type StudioPreviewType = "document" | "kanban" | "marketplace_card" | "pricing" | "communication" | "workflow" | "dashboard" | "table" | "security_matrix" | "integration" | "summary";
export type StudioExperience = {
  purpose: string;
  plainLanguage: string;
  whenToUse: string;
  managedBy: string[];
  whereUsed: StudioSurface[];
  result: string;
  workflow: { step: number; title: string; description: string }[];
  notes: string[];
  checklist: string[];
  risk: StudioRisk;
  warnings: string[];
  preview: { type: StudioPreviewType; title: string; description: string; surfaceKeys: string[] };
};
export type StudioNavigation = { groupKey: string; groupTitle: string; groupOrder: number; step: number; steps: number; requiredBefore: string[]; recommendedBefore: string[]; nextSteps: string[]; reason: string };

const surfaceOf = (raw: unknown): StudioSurface => {
  const d = asDict(raw);
  return { key: first(d.surface_key, d.key), title: first(d.title, d.surface_key), route: asStr(d.route), placement: asStr(d.placement) };
};
const RISKS: StudioRisk[] = ["low", "medium", "high"];
const PREVIEW_TYPES: StudioPreviewType[] = ["document", "kanban", "marketplace_card", "pricing", "communication", "workflow", "dashboard", "table", "security_matrix", "integration", "summary"];
export const previewTypeOf = (v: unknown): StudioPreviewType => (PREVIEW_TYPES.includes(v as StudioPreviewType) ? (v as StudioPreviewType) : "summary");

// Missing metadata (an older backend, a stale cache) never breaks the editor:
// the description stands in for the plain words, the preview falls back to
// a summary, and no technical runtime target is shown where a page would be.
function experienceOf(r: Dict): StudioExperience {
  const e = asDict(r.experience);
  const vp = asDict(r.visual_preview ?? e.visual_preview);
  const risk = asStr(e.risk_level) as StudioRisk;
  return {
    purpose: asStr(e.purpose),
    plainLanguage: first(e.plain_language, r.description, e.purpose),
    whenToUse: asStr(e.when_to_use),
    managedBy: strings(e.managed_by),
    whereUsed: asArr(e.where_used).map(surfaceOf).filter((s) => s.title),
    result: asStr(e.result),
    workflow: asArr(e.workflow)
      .map((w, i) => ({ step: numOrNull(asDict(w).step) ?? i + 1, title: asStr(asDict(w).title), description: asStr(asDict(w).description) }))
      .filter((w) => w.title)
      .sort((a, b) => a.step - b.step),
    notes: strings(e.novice_notes),
    checklist: strings(e.publish_checklist),
    risk: RISKS.includes(risk) ? risk : "medium",
    warnings: strings(e.warnings),
    preview: { type: previewTypeOf(vp.type), title: asStr(vp.title), description: asStr(vp.description), surfaceKeys: strings(vp.surface_keys) },
  };
}
function navigationOf(r: Dict): StudioNavigation | null {
  const n = asDict(r.navigation);
  if (!Object.keys(n).length) return null;
  return {
    groupKey: asStr(n.group_key),
    groupTitle: asStr(n.group_title),
    groupOrder: numOrNull(n.group_order) ?? 99,
    step: numOrNull(n.step_number) ?? 0,
    steps: numOrNull(n.step_count) ?? 0,
    requiredBefore: strings(n.required_before),
    recommendedBefore: strings(n.recommended_before),
    nextSteps: strings(n.next_steps),
    reason: asStr(n.sequence_reason),
  };
}

export type StudioConstructor = {
  code: string;
  title: string;
  runtimeTarget: string;
  schema: { required: string[]; fields: string[]; selectSources: Record<string, string>; meta: Record<string, StudioFieldMeta> };
  // The typed schema; empty in the registry list, which carries no schema.
  typed: StudioSchemaField[];
  sections: StudioSection[];
  defaultPayload: Dict;
  capabilities: string[];
  definitionVersion: number;
  approvalRequired: boolean;
  description: string;
  experience: StudioExperience;
  navigation: StudioNavigation | null;
  // Where the constructor stands: set up already, ready to start, or waiting
  // on others that must come first.
  completed: boolean;
  availability: string;
  missingRequired: string[];
  missingRecommended: string[];
  recordCount: number | null;
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
  // Optimistic lock: a save names the version it was made from.
  lockVersion: number | null;
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
  lastAction: string;
  online: boolean;
  startedAt: string;
  lastSeenAt: string;
  endedAt: string;
  durationSec: number;
  saveCount: number;
  raw: Dict;
};

export type StudioMonitoringSummary = { online: number; sessions: number; users: number; objectsCreated: number; submittedForApproval: number; saveCount: number; durationSeconds: number };
// One row of the monitoring answer's `users` (10-09 §9): who worked in Studio
// over the chosen period, and how much.
export type StudioMonitoringUser = { id: string; name: string; role: string; online: boolean; sessions: number; durationSeconds: number; saveCount: number; objects: number; submitted: number; lastSeenAt: string };
export type StudioMonitoring = { items: StudioActivity[]; online: number; total: number; summary: StudioMonitoringSummary; users: StudioMonitoringUser[]; raw: Dict };
export type StudioReferenceItem = { id: string; label: string; value: string; raw: Dict };

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
export type StudioSaveInput = { title?: string; payload?: Dict; summary?: string; version?: string; expectedLockVersion?: number | null };
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
  | "edit_conflict"
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

const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const optionValues = (v: unknown): string[] =>
  asArr(v)
    .map((o) => (typeof o === "string" || typeof o === "number" ? String(o) : first(asDict(o).value, asDict(o).key, asDict(o).code)))
    .filter(Boolean);

export function normSchemaField(raw: unknown, index = 0): StudioSchemaField {
  const f = asDict(raw);
  const ui = asDict(f.ui);
  const type = asStr(f.type).toLowerCase() || "text";
  const itemRaw = f.item_schema ?? f.items;
  const props = asArr(f.properties);
  return {
    key: first(f.key, f.name),
    label: first(f.label, f.title, f.key, f.name),
    type,
    component: asStr(ui.component ?? f.component),
    required: f.required === true,
    section: asStr(f.section),
    order: numOrNull(ui.order ?? f.order) ?? 1000 + index,
    help: asStr(f.help_text ?? f.help),
    options: optionValues(f.options),
    source: asStr(f.source),
    default: f.default,
    min: numOrNull(f.min ?? f.minimum),
    max: numOrNull(f.max ?? f.maximum),
    properties: props.map((p, i) => normSchemaField(p, i)).filter((p) => p.key),
    requiredFields: strings(f.required_fields),
    additional: f.additional_properties === true || (type === "object" && !props.length && f.additional_properties !== false),
    item: itemRaw && typeof itemRaw === "object" && !Array.isArray(itemRaw) ? normSchemaField(itemRaw) : null,
    minItems: numOrNull(f.min_items) ?? 0,
    uniqueBy: asStr(f.unique_by),
    example: f.example,
    optionLabels: Object.fromEntries(asArr(f.options).filter((o) => o && typeof o === "object").map((o) => [first(asDict(o).value, asDict(o).key), first(asDict(o).label, asDict(o).title)]).filter(([v, l]) => v && l)),
    hidden: asDict(f.ui).hidden === true || f.context_managed === true,
    readOnly: f.read_only === true,
  };
}

// Sections in the order the constructor gives them; fields inside each by
// their ui.order. A field with no section belongs to the first one.
export function studioSectionsOf(ctor: StudioConstructor): { section: StudioSection; fields: StudioSchemaField[] }[] {
  const known = [...ctor.sections];
  for (const f of ctor.typed) {
    const title = f.section || known[0]?.title || "";
    if (!known.some((s) => s.title === title)) known.push({ key: title.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "main", title, order: known.length + 1 });
  }
  return known
    .sort((a, b) => a.order - b.order)
    .map((section, i) => ({
      section,
      fields: ctor.typed.filter((f) => (f.section || known[0]?.title || "") === section.title || (!f.section && i === 0 && !section.title)).sort((a, b) => a.order - b.order),
    }))
    .filter((g) => g.fields.length);
}

const clone = <T,>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

// What a new object starts with: the constructor's default payload, then
// every field's own default where that payload has nothing, nested objects
// included. A null default is no value and is not sent.
export function studioDefaults(ctor: StudioConstructor): Dict {
  const fill = (fields: StudioSchemaField[], base: Dict): Dict => {
    const out: Dict = { ...base };
    for (const f of fields) {
      if (out[f.key] === undefined && f.default !== undefined && f.default !== null) out[f.key] = clone(f.default);
      if (f.type === "object" && f.properties.length && out[f.key] && typeof out[f.key] === "object" && !Array.isArray(out[f.key])) out[f.key] = fill(f.properties, out[f.key] as Dict);
    }
    return out;
  };
  return fill(ctor.typed, clone(ctor.defaultPayload) ?? {});
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
  const meta: Record<string, StudioFieldMeta> = {};
  const sources = selectSourcesOf(schema.select_sources ?? r.select_sources);
  for (const item of asArr(schema.fields ?? r.fields)) {
    const f = asDict(item);
    const key = first(f.key, f.name, f.field);
    if (!key) continue;
    meta[key] = {
      type: asStr(f.type).toLowerCase(),
      options: asArr(f.options).map((o) => (typeof o === "string" || typeof o === "number" ? String(o) : first(asDict(o).value, asDict(o).key, asDict(o).code))).filter(Boolean),
      help: asStr(f.help_text ?? f.help),
    };
    const src = asStr(f.source).split("?")[0].replace(/\/+$/, "").split("/").pop() ?? "";
    if (src && !sources[key]) sources[key] = src;
  }
  const typed = asArr(schema.fields).filter((x) => x && typeof x === "object").map((x, i) => normSchemaField(x, i)).filter((x) => x.key);
  const sections = asArr(asDict(r.ui_schema).sections)
    .map((x, i) => {
      const d = asDict(x);
      return { key: first(d.key, d.title) || `s${i}`, title: first(d.title, d.key), order: numOrNull(d.order) ?? i + 1 };
    })
    .filter((x) => x.title);
  return {
    code,
    title: first(r.title, r.name, r.label, code),
    runtimeTarget: first(r.runtime_target, r.runtimeTarget, r.target),
    schema: { required, fields, selectSources: sources, meta },
    typed,
    sections,
    defaultPayload: asDict(r.default_payload),
    capabilities: strings(r.capabilities),
    definitionVersion: numOrNull(r.definition_version ?? schema.version) ?? 0,
    approvalRequired: approval ?? !STUDIO_APPROVAL_FREE.includes(code),
    description: asStr(r.description),
    experience: experienceOf(r),
    navigation: navigationOf(r),
    completed: r.completed === true,
    availability: asStr(r.availability),
    missingRequired: strings(r.missing_required),
    missingRecommended: strings(r.missing_recommended),
    recordCount: numOrNull(r.record_count),
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
    lockVersion: lockOf(r.lock_version ?? asDict(r.object).lock_version),
    raw: r,
  };
}

function lockOf(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
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
    lastAction: first(r.last_action, r.action, meta.last_action),
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
  if (typeof input.expectedLockVersion === "number") body.expected_lock_version = input.expectedLockVersion;
  return normStudioDetail(await http(`/studio/objects/${enc(id)}/save`, { method: "POST", body: JSON.stringify(body) }));
}

export type StudioCheck = { ok: boolean; errors: StudioFieldErrors; raw: Dict };
export type StudioPreviewItem = { key: string; label: string; value: unknown; masked: boolean };
export type StudioVisualPreview = { type: StudioPreviewType; title: string; description: string; state: "empty" | "ready"; items: StudioPreviewItem[]; itemCount: number; surfaces: StudioSurface[]; emptyState: string; warnings: string[] };
export type StudioPreview = {
  ok: boolean;
  dryRun: boolean;
  errors: StudioFieldErrors;
  payloadHash: string;
  changedFields: string[];
  before: Dict | null;
  after: Dict | null;
  affectedCapabilities: string[];
  whereUsed: StudioSurface[];
  risk: StudioRisk | null;
  warnings: string[];
  checklist: string[];
  requiresApproval: boolean | null;
  visual: StudioVisualPreview | null;
  check: StudioCheck | null;
  raw: Dict;
};

export const MASK = "••••••••";
const checkOf = (raw: unknown): StudioCheck => {
  const d = asDict(raw);
  const errors = errorsListOf(d);
  return { ok: d.ok === true || (d.ok === undefined && !Object.keys(errors).length), errors, raw: d };
};

// The backend's own check of a draft payload (spec §9): the final word, the
// form's own checks only spare it obvious mistakes.
export async function validateStudioDraft(code: string, payload: Dict, signal?: AbortSignal, runtimeTargetId = ""): Promise<StudioCheck> {
  const q = runtimeTargetId ? `?runtime_target_id=${enc(runtimeTargetId)}` : "";
  return checkOf(await http(`/studio/constructors/${enc(code)}/validate${q}`, { method: "POST", body: JSON.stringify(payload), signal }));
}

function visualOf(raw: unknown): StudioVisualPreview | null {
  const v = asDict(raw);
  if (!Object.keys(v).length) return null;
  const items = asArr(v.items).map((x) => {
    const d = asDict(x);
    // A masked value stays masked: whatever came, only the mask is kept.
    const masked = d.masked === true || d.value === MASK;
    return { key: first(d.key, d.label), label: first(d.label, d.key), value: masked ? MASK : d.value, masked };
  });
  return {
    type: previewTypeOf(v.type),
    title: asStr(v.title),
    description: asStr(v.description),
    state: asStr(v.state) === "empty" || (!items.length && asStr(v.state) !== "ready") ? "empty" : "ready",
    items,
    itemCount: numOrNull(v.item_count) ?? items.length,
    surfaces: asArr(v.surfaces).map(surfaceOf).filter((s) => s.title),
    emptyState: asStr(v.empty_state),
    warnings: strings(v.warnings),
  };
}

// What publishing this payload would show and change (spec §7, §10): the
// visual preview, the fields that differ from what runs now, where it shows,
// the capabilities it touches, the risk, the warnings and the backend's own
// checklist. Nothing is saved (dry run).
export async function previewStudioDraft(code: string, payload: Dict, runtimeTargetId = "", signal?: AbortSignal): Promise<StudioPreview> {
  const q = runtimeTargetId ? `?runtime_target_id=${enc(runtimeTargetId)}` : "";
  const d = asDict(await http(`/studio/constructors/${enc(code)}/preview${q}`, { method: "POST", body: JSON.stringify(payload), signal }));
  const diff = asDict(d.diff);
  const impact = asDict(d.impact);
  const words = (v: unknown) => asArr(v).map((w) => (typeof w === "string" ? w : first(asDict(w).message, asDict(w).text, asDict(w).code))).filter(Boolean);
  const validation = d.validation ?? d.check;
  const risk = asStr(impact.risk_level) as StudioRisk;
  const errors = errorsListOf(d);
  return {
    ok: d.ok === true || (d.ok === undefined && !Object.keys(errors).length),
    dryRun: d.dry_run !== false,
    errors,
    payloadHash: first(d.payload_hash, impact.payload_hash),
    changedFields: strings(diff.changed_fields ?? impact.changed_fields ?? d.changed_fields),
    before: diff.before && typeof diff.before === "object" ? asDict(diff.before) : null,
    after: diff.after && typeof diff.after === "object" ? asDict(diff.after) : null,
    affectedCapabilities: strings(impact.affected_capabilities ?? d.affected_capabilities),
    whereUsed: asArr(impact.where_used).map(surfaceOf).filter((s) => s.title),
    risk: RISKS.includes(risk) ? risk : null,
    warnings: words(impact.warnings ?? d.warnings),
    checklist: strings(impact.publish_checklist),
    requiresApproval: typeof impact.requires_approval === "boolean" ? impact.requires_approval : null,
    visual: visualOf(d.visual_preview),
    check: validation && typeof validation === "object" ? checkOf(validation) : null,
    raw: d,
  };
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

export async function getStudioMonitoring(params: { constructorCode?: string; userId?: string; date?: string; dateFrom?: string; dateTo?: string } = {}): Promise<StudioMonitoring> {
  const query = new URLSearchParams();
  if (params.constructorCode) query.set("constructor_code", params.constructorCode);
  if (params.userId) query.set("user_id", params.userId);
  if (params.date) query.set("date", params.date);
  if (params.dateFrom) query.set("date_from", params.dateFrom);
  if (params.dateTo) query.set("date_to", params.dateTo);
  const qs = query.toString();
  const res = await http(`/admin/studio/monitoring${qs ? `?${qs}` : ""}`);
  const d = asDict(res);
  const rawSummary = asDict(d.summary);
  const now = Date.now();
  const items = listOf(res, ["items", "sessions", "activity", "activities", "active", "data", "results"]).map((r) => normStudioActivity(r, now));
  const onlineRaw = d.online ?? d.online_count ?? rawSummary.online;
  const online = typeof onlineRaw === "number" ? onlineRaw : items.filter((a) => a.online).length;
  const users = listOf(d.users, ["items", "users", "data", "results"]).map((value) => {
    const row = asDict(value);
    // The backend spells these user_name / sessions_count / objects_count /
    // submitted_count. Reading only name / session_count left every entry of
    // the user filter as "unknown user (0)".
    return {
      id: first(row.user_id, row.id),
      name: first(row.user_name, row.name, row.full_name, personOf(row.user)),
      role: first(row.role),
      online: row.online === true,
      sessions: asNum(row.sessions_count ?? row.sessions ?? row.session_count),
      durationSeconds: asNum(row.duration_seconds ?? row.worked_seconds),
      saveCount: asNum(row.save_count ?? row.saves),
      objects: asNum(row.objects_count ?? row.objects),
      submitted: asNum(row.submitted_count ?? row.submitted),
      lastSeenAt: first(row.last_seen_at, row.lastSeenAt),
    };
  }).filter((row) => row.id || row.name);
  return {
    items,
    online,
    total: totalOf(res, items.length),
    summary: {
      online,
      sessions: asNum(rawSummary.sessions ?? rawSummary.session_count, items.length),
      users: asNum(rawSummary.users ?? rawSummary.user_count, users.length || new Set(items.map((item) => item.userId).filter(Boolean)).size),
      objectsCreated: asNum(rawSummary.objects_created ?? rawSummary.objectsCreated),
      submittedForApproval: asNum(rawSummary.submitted_for_approval ?? rawSummary.submittedForApproval),
      saveCount: asNum(rawSummary.save_count ?? rawSummary.saves, items.reduce((sum, item) => sum + item.saveCount, 0)),
      durationSeconds: asNum(rawSummary.duration_seconds ?? rawSummary.worked_seconds, items.reduce((sum, item) => sum + item.durationSec, 0)),
    },
    users,
    raw: d,
  };
}

function selectSourcesOf(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [field, src] of Object.entries(v as Record<string, unknown>)) {
    const key = String(src ?? "").split("?")[0].replace(/\/+$/, "").split("/").pop() ?? "";
    if (key) out[field] = key;
  }
  return out;
}

// The registry list carries no schema; the editor reads each constructor's
// full schema once for its fields' types, options and help.
const fieldMetaCache = new Map<string, Promise<StudioConstructor | null>>();
// The loaded details, readable without waiting (the form's own checks run
// synchronously, after the editor has loaded the schema it draws).
const typedSnapshot = new Map<string, StudioConstructor>();
export const studioDetailSnapshot = (code: string): StudioConstructor | null => typedSnapshot.get(code.trim()) ?? null;
export function getStudioConstructorDetail(code: string): Promise<StudioConstructor | null> {
  const key = code.trim();
  if (!key) return Promise.resolve(null);
  let p = fieldMetaCache.get(key);
  if (!p) {
    p = http(`/studio/constructors/${enc(key)}`)
      .then((raw) => {
        const c = normStudioConstructor(raw);
        typedSnapshot.set(key, c);
        return c;
      })
      .catch(() => {
        fieldMetaCache.delete(key);
        return null;
      });
    fieldMetaCache.set(key, p);
  }
  return p;
}

export async function getStudioReference(key: string, q = "", limit = 50, signal?: AbortSignal): Promise<StudioReferenceItem[]> {
  const params = new URLSearchParams({ q, limit: String(Math.min(100, Math.max(1, limit))) });
  const raw = await http(`/studio/reference/${encodeURIComponent(key)}?${params}`, { signal });
  return listOf(raw, ["items", "data", "results", "options"]).map((value) => {
    const row = asDict(value);
    const valueOf = first(row.value, row.id, row.code, row.key);
    return { id: first(row.id, valueOf), value: valueOf, label: first(row.label, row.title, row.name, row.full_name, valueOf), raw: row };
  }).filter((item) => item.value);
}

// Ids the backend schema leaves as a plain text field but that still name a
// known record — an existing service package (K03-M), a consent document
// (K07), a Studio object (M2). They are picked from that record's own list
// instead of being typed (10-09 §11). Loaded once per page and searched here.
const LOCAL_REFERENCES: Record<string, () => Promise<StudioReferenceItem[]>> = {
  "local:service-packages": async () => {
    const { getServicePackages } = await import("@/lib/services/backend");
    return (await getServicePackages()).map((p) => ({ id: p.id, value: p.id, label: p.title || p.code, raw: { code: p.code, category_title: p.categoryTitle } }));
  },
  "local:consent-documents": async () => {
    const { listAdminConsentDocs } = await import("@/lib/services/backend");
    return (await listAdminConsentDocs()).map((d) => ({ id: d.id, value: d.id, label: d.title || d.slug, raw: { code: [d.slug, d.version].filter(Boolean).join(" · ") } }));
  },
  "local:studio-objects": async () =>
    (await listStudioObjects({ limit: 200 })).items.map((o) => ({ id: o.id, value: o.id, label: o.title || o.id, raw: { code: o.code } })),
};
const localCache = new Map<string, Promise<StudioReferenceItem[]>>();

export const isLocalStudioReference = (source: string) => source in LOCAL_REFERENCES;

export async function loadStudioReference(source: string, q = "", limit = 50, signal?: AbortSignal): Promise<StudioReferenceItem[]> {
  const load = LOCAL_REFERENCES[source];
  if (!load) return getStudioReference(source, q, limit, signal);
  let all = localCache.get(source);
  if (!all) {
    all = load();
    localCache.set(source, all);
    all.catch(() => localCache.delete(source));
  }
  const rows = await all;
  const needle = q.trim().toLowerCase();
  return (needle ? rows.filter((r) => `${r.label} ${r.value} ${asStr(r.raw.code)}`.toLowerCase().includes(needle)) : rows).slice(0, limit);
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
  else if (code === "studio_edit_conflict") kind = "edit_conflict";
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
