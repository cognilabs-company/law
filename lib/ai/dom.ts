export const cssEsc = (v: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(v) : v.replace(/["\\]/g, "\\$&"));

export const OVERLAY = ".ains,.gcap,.gscrim,.gring,[data-ai-ignore]";

export function isShown(el: Element): boolean {
  if (!el.isConnected || !el.getClientRects().length) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = window.getComputedStyle(el);
  return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.02;
}

export function openModalRoot(): Element | null {
  if (typeof document === "undefined") return null;
  const all = Array.from(document.querySelectorAll(".amodal, [role=dialog][aria-modal=true], dialog[open]")).filter((el) => !el.closest(OVERLAY));
  return all.length ? all[all.length - 1] : null;
}

export function intersectsViewport(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
}

export function pickBest<T extends Element>(all: T[]): T | null {
  if (!all.length) return null;
  const modal = openModalRoot();
  if (modal) {
    const inside = all.find((el) => modal.contains(el));
    if (inside) return inside;
  }
  return all.find(intersectsViewport) ?? all[0];
}

export function modalAiId(root: Element | null): string {
  if (!root) return "";
  const own = root.getAttribute("data-ai-id");
  if (own) return own;
  const typed = root.querySelector('[data-ai-type="modal"][data-ai-id]');
  return typed?.getAttribute("data-ai-id") || "";
}

export function domQuiet(maxMs: number, quietMs = 300, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve();
    let quiet = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      obs.disconnect();
      window.clearTimeout(quiet);
      window.clearTimeout(cap);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const bump = () => {
      window.clearTimeout(quiet);
      quiet = window.setTimeout(finish, quietMs);
    };
    const obs = new MutationObserver(bump);
    obs.observe(document.body, { childList: true, subtree: true });
    const cap = window.setTimeout(finish, maxMs);
    signal?.addEventListener("abort", finish);
    bump();
  });
}

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const id = window.setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(id);
      resolve();
    });
  });
