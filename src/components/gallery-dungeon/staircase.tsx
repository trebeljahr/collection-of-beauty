"use client";

import type { Staircase } from "@/lib/gallery-layout/types";
import { FLOOR_SEPARATION } from "@/lib/gallery-layout/world-coords";
import { Text } from "@react-three/drei";
import * as THREE from "three";
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
const landingMaterial = new THREE.MeshStandardMaterial({
  color: "#2e2118",
  roughness: 0.75,
  metalness: 0.08,
});
const railMaterial = new THREE.MeshStandardMaterial({
  color: "#1f1611",
  roughness: 0.85,
  metalness: 0.05,
});

/** Number of flat steps at each end of the flight. The first
 *  LANDING_STEPS sit at lowerY (entry on-ramp) and the last LANDING_STEPS
 *  sit at upperY (exit off-ramp). The remaining steps in the middle
 *  carry the rise. With numSteps=20 and LANDING_STEPS=2, the rise is
 *  spread across 16 steps ≈ 56 cm per step — comfortable to walk. */
const LANDING_STEPS = 2;

/**
 * Render one spiral flight: central column + fan of wedge steps + an
 * outer ring of handrail posts. The flight rises from `lowerY` at the
 * `entryAngle` to `upperY` after one revolution back to the same
 * angle, with flat landings of LANDING_STEPS wedges at each end so the
 * player can step on/off without lifting onto a riser.
 */
export function StaircaseRenderer({ staircase }: { staircase: Staircase }) {
  const { centerX, centerZ, innerRadius, outerRadius, numSteps, direction, lowerY, upperY } =
    staircase;

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
    const theta = staircase.entryAngle + i * stepAngle * direction;
    const stepTopY = stepTopAt(staircase, i);
    const cx = centerX + Math.cos(theta) * midR;
    const cz = centerZ + Math.sin(theta) * midR;
    const isLanding = i < LANDING_STEPS || i >= numSteps - LANDING_STEPS;
    steps.push(
      <mesh
        key={`step-${i}`}
        position={[cx, stepTopY - stepVerticalThickness / 2, cz]}
        rotation={[0, -theta, 0]}
      >
        <boxGeometry args={[stepDepth, stepVerticalThickness, arcAtMid]} />
        <primitive
          object={isLanding ? landingMaterial : stepMaterial}
          attach="material"
        />
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
    const theta = staircase.entryAngle + i * stepAngle * direction;
    const railY = stepTopAt(staircase, i) + 0.9; // chest-ish above step
    const cx = centerX + Math.cos(theta) * railRadius;
    const cz = centerZ + Math.sin(theta) * railRadius;
    rails.push(
      <mesh key={`rail-${i}`} position={[cx, railY, cz]} rotation={[0, -theta, 0]}>
        <boxGeometry args={[0.08, railHeight, arcAtMid]} />
        <primitive object={railMaterial} attach="material" />
      </mesh>,
    );
  }

  return (
    <group>
      {/* Central column */}
      <mesh position={[centerX, lowerY + columnHeight / 2, centerZ]}>
        <cylinderGeometry args={[innerRadius, innerRadius, columnHeight, 24]} />
        <primitive object={columnMaterial} attach="material" />
      </mesh>

      {steps}
      {rails}

      {/* Destination sign at the bottom of the flight, on the column
          face the player sees as they step onto the on-ramp. */}
      <StairSign
        position={[
          centerX + Math.cos(staircase.entryAngle) * (innerRadius + 0.05),
          lowerY + 2.4,
          centerZ + Math.sin(staircase.entryAngle) * (innerRadius + 0.05),
        ]}
        rotationY={-staircase.entryAngle}
        label={`↑ ${staircase.upperLabel}`}
      />
      {/* …and one at the top, same column, facing the player exiting. */}
      <StairSign
        position={[
          centerX + Math.cos(staircase.entryAngle) * (innerRadius + 0.05),
          upperY + 2.4,
          centerZ + Math.sin(staircase.entryAngle) * (innerRadius + 0.05),
        ]}
        rotationY={-staircase.entryAngle}
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
export function isInsideStair(staircase: Staircase, worldX: number, worldZ: number): boolean {
  const dx = worldX - staircase.centerX;
  const dz = worldZ - staircase.centerZ;
  const r = Math.hypot(dx, dz);
  return r >= staircase.innerRadius && r <= staircase.outerRadius;
}

/**
 * Raw angle-from-entry for a world XZ on the spiral, normalised to
 * [0, 2π). Returns 0 at `entryAngle` and increases in the spiral's
 * walking direction. The Player tracks this delta plus a cumulative
 * angle to disambiguate which "turn" around the column the player is
 * on — a flat angle is otherwise ambiguous (θ=0 at the bottom and at
 * the top of the same flight have identical raw values).
 */
export function spiralRawAngle(staircase: Staircase, worldX: number, worldZ: number): number {
  const dx = worldX - staircase.centerX;
  const dz = worldZ - staircase.centerZ;
  let theta = Math.atan2(dz, dx) - staircase.entryAngle;
  if (staircase.direction === -1) theta = -theta;
  return ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

/** Top Y of step `i` (0-indexed). Steps 0..LANDING_STEPS-1 sit flat at
 *  lowerY (entry on-ramp), steps numSteps-LANDING_STEPS..numSteps-1
 *  sit flat at upperY (exit off-ramp), and the middle steps carry the
 *  rise. Used by both the renderer and `stairHeightAt` so the visual
 *  treads match what the player's feet stand on. */
export function stepTopAt(staircase: Staircase, i: number): number {
  const { numSteps, lowerY, upperY } = staircase;
  if (i < LANDING_STEPS) return lowerY;
  if (i >= numSteps - LANDING_STEPS) return upperY;
  const risingSteps = numSteps - 2 * LANDING_STEPS;
  const k = i - LANDING_STEPS + 1; // 1..risingSteps
  return lowerY + (k / risingSteps) * (upperY - lowerY);
}

/** Y at a normalised cumulative angle. `cumulative` in [0, 2π] —
 *  below 0 clamps to lowerY, above 2π clamps to upperY. Implemented
 *  as a step function so each tread keeps a constant height while the
 *  player's foot is on it; the camera's existing damping smooths the
 *  riser jumps into a continuous climb. */
export function stairHeightAt(staircase: Staircase, cumulativeAngle: number): number {
  const stepAngle = (Math.PI * 2) / staircase.numSteps;
  const i = Math.floor(cumulativeAngle / stepAngle);
  const clamped = Math.max(0, Math.min(staircase.numSteps - 1, i));
  return stepTopAt(staircase, clamped);
}

/** Half-width of the on/off-ramp arc — the angular range around
 *  `entryAngle` where the spiral is at flat landing height and the
 *  player can transition between floor and stair without a step. */
export function landingArcHalf(staircase: Staircase): number {
  const stepAngle = (Math.PI * 2) / staircase.numSteps;
  return LANDING_STEPS * stepAngle;
}

/** True if a raw spiral angle (0..2π relative to entryAngle, as
 *  returned by `spiralRawAngle`) lies within the on-ramp arc on the
 *  lower floor or the off-ramp arc on the upper floor. Used by the
 *  player to gate first-time entry onto the spiral so step 0 always
 *  greets the player at floor height. */
export function isWithinLandingArc(staircase: Staircase, rawAngle: number): boolean {
  const arc = landingArcHalf(staircase);
  // On-ramp at the bottom (raw ≈ 0).
  if (rawAngle <= arc) return true;
  // Off-ramp at the top (raw ≈ 2π).
  if (rawAngle >= Math.PI * 2 - arc) return true;
  return false;
}

// `FLOOR_SEPARATION` is still the canonical per-floor rise — anchor
// its use here so bundlers don't drop the import when only the
// constant's reference matters (spiral geometry derives from
// lower/upperY directly).
void FLOOR_SEPARATION;
