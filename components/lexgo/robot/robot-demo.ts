import * as THREE from "three";
import { GESTURE_NAMES } from "./robot-gestures";
import type { RobotController } from "./RobotController";
import type { RobotExpression } from "./robot-types";

// The dev-only demo cycle of LexGoRobot (see FACE_EXPRESSIONS there). Its own
// module so the companion's shell doesn't import three.js: that loads with
// the canvas, and only where the robot is shown.
export function demoSteps(faces: RobotExpression[]): Array<(c: RobotController) => void> {
  return [
    (c) => c.idle(),
    (c) => c.peek(),
    (c) => c.greet(),
    (c) => c.wave(),
    (c) => c.lookAt(new THREE.Vector3(0.45, 0.45, 1)),
    (c) => c.pointAt(new THREE.Vector3(-0.4, 0.5, 1)),
    (c) => c.think(),
    (c) => c.hide(),
    ...faces.map((expression) => (c: RobotController) => c.setExpression(expression)),
    ...GESTURE_NAMES.map((name) => (c: RobotController) => c.playGesture(name)),
  ];
}
