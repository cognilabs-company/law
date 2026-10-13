// Where each catalog module lives in the workspace: a module with a page of
// its own opens there, the rest in the generic module screen.
const OWN: Record<string, string> = {
  leave: "/internal/leave",
  travel: "/internal/travel",
  recruiting: "/internal/recruiting",
  onboarding: "/internal/onboarding",
  offboarding: "/internal/offboarding",
  movements: "/internal/movements",
  policies: "/internal/policies",
  lms: "/internal/learning",
  documents: "/internal/documents",
  skills: "/internal/skills",
};

export const domainHref = (domain: string, type = "", open = "") => {
  const base = OWN[domain] ?? `/internal/hrm/${encodeURIComponent(domain)}`;
  const q = new URLSearchParams();
  if (type) q.set("type", type);
  if (open) q.set("open", open);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
};

// The statuses a record waits in for someone's decision or action.
export const WAITING = ["pending", "review", "returned", "submitted", "in_review"];
