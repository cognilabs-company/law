import type { Role } from "@/lib/auth";

// The first-run walkthrough. It is deliberately NOT the `lib/guide` tour: that
// one is the narrator (robot avatar, caption card, ring) the assistant drives
// on demand. This is the silent onboarding — a blurred page, one sharp element
// and a line of text under it — so it keeps its own, much smaller, state.
//
// Targets are resolved with `document.querySelector`, so every selector below
// must exist in the real markup:
//   [data-ai-target="nav:<key>"]  sidebar rows, from components/portal/portalNav.ts
//   [data-tour="<id>"]            the few dashboard anchors added for this tour
export type TourAdvance =
  // the step explains something; a click anywhere moves on
  | "any"
  // the user has to click the real element, which also navigates
  | "target";

export type TourStep = {
  id: string;
  /** CSS selector for the real element. */
  selector: string;
  /** Uzbek caption key under `onboarding.steps`. */
  key: string;
  advance: TourAdvance;
  /** Route the step lives on; the host navigates there if needed. */
  route?: string;
};

export const TOUR_VERSION = 1;

const CLIENT_STEPS: TourStep[] = [
  { id: "ai", selector: '[data-tour="ai-ask"]', key: "ai", advance: "any", route: "/portal/client" },
  { id: "areas", selector: '[data-tour="areas"]', key: "areas", advance: "any", route: "/portal/client" },
  { id: "services", selector: '[data-tour="services"]', key: "services", advance: "any", route: "/portal/client" },
  { id: "lawyers", selector: '[data-ai-target="nav:lawyers"]', key: "lawyers", advance: "target" },
  { id: "works", selector: '[data-ai-target="nav:works"]', key: "works", advance: "any" },
  { id: "sos", selector: '[data-ai-target="nav:sos"]', key: "sos", advance: "any" },
];

const SELLER_STEPS: TourStep[] = [
  { id: "newOrders", selector: '[data-ai-target="nav:newOrders"]', key: "newOrders", advance: "any" },
  { id: "cases", selector: '[data-ai-target="nav:cases"]', key: "cases", advance: "any" },
  { id: "services", selector: '[data-ai-target="nav:services"]', key: "sellerServices", advance: "any" },
  { id: "calendar", selector: '[data-ai-target="nav:calendar"]', key: "calendar", advance: "any" },
  { id: "messages", selector: '[data-ai-target="nav:messages"]', key: "messages", advance: "any" },
];

export function tourFor(role: Role): TourStep[] {
  return role === "client" ? CLIENT_STEPS : role === "advocate" || role === "lawyer" ? SELLER_STEPS : [];
}

const KEY = "lexgo_onboarding_v" + TOUR_VERSION;

/** Scoped to the signed-in user so a shared device does not swallow the tour. */
function storeKey(userId: string): string {
  return userId ? `${KEY}:${userId}` : KEY;
}

export function tourSeen(userId: string): boolean {
  try {
    return window.localStorage.getItem(storeKey(userId)) === "1";
  } catch {
    // Private mode or blocked storage: treat as seen so the tour cannot loop.
    return true;
  }
}

export function markTourSeen(userId: string): void {
  try {
    window.localStorage.setItem(storeKey(userId), "1");
  } catch {
    return;
  }
}

export function clearTourSeen(userId: string): void {
  try {
    window.localStorage.removeItem(storeKey(userId));
  } catch {
    return;
  }
}
