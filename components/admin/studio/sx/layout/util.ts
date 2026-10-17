const SCROLLS = /^(auto|scroll|overlay)$/;

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function scrollParent(el: Element | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node && node !== document.body && node !== document.documentElement) {
    if (SCROLLS.test(getComputedStyle(node).overflowY)) return node;
    node = node.parentElement;
  }
  return null;
}

export function domId(...parts: (string | number)[]): string {
  return parts
    .map((p) => String(p).trim().replace(/\s+/g, "-"))
    .filter(Boolean)
    .join("-");
}
