"use client";

import { createRef, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

export type RobotArmRig = {
  shoulder: THREE.Group;
  forearm: THREE.Group;
  hand: THREE.Group;
  fingers: THREE.Group[];
};

export type RobotLegRig = {
  hip: THREE.Group;
  knee: THREE.Group;
  foot: THREE.Group;
};

export type RobotRig = {
  root: THREE.Group;
  pelvis: THREE.Group;
  torso: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  arms: { left: RobotArmRig; right: RobotArmRig };
  legs: { left: RobotLegRig; right: RobotLegRig };
};

const shell = "#dce8f4";
const shellShade = "#9fb4cb";
const trim = "#273b5a";
const dark = "#07111f";
const cyan = "#69e8ff";
const violet = "#8b7dff";
const joint = "#537293";

function material(color: string, metalness = 0.2, roughness = 0.38) {
  return <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />;
}

function Finger({ fingerRef, side, index }: { fingerRef: React.RefObject<THREE.Group | null>; side: -1 | 1; index: number }) {
  const x = side * (0.025 + index * 0.014);
  return (
    <group ref={fingerRef} position={[x, -0.065, 0.025]}>
      <mesh position={[0, -0.025, 0]} scale={[0.012, 0.04, 0.014]}>
        <sphereGeometry args={[1, 12, 8]} />
        {material(shellShade, 0.18, 0.42)}
      </mesh>
      <mesh position={[0, -0.067, 0]} scale={[0.011, 0.028, 0.013]}>
        <sphereGeometry args={[1, 12, 8]} />
        {material(shell, 0.18, 0.42)}
      </mesh>
    </group>
  );
}

function Arm({ side, shoulderRef, forearmRef, handRef, fingerRefs }: { side: -1 | 1; shoulderRef: React.RefObject<THREE.Group | null>; forearmRef: React.RefObject<THREE.Group | null>; handRef: React.RefObject<THREE.Group | null>; fingerRefs: React.RefObject<THREE.Group | null>[] }) {
  return (
    <group ref={shoulderRef} position={[side * 0.265, 0.69, 0]}>
      <mesh position={[0, -0.115, 0]} scale={[0.075, 0.14, 0.075]}>
        <sphereGeometry args={[1, 20, 14]} />
        {material(shell, 0.25, 0.34)}
      </mesh>
      <mesh position={[0, -0.16, 0.015]} scale={[0.045, 0.075, 0.055]}>
        <sphereGeometry args={[1, 16, 10]} />
        {material(trim, 0.45, 0.27)}
      </mesh>
      <mesh position={[0, -0.02, 0]} scale={[0.09, 0.07, 0.09]}>
        <sphereGeometry args={[1, 18, 12]} />
        {material(joint, 0.55, 0.25)}
      </mesh>
      <group ref={forearmRef} position={[0, -0.235, 0]}>
        <mesh position={[0, -0.105, 0]} scale={[0.065, 0.13, 0.065]}>
          <sphereGeometry args={[1, 20, 14]} />
          {material(shellShade, 0.25, 0.36)}
        </mesh>
        <mesh position={[0, -0.215, 0]} scale={[0.07, 0.045, 0.07]}>
          <sphereGeometry args={[1, 18, 12]} />
          {material(joint, 0.55, 0.25)}
        </mesh>
        <group ref={handRef} position={[0, -0.275, 0]}>
          <mesh scale={[0.075, 0.09, 0.065]}>
            <sphereGeometry args={[1, 20, 14]} />
            {material(shell, 0.25, 0.34)}
          </mesh>
          {fingerRefs.map((fingerRef, index) => <Finger key={index} fingerRef={fingerRef} side={side} index={index} />)}
        </group>
      </group>
    </group>
  );
}

function Leg({ side, hipRef, kneeRef, footRef }: { side: -1 | 1; hipRef: React.RefObject<THREE.Group | null>; kneeRef: React.RefObject<THREE.Group | null>; footRef: React.RefObject<THREE.Group | null> }) {
  return (
    <group ref={hipRef} position={[side * 0.115, 0.35, 0]}>
      <mesh position={[0, -0.12, 0]} scale={[0.095, 0.14, 0.1]}>
        <sphereGeometry args={[1, 20, 14]} />
        {material(shell, 0.25, 0.36)}
      </mesh>
      <group ref={kneeRef} position={[0, -0.255, 0]}>
        <mesh position={[0, -0.105, 0]} scale={[0.08, 0.13, 0.085]}>
          <sphereGeometry args={[1, 20, 14]} />
          {material(shellShade, 0.25, 0.38)}
        </mesh>
        <mesh position={[0, -0.21, 0.012]} scale={[0.07, 0.045, 0.065]}>
          <sphereGeometry args={[1, 18, 12]} />
          {material(joint, 0.55, 0.25)}
        </mesh>
        <group ref={footRef} position={[0, -0.29, 0.035]}>
          <mesh scale={[0.12, 0.06, 0.16]}>
            <sphereGeometry args={[1, 20, 14]} />
            {material(trim, 0.5, 0.28)}
          </mesh>
          <mesh position={[0, 0.025, 0.055]} scale={[0.085, 0.018, 0.07]}>
            <boxGeometry args={[1, 1, 1]} />
            {material(cyan, 0.25, 0.24)}
          </mesh>
        </group>
      </group>
    </group>
  );
}

export default function RobotRig({ onReady, scale = 0.7 }: { onReady: (rig: RobotRig | null) => void; scale?: number }) {
  const rootRef = useRef<THREE.Group>(null);
  const pelvisRef = useRef<THREE.Group>(null);
  const torsoRef = useRef<THREE.Group>(null);
  const neckRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const leftShoulderRef = useRef<THREE.Group>(null);
  const rightShoulderRef = useRef<THREE.Group>(null);
  const leftForearmRef = useRef<THREE.Group>(null);
  const rightForearmRef = useRef<THREE.Group>(null);
  const leftHandRef = useRef<THREE.Group>(null);
  const rightHandRef = useRef<THREE.Group>(null);
  const leftHipRef = useRef<THREE.Group>(null);
  const rightHipRef = useRef<THREE.Group>(null);
  const leftKneeRef = useRef<THREE.Group>(null);
  const rightKneeRef = useRef<THREE.Group>(null);
  const leftFootRef = useRef<THREE.Group>(null);
  const rightFootRef = useRef<THREE.Group>(null);
  const leftFingerRefs = useMemo(() => Array.from({ length: 5 }, () => createRef<THREE.Group>()), []);
  const rightFingerRefs = useMemo(() => Array.from({ length: 5 }, () => createRef<THREE.Group>()), []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const pelvis = pelvisRef.current;
    const torso = torsoRef.current;
    const neck = neckRef.current;
    const head = headRef.current;
    const leftShoulder = leftShoulderRef.current;
    const rightShoulder = rightShoulderRef.current;
    const leftForearm = leftForearmRef.current;
    const rightForearm = rightForearmRef.current;
    const leftHand = leftHandRef.current;
    const rightHand = rightHandRef.current;
    const leftHip = leftHipRef.current;
    const rightHip = rightHipRef.current;
    const leftKnee = leftKneeRef.current;
    const rightKnee = rightKneeRef.current;
    const leftFoot = leftFootRef.current;
    const rightFoot = rightFootRef.current;
    const leftFingers = leftFingerRefs.map((ref) => ref.current).filter((value): value is THREE.Group => Boolean(value));
    const rightFingers = rightFingerRefs.map((ref) => ref.current).filter((value): value is THREE.Group => Boolean(value));
    if (!root || !pelvis || !torso || !neck || !head || !leftShoulder || !rightShoulder || !leftForearm || !rightForearm || !leftHand || !rightHand || !leftHip || !rightHip || !leftKnee || !rightKnee || !leftFoot || !rightFoot) return;
    onReady({
      root,
      pelvis,
      torso,
      neck,
      head,
      arms: {
        left: { shoulder: leftShoulder, forearm: leftForearm, hand: leftHand, fingers: leftFingers },
        right: { shoulder: rightShoulder, forearm: rightForearm, hand: rightHand, fingers: rightFingers },
      },
      legs: {
        left: { hip: leftHip, knee: leftKnee, foot: leftFoot },
        right: { hip: rightHip, knee: rightKnee, foot: rightFoot },
    },
    });
    return () => onReady(null);
  }, [leftFingerRefs, onReady, rightFingerRefs]);

  return (
    <group ref={rootRef} scale={scale}>
      <group ref={pelvisRef} position={[0, 0.35, 0]}>
        <mesh scale={[0.22, 0.12, 0.15]}>
          <sphereGeometry args={[1, 24, 16]} />
          {material(trim, 0.45, 0.3)}
        </mesh>
        <mesh position={[0, 0.02, 0.13]} scale={[0.09, 0.045, 0.02]}>
          <boxGeometry args={[1, 1, 1]} />
          {material(violet, 0.35, 0.24)}
        </mesh>
      </group>
      <group ref={torsoRef} position={[0, 0.58, 0]}>
        <mesh scale={[0.27, 0.3, 0.17]}>
          <sphereGeometry args={[1, 28, 20]} />
          {material(shell, 0.3, 0.32)}
        </mesh>
        <mesh position={[0, 0.015, 0.17]} scale={[0.14, 0.12, 0.018]}>
          <sphereGeometry args={[1, 20, 12]} />
          {material(dark, 0.2, 0.24)}
        </mesh>
        <mesh position={[0, 0.02, 0.19]} scale={[0.045, 0.04, 0.008]}>
          <sphereGeometry args={[1, 16, 10]} />
          {material(cyan, 0.45, 0.2)}
        </mesh>
        <mesh position={[0, -0.12, 0.155]} scale={[0.17, 0.025, 0.015]}>
          <boxGeometry args={[1, 1, 1]} />
          {material(trim, 0.5, 0.27)}
        </mesh>
      </group>
      <group ref={neckRef} position={[0, 0.82, 0]}>
        <mesh scale={[0.09, 0.08, 0.09]}>
          <sphereGeometry args={[1, 18, 12]} />
          {material(joint, 0.55, 0.25)}
        </mesh>
        <group ref={headRef} position={[0, 0.17, 0]}>
          <mesh scale={[0.27, 0.21, 0.22]}>
            <sphereGeometry args={[1, 32, 22]} />
            {material(shell, 0.28, 0.3)}
          </mesh>
          <mesh position={[0, 0.01, 0.205]} scale={[0.22, 0.135, 0.025]}>
            <sphereGeometry args={[1, 28, 18]} />
            {material(dark, 0.35, 0.2)}
          </mesh>
          <mesh position={[0, -0.13, 0.18]} scale={[0.15, 0.025, 0.018]}>
            <boxGeometry args={[1, 1, 1]} />
            {material(trim, 0.5, 0.25)}
          </mesh>
        </group>
      </group>
      <Arm side={-1} shoulderRef={leftShoulderRef} forearmRef={leftForearmRef} handRef={leftHandRef} fingerRefs={leftFingerRefs} />
      <Arm side={1} shoulderRef={rightShoulderRef} forearmRef={rightForearmRef} handRef={rightHandRef} fingerRefs={rightFingerRefs} />
      <Leg side={-1} hipRef={leftHipRef} kneeRef={leftKneeRef} footRef={leftFootRef} />
      <Leg side={1} hipRef={rightHipRef} kneeRef={rightKneeRef} footRef={rightFootRef} />
    </group>
  );
}
