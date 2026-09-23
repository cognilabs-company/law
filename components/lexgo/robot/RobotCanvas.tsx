"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import RobotModel from "./RobotModel";
import { CAMERA, CANVAS_OVERSCAN_RATIO } from "./robot-config";
import type { RobotController } from "./RobotController";

// Wider than its parent (.robot-viewport, which clips via overflow:hidden)
// on purpose — a second, independent safeguard beyond the conservative
// camera/character framing below: motion that ever overshoots still lands
// in this overscanned-but-clipped margin rather than depending on the
// framing math alone. Centered symmetrically (left offset by half the extra
// width) so the visible clipped region's aspect ratio still matches
// .robot-viewport's own — the character sits at world x 0 (restX 0, see
// robot-config.ts's ROOT_PLACEMENT), so an off-center canvas would bias it
// off-center inside the box instead of just adding equal margin both ways.
const oversizedStyle = {
  width: `${(1 + CANVAS_OVERSCAN_RATIO) * 100}%`,
  height: "100%",
  position: "absolute" as const,
  left: `${-(CANVAS_OVERSCAN_RATIO / 2) * 100}%`,
  top: 0,
  zIndex: 0,
};

export default function RobotCanvas({
  onReady,
  reducedMotion,
}: {
  onReady: (controller: RobotController | null) => void;
  reducedMotion: boolean;
}) {
  return (
    <div style={oversizedStyle}>
      <Canvas
        camera={{ fov: CAMERA.fov, position: CAMERA.position, near: CAMERA.near, far: CAMERA.far }}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 1.5]}
        onCreated={({ camera, scene }) => {
          camera.lookAt(...CAMERA.target);
          scene.background = null;
        }}
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[1.2, 2.4, 1.6]} intensity={1.1} />
        <directionalLight position={[-1.4, 0.6, -0.8]} intensity={0.3} />
        {/* useGLTF suspends on first load (the preload call in RobotModel
            only starts the fetch, it doesn't make the render wait for it) —
            without this boundary the model never appeared at all instead of
            just loading in a beat late. */}
        <Suspense fallback={null}>
          <RobotModel onReady={onReady} reducedMotion={reducedMotion} />
        </Suspense>
      </Canvas>
    </div>
  );
}
