import type { CategoryKind } from "../ctor/services";

// A new category's kind travels in the editor URL: kind=root, or kind=sub
// with its parent. A parent alone (the tree's "add subcategory") means sub.
export function categoryKindOf(raw: string, parent: string): CategoryKind | undefined {
  if (raw === "root") return "root";
  if (raw === "sub" || parent.trim()) return "sub";
  return undefined;
}

// The editor link for the chosen kind, on top of the plain "new K01" link
// (which may carry a form context).
export function categoryKindHref(base: string, kind: CategoryKind, parent: string): string {
  const join = base.includes("?") ? "&" : "?";
  return kind === "root" ? `${base}${join}kind=root` : `${base}${join}kind=sub&parent=${encodeURIComponent(parent)}`;
}
