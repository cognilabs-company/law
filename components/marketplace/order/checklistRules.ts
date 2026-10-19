import type { MarketPhase } from "@/lib/services/marketplace";
import type { ChecklistItem, ChecklistProgress, ChecklistStatus, OrderChecklist } from "@/lib/services/marketRuntime";
import type { OrderView } from "./types";
import type { UploadedFile } from "./upload";

export type ItemDraft = { status: ChecklistStatus; comment: string; files: UploadedFile[] };
export type ItemProblem = "reason" | "comment" | "file" | "skip";

export function draftOf(item: ChecklistItem): ItemDraft {
  return {
    status: item.status,
    comment: item.comment,
    files: item.files.map((f) => ({ id: f.id, name: f.name, url: f.url })),
  };
}

export function itemProblems(item: ChecklistItem, draft: ItemDraft): ItemProblem[] {
  const out: ItemProblem[] = [];
  const said = draft.comment.trim().length > 0;
  if (draft.status === "skipped_with_reason" && !said) out.push("reason");
  if (draft.status === "skipped_with_reason" && !item.skipAllowed && item.status !== "skipped_with_reason") out.push("skip");
  if (draft.status === "done") {
    if (item.commentRequired && !said) out.push("comment");
    if (item.fileRequired && !draft.files.length) out.push("file");
  }
  return out;
}

export function checklistBlockers(c: OrderChecklist | null): ChecklistItem[] {
  if (!c) return [];
  return c.items.filter((i) => i.required && (i.status === "pending" || (i.status === "skipped_with_reason" && !i.skipAllowed)));
}

function has(raw: Record<string, unknown>, ...keys: string[]): boolean {
  return keys.some((k) => Object.prototype.hasOwnProperty.call(raw, k));
}

function mergedItem(old: ChecklistItem, next: ChecklistItem): ChecklistItem {
  const raw = next.raw ?? {};
  return {
    ...next,
    title: next.title || old.title,
    description: has(raw, "description", "hint") ? next.description : old.description,
    required: has(raw, "required", "is_required") ? next.required : old.required,
    commentRequired: has(raw, "comment_required") ? next.commentRequired : old.commentRequired,
    fileRequired: has(raw, "file_required") ? next.fileRequired : old.fileRequired,
    skipAllowed: has(raw, "skip_allowed", "can_skip", "allow_skip", "skippable", "required", "is_required") ? next.skipAllowed : old.skipAllowed,
    key: next.key || old.key,
    comment: has(raw, "comment", "reason", "note") ? next.comment : old.comment,
    files: has(raw, "files", "attachments") ? next.files : old.files,
    sortOrder: has(raw, "sort_order", "position") ? next.sortOrder : old.sortOrder,
    updatedAt: next.updatedAt || old.updatedAt,
  };
}

export function progressOfItems(items: readonly ChecklistItem[]): ChecklistProgress {
  const settled = items.filter((i) => i.status !== "pending");
  const required = items.filter((i) => i.required);
  return {
    done: settled.length,
    total: items.length,
    requiredDone: required.filter((i) => i.status !== "pending").length,
    requiredTotal: required.length,
    percent: items.length ? Math.round((settled.length / items.length) * 100) : 0,
  };
}

export function sortedItems(items: readonly ChecklistItem[]): ChecklistItem[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => a.item.sortOrder - b.item.sortOrder || a.i - b.i)
    .map((x) => x.item);
}

export function mergeChecklistItem(c: OrderChecklist, item: ChecklistItem): OrderChecklist {
  const at = c.items.findIndex((x) => x.id === item.id);
  const list = at >= 0 ? c.items.map((x, i) => (i === at ? mergedItem(x, item) : x)) : [...c.items, item];
  const items = sortedItems(list);
  return { ...c, items, progress: progressOfItems(items) };
}

export function canEditChecklist(view: OrderView, phase: MarketPhase): boolean {
  return view === "seller" && phase === "in_progress";
}
