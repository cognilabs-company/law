"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import RobotCanvas from "./RobotCanvas";
import { RobotEvents } from "./RobotEvents";
import { BREAKPOINTS, DEBUG_ROBOT, VIEWPORT_SIZE } from "./robot-config";
import type { RobotController } from "./RobotController";

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
const DEMO_STEPS: Array<(c: RobotController) => void> = [
  (c) => c.idle(),
  (c) => c.peek(),
  (c) => c.lookAt(new THREE.Vector3(0.6, 0.75, 1)),
  (c) => c.wave(),
  (c) => c.greet(),
  (c) => c.pointAt(document.querySelector("h1") ?? document.body),
  (c) => c.think(),
  (c) => c.hide(),
  (c) => {
    c.lookAt(null);
    c.pointAt(null);
    c.idle();
  },
];

// The persistent "lives behind the right edge" companion (spec section 5) —
// mounted once at the portal shell root, not per-page. Four responsive
// states (section 35): full (>=1280px), compact (~80% size, 1024-1279),
// mini (a mostly-head sliver, 901-1023), hidden at or below this app's own
// portal mobile breakpoint (900px) rather than inventing an unrelated one.
export default function LexGoRobot({ onRobotClick }: { onRobotClick?: () => void }) {
  const controllerRef = useRef<RobotController | null>(null);
  const demoStepRef = useRef(0);
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
        aria-label={DEBUG_ROBOT ? "LexGo AI (dev: click to cycle idle / peek / look / wave / point / think / hide)" : "LexGo AI"}
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
