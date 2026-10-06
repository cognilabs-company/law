export const AI_DOMAINS = [
  "dashboard",
  "pricing",
  "documents",
  "marketplace",
  "urgent_advokat",
  "support",
  "profile",
  "payments",
  "advocate",
  "call_center",
  "organization",
  "admin",
  "services",
  "works",
] as const;

export type AiDomain = (typeof AI_DOMAINS)[number];

export type AiElementType =
  | "button"
  | "input"
  | "textarea"
  | "select"
  | "card"
  | "section"
  | "tab"
  | "modal"
  | "table"
  | "list"
  | "list_item"
  | "link"
  | "file_dropzone"
  | "editor"
  | "chat"
  | "call_button"
  | "rating"
  | "payment_gate";

const AI_ID_RE = /^[a-z][a-z0-9_-]*(\.[A-Za-z0-9][A-Za-z0-9_-]*)+$/;

export function isAiId(v: string): boolean {
  return !v.includes(":") && AI_ID_RE.test(v);
}

export function isLegacyTarget(v: string): boolean {
  return v.includes(":");
}

export function aiSeg(v: string | number | null | undefined): string {
  return String(v ?? "")
    .trim()
    .replace(/[\s.:/\\]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function aiId(base: string, ...parts: (string | number | null | undefined)[]): string {
  const tail = parts.map(aiSeg).filter(Boolean);
  return tail.length ? `${base}.${tail.join(".")}` : base;
}

export function aiDomainOf(id: string): string {
  return id.split(".")[0] ?? "";
}
