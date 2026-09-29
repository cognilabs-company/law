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
};

const FACE_STYLES: Record<RobotExpression, FaceStyle> = {
  default: { color: "#69e8ff", mouthColor: "#b9f5ff", eyeScaleX: 1, eyeScaleY: 1, eyeX: 0, eyeY: 0, mouthWidth: 1, mouthOpen: 0.05, mouthRotation: 0, browTilt: 0 },
  happy: { color: "#72ffc3", mouthColor: "#e3fff4", eyeScaleX: 0.94, eyeScaleY: 0.72, eyeX: 0, eyeY: -0.005, mouthWidth: 1.25, mouthOpen: 0.36, mouthRotation: 0, browTilt: -0.12 },
  curious: { color: "#ffd86f", mouthColor: "#fff1ad", eyeScaleX: 1.08, eyeScaleY: 1.12, eyeX: 0.01, eyeY: 0.008, mouthWidth: 0.82, mouthOpen: 0.2, mouthRotation: -0.08, browTilt: 0.24 },
  thinking: { color: "#c3a8ff", mouthColor: "#eadfff", eyeScaleX: 0.9, eyeScaleY: 0.92, eyeX: 0.012, eyeY: 0.014, mouthWidth: 0.7, mouthOpen: 0.08, mouthRotation: 0.13, browTilt: 0.18 },
  surprised: { color: "#8ae8ff", mouthColor: "#d7f8ff", eyeScaleX: 1.18, eyeScaleY: 1.22, eyeX: 0, eyeY: 0.006, mouthWidth: 0.64, mouthOpen: 0.84, mouthRotation: 0, browTilt: 0.32 },
  blink: { color: "#79ddff", mouthColor: "#b7efff", eyeScaleX: 1.02, eyeScaleY: 1, eyeX: 0, eyeY: 0, mouthWidth: 1, mouthOpen: 0.05, mouthRotation: 0, browTilt: 0 },
  error: { color: "#ff7696", mouthColor: "#ffc4d1", eyeScaleX: 0.92, eyeScaleY: 0.7, eyeX: -0.006, eyeY: -0.004, mouthWidth: 0.78, mouthOpen: 0.02, mouthRotation: 0.2, browTilt: -0.3 },
  success: { color: "#73ff95", mouthColor: "#d0ffda", eyeScaleX: 0.96, eyeScaleY: 0.86, eyeX: 0, eyeY: 0, mouthWidth: 1.18, mouthOpen: 0.48, mouthRotation: 0, browTilt: -0.18 },
};

export default function RobotFace({ head, expression }: { head?: THREE.Object3D; expression: RobotExpression }) {
  const groupRef = useRef<THREE.Group>(null);
  const leftEyeRef = useRef<THREE.Mesh>(null);
  const rightEyeRef = useRef<THREE.Mesh>(null);
  const leftPupilRef = useRef<THREE.Mesh>(null);
  const rightPupilRef = useRef<THREE.Mesh>(null);
  const leftBrowRef = useRef<THREE.Mesh>(null);
  const rightBrowRef = useRef<THREE.Mesh>(null);
  const mouthRef = useRef<THREE.Mesh>(null);
  const mouthOpenRef = useRef<THREE.Mesh>(null);
  const leftEyeMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const rightEyeMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const leftPupilMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const rightPupilMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const mouthMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const mouthOpenMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const blinkPhaseRef = useRef(0);
  const nextBlinkRef = useRef(3.2);

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
      leftPupilRef.current.position.x = THREE.MathUtils.lerp(leftPupilRef.current.position.x, -0.078 + style.eyeX, smooth);
      leftPupilRef.current.position.y = THREE.MathUtils.lerp(leftPupilRef.current.position.y, 0.022 + style.eyeY, smooth);
      leftPupilRef.current.scale.y = THREE.MathUtils.lerp(leftPupilRef.current.scale.y, Math.max(0.15, 1 - blinkAmount), smooth);
    }
    if (rightPupilRef.current) {
      rightPupilRef.current.position.x = THREE.MathUtils.lerp(rightPupilRef.current.position.x, 0.078 + style.eyeX, smooth);
      rightPupilRef.current.position.y = THREE.MathUtils.lerp(rightPupilRef.current.position.y, 0.022 + style.eyeY, smooth);
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
    leftEyeMaterialRef.current?.color.set(style.color);
    rightEyeMaterialRef.current?.color.set(style.color);
    leftPupilMaterialRef.current?.color.set(style.color);
    rightPupilMaterialRef.current?.color.set(style.color);
    mouthMaterialRef.current?.color.set(style.mouthColor);
  });

  return (
    <group ref={groupRef} position={[0, 0.01, 0.235]} renderOrder={20} frustumCulled={false}>
      <mesh renderOrder={20}>
        <planeGeometry args={[0.36, 0.18]} />
        <meshBasicMaterial color="#06101e" transparent opacity={0.98} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh ref={leftEyeRef} position={[-0.078, 0.022, 0.018]} renderOrder={21}>
        <sphereGeometry args={[0.037, 20, 12]} />
        <meshBasicMaterial ref={leftEyeMaterialRef} color="#69e8ff" transparent opacity={0.98} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh ref={rightEyeRef} position={[0.078, 0.022, 0.018]} renderOrder={21}>
        <sphereGeometry args={[0.037, 20, 12]} />
        <meshBasicMaterial ref={rightEyeMaterialRef} color="#69e8ff" transparent opacity={0.98} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh ref={leftPupilRef} position={[-0.078, 0.022, 0.024]} scale={[0.42, 0.42, 0.2]} renderOrder={22}>
        <sphereGeometry args={[0.037, 20, 12]} />
        <meshBasicMaterial ref={leftPupilMaterialRef} color="#69e8ff" transparent opacity={0.88} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh ref={rightPupilRef} position={[0.078, 0.022, 0.024]} scale={[0.42, 0.42, 0.2]} renderOrder={22}>
        <sphereGeometry args={[0.037, 20, 12]} />
        <meshBasicMaterial ref={rightPupilMaterialRef} color="#69e8ff" transparent opacity={0.88} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh ref={leftBrowRef} position={[-0.078, 0.073, 0.02]} scale={[0.86, 1, 1]} renderOrder={21}>
        <planeGeometry args={[0.065, 0.009]} />
        <meshBasicMaterial color="#b8efff" transparent opacity={0.9} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh ref={rightBrowRef} position={[0.078, 0.073, 0.02]} scale={[0.86, 1, 1]} renderOrder={21}>
        <planeGeometry args={[0.065, 0.009]} />
        <meshBasicMaterial color="#b8efff" transparent opacity={0.9} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh ref={mouthOpenRef} position={[0, -0.055, 0.019]} scale={[0.72, 0.6, 1]} renderOrder={21}>
        <planeGeometry args={[0.052, 0.026]} />
        <meshBasicMaterial ref={mouthOpenMaterialRef} color="#02060b" transparent opacity={0.04} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh ref={mouthRef} position={[0, -0.052, 0.025]} renderOrder={22}>
        <planeGeometry args={[0.08, 0.009]} />
        <meshBasicMaterial ref={mouthMaterialRef} color="#b9f5ff" transparent opacity={0.94} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
      </mesh>
    </group>
  );
}
