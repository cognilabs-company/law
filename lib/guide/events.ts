export type TourEndReason = "done" | "user_stop" | "route_change" | "replaced" | "nav_failed" | "clicked" | "stopped";

export type GuideEvent =
  | { type: "nav_ok"; tourId: string; href: string; already: boolean }
  | { type: "nav_failed"; tourId: string; href: string; reason: string }
  | { type: "step_shown"; tourId: string; index: number; commandId: string; target: string; by: string; canonical: string; focused: boolean }
  | { type: "step_missing"; tourId: string; index: number; commandId: string; target: string }
  | { type: "step_clicked"; tourId: string; index: number; commandId: string; target: string }
  | { type: "tour_end"; tourId: string; reason: TourEndReason };

const listeners = new Set<(e: GuideEvent) => void>();

export function emitGuideEvent(e: GuideEvent): void {
  listeners.forEach((fn) => {
    try {
      fn(e);
    } catch {
      return;
    }
  });
}

export function onGuideEvent(fn: (e: GuideEvent) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
