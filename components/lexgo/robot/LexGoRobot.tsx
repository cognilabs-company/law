"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { RobotEvents } from "./RobotEvents";
import { BREAKPOINTS, DEBUG_ROBOT, RANDOM_GESTURE_INTERVAL_MS, VIEWPORT_SIZE } from "./robot-config";
import { GESTURE_NAMES } from "./robot-gestures";
import type { RobotController } from "./RobotController";
import type { RobotExpression } from "./robot-types";

type Tier = "full" | "compact" | "mini";
type RobotDebugWindow = typeof window & { __lexgoRobotController?: RobotController | null };

// Dev-only manual test harness (section 38): clicking cycles one behavior at
// a time instead of navigating away immediately, so each can be inspected
// (and screenshotted) at rest rather than racing a timer. Never runs in
// production — the click there always just opens LexGo AI. Order matches
// the requested check-off list: idle, peek, wave, look, point, think, hide,
// back to idle. "look" is a discrete lookAt() snap to a fixed direction
// (not the ambient lookAtCursor(), which is already always running in the
// background regardless of this cycle) so it's its own visible, inspectable
// step rather than "whatever the mouse happens to be doing".
const FACE_EXPRESSIONS: RobotExpression[] = ["default", "happy", "curious", "thinking", "surprised", "blink", "error", "success"];

// What the companion may do on its own, in production. Everything here is
// either procedural (written for this robot) or the one baked clip that reads
// as friendly; the rest of GESTURE_NAMES is exercise and combat animation the
// generator happened to include, and IDLE_EXPRESSIONS leaves out "error" and
// "surprised", which say something is wrong when nothing is.
const IDLE_EXPRESSIONS: RobotExpression[] = ["default", "happy", "curious", "blink"];
const IDLE_BEATS: Array<(c: RobotController) => void> = [
  (c) => c.setExpression("default"),
  (c) => c.wave(),
  (c) => c.setExpression("happy"),
  (c) => c.playGesture("waveGoodbye"),
  (c) => c.setExpression("curious"),
  (c) => c.peek(),
  (c) => c.setExpression(IDLE_EXPRESSIONS[Math.floor(Math.random() * IDLE_EXPRESSIONS.length)]),
  (c) => c.idle(),
];

// three.js, the 3D scene and the ~2 MB model load with the canvas, and the
// canvas mounts only where the robot is shown (above the portal's 900px
// mobile breakpoint), once the page has loaded and the browser is idle — so
// a phone never downloads them and a cold visit's own requests go first.
const RobotCanvas = dynamic(() => import("./RobotCanvas"), { ssr: false });
const IDLE_TIMEOUT_MS = 4000;
// Rendering stops while any scroll is under way and resumes this long after
// the last scroll event: the WebGL frame loop otherwise competes with the
// scroll for every frame (measured: ~30 fps scrolling with it, 60 without).
const SCROLL_REST_MS = 180;
// On a 2G/3G or data-saving connection the 3D model (~1.3 MB gzip) would
// compete with the pages' own requests for most of a minute, so the companion
// is its still picture there (the canvas's own fallback) — still clickable.
// navigator.connection.downlink is not used: a fresh browser profile reports
// ~1.6 Mbps on a fast line until it has measured.
type NetInfo = { saveData?: boolean; effectiveType?: string };
function slowConnection(): boolean {
  const c = (navigator as Navigator & { connection?: NetInfo }).connection;
  if (!c) return false;
  return !!c.saveData || /^(slow-2g|2g|3g)$/.test(c.effectiveType ?? "");
}

const PEEK_AFTER = 48;
const SIZE_SCALE: Record<Tier, number> = { full: 0.88, compact: 0.88, mini: 1 };
const NOT_PAGE = 'aside,nav,[role="dialog"],[aria-modal="true"],[data-ai-ignore],.amodal,.robot-edge-zone';

function pageScroller(el: Element): boolean {
  if (el === document.scrollingElement || el === document.documentElement || el === document.body) return true;
  if (el.closest(NOT_PAGE)) return false;
  return el.clientHeight >= window.innerHeight * 0.45 && el.scrollHeight - el.clientHeight > 1;
}

// The persistent "lives behind the right edge" companion (spec section 5) —
// mounted once at the portal shell root, not per-page. Four responsive
// states (section 35): full (>=1280px), compact (~80% size, 1024-1279),
// mini (a mostly-head sliver, 901-1023), hidden at or below this app's own
// portal mobile breakpoint (900px) rather than inventing an unrelated one.
export default function LexGoRobot({ onRobotClick }: { onRobotClick?: () => void }) {
  const t = useTranslations("portal.aiAssistant.panel");
  const controllerRef = useRef<RobotController | null>(null);
  const demoStepRef = useRef(0);
  const previewStepRef = useRef(0);
  const [visible, setVisible] = useState(true);
  const [tier, setTier] = useState<Tier>("full");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [ready, setReady] = useState(false);
  const [peek, setPeek] = useState(false);
  const [canvasDue, setCanvasDue] = useState<"" | "3d" | "still">("");
  const [scrolling, setScrolling] = useState(false);

  useEffect(() => {
    if (!visible || canvasDue) return;
    let idle = 0;
    let timer = 0;
    const due = () => setCanvasDue(slowConnection() ? "still" : "3d");
    const start = () => {
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(due, { timeout: IDLE_TIMEOUT_MS });
      else timer = window.setTimeout(due, 1000);
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      window.removeEventListener("load", start);
      if (idle) window.cancelIdleCallback(idle);
      if (timer) window.clearTimeout(timer);
    };
  }, [visible, canvasDue]);

  useEffect(() => {
    if (!visible) return;
    let rest = 0;
    let on = false;
    const onAnyScroll = () => {
      if (!on) {
        on = true;
        setScrolling(true);
      }
      window.clearTimeout(rest);
      rest = window.setTimeout(() => {
        on = false;
        setScrolling(false);
      }, SCROLL_REST_MS);
    };
    window.addEventListener("scroll", onAnyScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener("scroll", onAnyScroll, { capture: true });
      window.clearTimeout(rest);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const tops = new WeakMap<Element, number>();
    let pending: Element | null = null;
    let frame = 0;
    const read = () => {
      frame = 0;
      const el = pending;
      pending = null;
      if (!el) return;
      const top = el.scrollTop;
      if (tops.get(el) === top) return;
      tops.set(el, top);
      setPeek(top > PEEK_AFTER);
    };
    const onScroll = (e: Event) => {
      const el = e.target instanceof Element ? e.target : document.scrollingElement;
      if (!el || !pageScroller(el)) return;
      pending = el;
      if (!frame) frame = window.requestAnimationFrame(read);
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [visible]);

  useEffect(() => {
    const compactQuery = window.matchMedia(`(max-width:${BREAKPOINTS.fullMinWidth - 1}px)`);
    const miniQuery = window.matchMedia(`(max-width:${BREAKPOINTS.compactMinWidth - 1}px)`);
    const hiddenQuery = window.matchMedia(`(max-width:${BREAKPOINTS.hiddenMaxWidth}px)`);
    const update = () => {
      setTier(miniQuery.matches ? "mini" : compactQuery.matches ? "compact" : "full");
      setVisible(!hiddenQuery.matches);
    };
    update();
    compactQuery.addEventListener("change", update);
    miniQuery.addEventListener("change", update);
    hiddenQuery.addEventListener("change", update);
    return () => {
      compactQuery.removeEventListener("change", update);
      miniQuery.removeEventListener("change", update);
      hiddenQuery.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // Section 21: global cursor tracking, not just hover-over-the-robot — the
  // robot watches the pointer anywhere on the page.
  useEffect(() => {
    if (!ready) return;
    if (reducedMotion) {
      controllerRef.current?.lookAtCursor(false);
      return;
    }
    controllerRef.current?.lookAtCursor(true);
    const handleMove = (e: PointerEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      controllerRef.current?.setPointerNDC(x, y);
    };
    window.addEventListener("pointermove", handleMove, { passive: true });
    return () => window.removeEventListener("pointermove", handleMove);
  }, [ready, reducedMotion]);

  // Ambient idle. This used to walk the FULL list of baked clips and face
  // expressions in production, which meant the companion on a client's
  // dashboard would, every thirty seconds, play "slash", "frustrated",
  // "depressed", "complain", "dive" or "sit" and pull an "error" face — the
  // clip list is whatever the generator baked, not a curated set, and the
  // exhaustive walk belongs to the dev harness that inspects them. In
  // production it now shows only the calm expressions and the one presentable
  // clip, and otherwise uses the procedural behaviours written for this.
  useEffect(() => {
    if (!ready || reducedMotion) return;
    const iv = setInterval(() => {
      if (document.hidden) return;
      const controller = controllerRef.current;
      if (!controller) return;
      const step = previewStepRef.current;
      if (DEBUG_ROBOT) {
        previewStepRef.current = (step + 1) % Math.max(GESTURE_NAMES.length, FACE_EXPRESSIONS.length);
        controller.playGesture(GESTURE_NAMES[step % GESTURE_NAMES.length]);
        controller.setExpression(FACE_EXPRESSIONS[step % FACE_EXPRESSIONS.length]);
        return;
      }
      previewStepRef.current = (step + 1) % IDLE_BEATS.length;
      IDLE_BEATS[step % IDLE_BEATS.length](controller);
    }, RANDOM_GESTURE_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [ready, reducedMotion]);

  function handleReady(controller: RobotController | null) {
    controllerRef.current = controller;
    if (DEBUG_ROBOT && typeof window !== "undefined") {
      (window as RobotDebugWindow).__lexgoRobotController = controller;
    }
    setReady(!!controller);
  }

  // Dev preview shortcut for the reference-board behaviors. This makes one
  // animation independently inspectable without clicking through the whole
  // demo cycle: /uz/portal/client?robot=wave (or ?robot=greet)
  useEffect(() => {
    if (!ready || !DEBUG_ROBOT) return;
    const demo = new URLSearchParams(window.location.search).get("robot");
    const controller = controllerRef.current;
    if (!controller) return;
    if (demo === "wave") controller.wave();
    if (demo === "greet") controller.greet();
    if (demo === "peek") controller.peek();
    if (demo === "hide") controller.hide();
    if (demo?.startsWith("gesture:")) {
      const name = demo.slice("gesture:".length);
      if ((GESTURE_NAMES as readonly string[]).includes(name)) {
        controller.playGesture(name as (typeof GESTURE_NAMES)[number]);
      }
    }
    if (demo?.startsWith("expression:")) {
      const expression = demo.slice("expression:".length) as RobotExpression;
      if (FACE_EXPRESSIONS.includes(expression)) controller.setExpression(expression);
    }
  }, [ready]);

  function handleClick() {
    if (DEBUG_ROBOT && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("robot") === "debug") {
      const controller = controllerRef.current;
      if (!controller) return;
      const step = demoStepRef.current;
      demoStepRef.current += 1;
      void import("./robot-demo").then(({ demoSteps }) => {
        const steps = demoSteps(FACE_EXPRESSIONS);
        steps[step % steps.length](controller);
      });
      return;
    }
    RobotEvents.emit("peek");
    onRobotClick?.();
  }

  if (!visible) return null;
  const base = VIEWPORT_SIZE[tier];
  const scale = SIZE_SCALE[tier];

  return (
    <div className={`robot-edge-zone${peek ? " is-peek" : ""}`}>
      <div
        className="robot-viewport"
        style={{ width: Math.round(base.width * scale), height: Math.round(base.height * scale) }}
        role="button"
        tabIndex={0}
        aria-label={t("open")}
        title={t("fullName")}
        data-ai-id="dashboard.ai-instructor.open"
        data-ai-type="button"
        onClick={handleClick}
        onMouseEnter={() => !DEBUG_ROBOT && RobotEvents.emit("peek")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        {canvasDue === "3d" ? (
          <RobotCanvas onReady={handleReady} reducedMotion={reducedMotion} paused={scrolling} />
        ) : canvasDue === "still" ? (
          <div className="robot-canvas-fallback" aria-hidden>
            <Image src="/img/card-lexgo-ai-sorash.png" alt="" width={104} height={104} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
