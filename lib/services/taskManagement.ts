"use client";

import { ApiError, asArr, asDict, asNum, asStr, errDetail, http, httpBlob, httpBlobNamed } from "@/lib/http";

type Dict = Record<string, unknown>;

export const TASK_STATUSES = ["new", "in_progress", "testing", "ready"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const isTaskStatus = (v: unknown): v is TaskStatus => typeof v === "string" && (TASK_STATUSES as readonly string[]).includes(v);

export type TaskPerson = { id: string; name: string; lexgoId: string; role: string };
export type TaskAssignee = TaskPerson & { assignedAt: string };
export type TaskActions = {
  canEdit: boolean;
  canAssign: boolean;
  canDelete: boolean;
  canChangeStatus: boolean;
  nextStatuses: TaskStatus[];
  isAssigned: boolean;
};
export type TaskHistoryItem = {
  id: string;
  eventType: string;
  fromStatus: TaskStatus | "";
  toStatus: TaskStatus | "";
  comment: string;
  payload: Dict;
  actor: TaskPerson | null;
  createdAt: string;
};
// A file attached to a task (GET /task-management/{id} → attachments).
// Its URLs are API paths that need the signed-in user's token, so they are
// fetched as blobs, never used as a plain src.
export type TaskAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: string;
  note: string;
  isImage: boolean;
  previewUrl: string;
  downloadUrl: string;
  uploader: TaskPerson | null;
  createdAt: string;
};
export type Task = {
  id: string;
  code: string;
  title: string;
  description: string;
  status: TaskStatus;
  statusLabel: string;
  deadlineAt: string;
  isOverdue: boolean;
  creator: TaskPerson | null;
  assignees: TaskAssignee[];
  readyBy: TaskPerson | null;
  readyAt: string;
  lockVersion: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string;
  deleteReason: string;
  actions: TaskActions;
  history: TaskHistoryItem[] | null;
  // Only the detail answer carries these; null on a list row.
  attachments: TaskAttachment[] | null;
  attachmentCount: number;
};
export type TaskCounts = Record<TaskStatus, number>;
// `periodApplied`: the backend answered with its `period` (or count_scope),
// i.e. it filtered by date_from/date_to/period_field. `legacyPeriod`: the
// page was read with the old deadline range (see listTasksInPeriod).
export type TaskPage = { items: Task[]; total: number; limit: number; offset: number; hasMore: boolean; counts: TaskCounts; periodApplied?: boolean; legacyPeriod?: boolean };
export type TaskMeta = {
  statuses: { value: TaskStatus; label: string; order: number }[];
  canCreate: boolean;
  canAssign: boolean;
  canApproveReady: boolean;
  canDeleteReady: boolean;
  events: string[];
  attachments: TaskUploadLimits;
};

// What GET /task-management/meta allows a task to carry. The defaults are
// the values it sent on 2026-10-22, used only until meta has loaded.
export type TaskUploadLimits = { maxCount: number; maxBytes: number; extensions: string[]; multiple: boolean };
export const TASK_UPLOAD_DEFAULTS: TaskUploadLimits = {
  maxCount: 10,
  maxBytes: 20 * 1024 * 1024,
  extensions: [".csv", ".doc", ".docx", ".jpeg", ".jpg", ".pdf", ".png", ".ppt", ".pptx", ".txt", ".webp", ".xls", ".xlsx"],
  multiple: true,
};

function uploadLimitsOf(v: unknown): TaskUploadLimits {
  const d = asDict(v);
  const ext = asArr(d.allowed_extensions)
    .map((x) => asStr(x).toLowerCase().trim())
    .filter(Boolean)
    .map((x) => (x.startsWith(".") ? x : `.${x}`));
  return {
    maxCount: asNum(d.max_count) || TASK_UPLOAD_DEFAULTS.maxCount,
    maxBytes: asNum(d.max_bytes_per_file) || TASK_UPLOAD_DEFAULTS.maxBytes,
    extensions: ext.length ? ext : TASK_UPLOAD_DEFAULTS.extensions,
    multiple: d.multiple_upload !== false,
  };
}

const personOf = (v: unknown): TaskPerson | null => {
  const d = asDict(v);
  const id = asStr(d.id);
  if (!id && !asStr(d.name)) return null;
  return { id, name: asStr(d.name) || asStr(d.full_name), lexgoId: asStr(d.lexgo_id), role: asStr(d.role) };
};

const statusOf = (v: unknown): TaskStatus | "" => (isTaskStatus(v) ? v : "");

function actionsOf(v: unknown): TaskActions {
  const d = asDict(v);
  return {
    canEdit: d.can_edit === true,
    canAssign: d.can_assign === true,
    canDelete: d.can_delete === true,
    canChangeStatus: d.can_change_status === true,
    nextStatuses: asArr(d.next_statuses).filter(isTaskStatus),
    isAssigned: d.is_assigned === true,
  };
}

function historyItemOf(v: unknown): TaskHistoryItem {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    eventType: asStr(d.event_type),
    fromStatus: statusOf(d.from_status),
    toStatus: statusOf(d.to_status),
    comment: asStr(d.comment),
    payload: asDict(d.payload),
    actor: personOf(d.actor),
    createdAt: asStr(d.created_at),
  };
}

// An API path, with the API's own origin dropped when the backend sends an
// absolute URL; anything that is not a path on the API is refused.
const apiPath = (v: unknown): string => {
  const s = asStr(v).trim().replace(/^https?:\/\/[^/]+/i, "");
  return s.startsWith("/") && !s.startsWith("//") ? s : "";
};

function attachmentOf(v: unknown): TaskAttachment {
  const d = asDict(v);
  const mimeType = asStr(d.mime_type).toLowerCase();
  const kind = asStr(d.kind).toLowerCase();
  const previewUrl = apiPath(d.preview_url) || apiPath(d.inline_url);
  return {
    id: asStr(d.id),
    fileName: asStr(d.file_name),
    mimeType,
    sizeBytes: asNum(d.size_bytes),
    kind,
    note: asStr(d.note),
    isImage: (kind === "image" || mimeType.startsWith("image/")) && d.preview_supported !== false && !!previewUrl,
    previewUrl,
    downloadUrl: apiPath(d.download_url),
    uploader: personOf(d.uploader),
    createdAt: asStr(d.created_at),
  };
}

export function normTask(v: unknown): Task {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    code: asStr(d.task_code),
    title: asStr(d.title),
    description: asStr(d.description),
    status: statusOf(d.status) || "new",
    statusLabel: asStr(d.status_label),
    deadlineAt: asStr(d.deadline_at),
    isOverdue: d.is_overdue === true,
    creator: personOf(d.creator),
    assignees: asArr(d.assignees)
      .map((a) => {
        const p = personOf(a);
        return p ? { ...p, assignedAt: asStr(asDict(a).assigned_at) } : null;
      })
      .filter((a): a is TaskAssignee => a !== null),
    readyBy: personOf(d.ready_by),
    readyAt: asStr(d.ready_at),
    lockVersion: asNum(d.lock_version),
    createdAt: asStr(d.created_at),
    updatedAt: asStr(d.updated_at),
    deletedAt: asStr(d.deleted_at),
    deleteReason: asStr(d.delete_reason),
    actions: actionsOf(d.actions),
    history: Array.isArray(d.history) ? d.history.map(historyItemOf) : null,
    attachments: Array.isArray(d.attachments) ? d.attachments.map(attachmentOf).filter((a) => a.id) : null,
    attachmentCount: asNum(d.attachment_count, Array.isArray(d.attachments) ? d.attachments.length : 0),
  };
}

const countsOf = (v: unknown): TaskCounts => {
  const d = asDict(v);
  return { new: asNum(d.new), in_progress: asNum(d.in_progress), testing: asNum(d.testing), ready: asNum(d.ready) };
};

export async function getTaskMeta(signal?: AbortSignal): Promise<TaskMeta> {
  const d = asDict(await http("/task-management/meta", { signal }));
  const caps = asDict(d.capabilities);
  return {
    statuses: asArr(d.statuses)
      .map((s) => {
        const x = asDict(s);
        return { value: statusOf(x.value), label: asStr(x.label), order: asNum(x.order) };
      })
      .filter((s): s is TaskMeta["statuses"][number] => s.value !== ""),
    canCreate: caps.create === true,
    canAssign: caps.assign === true,
    canApproveReady: caps.approve_ready === true,
    canDeleteReady: caps.delete_ready === true,
    events: asArr(asDict(d.realtime).events).map((e) => asStr(e)).filter(Boolean),
    attachments: uploadLimitsOf(d.attachments),
  };
}

// Which date a period filters on (FRONTEND_MARKETPLACE_PRICING_TASK_PERIOD_
// CAMPAIGN_FIXES §3): the deadline, the day the task was created, or the day
// it was moved to Ready.
export const TASK_PERIOD_FIELDS = ["deadline", "created", "completed"] as const;
export type TaskPeriodField = (typeof TASK_PERIOD_FIELDS)[number];

export type TaskQuery = {
  status?: TaskStatus | "";
  assignee?: string;
  q?: string;
  // Inclusive calendar days (YYYY-MM-DD) in the backend's task timezone,
  // always both together, with the date they apply to.
  dateFrom?: string;
  dateTo?: string;
  periodField?: TaskPeriodField;
  // Legacy deadline range; never sent together with dateFrom/dateTo (the
  // backend answers 422 period_filter_conflict).
  deadlineFrom?: string;
  deadlineTo?: string;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
};

export async function listTasks(query: TaskQuery, signal?: AbortSignal): Promise<TaskPage> {
  const p = new URLSearchParams();
  if (query.status) p.set("status", query.status);
  if (query.assignee) p.set("assignee_user_id", query.assignee);
  if (query.q?.trim()) p.set("q", query.q.trim());
  if (query.dateFrom && query.dateTo) {
    p.set("date_from", query.dateFrom);
    p.set("date_to", query.dateTo);
    p.set("period_field", query.periodField ?? "deadline");
  } else {
    if (query.deadlineFrom) p.set("deadline_from", query.deadlineFrom);
    if (query.deadlineTo) p.set("deadline_to", query.deadlineTo);
  }
  if (query.includeDeleted) p.set("include_deleted", "true");
  p.set("limit", String(Math.min(100, Math.max(1, query.limit ?? 30))));
  p.set("offset", String(Math.max(0, query.offset ?? 0)));
  const d = asDict(await http(`/task-management?${p}`, { signal }));
  const items = asArr(d.items).map(normTask).filter((t) => t.id);
  return {
    items,
    total: asNum(d.total, items.length),
    limit: asNum(d.limit, items.length),
    offset: asNum(d.offset),
    hasMore: d.has_more === true,
    counts: countsOf(d.status_counts),
    periodApplied: (!!d.period && typeof d.period === "object") || typeof d.count_scope === "string",
  };
}

// The task list with a period. A backend with the period contract filters
// rows and status_counts by date_from/date_to/period_field in one request.
// One without it ignores those parameters and returns everything; it then
// gets the old deadline range, and since its status_counts ignore that
// range, the per-status totals are read with the same filters. Which one
// answers is learnt from the first period request and kept, so once the
// backend ships the contract this is a single request again.
let periodContract: "" | "new" | "legacy" = "";
const dayStartIso = (d: string) => new Date(`${d}T00:00:00`).toISOString();
const dayEndIso = (d: string) => new Date(`${d}T23:59:59.999`).toISOString();

export async function listTasksInPeriod(query: TaskQuery, signal?: AbortSignal): Promise<TaskPage> {
  if (!query.dateFrom || !query.dateTo || periodContract === "new") return listTasks(query, signal);
  if (periodContract === "") {
    const page = await listTasks(query, signal);
    if (page.periodApplied) {
      periodContract = "new";
      return page;
    }
    periodContract = "legacy";
  }
  // The legacy range only knows the deadline.
  const legacy: TaskQuery = { ...query, dateFrom: "", dateTo: "", periodField: undefined, deadlineFrom: dayStartIso(query.dateFrom), deadlineTo: dayEndIso(query.dateTo) };
  const [page, ...totals] = await Promise.all([listTasks(legacy, signal), ...TASK_STATUSES.map((st) => listTasks({ ...legacy, status: st, limit: 1, offset: 0 }, signal).then((p) => p.total))]);
  return { ...page, counts: Object.fromEntries(TASK_STATUSES.map((st, i) => [st, totals[i]])) as TaskCounts, legacyPeriod: true };
}

const enc = encodeURIComponent;

export async function getTask(id: string, signal?: AbortSignal): Promise<Task> {
  return normTask(await http(`/task-management/${enc(id)}`, { signal }));
}

// An attachment's bytes, with the user's token (preview_url / download_url).
export function getTaskAttachmentBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  return httpBlob(path, { signal });
}

export function downloadTaskAttachment(path: string): Promise<{ blob: Blob; name: string }> {
  return httpBlobNamed(path);
}

export async function getTaskHistory(id: string, signal?: AbortSignal): Promise<TaskHistoryItem[]> {
  const d = asDict(await http(`/task-management/${enc(id)}/history`, { signal }));
  return asArr(d.items).map(historyItemOf);
}

export type TaskUserOption = TaskPerson;

export async function searchTaskUsers(q: string, signal?: AbortSignal): Promise<TaskUserOption[]> {
  const p = new URLSearchParams({ limit: "50", offset: "0" });
  if (q.trim()) p.set("q", q.trim());
  const d = asDict(await http(`/task-management/users?${p}`, { signal }));
  return asArr(d.items)
    .map(personOf)
    .filter((u): u is TaskPerson => !!u && !!u.id);
}

export type TaskDraft = { title: string; description: string; deadlineAt: string; assigneeIds: string[] };

export async function createTask(draft: TaskDraft): Promise<Task> {
  const body = { title: draft.title.trim(), description: draft.description.trim(), deadline_at: draft.deadlineAt, assignee_user_ids: draft.assigneeIds };
  return normTask(await http("/task-management", { method: "POST", body: JSON.stringify(body) }));
}

// POST /task-management/{id}/attachments: several files in one multipart
// call, guarded by the task's lock version like every other change. The
// response shape is not documented, so the task is read back afterwards for
// its new lock version and attachment count.
export async function uploadTaskAttachments(task: Pick<Task, "id" | "lockVersion">, files: File[], note = ""): Promise<Task> {
  const form = new FormData();
  for (const f of files) form.append("files", f, f.name);
  if (note.trim()) form.append("note", note.trim());
  form.append("expected_lock_version", String(task.lockVersion));
  await http(`/task-management/${encodeURIComponent(task.id)}/attachments`, { method: "POST", body: form });
  return getTask(task.id);
}

export type TaskEdit = { title?: string; description?: string; deadlineAt?: string };

export async function updateTask(task: Pick<Task, "id" | "lockVersion">, edit: TaskEdit): Promise<Task> {
  const body: Dict = { expected_lock_version: task.lockVersion };
  if (edit.title !== undefined) body.title = edit.title.trim();
  if (edit.description !== undefined) body.description = edit.description.trim();
  if (edit.deadlineAt !== undefined) body.deadline_at = edit.deadlineAt;
  return normTask(await http(`/task-management/${enc(task.id)}`, { method: "PATCH", body: JSON.stringify(body) }));
}

export async function setTaskAssignees(task: Pick<Task, "id" | "lockVersion">, userIds: string[]): Promise<Task> {
  return normTask(await http(`/task-management/${enc(task.id)}/assignees`, { method: "PUT", body: JSON.stringify({ user_ids: userIds, expected_lock_version: task.lockVersion }) }));
}

export async function changeTaskStatus(task: Pick<Task, "id" | "lockVersion">, status: TaskStatus, comment = ""): Promise<Task> {
  return normTask(await http(`/task-management/${enc(task.id)}/status`, { method: "POST", body: JSON.stringify({ status, comment: comment.trim(), expected_lock_version: task.lockVersion }) }));
}

export async function deleteTask(task: Pick<Task, "id" | "lockVersion">, reason: string): Promise<void> {
  await http(`/task-management/${enc(task.id)}`, { method: "DELETE", body: JSON.stringify({ reason: reason.trim(), expected_lock_version: task.lockVersion }) });
}

export const isReturn = (from: TaskStatus, to: TaskStatus) => from === "testing" && to === "in_progress";

// Ulugbek Omonov's task account works without the start / send-to-testing /
// ready steps (TSK-371625): those buttons are gone for it, the page refuses
// to send them, and its final action approves and archives the task (the
// archive is the soft delete, with the closing note as its reason). Only a
// return keeps its button. Everyone else sees the full flow; the backend's
// permissions are unchanged.
const SIMPLE_FLOW_USERS = new Set(["dc68625e-b472-46ab-bd19-96cfa57591e1"]);
export const usesSimpleTaskFlow = (userId: string | undefined) => !!userId && SIMPLE_FLOW_USERS.has(userId);
export const simpleFlowAllows = (from: TaskStatus, to: TaskStatus) => isReturn(from, to);
export function simpleFlowView(task: Task): Task {
  return { ...task, actions: { ...task.actions, nextStatuses: task.actions.nextStatuses.filter((to) => simpleFlowAllows(task.status, to)) } };
}

export type TaskErrorKind = "conflict" | "forbidden" | "missing" | "invalid" | "unavailable" | "auth" | "network" | "other";
export type TaskError = { kind: TaskErrorKind; code: string; message: string; fields: Record<string, string> };

export function taskErrorOf(e: unknown): TaskError {
  if (!(e instanceof ApiError)) return { kind: "network", code: "", message: "", fields: {} };
  const detail = asDict(e.data.detail);
  const code = e.code || asStr(detail.code);
  const message = asStr(detail.message) || errDetail(e);
  const kind: TaskErrorKind =
    e.status === 0 ? "network" : e.status === 401 ? "auth" : e.status === 403 ? "forbidden" : e.status === 404 ? "missing" : e.status === 409 ? "conflict" : e.status === 422 ? "invalid" : e.status === 503 ? "unavailable" : "other";
  return { kind, code, message, fields: e.fieldErrors };
}

export const TASK_EVENT_PREFIX = "tasks.";

export type TaskStats = {
  created: number;
  readyInPeriod: number;
  total: number;
  active: number;
  readyTotal: number;
  overdue: number;
  unassigned: number;
  byStatus: TaskCounts;
  labels: Partial<Record<TaskStatus, string>>;
};

export async function getTaskStats(query: { dateFrom?: string; dateTo?: string; assignee?: string } = {}, signal?: AbortSignal): Promise<TaskStats> {
  const p = new URLSearchParams();
  if (query.dateFrom && query.dateTo) {
    p.set("date_from", query.dateFrom);
    p.set("date_to", query.dateTo);
  }
  if (query.assignee) p.set("assignee_user_id", query.assignee);
  const qs = p.toString();
  const d = asDict(await http(qs ? `/task-management/stats?${qs}` : "/task-management/stats", { signal }));
  const pt = asDict(d.period_tasks);
  const cs = asDict(d.current_snapshot);
  const l = asDict(d.status_labels);
  return {
    created: asNum(pt.total_created),
    readyInPeriod: asNum(pt.ready_in_period),
    total: asNum(cs.total),
    active: asNum(cs.active_total),
    readyTotal: asNum(cs.ready_total),
    overdue: asNum(cs.overdue_total),
    unassigned: asNum(cs.unassigned_total),
    byStatus: countsOf(cs.by_status),
    labels: Object.fromEntries(TASK_STATUSES.map((s) => [s, asStr(l[s])]).filter(([, v]) => v)),
  };
}
