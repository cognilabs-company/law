import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { categoryName } from "@/lib/categoryNames";
import { ApiError, asDict, asStr } from "@/lib/http";
import { getServiceCategories, type BackendCategory } from "@/lib/services/backend";
import {
  closeExperienceRoom,
  getExperienceForReview,
  openExperienceRoom,
  type CheckItem,
  type DiffRow,
  type ExperienceEvidence,
  type ExperienceQueueItem,
  type ExperienceReviewEntry,
  type HistoryRow,
  type ReviewRoom,
  type ReviewSeller,
} from "@/lib/services/experience";
import { closeAchievementRoom, getAchievementForReview, openAchievementRoom, type AchievementQueueItem, type AiRisk } from "@/lib/services/achievements";
import { closeLicenseRoom, getLicenseForReview, openLicenseRoom, type LicenseRecord, type Mismatch, type Practice } from "@/lib/services/advocatePractice";

export type VerifyKind = "experience" | "achievement" | "license";
export type VerifyItem = ExperienceQueueItem | AchievementQueueItem | LicenseRecord;

export type VerifyDetail = {
  pending: boolean;
  blocked: boolean;
  isRevision: boolean;
  evidence: ExperienceEvidence[];
  diff: DiffRow[];
  checks: CheckItem[];
  reviews: ExperienceReviewEntry[];
  room: ReviewRoom | null;
  seller: ReviewSeller | null;
  history: HistoryRow[];
  changedFields: string[];
  exp: ExperienceQueueItem | null;
  ach: AchievementQueueItem | null;
  lic: LicenseRecord | null;
  ai: AiRisk | null;
  advisory: boolean;
  mismatches: Mismatch[];
  practice: Practice | null;
  sellerUserId: string;
};

export const REASON_MIN = 10;

export const kindOfQueue = (queue: string): VerifyKind => (queue === "achievements" ? "achievement" : queue === "licenses" ? "license" : "experience");

export async function loadVerifyDetail(kind: VerifyKind, id: string, signal: AbortSignal): Promise<VerifyDetail> {
  if (kind === "experience") {
    const d = await getExperienceForReview(id, signal);
    const it = d.record;
    return {
      pending: it?.status === "pending_review",
      blocked: false,
      isRevision: !!d.previous,
      evidence: it?.evidence ?? [],
      diff: d.diff,
      checks: d.checks,
      reviews: d.reviews,
      room: d.room,
      seller: d.seller,
      history: d.history,
      changedFields: d.changedFields,
      exp: it,
      ach: null,
      lic: null,
      ai: null,
      advisory: false,
      mismatches: [],
      practice: null,
      sellerUserId: it?.sellerUserId || d.seller?.id || "",
    };
  }
  if (kind === "achievement") {
    const d = await getAchievementForReview(id, signal);
    const it = d.record;
    return {
      pending: it?.status === "pending_review" || it?.status === "ai_analysis_pending",
      blocked: it?.status === "ai_analysis_pending" || d.ai?.status === "running",
      isRevision: !!d.previous,
      evidence: it?.evidence ?? [],
      diff: d.diff,
      checks: d.checks,
      reviews: d.reviews,
      room: d.room,
      seller: d.seller,
      history: d.history,
      changedFields: [],
      exp: null,
      ach: it,
      lic: null,
      ai: d.ai,
      advisory: d.advisoryOnly,
      mismatches: [],
      practice: null,
      sellerUserId: it?.sellerUserId || d.seller?.id || "",
    };
  }
  const d = await getLicenseForReview(id, signal);
  return {
    pending: d.record?.status === "pending_review",
    blocked: d.ai?.status === "running",
    isRevision: d.isRevision,
    evidence: d.evidence,
    diff: d.diff,
    checks: d.checks,
    reviews: d.reviews,
    room: d.room,
    seller: d.seller,
    history: d.history,
    changedFields: [],
    exp: null,
    ach: null,
    lic: d.record,
    ai: d.ai,
    advisory: d.advisoryOnly,
    mismatches: d.mismatches,
    practice: d.practice,
    sellerUserId: d.record?.sellerUserId || d.practice?.sellerUserId || d.seller?.id || "",
  };
}

export function openReviewRoom(kind: VerifyKind, id: string): Promise<ReviewRoom> {
  if (kind === "achievement") return openAchievementRoom(id);
  if (kind === "license") return openLicenseRoom(id);
  return openExperienceRoom(id);
}

export function closeReviewRoom(kind: VerifyKind, id: string, room: ReviewRoom): Promise<ReviewRoom> {
  if (kind === "achievement") return closeAchievementRoom(id, room);
  if (kind === "license") return closeLicenseRoom(id, room);
  return closeExperienceRoom(id, room);
}

export type ErrSpot = "checklist" | "reason" | "public" | "blocked" | "reviewed" | "";

export function errSpotOf(code: string): ErrSpot {
  if (/checklist_incomplete$/.test(code)) return "checklist";
  if (/reason_required$/.test(code)) return "reason";
  if (/public_description_(required|contains_pii)$/.test(code)) return "public";
  if (/ai_analysis_pending$/.test(code)) return "blocked";
  if (/already_reviewed$/.test(code)) return "reviewed";
  return "";
}

export const errCodeOf = (e: unknown): string => (e instanceof ApiError ? asStr(asDict(e.data.detail).code) || e.code || "" : "");

const KB = 1024;
export const fmtSize = (b: number | null): string => (!b ? "" : b < KB ? `${b} B` : b < KB * KB ? `${Math.round(b / KB)} KB` : `${(b / (KB * KB)).toFixed(1)} MB`);

export function useCategoryName(on: boolean): (id: string) => string {
  const locale = useLocale();
  const [cats, setCats] = useState<BackendCategory[]>([]);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    void getServiceCategories().then(
      (c) => {
        if (alive) setCats(c);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [on]);
  return (id: string) => {
    const c = cats.find((x) => x.id === id);
    return c ? categoryName({ slug: c.slug, title: c.name }, locale) : "";
  };
}
