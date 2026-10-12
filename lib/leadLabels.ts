import { humanizeSlug } from "@/lib/lawyers";
import { operatorName } from "@/lib/services/users";

type T = { has: (key: string) => boolean; (key: string): string };

export const LOST_REASONS = ["price", "solved_self", "competitor", "no_answer", "no_service", "spam"] as const;

const LOST_KEYS: ReadonlySet<string> = new Set(["lost", "rejected"]);

export const isLostKey = (key: string): boolean => LOST_KEYS.has(key);

export function isLostStage(key: string, columns?: readonly { key: string; isLost?: boolean }[]): boolean {
  return columns?.find((c) => c.key === key)?.isLost === true || isLostKey(key);
}

const STAGE_ICONS: Readonly<Record<string, string>> = {
  new: "/img/yangi.png",
  contacted: "/img/boglanildi.png",
  qualified: "/img/malakali.png",
  proposal: "/img/taklif.png",
  won: "/img/yutildi.png",
  lost: "/img/yoqotildi.png",
  duplicate: "/img/dublikat.png",
};

export function leadStageIcon(key: string): string | null {
  return STAGE_ICONS[String(key || "").trim().toLowerCase()] ?? null;
}

export type PersonLike = { name: string; phone: string; lexgoId?: string };

export const personLabel = (p: PersonLike | undefined): string => (p ? operatorName(p) : "");

// Lead category ("family", "court", "housing") → label; unknown keys humanized.
export function leadCategoryLabel(t: T, category: string): string {
  if (!category) return "";
  return t.has(`categories.${category}`) ? t(`categories.${category}`) : humanizeSlug(category);
}

// Lead source ("web", "ai_classify", "telegram") → label; unknown keys humanized.
export function leadSourceLabel(t: T, source: string): string {
  if (!source) return "";
  return t.has(`source.${source}`) ? t(`source.${source}`) : humanizeSlug(source);
}

// Kanban column title: a column still carrying the backend's default English
// title ("New" for key "new") gets the translated stage name; a title an admin
// renamed stays as written.
export function kanbanColumnTitle(tStages: T, col: { key: string; title: string }): string {
  const plain = (col.title || "").trim().toLowerCase();
  const isDefault = !plain || plain === col.key.replace(/_/g, " ").toLowerCase();
  if (isDefault && tStages.has(`stages.${col.key}`)) return tStages(`stages.${col.key}`);
  return col.title || humanizeSlug(col.key);
}

// Region value ("tashkent") → enums.regions name; free-text regions stay as typed.
export function leadRegionLabel(te: T, region: string): string {
  if (!region) return "";
  const k = region.trim().toLowerCase();
  return te.has(`regions.${k}`) ? te(`regions.${k}`) : region;
}

// Backend score ("hot" | "warm" | "cold") → admin.pipeline.score.* label.
export function leadScoreLabel(t: T, score: string): string {
  if (!score) return "";
  return t.has(`score.${score}`) ? t(`score.${score}`) : humanizeSlug(score);
}

// Urgency ("urgent", "normal", …) → admin.pipeline.urgency.* label.
export function leadUrgencyLabel(t: T, urgency: string): string {
  if (!urgency) return "";
  const k = urgency.trim().toLowerCase();
  return t.has(`urgency.${k}`) ? t(`urgency.${k}`) : humanizeSlug(urgency);
}

// Assignee chip text: "you" for the signed-in user, the operator's name from
// the directory, or a plain "operator" when the directory isn't readable.
export function assigneeLabel(t: T, people: ReadonlyMap<string, PersonLike>, userId: string, meId: string, ready = true): string {
  if (!userId) return t("assign.none");
  if (meId && userId === meId) return t("assign.me");
  return personLabel(people.get(userId)) || (ready ? t("assign.unknown") : t("assign.title"));
}
