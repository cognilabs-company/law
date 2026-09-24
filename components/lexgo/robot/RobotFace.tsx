"use client";

import { useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { RobotExpression } from "./robot-types";

type FaceStyle = {
  color: string;
  mouthColor: string;
  eyeScaleX: number;
  eyeScaleY: number;
  eyeX: number;
  eyeY: number;
  mouthWidth: number;
  mouthOpen: number;
  mouthRotation: number;
  browTilt: number;
  cheekOpacity: number;
};

const FACE_STYLES: Record<RobotExpression, FaceStyle> = {
  default: {
    color: "#73dcff",
    mouthColor: "#a9efff",
    eyeScaleX: 1,
    eyeScaleY: 1,
    eyeX: 0,
    eyeY: 0,
    mouthWidth: 1,
    mouthOpen: 0.05,
    mouthRotation: 0,
    browTilt: 0,
    cheekOpacity: 0.18,
  },
  happy: {
    color: "#6fffc1",
    mouthColor: "#e2fff3",
    eyeScaleX: 0.96,
    eyeScaleY: 0.78,
    eyeX: 0,
    eyeY: -0.002,
    mouthWidth: 1.24,
    mouthOpen: 0.36,
    mouthRotation: 0,
    browTilt: -0.12,
    cheekOpacity: 0.62,
  },
  curious: {
    color: "#ffd86f",
    mouthColor: "#fff0ac",
    eyeScaleX: 1.08,
    eyeScaleY: 1.12,
    eyeX: 0.008,
    eyeY: 0.008,
    mouthWidth: 0.82,
    mouthOpen: 0.2,
    mouthRotation: -0.08,
    browTilt: 0.28,
    cheekOpacity: 0.24,
  },
  thinking: {
    color: "#c4a8ff",
    mouthColor: "#eadfff",
    eyeScaleX: 0.9,
    eyeScaleY: 0.92,
    eyeX: 0.012,
    eyeY: 0.015,
    mouthWidth: 0.68,
    mouthOpen: 0.08,
    mouthRotation: 0.13,
    browTilt: 0.18,
    cheekOpacity: 0.12,
  },
  surprised: {
    color: "#8ae8ff",
    mouthColor: "#d7f8ff",
    eyeScaleX: 1.16,
    eyeScaleY: 1.22,
    eyeX: 0,
    eyeY: 0.004,
    mouthWidth: 0.62,
    mouthOpen: 0.84,
    mouthRotation: 0,
    browTilt: 0.34,
    cheekOpacity: 0.3,
  },
  blink: {
    color: "#79ddff",
    mouthColor: "#b7efff",
    eyeScaleX: 1.02,
    eyeScaleY: 1,
    eyeX: 0,
    eyeY: 0,
    mouthWidth: 1,
    mouthOpen: 0.05,
    mouthRotation: 0,
    browTilt: 0,
    cheekOpacity: 0.18,
  },
  error: {
    color: "#ff6e91",
    mouthColor: "#ffc1cf",
    eyeScaleX: 0.92,
    eyeScaleY: 0.72,
    eyeX: -0.006,
    eyeY: -0.004,
    mouthWidth: 0.78,
    mouthOpen: 0.02,
    mouthRotation: 0.2,
    browTilt: -0.32,
    cheekOpacity: 0.36,
  },
  success: {
    color: "#73ff95",
    mouthColor: "#d0ffda",
    eyeScaleX: 0.96,
    eyeScaleY: 0.88,
    eyeX: 0,
    eyeY: 0,
    mouthWidth: 1.18,
    mouthOpen: 0.48,
    mouthRotation: 0,
    browTilt: -0.18,
    cheekOpacity: 0.48,
  },
};

export default function RobotFace({
  head,
  expression,
}: {
  head?: THREE.Object3D;
  expression: RobotExpression;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const leftEyeRef = useRef<THREE.Mesh>(null);
  const rightEyeRef = useRef<THREE.Mesh>(null);
  const leftPupilRef = useRef<THREE.Mesh>(null);
  const rightPupilRef = useRef<THREE.Mesh>(null);
  const leftBrowRef = useRef<THREE.Mesh>(null);
  const rightBrowRef = useRef<THREE.Mesh>(null);
  const mouthRef = useRef<THREE.Mesh>(null);
  const mouthOpenRef = useRef<THREE.Mesh>(null);
  const leftCheekRef = useRef<THREE.Mesh>(null);
  const rightCheekRef = useRef<THREE.Mesh>(null);
  const leftEyeMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const rightEyeMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const leftPupilMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const rightPupilMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const mouthMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const mouthOpenMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const cheekMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const rightCheekMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const blinkPhaseRef = useRef(0);
  const nextBlinkRef = useRef(3.1);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group || !head) return;
    const previousParent = group.parent;
    head.add(group);
    return () => {
      if (group.parent === head) head.remove(group);
      if (previousParent && group.parent !== previousParent) previousParent.add(group);
    };
  }, [head]);

  useFrame((_, delta) => {
    const style = FACE_STYLES[expression] ?? FACE_STYLES.default;
    const explicitBlink = expression === "blink";

    if (!explicitBlink) {
      if (blinkPhaseRef.current > 0) {
        blinkPhaseRef.current = Math.min(1, blinkPhaseRef.current + delta / 0.22);
        if (blinkPhaseRef.current >= 1) {
          blinkPhaseRef.current = 0;
          nextBlinkRef.current = 3.5 + Math.random() * 4.5;
        }
      } else {
        nextBlinkRef.current -= delta;
        if (nextBlinkRef.current <= 0) blinkPhaseRef.current = 0.001;
      }
    }

    const blinkAmount = explicitBlink ? 1 : Math.sin(blinkPhaseRef.current * Math.PI);
    const eyeY = style.eyeScaleY * Math.max(0.08, 1 - blinkAmount);
    const smooth = Math.min(1, delta * 12);

    if (leftEyeRef.current) {
      leftEyeRef.current.scale.x = THREE.MathUtils.lerp(leftEyeRef.current.scale.x, style.eyeScaleX, smooth);
      leftEyeRef.current.scale.y = THREE.MathUtils.lerp(leftEyeRef.current.scale.y, eyeY, smooth);
    }
    if (rightEyeRef.current) {
      rightEyeRef.current.scale.x = THREE.MathUtils.lerp(rightEyeRef.current.scale.x, style.eyeScaleX, smooth);
      rightEyeRef.current.scale.y = THREE.MathUtils.lerp(rightEyeRef.current.scale.y, eyeY, smooth);
    }
    if (leftPupilRef.current) {
      leftPupilRef.current.position.x = THREE.MathUtils.lerp(leftPupilRef.current.position.x, -0.052 + style.eyeX, smooth);
      leftPupilRef.current.position.y = THREE.MathUtils.lerp(leftPupilRef.current.position.y, 0.028 + style.eyeY, smooth);
      leftPupilRef.current.scale.y = THREE.MathUtils.lerp(leftPupilRef.current.scale.y, Math.max(0.15, 1 - blinkAmount), smooth);
    }
    if (rightPupilRef.current) {
      rightPupilRef.current.position.x = THREE.MathUtils.lerp(rightPupilRef.current.position.x, 0.052 + style.eyeX, smooth);
      rightPupilRef.current.position.y = THREE.MathUtils.lerp(rightPupilRef.current.position.y, 0.028 + style.eyeY, smooth);
      rightPupilRef.current.scale.y = THREE.MathUtils.lerp(rightPupilRef.current.scale.y, Math.max(0.15, 1 - blinkAmount), smooth);
    }
    if (leftBrowRef.current) leftBrowRef.current.rotation.z = THREE.MathUtils.lerp(leftBrowRef.current.rotation.z, style.browTilt, smooth);
    if (rightBrowRef.current) rightBrowRef.current.rotation.z = THREE.MathUtils.lerp(rightBrowRef.current.rotation.z, -style.browTilt, smooth);
    if (mouthRef.current) {
      mouthRef.current.scale.x = THREE.MathUtils.lerp(mouthRef.current.scale.x, style.mouthWidth, smooth);
      mouthRef.current.rotation.z = THREE.MathUtils.lerp(mouthRef.current.rotation.z, style.mouthRotation, smooth);
    }
    if (mouthOpenRef.current) {
      mouthOpenRef.current.scale.y = THREE.MathUtils.lerp(mouthOpenRef.current.scale.y, 0.6 + style.mouthOpen * 1.8, smooth);
      if (mouthOpenMaterialRef.current) mouthOpenMaterialRef.current.opacity = THREE.MathUtils.lerp(mouthOpenMaterialRef.current.opacity, style.mouthOpen * 0.78, smooth);
    }
    if (leftCheekRef.current) leftCheekRef.current.scale.x = THREE.MathUtils.lerp(leftCheekRef.current.scale.x, 0.75 + style.cheekOpacity, smooth);
    if (rightCheekRef.current) rightCheekRef.current.scale.x = THREE.MathUtils.lerp(rightCheekRef.current.scale.x, 0.75 + style.cheekOpacity, smooth);

    leftEyeMaterialRef.current?.color.set(style.color);
    rightEyeMaterialRef.current?.color.set(style.color);
    leftPupilMaterialRef.current?.color.set(style.color);
    rightPupilMaterialRef.current?.color.set(style.color);
    mouthMaterialRef.current?.color.set(style.mouthColor);
    if (cheekMaterialRef.current) {
      cheekMaterialRef.current.color.set(style.color);
      cheekMaterialRef.current.opacity = style.cheekOpacity;
    }
    if (rightCheekMaterialRef.current) {
      rightCheekMaterialRef.current.color.set(style.color);
      rightCheekMaterialRef.current.opacity = style.cheekOpacity;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0.064, 0.12]} renderOrder={20}>
      <mesh renderOrder={20}>
        <planeGeometry args={[0.2, 0.14]} />
        <meshBasicMaterial color="#07111e" transparent opacity={0.92} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh ref={leftEyeRef} position={[-0.052, 0.028, 0.018]} renderOrder={21}>
        <sphereGeometry args={[0.027, 16, 10]} />
        <meshBasicMaterial ref={leftEyeMaterialRef} color="#73dcff" transparent opacity={0.98} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh ref={rightEyeRef} position={[0.052, 0.028, 0.018]} renderOrder={21}>
        <sphereGeometry args={[0.027, 16, 10]} />
        <meshBasicMaterial ref={rightEyeMaterialRef} color="#73dcff" transparent opacity={0.98} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh ref={leftPupilRef} position={[-0.052, 0.028, 0.024]} scale={[0.44, 0.44, 0.2]} renderOrder={22}>
        <sphereGeometry args={[0.027, 16, 10]} />
        <meshBasicMaterial ref={leftPupilMaterialRef} color="#73dcff" transparent opacity={0.88} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh ref={rightPupilRef} position={[0.052, 0.028, 0.024]} scale={[0.44, 0.44, 0.2]} renderOrder={22}>
        <sphereGeometry args={[0.027, 16, 10]} />
        <meshBasicMaterial ref={rightPupilMaterialRef} color="#73dcff" transparent opacity={0.88} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh position={[-0.061, 0.041, 0.03]} scale={[0.28, 0.28, 0.12]} renderOrder={23}>
        <sphereGeometry args={[0.027, 12, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.86} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh position={[0.043, 0.041, 0.03]} scale={[0.28, 0.28, 0.12]} renderOrder={23}>
        <sphereGeometry args={[0.027, 12, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.86} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh ref={leftBrowRef} position={[-0.052, 0.073, 0.02]} scale={[0.86, 1, 1]} renderOrder={21}>
        <planeGeometry args={[0.047, 0.008]} />
        <meshBasicMaterial color="#b8efff" transparent opacity={0.9} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh ref={rightBrowRef} position={[0.052, 0.073, 0.02]} scale={[0.86, 1, 1]} renderOrder={21}>
        <planeGeometry args={[0.047, 0.008]} />
        <meshBasicMaterial color="#b8efff" transparent opacity={0.9} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh ref={leftCheekRef} position={[-0.082, -0.032, 0.018]} scale={[0.75, 0.45, 0.18]} renderOrder={21}>
        <sphereGeometry args={[0.018, 12, 8]} />
        <meshBasicMaterial ref={cheekMaterialRef} color="#73dcff" transparent opacity={0.18} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh ref={rightCheekRef} position={[0.082, -0.032, 0.018]} scale={[0.75, 0.45, 0.18]} renderOrder={21}>
        <sphereGeometry args={[0.018, 12, 8]} />
        <meshBasicMaterial ref={rightCheekMaterialRef} color="#73dcff" transparent opacity={0.18} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh ref={mouthOpenRef} position={[0, -0.054, 0.019]} scale={[0.7, 0.6, 1]} renderOrder={21}>
        <planeGeometry args={[0.037, 0.022]} />
        <meshBasicMaterial ref={mouthOpenMaterialRef} color="#02060b" transparent opacity={0.04} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh ref={mouthRef} position={[0, -0.051, 0.025]} scale={[1, 1, 1]} renderOrder={22}>
        <planeGeometry args={[0.058, 0.008]} />
        <meshBasicMaterial ref={mouthMaterialRef} color="#a9efff" transparent opacity={0.94} depthTest={false} depthWrite={false} />
      </mesh>
    </group>
  );
}
