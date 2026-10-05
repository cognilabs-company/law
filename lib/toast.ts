export type ToastTone = "info" | "ok" | "err";
export type ToastItem = { id: number; text: string; tone: ToastTone; ms: number };

let seq = 0;
const listeners = new Set<(t: ToastItem) => void>();

export function toast(text: string, opts: { tone?: ToastTone; ms?: number } = {}): void {
  if (!text) return;
  const item: ToastItem = { id: ++seq, text, tone: opts.tone ?? "info", ms: opts.ms ?? 4500 };
  listeners.forEach((fn) => fn(item));
}

export function subscribeToasts(fn: (t: ToastItem) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
