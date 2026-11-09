"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import Typewriter from "@/components/guide/Typewriter";
import { getIdleOnboarding, getOnboarding, goToStep, onboardingRunning, startOnboarding, stopOnboarding, subscribeOnboarding } from "@/lib/onboarding/store";
import { markTourSeen, tourFor, tourSeen, type TourStep } from "@/lib/onboarding/tour";

// The first-run walkthrough: the page behind is blurred and dimmed, the step's
// real element stays sharp through a hole cut in that layer, and the caption
// types itself underneath. No card, no ring, no buttons — the hole IS the
// highlight, because everything else is out of focus.
//
// The hole is a `clip-path` on the overlay rather than a `filter` on a parent:
// a filtered ancestor would blur the target with everything else, and a cloned
// target would lose its handlers. Clipped-away pixels are not hit-tested
// either, so clicks inside the hole reach the real element while the blurred
// rest of the page stays inert.

type Box = { x: number; y: number; w: number; h: number; r: number };

const PAD = 6;
const GAP = 14; // from the hole edge; PAD + GAP ≈ 20px from the element
const ROOM = 150; // always keep this much of the viewport free for the caption
const EDGE = 16;
const CAP_W = 420;
const LOCATE_MS = 6000;
const GONE_MS = 1200; // how long a target may stay hidden before the step is skipped
const CLIPS = /(auto|scroll|hidden|clip)/;

/** Scrollable ancestors clip the target, so the hole must stay inside them. */
function clippers(el: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  let p = el.parentElement;
  while (p && p !== document.body && p !== document.documentElement) {
    const cs = window.getComputedStyle(p);
    if (CLIPS.test(cs.overflow + cs.overflowX + cs.overflowY)) out.push(p);
    if (cs.position === "fixed") break;
    p = p.parentElement;
  }
  return out;
}

function visibleBox(el: HTMLElement, clip: HTMLElement[]): Box | null {
  const r = el.getBoundingClientRect();
  let left = r.left - PAD;
  let top = r.top - PAD;
  let right = r.right + PAD;
  let bottom = r.bottom + PAD;
  for (const c of clip) {
    const cr = c.getBoundingClientRect();
    left = Math.max(left, cr.left);
    top = Math.max(top, cr.top);
    right = Math.min(right, cr.right);
    bottom = Math.min(bottom, cr.bottom);
  }
  left = Math.max(left, 0);
  top = Math.max(top, 0);
  right = Math.min(right, window.innerWidth);
  bottom = Math.min(bottom, window.innerHeight);
  // A section taller than the screen would leave nowhere to put the caption,
  // so the hole stops short of the bottom: the top of the element is what the
  // step is about anyway.
  if (bottom > window.innerHeight - ROOM && bottom - top > window.innerHeight / 2) {
    bottom = Math.max(top + 80, window.innerHeight - ROOM);
  }
  if (right - left < 4 || bottom - top < 4) return null;
  const radius = parseFloat(window.getComputedStyle(el).borderTopLeftRadius) || 10;
  return { x: left, y: top, w: right - left, h: bottom - top, r: radius + PAD };
}

function holePath(W: number, H: number, b: Box): string {
  const k = Math.max(0, Math.min(b.r, b.w / 2, b.h / 2));
  const { x, y, w, h } = b;
  const f = (n: number) => Math.round(n * 10) / 10;
  return `path(evenodd, "M0 0H${f(W)}V${f(H)}H0Z M${f(x + k)} ${f(y)}H${f(x + w - k)}A${f(k)} ${f(k)} 0 0 1 ${f(x + w)} ${f(y + k)}V${f(y + h - k)}A${f(k)} ${f(k)} 0 0 1 ${f(x + w - k)} ${f(y + h)}H${f(x + k)}A${f(k)} ${f(k)} 0 0 1 ${f(x)} ${f(y + h - k)}V${f(y + k)}A${f(k)} ${f(k)} 0 0 1 ${f(x + k)} ${f(y)}Z")`;
}

/** Waits for a step's element to exist — pages load their data first. */
function waitFor(selector: string, ms: number, signal: AbortSignal): Promise<HTMLElement | null> {
  const hit = () => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? el : null;
  };
  const now = hit();
  if (now) return Promise.resolve(now);
  return new Promise((resolve) => {
    let done = false;
    const finish = (el: HTMLElement | null) => {
      if (done) return;
      done = true;
      obs.disconnect();
      window.clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(el);
    };
    const onAbort = () => finish(null);
    const obs = new MutationObserver(() => {
      const el = hit();
      if (el) finish(el);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    const timer = window.setTimeout(() => finish(hit()), ms);
    signal.addEventListener("abort", onAbort);
  });
}

export default function OnboardingHost() {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { session, ready } = useAuth();
  const state = useSyncExternalStore(subscribeOnboarding, getOnboarding, getIdleOnboarding);

  const [el, setEl] = useState<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const scrim = useRef<HTMLDivElement>(null);
  const cap = useRef<HTMLDivElement>(null);
  // The user this mount has already decided about, so a re-render or a later
  // visit to the dashboard never starts the tour a second time.
  const bootedFor = useRef<string | null>(null);

  const steps = session ? tourFor(session.role) : [];
  const step: TourStep | undefined = steps[state.index];
  const running = state.running && !!step;
  // The dashboard is the tour's home: the first arrival there plays it.
  const home = session ? `/portal/${session.role}` : "";

  const finish = useCallback(() => {
    stopOnboarding();
  }, []);

  const advance = useCallback(() => {
    const s = getOnboarding();
    if (!s.running) return;
    if (s.index >= steps.length - 1) finish();
    else goToStep(s.index + 1);
  }, [steps.length, finish]);

  // Play once per user: on the first arrival at the dashboard, never again
  // after that (the help menu's "Qo'llanmani ko'rish" replays it on request).
  // The tour is marked seen the moment it starts, not when it ends, so a
  // reload or a jump to another page mid-tour does not bring it back. The
  // guard is written when the timer fires rather than in the effect body:
  // Strict Mode runs the effect twice, and a flag set up front would let the
  // first cleanup cancel the only start that was ever scheduled.
  useEffect(() => {
    if (!ready || !session) return;
    if (bootedFor.current === session.id) return;
    if (pathname !== home) return;
    if (!tourFor(session.role).length || tourSeen(session.id)) {
      bootedFor.current = session.id;
      return;
    }
    const userId = session.id;
    const id = window.setTimeout(() => {
      bootedFor.current = userId;
      markTourSeen(userId);
      if (!onboardingRunning()) startOnboarding();
    }, 900);
    return () => window.clearTimeout(id);
  }, [ready, session, pathname, home]);

  // A signed-out user can never be mid-tour.
  useEffect(() => {
    if (ready && !session) stopOnboarding();
  }, [ready, session]);

  // Resolve the step: go to its route if it names one, then wait for the
  // element. A step whose element never appears is skipped rather than
  // trapping the user behind a blurred page.
  useEffect(() => {
    if (!running || !step) return;
    const ctrl = new AbortController();
    void (async () => {
      if (step.route && pathname !== step.route) {
        router.push(step.route as Parameters<typeof router.push>[0]);
        return; // the pathname change re-runs this effect
      }
      const found = await waitFor(step.selector, LOCATE_MS, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (!found) {
        advance();
        return;
      }
      found.scrollIntoView({ block: "center", behavior: "smooth" });
      setEl(found);
      // let the scroll settle before the hole and caption fade in
      window.setTimeout(() => {
        if (!ctrl.signal.aborted) setVisible(true);
      }, 240);
    })();
    return () => {
      ctrl.abort();
      setEl(null);
      setVisible(false);
    };
  }, [running, step, pathname, router, advance]);

  // Track the element every frame: the hole has to survive scrolling, resizing
  // and any layout the page does while the step is up.
  useEffect(() => {
    if (!running || !el) return;
    const s = scrim.current;
    if (!s) return;
    let raf = 0;
    let last = "";
    let clip = clippers(el);
    let scrollTimer = 0;
    let goneSince = 0;
    const onScroll = () => {
      // backdrop-filter is expensive to repaint; drop it while scrolling
      s.dataset.scrolling = "1";
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => delete s.dataset.scrolling, 180);
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    const loop = () => {
      if (!el.isConnected) {
        // React replaced the node — a real dashboard re-renders as its data
        // arrives. Re-resolve and let the effect restart on the new node.
        // Never store null here: that would leave the step with no element and
        // nothing to bring it back, which froze the tour on the first step.
        const again = document.querySelector<HTMLElement>(step?.selector ?? "");
        if (again) {
          setEl(again);
          return;
        }
        if (!goneSince) goneSince = performance.now();
        else if (performance.now() - goneSince > GONE_MS) {
          advance();
          return;
        }
        raf = window.requestAnimationFrame(loop);
        return;
      }
      const box = visibleBox(el, clip);
      if (!box) {
        // The target went off-screen or its container collapsed (the sidebar
        // folds away on a phone). Hide the caption rather than leave it
        // floating, and move on if it does not come back.
        const c0 = cap.current;
        if (c0) c0.style.opacity = "0";
        if (!goneSince) goneSince = performance.now();
        else if (performance.now() - goneSince > GONE_MS) {
          advance();
          return;
        }
      } else {
        goneSince = 0;
        const c0 = cap.current;
        if (c0) c0.style.opacity = "";
        const path = holePath(window.innerWidth, window.innerHeight, box);
        if (path !== last) {
          s.style.clipPath = path;
          s.style.setProperty("-webkit-clip-path", path);
          last = path;
        }
        const c = cap.current;
        if (c) {
          const cw = Math.min(CAP_W, window.innerWidth - EDGE * 2);
          const ch = c.offsetHeight;
          const below = box.y + box.h + GAP;
          const above = box.y - GAP - ch;
          // under the target by default, above it when there is no room below,
          // and clamped into view as a last resort
          const fitsBelow = below + ch <= window.innerHeight - EDGE;
          const raw = fitsBelow || above < EDGE ? below : above;
          const top = Math.min(Math.max(raw, EDGE), Math.max(EDGE, window.innerHeight - ch - EDGE));
          // Left-aligned with the target rather than centred under it: under a
          // full-width card a centred line starts in the middle of nowhere.
          const left = Math.min(Math.max(box.x, EDGE), Math.max(EDGE, window.innerWidth - cw - EDGE));
          c.style.width = `${cw}px`;
          c.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
        }
      }
      raf = window.requestAnimationFrame(loop);
    };
    loop();
    const onResize = () => {
      clip = clippers(el);
      last = "";
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(scrollTimer);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onResize);
      delete s.dataset.scrolling;
    };
  }, [running, el, step?.selector, advance]);

  // The highlighted element is the obvious thing to click, so clicking it has
  // to move the tour on as well — otherwise the step looks stuck. The click
  // still reaches the element and does its own job; this only listens.
  useEffect(() => {
    if (!running || !el) return;
    const onClick = () => window.setTimeout(advance, 0);
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [running, el, advance]);

  // Esc leaves; arrows and Enter/Space move on. Everything else is swallowed so
  // the blurred page cannot be tabbed into mid-step.
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        finish();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        advance();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToStep(Math.max(0, getOnboarding().index - 1));
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [running, advance, finish]);

  useEffect(() => {
    if (!running) return;
    document.body.dataset.onboarding = "on";
    return () => {
      delete document.body.dataset.onboarding;
    };
  }, [running]);

  if (!running || typeof document === "undefined") return null;
  const text = t(`steps.${step.key}`);

  return createPortal(
    <div className={`obd${visible ? " is-in" : ""}`} data-layer-ignore="">
      {/* the blur + dim, with the target punched out of it */}
      <div className="obd__scrim" ref={scrim} onClick={advance} />
      {/* plain text under the target: no container, no background, no shadow */}
      <div className="obd__cap" ref={cap} role="status" aria-live="polite">
        <p className="obd__text">
          <Typewriter key={`${step.id}:${locale}`} text={text} locale={locale} />
        </p>
        <span className="obd__meta">
          <span className="obd__hint">{t("hintAny")}</span>
          <button type="button" className="obd__skip" onClick={finish}>
            {t("skip")}
          </button>
        </span>
      </div>
      <p className="sr-only">{text}</p>
    </div>,
    document.body,
  );
}
