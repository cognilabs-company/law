import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { ApiError, asArr, asDict, asNum, asStr, currentTokenOwner, errDetail, http, httpBlob, isForbidden, isRouteMissing, parseServerTime, type Dict } from "@/lib/http";
import { saveBlob } from "@/lib/download";
import { sessionRoles, useAuth } from "@/lib/auth";
import { STUDIO_RETIRED_CODES, isRetiredStudioCode } from "@/lib/studio/retired";

export type StudioStatus = "draft" | "submitted" | "in_review" | "changes_requested" | "approved" | "published" | "archived";
export const STUDIO_STATUSES: StudioStatus[] = ["draft", "submitted", "in_review", "changes_requested", "approved", "published", "archived"];
export type StudioDecision = "approve" | "changes_requested" | "reject";
export type StudioAvailability = "checking" | "on" | "off";
export type StudioFieldErrors = Record<string, string>;

export const STUDIO_ROLES = ["studio_editor", "studio_reviewer", "studio_publisher", "studio_admin"] as const;
export type StudioRole = (typeof STUDIO_ROLES)[number];
export const STUDIO_APPROVAL_FREE = ["K16"];
export { STUDIO_RETIRED_CODES, isRetiredStudioCode };
const liveCodes = (codes: readonly string[]): string[] => codes.filter((c) => !isRetiredStudioCode(c));
const stillBlocked = (blocked: boolean, before: readonly string[], after: readonly string[]): boolean => blocked && (after.length > 0 || before.length === 0);
const STUDIO_FACTORS_GROUP = "services_packages";
const FACTOR_CODE = "K34";
const CATEGORY_CODE = "K01";
function factorsFirst<T>(list: readonly T[], codeOf: (x: T) => string): T[] | null {
  const codes = list.map((x) => codeOf(x).trim().toUpperCase());
  const f = codes.indexOf(FACTOR_CODE);
  const c = codes.indexOf(CATEGORY_CODE);
  if (f < 0 || c < 0 || f < c) return null;
  const out = list.slice();
  const [moved] = out.splice(f, 1);
  out.splice(c, 0, moved);
  return out;
}
const withoutCategoryGate = (code: string, groupKey: string, list: readonly string[]): string[] => (code === FACTOR_CODE && groupKey === STUDIO_FACTORS_GROUP ? list.filter((x) => x !== CATEGORY_CODE) : [...list]);
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
  generated: boolean;
  visibleWhen: StudioVisibleWhen | null;
};
export type StudioVisibleWhen = { field: string; equals?: unknown; in?: unknown[]; notEquals?: unknown };

function visibleWhenOf(raw: unknown): StudioVisibleWhen | null {
  const d = asDict(raw);
  const field = asStr(d.field ?? d.key);
  if (!field) return null;
  const out: StudioVisibleWhen = { field };
  if ("equals" in d) out.equals = d.equals;
  if (Array.isArray(d.in ?? d.one_of)) out.in = asArr(d.in ?? d.one_of);
  if ("not_equals" in d) out.notEquals = d.not_equals;
  return out;
}
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
  const code = first(r.code, r.constructor_code, r.key, r.id).toUpperCase();
  const groupKey = asStr(n.group_key);
  return {
    groupKey,
    groupTitle: asStr(n.group_title),
    groupOrder: numOrNull(n.group_order) ?? 99,
    step: numOrNull(n.step_number) ?? 0,
    steps: numOrNull(n.step_count) ?? 0,
    requiredBefore: withoutCategoryGate(code, groupKey, liveCodes(strings(n.required_before))),
    recommendedBefore: liveCodes(strings(n.recommended_before)),
    nextSteps: liveCodes(strings(n.next_steps)),
    reason: asStr(n.sequence_reason),
  };
}

// How a constructor's objects are worked on (spec 10-12 grouped workflows
// §10): the backend names the endpoints, the frontend never builds them.
export type StudioOperations = { supported: string[]; listEndpoint: string; formContextEndpoint: string; contextFields: string[]; identitySource: string; defaultView: string };

function operationsOf(r: Dict): StudioOperations {
  const o = asDict(r.operations);
  return {
    supported: strings(o.supported),
    listEndpoint: asStr(o.list_endpoint),
    formContextEndpoint: asStr(o.form_context_endpoint),
    contextFields: strings(o.context_fields),
    identitySource: first(o.identity_source),
    defaultView: first(o.default),
  };
}

function referencesOf(v: unknown): string[] {
  const out: string[] = [];
  for (const x of asArr(v)) {
    const s = (typeof x === "string" ? x : str(asDict(x).source)).trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
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
  operations: StudioOperations;
  references: string[];
  contextFields: string[];
  raw: Dict;
};

// One of the catalog's business groups, in the backend's order, with its
// constructors in the order they are done (§3–4).
export type StudioGroup = {
  key: string;
  title: string;
  description: string;
  order: number;
  codes: string[];
  count: number;
  completed: number;
  available: number;
  progress: number;
  nextCode: string;
};

// A business goal that runs through constructors of several groups (§6).
export type StudioJourneyStep = { step: number; code: string; title: string; completed: boolean; blocked: boolean; missingRequired: string[] };
export type StudioJourney = { key: string; title: string; description: string; codes: string[]; steps: StudioJourneyStep[]; completed: number; progress: number };

const pct = (v: unknown, done: number, all: number) => Math.max(0, Math.min(100, numOrNull(v) ?? (all ? Math.round((done / all) * 100) : 0)));

export function normStudioGroup(raw: unknown, i = 0): StudioGroup {
  const d = asDict(raw);
  const all = strings(d.codes).length ? strings(d.codes) : asArr(d.constructors).map((c) => first(asDict(c).code)).filter(Boolean);
  const live = liveCodes(all);
  const codes = (first(d.key, d.id) === STUDIO_FACTORS_GROUP ? factorsFirst(live, (c) => c) : null) ?? live;
  const dropped = all.length - codes.length;
  const listed = asArr(d.constructors).map(normStudioConstructor).filter((c) => c.code && codes.includes(c.code));
  const recount = dropped > 0 && listed.length === codes.length;
  const count = Math.max(0, (numOrNull(d.visible_constructor_count) ?? numOrNull(d.constructor_count) ?? all.length) - dropped);
  const completed = recount ? listed.filter((c) => c.completed).length : Math.min(count, numOrNull(d.completed_count) ?? 0);
  const available = recount ? listed.filter((c) => !c.completed && c.availability !== "blocked").length : Math.min(count, numOrNull(d.available_count) ?? 0);
  const next = asStr(d.next_constructor_code);
  const nextCode = isRetiredStudioCode(next) ? (listed.find((c) => !c.completed && c.availability !== "blocked")?.code ?? "") : next;
  return {
    key: first(d.key, d.id) || `g${i}`,
    title: first(d.title, d.key),
    description: asStr(d.description),
    order: numOrNull(d.order) ?? i + 1,
    codes,
    count,
    completed,
    available,
    progress: dropped > 0 ? pct(null, completed, count) : pct(d.progress_percent, completed, count),
    nextCode,
  };
}

export function normStudioJourney(raw: unknown, i = 0): StudioJourney {
  const d = asDict(raw);
  const all = asArr(d.steps).map((x, j) => {
    const s = asDict(x);
    return {
      step: numOrNull(s.step) ?? j + 1,
      code: first(s.constructor_code, s.code),
      title: asStr(s.title),
      completed: s.completed === true,
      blocked: asStr(s.availability) === "blocked",
      missingRequired: strings(s.missing_required),
    };
  });
  const dropped = all.some((s) => isRetiredStudioCode(s.code));
  const kept = all.filter((s) => !isRetiredStudioCode(s.code));
  const moved = factorsFirst(kept, (s) => s.code);
  const nums = kept.map((s) => s.step).sort((a, b) => a - b);
  const steps = (moved ?? kept).map((s, j) => {
    const live = liveCodes(s.missingRequired);
    const missingRequired = moved && s.code.trim().toUpperCase() === FACTOR_CODE ? live.filter((c) => c !== CATEGORY_CODE) : live;
    return { ...s, step: dropped ? j + 1 : moved ? nums[j] : s.step, missingRequired, blocked: stillBlocked(s.blocked, s.missingRequired, missingRequired) };
  });
  const completed = dropped ? steps.filter((s) => s.completed).length : (numOrNull(d.completed_count) ?? steps.filter((s) => s.completed).length);
  return {
    key: first(d.key, d.id) || `j${i}`,
    title: first(d.title, d.key),
    description: asStr(d.description),
    codes: strings(d.codes).length ? (factorsFirst(liveCodes(strings(d.codes)), (c) => c) ?? liveCodes(strings(d.codes))) : steps.map((s) => s.code),
    steps,
    completed,
    progress: dropped ? pct(null, completed, steps.length) : pct(d.progress_percent, completed, numOrNull(d.step_count) ?? steps.length),
  };
}

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
  // The route this version was submitted under, kept as it was that day.
  routeSnapshot: StudioRoute | null;
};

export type StudioPerson = { id: string; name: string };
export type StudioApprovalMode = "any" | "all" | "quorum";
export type StudioStepApproval = { userId: string; name: string; decision: string; comment: string; at: string };
export type StudioReassignment = { fromId: string; from: string; toId: string; to: string; by: string; message: string; at: string };

export type StudioStep = {
  id: string;
  order: number;
  role: string;
  title: string;
  status: string;
  decidedBy: string;
  decidedAt: string;
  comment: string;
  // Who decides this stage and how many of them it takes; the counters and
  // "may I decide" are the backend's, never worked out here.
  approvers: StudioPerson[];
  mode: StudioApprovalMode;
  required: number;
  approved: number;
  remaining: number;
  approvals: StudioStepApproval[];
  reassignments: StudioReassignment[];
  deadlineAt: string;
  overdue: boolean;
  escalatedAt: string;
  canDecide: boolean | null;
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

export type StudioRouteScope = "global" | "group" | "constructor";
export type StudioRouteSource = StudioRouteScope | "default";
export type StudioDeadlineUnit = "minute" | "hour" | "day";
export type StudioRouteStep = {
  role: string;
  title: string;
  approverIds: string[];
  approvers: StudioPerson[];
  mode: StudioApprovalMode;
  required: number;
  deadlineValue: number | null;
  deadlineUnit: StudioDeadlineUnit;
};
export type StudioRoute = {
  id: string;
  scopeType: StudioRouteScope;
  scopeKey: string;
  source: StudioRouteSource;
  constructorCode: string;
  title: string;
  steps: StudioRouteStep[];
  finalAction: string;
  deadlineHours: number;
  requireSuperadmin: boolean;
  autoPublishWhenEmpty: boolean;
  changeRequestRestart: string;
  version: number;
  status: string;
  updatedAt: string;
  raw: Dict;
};
export type StudioRouteInput = {
  scopeType: StudioRouteScope;
  scopeKey: string;
  title: string;
  steps: Pick<StudioRouteStep, "title" | "approverIds" | "mode" | "required" | "deadlineValue" | "deadlineUnit">[];
  finalAction: string;
  deadlineHours: number;
  requireSuperadmin: boolean;
  autoPublishWhenEmpty: boolean;
  changeRequestRestart: string;
  status: string;
};
export type StudioRouteGroup = { key: string; title: string; description: string; codes: string[]; order: number };
export type StudioRouteBoard = { items: StudioRoute[]; groups: StudioRouteGroup[]; primarySuperadmin: StudioPerson | null };
export type StudioApprover = { id: string; name: string; employeeCode: string; lexgoId: string; roles: string[]; primary: boolean };
// The two permissions that open workflow administration (contract §3).
export const STUDIO_PERM_WORKFLOW = "studio.workflow.manage";
export const STUDIO_PERM_REASSIGN = "studio.approval.reassign";

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
export type StudioRegistry = { items: StudioConstructor[]; userRoles: string[]; groups: StudioGroup[]; journeys: StudioJourney[]; constructorCount: number | null };
export type StudioListQuery = { constructorCode?: string; status?: string; assignedToMe?: boolean; limit?: number; offset?: number };
export type StudioSaveInput = { title?: string; payload?: Dict; summary?: string; version?: string; expectedLockVersion?: number | null };
export type StudioCreateInput = { constructorCode: string; title: string; payload: Dict; runtimeTargetId?: string; runtimeTargetType?: string };
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
    hidden: ui.hidden === true || f.context_managed === true || f.generated === true || (Array.isArray(f.visible_in_modes) && f.visible_in_modes.length === 0),
    readOnly: f.read_only === true,
    generated: f.generated === true,
    visibleWhen: visibleWhenOf(f.visible_when ?? ui.visible_when),
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
  const operations = operationsOf(r);
  const missingAll = strings(r.missing_required);
  const missingRequired = withoutCategoryGate(code.toUpperCase(), asStr(asDict(r.navigation).group_key), liveCodes(missingAll));
  const availability = asStr(r.availability);
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
    availability: availability === "blocked" && !stillBlocked(true, missingAll, missingRequired) ? "available" : availability,
    missingRequired,
    missingRecommended: liveCodes(strings(r.missing_recommended)),
    recordCount: numOrNull(r.record_count),
    operations,
    references: referencesOf(r.references),
    contextFields: operations.contextFields.length ? [...operations.contextFields] : strings(schema.context_fields),
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
    routeSnapshot: Object.keys(asDict(r.route_snapshot)).length ? normStudioRoute(r.route_snapshot) : null,
  };
}

const MODES: StudioApprovalMode[] = ["any", "all", "quorum"];
const modeOf = (v: unknown): StudioApprovalMode => (MODES.includes(asStr(v).toLowerCase() as StudioApprovalMode) ? (asStr(v).toLowerCase() as StudioApprovalMode) : "all");
function peopleOf(list: unknown, ids: unknown): StudioPerson[] {
  const named = asArr(list)
    .map((x) => {
      const d = asDict(x);
      return { id: first(d.id, d.user_id, d.value), name: first(d.name, d.full_name, d.label) || personOf(x) };
    })
    .filter((x) => x.id);
  const known = new Set(named.map((x) => x.id));
  return [...named, ...strings(ids).filter((id) => !known.has(id)).map((id) => ({ id, name: "" }))];
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
    approvers: peopleOf(r.approvers, r.approver_user_ids),
    mode: modeOf(r.approval_mode),
    required: asNum(r.required_approvals ?? r.quorum, 1),
    approved: asNum(r.approved_count, 0),
    remaining: asNum(r.remaining_approvals, 0),
    approvals: asArr(r.approvals).map((x) => {
      const d = asDict(x);
      return { userId: first(d.user_id, d.approver_user_id, d.id), name: first(d.name, d.user_name, d.approver_name) || personOf(d.user ?? d.approver), decision: asStr(d.decision ?? d.status).toLowerCase(), comment: first(d.comment, d.note), at: timeOf(d.decided_at, d.created_at, d.at) };
    }),
    reassignments: asArr(r.reassignment_history).map((x) => {
      const d = asDict(x);
      return {
        fromId: first(d.from_user_id, asDict(d.from_user).id),
        from: first(d.from_user_name, d.from_name) || personOf(d.from_user),
        toId: first(d.to_user_id, asDict(d.to_user).id),
        to: first(d.to_user_name, d.to_name) || personOf(d.to_user),
        by: first(d.by_user_name, d.reassigned_by_name, d.actor_name) || personOf(d.reassigned_by ?? d.by_user ?? d.actor),
        message: first(d.message, d.comment),
        at: timeOf(d.reassigned_at, d.created_at, d.at),
      };
    }),
    deadlineAt: timeOf(r.deadline_at),
    overdue: r.is_overdue === true,
    escalatedAt: timeOf(r.escalation_notified_at),
    canDecide: typeof r.can_decide === "boolean" ? r.can_decide : null,
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
    .map((s, i) => normStudioStep(s, i));
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

const UNITS: StudioDeadlineUnit[] = ["minute", "hour", "day"];
export function normStudioRoute(raw: unknown): StudioRoute {
  const r = asDict(raw);
  const scope = asStr(r.scope_type).toLowerCase();
  const source = asStr(r.source).toLowerCase();
  const code = first(r.constructor_code, r.constructorCode, r.code);
  const scopeType: StudioRouteScope = scope === "global" || scope === "group" ? scope : "constructor";
  return {
    id: first(r.id, r.route_id, r.uuid),
    scopeType,
    scopeKey: first(r.scope_key, scopeType === "constructor" ? code : scopeType === "global" ? "*" : ""),
    source: source === "default" || source === "global" || source === "group" || source === "constructor" ? source : scopeType,
    constructorCode: scopeType === "constructor" ? code || asStr(r.scope_key) : "",
    title: first(r.title, r.name),
    steps: listOf(r.steps, ["items", "steps"]).map((s) => {
      const d = asDict(s);
      const unit = asStr(d.deadline_unit).toLowerCase() as StudioDeadlineUnit;
      const people = peopleOf(d.approvers, d.approver_user_ids);
      return {
        role: first(d.role, d.required_role, d.reviewer_role),
        title: first(d.title, d.name, d.label),
        approverIds: people.map((x) => x.id),
        approvers: people,
        mode: modeOf(d.approval_mode),
        required: asNum(d.required_approvals ?? d.quorum, 1),
        deadlineValue: numOrNull(d.deadline_value),
        deadlineUnit: UNITS.includes(unit) ? unit : "hour",
      };
    }),
    finalAction: asStr(r.final_action, "publish") || "publish",
    deadlineHours: asNum(r.deadline_hours, 24),
    requireSuperadmin: r.require_primary_superadmin !== false,
    autoPublishWhenEmpty: r.auto_publish_when_empty !== false,
    changeRequestRestart: asStr(r.change_request_restart, "current") || "current",
    version: asNum(r.route_version, 1),
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
  groups: StudioGroup[];
  journeys: StudioJourney[];
  constructorCount: number | null;
  error: unknown;
  at: number;
};

let reg: RegState = { avail: "checking", owner: "", items: [], userRoles: [], groups: [], journeys: [], constructorCount: null, error: null, at: 0 };
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
    reg = { avail: "checking", owner: currentTokenOwner(), items: [], userRoles: [], groups: [], journeys: [], constructorCount: null, error: null, at: 0 };
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
  return { avail: s.avail, items: s.items, userRoles: s.userRoles, groups: s.groups, journeys: s.journeys, constructorCount: s.constructorCount, error: s.error };
}

function markOff(owner: string): void {
  clearTimeout(offTimer);
  offTimer = setTimeout(() => {
    if (reg.avail === "off") setReg({ avail: "checking", at: 0 });
  }, OFF_TTL);
  setReg({ avail: "off", owner, items: [], userRoles: [], groups: [], journeys: [], constructorCount: null, error: null, at: Date.now() });
}

function renumbered(c: StudioConstructor, groups: readonly StudioGroup[], shrunk: ReadonlySet<string>): StudioConstructor {
  const nav = c.navigation;
  if (!nav || !shrunk.has(nav.groupKey)) return c;
  const g = groups.find((x) => x.key === nav.groupKey);
  const at = g ? g.codes.indexOf(c.code) : -1;
  return at < 0 || !g ? c : { ...c, navigation: { ...nav, step: at + 1, steps: g.codes.length } };
}

function factorsFirstNav(c: StudioConstructor, groups: readonly StudioGroup[]): StudioConstructor {
  const nav = c.navigation;
  if (!nav || nav.groupKey !== STUDIO_FACTORS_GROUP) return c;
  const g = groups.find((x) => x.key === STUDIO_FACTORS_GROUP);
  const at = g ? g.codes.indexOf(c.code) : -1;
  if (!g || at < 0 || nav.step === at + 1) return c;
  const after = g.codes[at + 1] ?? "";
  const code = c.code.toUpperCase();
  const nextSteps = code === FACTOR_CODE ? (after ? [after] : []) : code === CATEGORY_CODE ? nav.nextSteps.map((x) => (x === FACTOR_CODE ? after : x)).filter((x) => !!x && x !== c.code) : nav.nextSteps;
  return { ...c, navigation: { ...nav, step: at + 1, steps: g.codes.length, nextSteps } };
}

function parseRegistry(res: unknown): StudioRegistry {
  const d = asDict(res);
  const all = listOf(res, ["items", "constructors", "data", "results"]).map(normStudioConstructor).filter((c) => c.code);
  const userRoles = strings(d.user_roles ?? d.roles ?? d.userRoles).map((r) => r.toLowerCase());
  const groups = asArr(d.groups).map(normStudioGroup).filter((g) => g.codes.length);
  const journeys = asArr(d.journeys).map(normStudioJourney).filter((j) => j.steps.length);
  for (const g of asArr(d.groups))
    for (const c of asArr(asDict(g).constructors)) {
      const n = normStudioConstructor(c);
      if (n.code && !all.some((x) => x.code === n.code)) all.push(n);
    }
  const retired = new Set(all.filter((c) => isRetiredStudioCode(c.code)).map((c) => c.code));
  const shrunk = new Set(
    asArr(d.groups)
      .map((g) => asDict(g))
      .filter((g) => [...strings(g.codes), ...asArr(g.constructors).map((c) => first(asDict(c).code))].some(isRetiredStudioCode))
      .map((g) => first(g.key, g.id)),
  );
  const items = all
    .filter((c) => !retired.has(c.code))
    .map((c) => renumbered(c, groups, shrunk))
    .map((c) => factorsFirstNav(c, groups));
  const listed = numOrNull(d.constructor_count);
  const constructorCount = listed === null ? null : Math.max(0, listed - retired.size);
  return { items, userRoles, groups, journeys, constructorCount };
}

export async function listStudioConstructors(): Promise<StudioRegistry> {
  const owner = currentTokenOwner();
  try {
    const out = parseRegistry(await http("/studio/constructors"));
    clearTimeout(offTimer);
    setReg({ avail: "on", owner, items: out.items, userRoles: out.userRoles, groups: out.groups, journeys: out.journeys, constructorCount: out.constructorCount, error: null, at: Date.now() });
    return out;
  } catch (e) {
    if (isRouteMissing(e)) markOff(owner);
    else if (isForbidden(e)) setReg({ avail: "on", owner, items: [], userRoles: [], groups: [], journeys: [], constructorCount: null, error: e, at: Date.now() });
    else setReg({ avail: reg.avail === "checking" ? "on" : reg.avail, owner, error: e, at: Date.now() });
    throw e;
  }
}

export function ensureStudioRegistry(force = false): Promise<StudioRegistry | null> {
  const s = snapshot();
  if (!force && s.avail === "off") return Promise.resolve(null);
  if (!force && s.avail === "on" && !s.error && Date.now() - s.at < FRESH_MS) return Promise.resolve({ items: s.items, userRoles: s.userRoles, groups: s.groups, journeys: s.journeys, constructorCount: s.constructorCount });
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

const serverReg: RegState = { avail: "checking", owner: "", items: [], userRoles: [], groups: [], journeys: [], constructorCount: null, error: null, at: 0 };

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

export function studioCtorRank(code: string): number {
  const nav = findStudioConstructor(str(code).trim())?.navigation;
  return nav ? nav.groupOrder * 100 + nav.step : 9999;
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
const HOLIDAY_FIELDS = ["starts_on", "duration_days"];

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

const objectInflight = new Map<string, Promise<StudioDetail>>();

export function getStudioObject(id: string): Promise<StudioDetail> {
  const hit = objectInflight.get(id);
  if (hit) return hit;
  const p = http(`/studio/objects/${enc(id)}`)
    .then(normStudioDetail)
    .finally(() => objectInflight.delete(id));
  objectInflight.set(id, p);
  return p;
}

export function isHolidayCalendarCtor(ctor: Pick<StudioConstructor, "typed" | "schema"> | null | undefined): boolean {
  if (!ctor) return false;
  return HOLIDAY_FIELDS.some((k) => ctor.schema.fields.includes(k) || ctor.typed.some((f) => f.key === k));
}

export async function createStudioObject(input: StudioCreateInput): Promise<StudioDetail> {
  const res = await http("/studio/objects", {
    method: "POST",
    body: JSON.stringify({
      constructor_code: input.constructorCode,
      title: input.title,
      runtime_target_type: input.runtimeTargetType ?? "",
      runtime_target_id: input.runtimeTargetId ?? "",
      payload: input.payload,
    }),
  });
  return normStudioDetail(res);
}

function objectActionPath(id: string, action: "save" | "submit", url?: string): string {
  const built = `/studio/objects/${enc(id)}/${action}`;
  const raw = (typeof url === "string" ? url.trim() : "").replace(/^https?:\/\/[^/]+/i, "").replace(/^\/api\/backend(?=\/)/, "");
  if (!raw || raw.includes("..") || raw.startsWith("//")) return built;
  const path = raw.split(/[?#]/)[0];
  const m = new RegExp(`^/studio/objects/([^/]+)/${action}$`).exec(path);
  if (!m) return built;
  let seg = m[1];
  try {
    seg = decodeURIComponent(seg);
  } catch {
    return built;
  }
  return seg === id ? path : built;
}

export async function saveStudioObject(id: string, input: StudioSaveInput, url?: string): Promise<StudioDetail> {
  const body: Dict = {};
  if (input.title !== undefined) body.title = input.title;
  if (input.payload !== undefined) body.payload = input.payload;
  if (input.summary) body.summary = input.summary;
  if (input.version) body.version = input.version;
  if (typeof input.expectedLockVersion === "number") body.expected_lock_version = input.expectedLockVersion;
  return normStudioDetail(await http(objectActionPath(id, "save", url), { method: "POST", body: JSON.stringify(body) }));
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

export async function submitStudioObject(id: string, url?: string): Promise<StudioDetail> {
  return normStudioDetail(await http(objectActionPath(id, "submit", url), { method: "POST" }));
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

// ── Records and form context (spec 10-12 grouped workflows §8–15) ──────────

export type StudioRecordSource = "runtime" | "studio";
export type StudioRecordActions = { view: string; edit: string; clone: string; archive: string };
export type StudioRecord = {
  id: string;
  recordId: string;
  code: string;
  title: string;
  status: string;
  source: StudioRecordSource;
  runtimeTargetId: string;
  runtimeTargetType: string;
  studioObjectId: string;
  updatedAt: string;
  owner: string;
  version: string;
  actions: StudioRecordActions;
};
export type StudioRecords = { items: StudioRecord[]; total: number; runtimeTotal: number; studioTotal: number; createUrl: string };
export type StudioRecordQuery = { q?: string; status?: string; source?: "" | StudioRecordSource; limit?: number; offset?: number };

// Only the backend's own Studio paths are ever followed from a response.
const studioPath = (url: string, prefix = "/studio/"): string => {
  const u = (url || "").trim();
  return u.startsWith(prefix) && !u.includes("..") && !/^\/\//.test(u) ? u : "";
};

export function normStudioRecord(raw: unknown): StudioRecord {
  const d = asDict(raw);
  const a = asDict(d.actions);
  const source: StudioRecordSource = asStr(d.source) === "runtime" ? "runtime" : "studio";
  const ver = asDict(d.current_version);
  return {
    id: first(d.id, d.record_id),
    recordId: first(d.record_id, d.id),
    code: first(d.constructor_code, d.code),
    title: first(d.title, d.name),
    status: asStr(d.status).toLowerCase(),
    source,
    runtimeTargetId: asStr(d.runtime_target_id),
    runtimeTargetType: asStr(d.runtime_target_type),
    studioObjectId: first(d.studio_object_id, source === "studio" ? d.id : ""),
    updatedAt: timeOf(d.updated_at, d.created_at),
    owner: first(d.owner_name, personOf(d.created_by)),
    version: first(d.current_version_label, ver.version, ver.label),
    actions: { view: studioPath(asStr(a.view)), edit: studioPath(asStr(a.edit)), clone: studioPath(asStr(a.clone)), archive: studioPath(asStr(a.archive)) },
  };
}

export async function listStudioRecords(code: string, q: StudioRecordQuery = {}, signal?: AbortSignal): Promise<StudioRecords> {
  const p = new URLSearchParams();
  if (q.q?.trim()) p.set("q", q.q.trim());
  if (q.status) p.set("status", q.status);
  p.set("source", q.source || "all");
  p.set("limit", String(q.limit ?? 50));
  p.set("offset", String(q.offset ?? 0));
  const d = asDict(await http(`/studio/constructors/${enc(code)}/records?${p}`, { signal }));
  const items = asArr(d.items).map(normStudioRecord).filter((r) => r.id);
  return {
    items,
    total: numOrNull(d.total) ?? items.length,
    runtimeTotal: numOrNull(d.runtime_total) ?? 0,
    studioTotal: numOrNull(d.studio_total) ?? 0,
    createUrl: studioPath(asStr(d.create_url), `/studio/constructors/`),
  };
}

export type StudioFormMode = "create" | "view" | "edit" | "clone";
export type StudioFormContext = {
  mode: StudioFormMode;
  code: string;
  constructorTitle: string;
  title: string;
  ctor: StudioConstructor;
  initialPayload: Dict;
  recordId: string;
  source: StudioRecordSource | "";
  runtimeTargetId: string;
  runtimeTargetType: string;
  studioObjectId: string;
  saveUrl: string;
};

// The form for one object as the backend prepares it: its cleaned schema,
// the payload to start from and the object it stands for (route context).
export async function getStudioFormContext(url: string, signal?: AbortSignal): Promise<StudioFormContext> {
  const path = studioPath(url, "/studio/constructors/");
  if (!path || !path.includes("/form-context")) throw new Error("studio_form_context_url");
  const d = asDict(await http(path, { signal }));
  const ctx = asDict(d.context);
  const sub = asDict(d.submit);
  const code = first(d.constructor_code, sub.constructor_code);
  const mode = (["create", "view", "edit", "clone"].includes(asStr(d.mode)) ? asStr(d.mode) : "create") as StudioFormMode;
  const ctor = normStudioConstructor({ ...d, code, title: first(d.constructor_title, code), ui_schema: { sections: asArr(d.sections) } });
  const src = asStr(ctx.source);
  return {
    mode,
    code,
    constructorTitle: first(d.constructor_title, code),
    title: asStr(d.title),
    ctor,
    initialPayload: asDict(d.initial_payload),
    recordId: asStr(ctx.record_id),
    source: src === "runtime" || src === "studio" ? src : "",
    runtimeTargetId: first(sub.runtime_target_id, ctx.runtime_target_id),
    runtimeTargetType: first(sub.runtime_target_type, ctx.runtime_target_type),
    studioObjectId: asStr(ctx.studio_object_id),
    saveUrl: studioPath(asStr(sub.save_object_url), "/studio/objects/"),
  };
}

export function studioFormContextUrl(url: string, mode: StudioFormMode): string {
  const path = studioPath(url, "/studio/constructors/");
  const hashAt = path.indexOf("#");
  const bare = hashAt < 0 ? path : path.slice(0, hashAt);
  const queryAt = bare.indexOf("?");
  const base = queryAt < 0 ? bare : bare.slice(0, queryAt);
  if (!base.includes("/form-context")) return "";
  const params = new URLSearchParams(queryAt < 0 ? "" : bare.slice(queryAt + 1));
  params.set("mode", mode);
  return `${base}?${params}${hashAt < 0 ? "" : path.slice(hashAt)}`;
}

const SUGGEST_LIST_KEYS = ["items", "suggestions", "terms", "discovery_terms"];
const SUGGEST_DATA_KEYS = ["items", "suggestions"];
const SUGGEST_MAX = 30;

function suggestionsOf(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const d = asDict(raw);
  for (const k of SUGGEST_LIST_KEYS) if (Array.isArray(d[k])) return d[k] as unknown[];
  const data = asDict(d.data);
  for (const k of SUGGEST_DATA_KEYS) if (Array.isArray(data[k])) return data[k] as unknown[];
  return [];
}

export async function suggestDiscoveryTerms(input: { title: string; description?: string; parentTitle?: string }, signal?: AbortSignal): Promise<string[]> {
  const res = await http("/studio/categories/discovery-terms/suggest", {
    method: "POST",
    body: JSON.stringify({ title: input.title, description: input.description ?? "", parent_title: input.parentTitle ?? "" }),
    signal,
  });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of suggestionsOf(res)) {
    const d = x && typeof x === "object" && !Array.isArray(x) ? (x as Dict) : null;
    const term = d ? first(d.value, d.term, d.text, d.label, d.title) : first(x);
    const key = term.toLowerCase();
    if (!term || seen.has(key)) continue;
    seen.add(key);
    out.push(term);
    if (out.length >= SUGGEST_MAX) break;
  }
  return out;
}

// A Studio object's copy under a new title; the original is not touched.
export async function cloneStudioObject(url: string, title: string): Promise<StudioDetail> {
  const path = studioPath(url, "/studio/objects/");
  if (!path || !/\/clone$/.test(path)) throw new Error("studio_clone_url");
  return normStudioDetail(await http(path, { method: "POST", body: JSON.stringify({ title }) }));
}

export async function archiveStudioRecord(url: string): Promise<StudioDetail> {
  const path = studioPath(url, "/studio/objects/");
  if (!path || !/\/archive$/.test(path)) throw new Error("studio_archive_url");
  return normStudioDetail(await http(path, { method: "POST" }));
}

// The object a "/studio/objects/{id}" action stands for.
export const studioObjectIdOf = (url: string): string => /^\/studio\/objects\/([^/?#]+)\/?$/.exec(studioPath(url, "/studio/objects/"))?.[1] ?? "";

export function studioObjectAction(id: string, action: "clone" | "archive"): string {
  return `/studio/objects/${enc(id)}/${action}`;
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

// What people did to Studio records (GET /admin/audit-trail, target_type
// studio_object): create, save, submit, review, publish, archive, comment…
// The monitoring answer says only how long a session lasted; these rows say
// what happened in it. Dates are whole days on the server's calendar.
export type StudioAuditEvent = { id: string; userId: string; action: string; targetId: string; title: string; at: number };
export async function listStudioAudit(params: { userId?: string; dateFrom?: string; dateTo?: string } = {}, signal?: AbortSignal): Promise<StudioAuditEvent[]> {
  const query = new URLSearchParams({ target_type: "studio_object" });
  if (params.userId) query.set("user_id", params.userId);
  if (params.dateFrom) query.set("date_from", params.dateFrom);
  if (params.dateTo) query.set("date_to", params.dateTo);
  const res = await http(`/admin/audit-trail?${query}`, { signal });
  return listOf(res, ["items", "data", "results"])
    .map(asDict)
    .filter((d) => asStr(d.outcome || "success") === "success")
    .map((d) => {
      const raw = asStr(d.action).toLowerCase();
      return {
        id: asStr(d.id),
        userId: asStr(d.user_id),
        action: raw === "studio_comment_create" ? "comment" : raw.replace(/^studio_object_/, ""),
        targetId: asStr(d.target_id),
        title: asStr(d.detail),
        at: parseServerTime(asStr(d.created_at)),
      };
    })
    .filter((e) => e.userId && Number.isFinite(e.at));
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

export function studioReferenceKey(source: string): { key: string; params: URLSearchParams } {
  const [path, query = ""] = source.trim().split("?");
  const key = path
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/+/, "")
    .replace(/^(api\/backend\/)?studio\/reference\//, "")
    .replace(/\/+$/, "");
  return { key, params: new URLSearchParams(query) };
}

export async function getStudioReference(source: string, q = "", limit = 50, signal?: AbortSignal): Promise<StudioReferenceItem[]> {
  const { key, params } = studioReferenceKey(source);
  params.set("q", q);
  params.set("limit", String(Math.min(100, Math.max(1, limit))));
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

// Saved routes with the nine groups and the primary superadmin the backend
// names (contract §6): group membership is never hardcoded here.
export async function listApprovalRoutes(): Promise<StudioRouteBoard> {
  const res = await http("/admin/studio/approval-routes");
  const d = asDict(res);
  const sa = asDict(d.primary_superadmin);
  return {
    items: listOf(res, ["items", "routes", "data", "results"])
      .map(normStudioRoute)
      .filter((r) => r.scopeType !== "constructor" || !isRetiredStudioCode(r.constructorCode || r.scopeKey)),
    groups: asArr(d.groups)
      .map((g, i) => {
        const x = asDict(g);
        return { key: asStr(x.key), title: asStr(x.title), description: asStr(x.description), codes: liveCodes(strings(x.codes)), order: asNum(x.order, i + 1) };
      })
      .filter((g) => g.key)
      .sort((a, b) => a.order - b.order),
    primarySuperadmin: first(sa.id) ? { id: first(sa.id), name: first(sa.name, sa.full_name) } : null,
  };
}

// An upsert for the chosen scope: saving the same scope again updates it.
export async function saveApprovalRoute(input: StudioRouteInput): Promise<StudioRoute> {
  const body: Dict = {
    scope_type: input.scopeType,
    scope_key: input.scopeKey,
    title: input.title,
    steps: input.steps.map((s) => ({
      title: s.title,
      approver_user_ids: s.approverIds,
      approval_mode: s.mode,
      ...(s.mode === "quorum" ? { required_approvals: s.required } : {}),
      ...(s.deadlineValue ? { deadline_value: s.deadlineValue, deadline_unit: s.deadlineUnit } : {}),
    })),
    final_action: input.finalAction,
    allow_self_approval: false,
    change_request_restart: input.changeRequestRestart,
    deadline_hours: input.deadlineHours,
    require_primary_superadmin: input.requireSuperadmin,
    auto_publish_when_empty: input.autoPublishWhenEmpty,
    reminders: [],
    status: input.status,
  };
  if (input.scopeType === "constructor") body.constructor_code = input.scopeKey;
  const res = asDict(await http("/admin/studio/approval-routes", { method: "POST", body: JSON.stringify(body) }));
  return normStudioRoute(res.route ?? res.item ?? res);
}

// Who may be picked as an approver: active staff with Studio access only.
export async function listApprovalUsers(q = "", constructorCode = "", signal?: AbortSignal): Promise<StudioApprover[]> {
  const p = new URLSearchParams({ limit: "100" });
  if (q.trim()) p.set("q", q.trim());
  if (constructorCode) p.set("constructor_code", constructorCode);
  const res = await http(`/admin/studio/approval-users?${p}`, { signal });
  return listOf(res, ["items", "users", "data"]).map((x) => {
    const d = asDict(x);
    const roles = strings(d.constructor_roles);
    return {
      id: first(d.id, d.value),
      name: first(d.label, d.name),
      employeeCode: asStr(d.employee_code),
      lexgoId: asStr(d.lexgo_id),
      roles: roles.length ? roles : strings(d.studio_roles),
      primary: d.is_primary_superadmin === true,
    };
  }).filter((u) => u.id);
}

// A pending decision handed from one approver to another (contract §13).
export async function reassignApprovalStep(stepId: string, input: { fromUserId: string; toUserId: string; message?: string }): Promise<void> {
  await http(`/admin/studio/approval-steps/${enc(stepId)}/reassign`, {
    method: "POST",
    body: JSON.stringify({ from_user_id: input.fromUserId, to_user_id: input.toUserId, message: input.message ?? "" }),
  });
}

// Overdue stages are escalated by the backend every minute; this asks for a
// pass right now.
export async function processOverdueApprovals(): Promise<void> {
  await http("/admin/studio/approvals/process-overdue", { method: "POST" });
}

// The route a constructor is approved by today, with where it comes from
// (its own, its group's, the global one or the backend default).
export async function getEffectiveRoute(code: string, signal?: AbortSignal): Promise<StudioRoute | null> {
  const d = asDict(await http(`/studio/constructors/${enc(code)}`, { signal }));
  return Object.keys(asDict(d.approval_route)).length ? normStudioRoute(d.approval_route) : null;
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
    const raw = first(e.message, e.msg, e.error, e.detail);
    // A coded error becomes a token the screen says in the reader's own
    // language, about the field by its own name ("@code:minimum:1"); the
    // backend's sentence is kept only where it sent no code.
    const code = asStr(e.code).toLowerCase();
    const bound = code === "minimum" || code === "maximum" ? /-?\d+(?:\.\d+)?/.exec(raw)?.[0] : undefined;
    const msg = /^[a-z_]+$/.test(code) ? `@code:${code}${bound !== undefined ? `:${bound}` : ""}` : raw;
    if (!msg) continue;
    out[key] = out[key] && !msg.startsWith("@code:") && !out[key].startsWith("@code:") ? `${out[key]}; ${msg}` : out[key] || msg;
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

export type StudioJourneyType = "service" | "package";
export type StudioCreationJourney = {
  id: string;
  type: StudioJourneyType;
  title: string;
  status: string;
  progress: number | null;
  completedCount: number;
  totalCount: number | null;
  currentStep: string;
  completedSteps: string[];
  missingSteps: string[];
  context: Record<string, unknown>;
  resumeUrl: string;
  createdAt: string;
  updatedAt: string;
  raw: Record<string, unknown>;
};
export type StudioCreationJourneys = { items: StudioCreationJourney[]; total: number; incompleteCount: number | null };
export type StudioJourneyQuery = { status?: string; type?: StudioJourneyType; limit?: number; offset?: number };

const JOURNEY_LIST_KEYS = ["items", "journeys", "results", "data"];
const journeyMemory = new Map<string, StudioCreationJourney>();

function journeyStepKey(v: unknown): string {
  if (typeof v === "string") return v.trim();
  const d = asDict(v);
  return first(d.key, d.step);
}

function journeyStepList(v: unknown): string[] {
  const out: string[] = [];
  for (const item of asArr(v)) {
    const k = journeyStepKey(item);
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

function journeyCount(v: unknown): number | null {
  const n = numOrNull(v);
  return n === null || n < 0 ? null : Math.floor(n);
}

export function normCreationJourney(raw: unknown): StudioCreationJourney {
  let d = asDict(raw);
  if (!first(d.id, d.journey_id)) {
    for (const k of ["journey", "item", "data"]) {
      const inner = asDict(d[k]);
      if (first(inner.id, inner.journey_id)) {
        d = inner;
        break;
      }
    }
  }
  const completedSteps = journeyStepList(d.completed_steps);
  const percent = numOrNull(d.progress_percent);
  return {
    id: first(d.id, d.journey_id),
    type: /package/i.test(first(d.journey_type, d.type)) ? "package" : "service",
    title: first(d.title, d.name),
    status: first(d.status).toLowerCase(),
    progress: percent === null ? null : Math.max(0, Math.min(100, percent)),
    completedCount: journeyCount(d.completed_count) ?? completedSteps.length,
    totalCount: journeyCount(d.total_count),
    currentStep: journeyStepKey(d.current_step),
    completedSteps,
    missingSteps: journeyStepList(d.missing_steps),
    context: { ...asDict(d.context) },
    resumeUrl: typeof d.resume_url === "string" ? d.resume_url.trim() : "",
    createdAt: timeOf(d.created_at, d.createdAt),
    updatedAt: timeOf(d.updated_at, d.updatedAt, d.created_at),
    raw: d,
  };
}

export function rememberCreationJourney(j: StudioCreationJourney): void {
  if (j.id) journeyMemory.set(j.id, j);
}

export function peekCreationJourney(id: string): StudioCreationJourney | null {
  return id ? journeyMemory.get(id) ?? null : null;
}

export async function listCreationJourneys(q: StudioJourneyQuery = {}, signal?: AbortSignal): Promise<StudioCreationJourneys> {
  const p = new URLSearchParams();
  if (q.status) p.set("status", q.status);
  if (q.type) p.set("journey_type", q.type);
  if (q.limit != null) p.set("limit", String(q.limit));
  if (q.offset != null) p.set("offset", String(q.offset));
  const qs = p.toString();
  const res = await http(`/studio/journeys${qs ? `?${qs}` : ""}`, { signal });
  const items = listOf(res, JOURNEY_LIST_KEYS).map(normCreationJourney).filter((j) => j.id);
  return { items, total: totalOf(res, items.length), incompleteCount: journeyCount(asDict(res).incomplete_count) };
}

export async function startCreationJourney(input: { type: StudioJourneyType; title: string; context?: Record<string, unknown> }): Promise<StudioCreationJourney> {
  const res = await http("/studio/journeys", {
    method: "POST",
    body: JSON.stringify({ journey_type: input.type, title: input.title, context: input.context ?? {} }),
  });
  const j = normCreationJourney(res);
  if (!j.id) throw new Error("journey_no_id");
  const typed = first(j.raw.journey_type, j.raw.type);
  const out: StudioCreationJourney = { ...j, title: j.title || input.title, type: typed ? j.type : input.type };
  rememberCreationJourney(out);
  return out;
}

export async function saveCreationJourney(id: string, input: { completedSteps: string[]; currentStep: string; context: Record<string, unknown> }): Promise<StudioCreationJourney> {
  const res = await http(`/studio/journeys/${enc(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ completed_steps: input.completedSteps, current_step: input.currentStep, context: input.context }),
  });
  const j = normCreationJourney(res);
  const out: StudioCreationJourney = j.id ? j : { ...j, id };
  if (j.id || j.raw.completed_steps !== undefined) rememberCreationJourney(out);
  return out;
}
