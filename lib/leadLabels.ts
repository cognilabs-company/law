import { humanizeSlug } from "@/lib/lawyers";

type T = { has: (key: string) => boolean; (key: string): string };

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
