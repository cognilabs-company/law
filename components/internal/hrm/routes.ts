import { hrmRoute } from "./text";

export const domainHref = (domain: string, type = "", open = "") => {
  const base = hrmRoute(domain);
  const q = new URLSearchParams();
  if (type) q.set("type", type);
  if (open) q.set("open", open);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
};

// The statuses a record waits in for someone's decision or action.
export const WAITING = ["pending", "review", "returned", "submitted", "in_review"];
