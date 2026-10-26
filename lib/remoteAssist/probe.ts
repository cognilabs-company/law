import { raCollect, raSafeRoute } from "./registry";

// What sits at a point of the client's page, for the operator's "click" on
// the live picture (remote assistance v2). Only two answers ever leave the
// page: a LexGo route the registry allows (a link), or the id of a
// registered, non-secret component. Nothing is clicked here — the operator's
// console turns the answer into a normal, audited command.

export type RaProbeAnswer = { route?: string; componentId?: string; label?: string };

const labelOf = (el: Element): string => (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);

export function raProbeAt(x: number, y: number): RaProbeAnswer {
  if (typeof document === "undefined") return {};
  const px = Math.round(x * window.innerWidth);
  const py = Math.round(y * window.innerHeight);
  // Our own bar, marks and sheets are not the page.
  const el = document.elementsFromPoint(px, py).find((e) => !e.closest("[data-ra-ignore]"));
  if (!el) return {};
  const a = el.closest("a[href]");
  if (a instanceof HTMLAnchorElement) {
    try {
      const url = new URL(a.href, window.location.href);
      const route = url.origin === window.location.origin ? raSafeRoute(url.pathname + url.search) : "";
      if (route) return { route, label: labelOf(a) };
    } catch {
      /* not a URL */
    }
  }
  const live = raCollect();
  const hit = live.find((l) => l.el === el || l.el.contains(el));
  // The innermost registered component under the point.
  const inner = live.filter((l) => l.el.contains(el)).sort((p, q) => (p.el.contains(q.el) ? 1 : q.el.contains(p.el) ? -1 : 0))[0] ?? hit;
  return inner ? { componentId: inner.def.componentId, label: inner.def.label || labelOf(inner.el) } : {};
}
