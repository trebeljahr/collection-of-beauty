"use client";

import * as THREE from "three";
import { Text } from "@react-three/drei";
import type { Staircase } from "@/lib/gallery-layout/types";
import { FLOOR_SEPARATION } from "@/lib/gallery-layout/world-coords";
import { signBaseMaterial } from "./palette-materials";

// Shared materials — one "stair vocabulary" for every spiral in the
// building. Allocated once at module load.
const columnMaterial = new THREE.MeshStandardMaterial({
  color: "#2a1d14",
  roughness: 0.8,
  metalness: 0.1,
});
const stepMaterial = new THREE.MeshStandardMaterial({
  color: "#3a2a1f",
  roughness: 0.7,
  metalness: 0.1,
});
const railMaterial = new THREE.MeshStandardMaterial({
  color: "#1f1611",
  roughness: 0.85,
  metalness: 0.05,
});

/**
 * Render one spiral flight: central column + fan of wedge steps + an
 * outer ring of handrail posts. The flight rises from `lowerY` at
 * θ=0 to `upperY` at θ=2π around (centerX, centerZ), one revolution
 * for one storey.
 *
 * Each step is approximated as a thin box oriented tangent to the
 * central column. With SPIRAL_STEPS_PER_FLOOR = 20 that's 18° per
 * step, which is visually smooth enough without needing a custom
 * annular-wedge geometry.
 */
export function StaircaseRenderer({
  staircase,
}: {
  staircase: Staircase;
}) {
  const {
    centerX,
    centerZ,
    innerRadius,
    outerRadius,
    numSteps,
    direction,
    lowerY,
    upperY,
  } = staircase;

  const midR = (innerRadius + outerRadius) / 2;
  const stepDepth = outerRadius - innerRadius; // radial span of the tread
  const stepAngle = (2 * Math.PI) / numSteps;
  // Slight overlap so adjacent steps' boxes don't leave visible gaps
  // at the outer radius. The central column hides any overlap near
  // the inner edge.
  const arcAtMid = stepAngle * midR * 1.05;
  const stepVerticalThickness = 0.5;
  const totalRise = upperY - lowerY;

  // Column slightly taller than the rise so it visually terminates at
  // the floor above instead of the step top.
  const columnHeight = totalRise + 0.6;

  const steps: React.ReactElement[] = [];
  for (let i = 0; i < numSteps; i++) {
    const theta = i * stepAngle * direction;
    const t = i / numSteps;
    const stepTopY = lowerY + t * totalRise + totalRise / numSteps;
    const cx = centerX + Math.cos(theta) * midR;
    const cz = centerZ + Math.sin(theta) * midR;
    steps.push(
      <mesh
        key={`step-${i}`}
        position={[cx, stepTopY - stepVerticalThickness / 2, cz]}
        rotation={[0, -theta, 0]}
      >
        <boxGeometry args={[stepDepth, stepVerticalThickness, arcAtMid]} />
        <primitive object={stepMaterial} attach="material" />
      </mesh>,
    );
  }

  // Outer handrail — a thin ring at chest height, rising smoothly with
  // the spiral. We approximate it as a line of tangent boxes too, one
  // per step, at the outer edge.
  const rails: React.ReactElement[] = [];
  const railRadius = outerRadius - 0.15;
  const railHeight = 1.0;
  for (let i = 0; i < numSteps; i++) {
    const theta = i * stepAngle * direction;
    const t = i / numSteps;
    const railY = lowerY + t * totalRise + 0.9; // chest-ish above step
    const cx = centerX + Math.cos(theta) * railRadius;
    const cz = centerZ + Math.sin(theta) * railRadius;
    rails.push(
      <mesh
        key={`rail-${i}`}
        position={[cx, railY, cz]}
        rotation={[0, -theta, 0]}
      >
        <boxGeometry args={[0.08, railHeight, arcAtMid]} />
        <primitive object={railMaterial} attach="material" />
      </mesh>,
    );
  }

  return (
    <group>
      {/* Central column */}
      <mesh
        position={[centerX, lowerY + columnHeight / 2, centerZ]}
      >
        <cylinderGeometry args={[innerRadius, innerRadius, columnHeight, 24]} />
        <primitive object={columnMaterial} attach="material" />
      </mesh>

      {steps}
      {rails}

      {/* Destination sign at the bottom of the flight — placed on the
          central column at the spiral's entry angle (+X). */}
      <StairSign
        position={[
          centerX + innerRadius + 0.05,
          lowerY + 2.4,
          centerZ,
        ]}
        rotationY={-Math.PI / 2}
        label={`↑ ${staircase.upperLabel}`}
      />
      {/* …and one at the top, same column, facing the player exiting. */}
      <StairSign
        position={[
          centerX + innerRadius + 0.05,
          upperY + 2.4,
          centerZ,
        ]}
        rotationY={-Math.PI / 2}
        label={`↓ ${staircase.lowerLabel}`}
      />
    </group>
  );
}

function StairSign({
  position,
  rotationY,
  label,
}: {
  position: [number, number, number];
  rotationY: number;
  label: string;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh>
        <boxGeometry args={[2.4, 0.5, 0.04]} />
        <primitive object={signBaseMaterial} attach="material" />
      </mesh>
      <Text
        position={[0, 0, 0.03]}
        fontSize={0.24}
        color="#f2e9d0"
        anchorX="center"
        anchorY="middle"
        maxWidth={2.2}
      >
        {label}
      </Text>
    </group>
  );
}

// ── Physics helpers ──────────────────────────────────────────────────
// Convert a world-space (x, z) on the spiral's walking surface into
// either the Y the player's feet should be at, or null (off spiral).
// Consumers of `stairHeightAt` also need to know whether the point is
// even inside the footprint — `isInsideStair` returns that.

/** True if (worldX, worldZ) is within the spiral's walking annulus
 *  (between innerRadius and outerRadius). The central column and the
 *  walkway outside the spiral both return false so they use normal
 *  floor physics. */
export function isInsideStair(
  staircase: Staircase,
  worldX: number,
  worldZ: number,
): boolean {
  const dx = worldX - staircase.centerX;
  const dz = worldZ - staircase.centerZ;
  const r = Math.hypot(dx, dz);
  return r >= staircase.innerRadius && r <= staircase.outerRadius;
}

/**
 * Raw angle-from-entry for a world XZ on the spiral, normalised to
 * [0, 2π). Only meaningful inside the spiral annulus. The Player
 * uses this plus a tracked cumulative-angle to disambiguate which
 * "turn" around the column the player is on — a flat angle is
 * ambiguous (e.g. θ=0 is both the bottom of this flight and the top
 * of the same flight if the player has already walked a full loop).
 */
export function spiralRawAngle(
  staircase: Staircase,
  worldX: number,
  worldZ: number,
): number {
  const dx = worldX - staircase.centerX;
  const dz = worldZ - staircase.centerZ;
  let theta = Math.atan2(dz, dx);
  // Flip sign for clockwise spirals so "walking forward" always
  // corresponds to increasing θ.
  if (staircase.direction === -1) theta = -theta;
  return (theta + Math.PI * 2) % (Math.PI * 2);
}

/** Y at a normalised cumulative angle. `cumulative` in [0, 2π] —
 *  below 0 clamps to lowerY, above 2π clamps to upperY. */
export function stairHeightAt(
  staircase: Staircase,
  cumulativeAngle: number,
): number {
  const t = Math.max(0, Math.min(1, cumulativeAngle / (Math.PI * 2)));
  return staircase.lowerY + t * (staircase.upperY - staircase.lowerY);
}

// `FLOOR_SEPARATION` is still the canonical per-floor rise — anchor
// its use here so bundlers don't drop the import when only the
// constant's reference matters (spiral geometry derives from
// lower/upperY directly).
void FLOOR_SEPARATION;
