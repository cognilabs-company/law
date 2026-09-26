"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import RobotCanvas from "./RobotCanvas";
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

const DEMO_STEPS: Array<(c: RobotController) => void> = [
  (c) => c.idle(),
  (c) => c.peek(),
  (c) => c.greet(),
  (c) => c.wave(),
  (c) => c.lookAt(new THREE.Vector3(0.45, 0.45, 1)),
  (c) => c.pointAt(new THREE.Vector3(-0.4, 0.5, 1)),
  (c) => c.think(),
  (c) => c.hide(),
  ...FACE_EXPRESSIONS.map((expression) => (c: RobotController) => c.setExpression(expression)),
  ...GESTURE_NAMES.map((name) => (c: RobotController) => c.playGesture(name)),
];

// The persistent "lives behind the right edge" companion (spec section 5) —
// mounted once at the portal shell root, not per-page. Four responsive
// states (section 35): full (>=1280px), compact (~80% size, 1024-1279),
// mini (a mostly-head sliver, 901-1023), hidden at or below this app's own
// portal mobile breakpoint (900px) rather than inventing an unrelated one.
export default function LexGoRobot({ onRobotClick }: { onRobotClick?: () => void }) {
  const controllerRef = useRef<RobotController | null>(null);
  const demoStepRef = useRef(0);
  const previewStepRef = useRef(0);
  const [visible, setVisible] = useState(true);
  const [tier, setTier] = useState<Tier>("full");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [ready, setReady] = useState(false);

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
    if (DEBUG_ROBOT) {
      const controller = controllerRef.current;
      if (!controller) return;
      DEMO_STEPS[demoStepRef.current % DEMO_STEPS.length](controller);
      demoStepRef.current += 1;
      return;
    }
    RobotEvents.emit("peek");
    onRobotClick?.();
  }

  if (!visible) return null;
  const size = VIEWPORT_SIZE[tier];

  return (
    <div className="robot-edge-zone">
      <div
        className="robot-viewport"
        style={{ width: size.width, height: size.height }}
        role="button"
        tabIndex={0}
        aria-label={DEBUG_ROBOT ? "LexGo AI (dev: click to cycle behaviors, gestures, and face expressions)" : "LexGo AI"}
        onClick={handleClick}
        onMouseEnter={() => !DEBUG_ROBOT && RobotEvents.emit("peek")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (DEBUG_ROBOT) handleClick();
            else onRobotClick?.();
          }
        }}
      >
        <RobotCanvas onReady={handleReady} reducedMotion={reducedMotion} />
      </div>
    </div>
  );
}
