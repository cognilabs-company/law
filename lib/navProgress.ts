// Immediate feedback for client navigations: <html data-nav-pending> is set
// from the moment a navigation starts until the URL changes, and
// components/NavProgress draws the top bar (and the progress cursor) from it.
//
// A Link sets it while Next's useLinkStatus reports the click as pending
// (components/NavPendingSignal, added to every Link by i18n/navigation); a
// router.push() from code sets it until location.href moves on. Either way it
// is shown at the click, not after the destination has loaded.

const SAFETY_MS = 15_000;
let holds = 0;
let watchFrom = "";
let watch = 0;
let safety = 0;

function paint() {
  if (typeof document === "undefined") return;
  const on = holds > 0 || watch !== 0;
  if (on !== document.documentElement.hasAttribute("data-nav-pending")) document.documentElement.toggleAttribute("data-nav-pending", on);
}

function stopWatch() {
  if (watch) window.clearInterval(watch);
  if (safety) window.clearTimeout(safety);
  watch = 0;
  safety = 0;
}

// Pending until released (a Link whose useLinkStatus is pending).
export function holdNavPending(): () => void {
  holds += 1;
  paint();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    paint();
  };
}

// Pending until the URL changes (router.push / replace from code), with a
// safety stop for a navigation to the page already shown.
export function startNavPending(): void {
  if (typeof window === "undefined") return;
  stopWatch();
  watchFrom = window.location.href;
  watch = window.setInterval(() => {
    if (window.location.href === watchFrom) return;
    stopWatch();
    paint();
  }, 50);
  safety = window.setTimeout(() => {
    stopWatch();
    paint();
  }, SAFETY_MS);
  paint();
}

// The URL has changed (NavProgress sees a new pathname): nothing is pending.
export function endNavPending(): void {
  if (typeof window === "undefined") return;
  stopWatch();
  paint();
}

// Whether a router target is the page already shown (no navigation follows).
export function isSamePage(href: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const u = new URL(href, window.location.href);
    return u.origin === window.location.origin && u.pathname.replace(/\/$/, "") === window.location.pathname.replace(/\/$/, "") && u.search === window.location.search;
  } catch {
    return false;
  }
}
