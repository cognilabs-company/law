import { STATUS_ICON } from "./icons";
import type { SxRecordSource, SxStage, SxStatusInfo, SxStatusKey, SxTone } from "./types";

export const SX_STAGES: readonly SxStage[] = ["draft", "submitted", "in_review", "approved", "published"];

type KeyShape = { stage: number; branch: SxStatusInfo["branch"]; tone: SxTone; live: boolean };

const SHAPE: Readonly<Record<SxStatusKey, KeyShape>> = {
  draft: { stage: 0, branch: null, tone: "draft", live: false },
  submitted: { stage: 1, branch: null, tone: "submitted", live: false },
  in_review: { stage: 2, branch: null, tone: "review", live: false },
  returned: { stage: 2, branch: "returned", tone: "returned", live: false },
  rejected: { stage: 2, branch: "rejected", tone: "returned", live: false },
  approved: { stage: 3, branch: null, tone: "approved", live: false },
  scheduled: { stage: 3, branch: null, tone: "approved", live: false },
  published: { stage: 4, branch: null, tone: "published", live: true },
  active: { stage: 4, branch: null, tone: "published", live: true },
  archived: { stage: -1, branch: null, tone: "archived", live: false },
  superseded: { stage: -1, branch: null, tone: "archived", live: false },
  inactive: { stage: -1, branch: null, tone: "draft", live: false },
  paused: { stage: -1, branch: null, tone: "draft", live: false },
  deleted: { stage: -1, branch: null, tone: "archived", live: false },
  expired: { stage: -1, branch: null, tone: "archived", live: false },
  failed: { stage: -1, branch: null, tone: "returned", live: false },
  unknown: { stage: -1, branch: null, tone: "draft", live: false },
};

const STUDIO_WORDS: Readonly<Record<string, SxStatusKey>> = {
  draft: "draft",
  new: "draft",
  submitted: "submitted",
  pending: "submitted",
  sent: "submitted",
  waiting: "submitted",
  in_review: "in_review",
  review: "in_review",
  reviewing: "in_review",
  under_review: "in_review",
  in_progress: "in_review",
  changes_requested: "returned",
  needs_changes: "returned",
  returned: "returned",
  rework: "returned",
  request_changes: "returned",
  rejected: "rejected",
  reject: "rejected",
  declined: "rejected",
  approved: "approved",
  approve: "approved",
  scheduled: "scheduled",
  published: "published",
  live: "published",
  active: "active",
  enabled: "active",
  archived: "archived",
  superseded: "superseded",
  replaced: "superseded",
  inactive: "inactive",
  disabled: "inactive",
  hidden: "inactive",
  paused: "paused",
  deleted: "deleted",
  removed: "deleted",
  expired: "expired",
  failed: "failed",
  error: "failed",
};

const RUNTIME_WORDS: Readonly<Record<string, SxStatusKey>> = {
  active: "active",
  enabled: "active",
  published: "published",
  live: "published",
  inactive: "inactive",
  disabled: "inactive",
  hidden: "inactive",
  archived: "archived",
  deleted: "deleted",
  removed: "deleted",
  draft: "draft",
  expired: "expired",
  paused: "paused",
};

const has = Object.prototype.hasOwnProperty;

export function normStatus(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function statusKeyOf(raw: string | null | undefined, source: SxRecordSource = "studio"): SxStatusKey {
  const words = source === "runtime" ? RUNTIME_WORDS : STUDIO_WORDS;
  const norm = normStatus(raw);
  return norm && has.call(words, norm) ? words[norm] : "unknown";
}

export function sxStatus(raw: string | null | undefined, source: SxRecordSource = "studio"): SxStatusInfo {
  const key = statusKeyOf(raw, source);
  const shape = SHAPE[key];
  const known = key !== "unknown";
  return {
    key,
    raw: String(raw ?? "").trim(),
    stage: shape.stage,
    branch: shape.branch,
    tone: shape.tone,
    icon: STATUS_ICON[key],
    live: shape.live,
    labelKey: known ? `sx.status.${key}.label` : "",
    hintKey: known ? `sx.status.${key}.hint` : "",
  };
}

export function stageOnLine(info: SxStatusInfo, direct: boolean): number {
  if (!direct) return info.stage;
  return info.stage === 4 ? 1 : info.stage >= 0 ? 0 : -1;
}

export function stageKey(index: number, direct: boolean): SxStage {
  if (direct) return index === 1 ? "published" : "draft";
  const i = Math.min(SX_STAGES.length - 1, Math.max(0, Math.trunc(index) || 0));
  return SX_STAGES[i];
}

export function stageCount(direct: boolean): number {
  return direct ? 2 : SX_STAGES.length;
}
