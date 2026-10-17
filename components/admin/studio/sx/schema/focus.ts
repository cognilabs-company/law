import { normPath } from "@/lib/studioSchema";
import { prefersReducedMotion } from "../hooks";

const FOCUSABLE = 'input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),select:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])';

function cssEscape(v: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(v);
  return v.replace(/["\\]/g, "\\$&");
}

function expandRows(el: Element, form: Element): void {
  const closed: HTMLElement[] = [];
  let cur: Element | null = el.parentElement;
  while (cur && cur !== form) {
    if (cur instanceof HTMLElement && cur.hidden && cur.id) closed.unshift(cur);
    cur = cur.parentElement;
  }
  for (const body of closed) {
    const toggle = form.querySelector<HTMLElement>(`[aria-controls="${cssEscape(body.id)}"]`);
    if (toggle && body.hidden) toggle.click();
  }
}

function findTarget(form: Element, path: string): Element | null {
  const norm = path === "$title" ? path : normPath(path);
  const exact = form.querySelector(`[data-path="${cssEscape(norm)}"]`);
  if (exact) return exact;
  const parts = norm.split(".");
  while (parts.length > 1) {
    parts.pop();
    const near = form.querySelector(`[data-path="${cssEscape(parts.join("."))}"]`);
    if (near) return near;
  }
  return null;
}

export function focusFieldPath(idPrefix: string, path: string): boolean {
  if (typeof document === "undefined") return false;
  const form = document.getElementById(`${idPrefix}-form`);
  if (!form) return false;
  const el = findTarget(form, path);
  if (!el) return false;
  expandRows(el, form);
  const run = () => {
    const control = el.matches(FOCUSABLE) ? (el as HTMLElement) : el.querySelector<HTMLElement>(FOCUSABLE);
    el.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    control?.focus({ preventScroll: true });
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
  else run();
  return true;
}
