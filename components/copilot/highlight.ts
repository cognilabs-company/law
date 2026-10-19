import { isShown } from "@/lib/ai/dom";
import { settle, waitForTarget } from "@/lib/guide/targets";

const RING_MS = 1900;
const PAD = 6;
let seq = 0;

function byId(target: string): HTMLElement | null {
  if (!/^[A-Za-z][\w:.-]*$/.test(target)) return null;
  const el = document.getElementById(target);
  return el && isShown(el) ? el : null;
}

function ring(el: HTMLElement, z: number, style: string, onEnd: () => void): void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const box = document.createElement("div");
  box.className = `cpl-ring${reduce ? " cpl-ring--still" : ""}${style && style !== "red_pulse" ? " cpl-ring--soft" : ""}`;
  box.setAttribute("aria-hidden", "true");
  box.setAttribute("data-ai-ignore", "");
  box.style.zIndex = String(z);
  document.body.appendChild(box);
  const radius = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 10;
  box.style.borderRadius = `${Math.min(radius + PAD, 28)}px`;
  const t0 = performance.now();
  const place = () => {
    const r = el.getBoundingClientRect();
    box.style.transform = `translate(${Math.round(r.left - PAD)}px, ${Math.round(r.top - PAD)}px)`;
    box.style.width = `${Math.round(r.width + PAD * 2)}px`;
    box.style.height = `${Math.round(r.height + PAD * 2)}px`;
    if (performance.now() - t0 < RING_MS && el.isConnected) window.requestAnimationFrame(place);
    else {
      box.remove();
      onEnd();
    }
  };
  place();
}

function covers(panel: HTMLElement | null | undefined, el: HTMLElement): boolean {
  if (!panel || !panel.isConnected) return false;
  const a = panel.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return r.left < a.right && r.right > a.left && r.top < a.bottom && r.bottom > a.top;
}

export async function flashTarget(target: string, opts: { z: number; style?: string; wait?: number; signal?: AbortSignal; avoid?: HTMLElement | null }): Promise<boolean> {
  if (typeof document === "undefined" || !target) return false;
  const found = (await waitForTarget(target, opts.wait ?? 6000, opts.signal, false)) ?? byId(target);
  if (!found || opts.signal?.aborted) return false;
  const local = new AbortController();
  const stop = () => local.abort();
  opts.signal?.addEventListener("abort", stop, { once: true });
  await settle(found, local.signal);
  opts.signal?.removeEventListener("abort", stop);
  if (opts.signal?.aborted || !found.isConnected) return false;
  const panel = opts.avoid && covers(opts.avoid, found) ? opts.avoid : null;
  const id = String(++seq);
  if (panel) panel.setAttribute("data-peek", id);
  ring(found, opts.z, opts.style ?? "red_pulse", () => {
    if (panel && panel.getAttribute("data-peek") === id) panel.removeAttribute("data-peek");
  });
  return true;
}
