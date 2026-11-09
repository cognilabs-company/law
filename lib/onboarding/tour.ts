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
// Every step explains something and a click anywhere moves on. The real
// element stays clickable through the hole, so a user who would rather open it
// can — the tour simply carries on from the next page.
export type TourAdvance = "any";

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

const CLIENT_STEPS: TourStep[] = [
  // In page order — the tour walks down the dashboard, it does not jump back
  // up. Services sits above the areas card, so it is explained first.
  { id: "ai", selector: '[data-tour="ai-ask"]', key: "ai", advance: "any", route: "/portal/client" },
  { id: "services", selector: '[data-tour="services"]', key: "services", advance: "any", route: "/portal/client" },
  { id: "areas", selector: '[data-tour="areas"]', key: "areas", advance: "any", route: "/portal/client" },
  { id: "lawyers", selector: '[data-ai-target="nav:lawyers"]', key: "lawyers", advance: "any" },
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

// The tour plays by itself once: on the user's first arrival at the
// dashboard. After that it only runs when asked for from the help menu.
// Bump the version when the tour changes enough that everyone should see it
// once more.
const TOUR_VERSION = 1;
const KEY = `lexgo_onboarding_v${TOUR_VERSION}`;

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
