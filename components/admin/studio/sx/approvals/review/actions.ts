import { studioErrorOf, type StudioConstructor, type StudioDecision, type StudioDetail } from "@/lib/services/studio";
import type { SxStageKey } from "../../stage/stage";
import { canDecideOf, canPublishOf, isAuthorOf, type ApprViewer } from "../model";

export type ReviewKind = "approve" | "return" | "reject" | "publish";
export type ReviewCan = { approve: boolean; back: boolean; reject: boolean; publish: boolean; fix: boolean; comment: boolean; exportVersions: boolean };

export const NO_REVIEW: ReviewCan = Object.freeze({ approve: false, back: false, reject: false, publish: false, fix: false, comment: false, exportVersions: false });

export function reviewCan(d: StudioDetail | null, v: ApprViewer, ctor: StudioConstructor | null): ReviewCan {
  if (!d) return NO_REVIEW;
  const decide = canDecideOf(d, v);
  return {
    approve: decide,
    back: decide,
    reject: decide,
    publish: canPublishOf(d, v, ctor),
    fix: d.status === "changes_requested" && v.access.canEdit && isAuthorOf(d, v.id),
    comment: v.access.any && d.status !== "archived",
    exportVersions: v.access.isAdmin || v.access.canPublish,
  };
}

export function allowedBy(can: ReviewCan, kind: ReviewKind): boolean {
  if (kind === "approve") return can.approve;
  if (kind === "return") return can.back;
  if (kind === "reject") return can.reject;
  return can.publish;
}

export function decisionOf(kind: Exclude<ReviewKind, "publish">): StudioDecision {
  if (kind === "return") return "changes_requested";
  if (kind === "reject") return "reject";
  return "approve";
}

export function needsComment(kind: ReviewKind): boolean {
  return kind === "return" || kind === "reject";
}

export type ActionError = { key: string; field: "comment" | null; stale: boolean; code: string };

const NOT_YOURS: ReadonlySet<string> = new Set(["studio_step_not_assigned", "studio_not_approver", "studio_approval_forbidden", "studio_approval_step_forbidden", "studio_cannot_decide"]);
const STALE_CODES: ReadonlySet<string> = new Set(["studio_approval_duplicate_decision", "studio_approval_step_not_pending", "studio_approval_step_missing", "studio_approval_step_not_found"]);
const COMMENT_FIELDS = ["comment", "note", "reason"];

function hasCommentError(fieldErrors: Record<string, string>): boolean {
  return Object.keys(fieldErrors).some((k) => {
    const leaf = k.split(".").pop() ?? k;
    return COMMENT_FIELDS.includes(leaf);
  });
}

export function actionErrorOf(e: unknown): ActionError {
  const se = studioErrorOf(e);
  const code = se.code;
  const lc = code.toLowerCase();
  const out = (key: string, field: "comment" | null, stale: boolean): ActionError => ({ key, field, stale, code });
  if (hasCommentError(se.fieldErrors)) return out("sx.appr.err.comment", "comment", false);
  if (lc === "studio_publish_requires_approved") return out("sx.editor.err.publishRequiresApproved", null, true);
  if (lc === "studio_publish_failed") return out("sx.editor.alert.publishFailText", null, true);
  if (lc === "studio_object_archived") return out("sx.ap3.err.archived", null, true);
  if (lc === "studio_version_locked") return out("sx.ap3.err.locked", null, true);
  if (lc.includes("self_approval")) return out("sx.appr.err.self", null, true);
  if (NOT_YOURS.has(lc)) return out("sx.appr.err.notYours", null, true);
  if (STALE_CODES.has(lc)) return out("sx.appr.err.changed", null, true);
  if (lc.includes("comment_required")) return out("sx.appr.err.comment", "comment", false);
  switch (se.kind) {
    case "edit_conflict":
    case "conflict":
      return out("sx.appr.err.changed", null, true);
    case "forbidden":
      return out("sx.editor.err.forbidden", null, true);
    case "not_found":
      return out("sx.editor.err.notFound", null, true);
    case "network":
      return out("sx.editor.err.network", null, false);
    case "validation":
    case "payload_invalid":
    case "submit_invalid":
      return out("sx.editor.err.validation", null, false);
    default:
      return out("sx.editor.err.other", null, false);
  }
}

export function toastKeyOf(kind: ReviewKind, statusAfter: string): string {
  if (kind === "approve") return statusAfter === "published" ? "sx.appr.toast.approvedLive" : "sx.appr.toast.approved";
  if (kind === "return") return "sx.appr.toast.returned";
  if (kind === "reject") return "sx.appr.toast.rejected";
  return "sx.editor.toast.published";
}

export function stageAfter(kind: ReviewKind, statusAfter: string): SxStageKey {
  if (kind === "publish") return "published";
  if (kind === "return") return "returned";
  if (kind === "reject") return "rejected";
  return statusAfter === "published" ? "published" : "approved";
}

export function publishFailKey(code: string): string {
  const lc = code.trim().toLowerCase();
  if (!lc) return "";
  if (lc === "studio_publish_requires_approved") return "sx.editor.err.publishRequiresApproved";
  if (lc === "studio_publish_failed") return "sx.editor.alert.publishFailText";
  if (lc === "studio_object_archived") return "sx.ap3.err.archived";
  if (lc === "studio_version_locked") return "sx.ap3.err.locked";
  if (lc === "studio_object_not_found" || lc === "not_found") return "sx.editor.err.notFound";
  if (lc === "studio_edit_conflict" || lc.includes("conflict")) return "sx.appr.err.changed";
  if (NOT_YOURS.has(lc) || lc.includes("forbidden") || lc.includes("permission")) return "sx.editor.err.forbidden";
  return "";
}
