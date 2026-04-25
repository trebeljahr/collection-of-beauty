"use client";

import type { Staircase } from "@/lib/gallery-layout/types";
import { Text } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { signBaseMaterial } from "./palette-materials";

// Shared materials — one "stair vocabulary" for every spiral in the
// building. Allocated once at module load.
const treadMaterial = new THREE.MeshStandardMaterial({
  color: "#3a2a1f",
  roughness: 0.7,
  metalness: 0.1,
});
const newelMaterial = new THREE.MeshStandardMaterial({
  color: "#1f1611",
  roughness: 0.9,
  metalness: 0.05,
});
const railTopMaterial = new THREE.MeshStandardMaterial({
  color: "#2a1d14",
  roughness: 0.6,
  metalness: 0.15,
});
const balusterMaterial = new THREE.MeshStandardMaterial({
  color: "#1a1108",
  roughness: 0.85,
  metalness: 0.05,
});

const TREAD_THICKNESS = 0.16;
const NEWEL_HEIGHT = 2.2;
const NEWEL_SIZE = 0.32;
const RAIL_HEIGHT = 1.0;
const BALUSTER_SIZE = 0.05;

/**
 * Build a single spiral tread as an explicit BufferGeometry (annulus
 * sector wedge). The tread's TOP face sits at world Y = `topY`; the
 * bottom is `topY - TREAD_THICKNESS`. Angles are in atan2 convention
 * (atan2(dz, dx)) so x = r*cos(θ), z = r*sin(θ) maps directly.
 *
 * Triangulation produces:
 *  - top + bottom annular faces
 *  - inner + outer curved faces (visible from the well / outside)
 *  - two radial side caps that double as risers between adjacent steps
 */
function buildTreadGeometry(
  innerR: number,
  outerR: number,
  thetaStart: number,
  thetaEnd: number,
  topY: number,
  thickness: number,
  segments: number,
): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  const indices: number[] = [];
  const ring = (which: 0 | 1 | 2 | 3, i: number) =>
    which * (segments + 1) + i;

  const bottomY = topY - thickness;
  // 4 rings × (segments+1) verts: ib, it, ob, ot.
  for (const [r, y] of [
    [innerR, bottomY],
    [innerR, topY],
    [outerR, bottomY],
    [outerR, topY],
  ] as const) {
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const theta = thetaStart + (thetaEnd - thetaStart) * t;
      positions.push(r * Math.cos(theta), y, r * Math.sin(theta));
    }
  }

  // Top (CCW from above looking down -Y).
  for (let i = 0; i < segments; i++) {
    indices.push(ring(1, i), ring(3, i), ring(1, i + 1));
    indices.push(ring(1, i + 1), ring(3, i), ring(3, i + 1));
  }
  // Bottom (CCW from below).
  for (let i = 0; i < segments; i++) {
    indices.push(ring(0, i), ring(0, i + 1), ring(2, i));
    indices.push(ring(0, i + 1), ring(2, i + 1), ring(2, i));
  }
  // Inner curved face (faces toward the well).
  for (let i = 0; i < segments; i++) {
    indices.push(ring(0, i + 1), ring(0, i), ring(1, i));
    indices.push(ring(0, i + 1), ring(1, i), ring(1, i + 1));
  }
  // Outer curved face.
  for (let i = 0; i < segments; i++) {
    indices.push(ring(2, i), ring(2, i + 1), ring(3, i));
    indices.push(ring(2, i + 1), ring(3, i + 1), ring(3, i));
  }
  // Radial cap at thetaStart (also serves as the riser of THIS step,
  // visible to a player approaching from the previous tread).
  indices.push(ring(0, 0), ring(1, 0), ring(2, 0));
  indices.push(ring(1, 0), ring(3, 0), ring(2, 0));
  // Radial cap at thetaEnd.
  indices.push(ring(0, segments), ring(2, segments), ring(1, segments));
  indices.push(ring(1, segments), ring(2, segments), ring(3, segments));

  return { positions, indices };
}

/** Merge all the spiral's tread wedges into one BufferGeometry. */
function buildSpiralStepsGeometry(
  staircase: Staircase,
): THREE.BufferGeometry {
  const { innerRadius, outerRadius, numSteps, direction, lowerY, upperY, entryAngle } =
    staircase;
  const stepAngle = ((Math.PI * 2) / numSteps) * direction;
  // Each tread's top sits at lowerY + i * stepRise so step 0 is flush
  // with the lower floor and the last step (numSteps-1) lands the
  // player on upperY exactly when they cross to the next stair (where
  // step 0 is again flush with upperY).
  const stepRise = (upperY - lowerY) / numSteps;
  const positions: number[] = [];
  const indices: number[] = [];
  const segPerStep = 4;

  for (let i = 0; i < numSteps; i++) {
    const aStart = entryAngle + i * stepAngle;
    const aEnd = entryAngle + (i + 1) * stepAngle;
    // ExtrudeGeometry needs aStart < aEnd; if direction is -1 swap.
    const lo = Math.min(aStart, aEnd);
    const hi = Math.max(aStart, aEnd);
    // Step `i` top sits at the i-th rise above the lower floor. Step 0
    // tread is at lowerY (the on-ramp). Step (numSteps-1) tread is at
    // upperY - stepRise; the next stair's step 0 is at upperY, giving
    // a clean continuous climb across the transition.
    const topY = lowerY + i * stepRise;
    const { positions: p, indices: idx } = buildTreadGeometry(
      innerRadius,
      outerRadius,
      lo,
      hi,
      topY,
      TREAD_THICKNESS,
      segPerStep,
    );
    const base = positions.length / 3;
    for (let k = 0; k < p.length; k++) positions.push(p[k]);
    for (let k = 0; k < idx.length; k++) indices.push(idx[k] + base);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/** Inner railing around the open well — a continuous top rail with
 *  vertical balusters at each step. Inner radius slightly outside the
 *  well so the rail doesn't z-fight with the tread inner face. */
function buildInnerRail(
  staircase: Staircase,
): { rail: THREE.BufferGeometry; balusters: Array<[number, number, number]> } {
  const { innerRadius, numSteps, direction, lowerY, upperY, entryAngle } = staircase;
  const stepAngle = ((Math.PI * 2) / numSteps) * direction;
  const stepRise = (upperY - lowerY) / numSteps;
  const railR = innerRadius + 0.06;
  const positions: number[] = [];
  const indices: number[] = [];
  const segPerStep = 3;
  const railThickness = 0.06;

  // Build a thin ribbon along the rail path. Two control points per
  // sample (one at top of rail, one slightly below) form a quad strip.
  let ringIdx = 0;
  const balusters: Array<[number, number, number]> = [];
  for (let i = 0; i < numSteps; i++) {
    const aStart = entryAngle + i * stepAngle;
    const aEnd = entryAngle + (i + 1) * stepAngle;
    const lo = Math.min(aStart, aEnd);
    const hi = Math.max(aStart, aEnd);
    const yTop = lowerY + i * stepRise + RAIL_HEIGHT;
    for (let s = 0; s <= segPerStep; s++) {
      const t = s / segPerStep;
      const theta = lo + (hi - lo) * t;
      const x = railR * Math.cos(theta);
      const z = railR * Math.sin(theta);
      positions.push(x, yTop, z);
      positions.push(x, yTop - railThickness, z);
      if (i + s > 0) {
        const a = (ringIdx - 1) * 2;
        const b = ringIdx * 2;
        indices.push(a, b, a + 1);
        indices.push(a + 1, b, b + 1);
      }
      ringIdx++;
    }
    // One baluster per step at the start angle.
    const balR = innerRadius + 0.04;
    const balTheta = aStart;
    balusters.push([
      balR * Math.cos(balTheta),
      lowerY + i * stepRise + (RAIL_HEIGHT - railThickness) / 2,
      balR * Math.sin(balTheta),
    ]);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return { rail: geom, balusters };
}

/**
 * Render one revolution of the open-well spiral. Steps are real wedge
 * geometry (top, bottom, inner curve, outer curve, riser caps) so each
 * tread reads as a step rather than a smoothed ramp. A continuous top
 * rail follows the inner edge of the spiral with a baluster per step.
 * Newel posts at the entry angle anchor the bottom and top to the
 * floor + ceiling and carry the directional sign.
 */
export function StaircaseRenderer({ staircase }: { staircase: Staircase }) {
  const { centerX, centerZ, innerRadius, outerRadius, lowerY, upperY, entryAngle } =
    staircase;

  const stepsGeom = useMemo(() => buildSpiralStepsGeometry(staircase), [staircase]);
  const railData = useMemo(() => buildInnerRail(staircase), [staircase]);

  // Newel posts at the entry direction, just outside the outer tread
  // radius. They anchor the spiral to the floor (visually, by going
  // floor → 2 m up) and carry the wall-mounted direction sign.
  const newelR = outerRadius + NEWEL_SIZE / 2 + 0.05;
  const newelX = newelR * Math.cos(entryAngle);
  const newelZ = newelR * Math.sin(entryAngle);

  // Sign sits flush against the OUTWARD-facing face of the newel
  // post — the side a player approaching from outside the spiral will
  // see first. We want the sign's normal (default +Z) to point in the
  // entry direction, i.e. outward from the spiral centre. The Y
  // rotation that maps +Z onto (cos(entryAngle), 0, sin(entryAngle))
  // is θ = π/2 − entryAngle.
  const signRotY = Math.PI / 2 - entryAngle;
  const signOffset = NEWEL_SIZE / 2 + 0.012;
  const signX = newelX + Math.cos(entryAngle) * signOffset;
  const signZ = newelZ + Math.sin(entryAngle) * signOffset;

  return (
    <group position={[centerX, 0, centerZ]}>
      {/* Treads — single merged mesh per stair. */}
      <mesh geometry={stepsGeom} castShadow receiveShadow>
        <primitive object={treadMaterial} attach="material" />
      </mesh>

      {/* Inner railing around the open well. */}
      <mesh geometry={railData.rail}>
        <primitive object={railTopMaterial} attach="material" />
      </mesh>
      {railData.balusters.map((p, i) => (
        <mesh key={`bal-${i}`} position={p}>
          <boxGeometry args={[BALUSTER_SIZE, RAIL_HEIGHT, BALUSTER_SIZE]} />
          <primitive object={balusterMaterial} attach="material" />
        </mesh>
      ))}

      {/* Lower newel post + sign. The sign carries an arrow pointing
          up the spiral — the player walking toward the entry sees it
          face-on. */}
      <mesh position={[newelX, lowerY + NEWEL_HEIGHT / 2, newelZ]}>
        <boxGeometry args={[NEWEL_SIZE, NEWEL_HEIGHT, NEWEL_SIZE]} />
        <primitive object={newelMaterial} attach="material" />
      </mesh>
      <StairSign
        position={[signX, lowerY + 1.65, signZ]}
        rotationY={signRotY}
        label={`↑ ${staircase.upperLabel}`}
      />

      {/* Upper newel post + sign — sits at the same XZ as the lower
          one, one storey higher. */}
      <mesh position={[newelX, upperY + NEWEL_HEIGHT / 2, newelZ]}>
        <boxGeometry args={[NEWEL_SIZE, NEWEL_HEIGHT, NEWEL_SIZE]} />
        <primitive object={newelMaterial} attach="material" />
      </mesh>
      <StairSign
        position={[signX, upperY + 1.65, signZ]}
        rotationY={signRotY}
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
        <boxGeometry args={[1.4, 0.32, 0.02]} />
        <primitive object={signBaseMaterial} attach="material" />
      </mesh>
      <Text
        position={[0, 0, 0.012]}
        fontSize={0.14}
        color="#f2e9d0"
        anchorX="center"
        anchorY="middle"
        maxWidth={1.3}
      >
        {label}
      </Text>
    </group>
  );
}

// ── Physics helpers ──────────────────────────────────────────────────

/** True if (worldX, worldZ) sits inside the spiral's walking annulus
 *  (between innerRadius and outerRadius). Outside the annulus uses
 *  normal floor physics. */
export function isInsideStair(stair: Staircase, worldX: number, worldZ: number): boolean {
  const dx = worldX - stair.centerX;
  const dz = worldZ - stair.centerZ;
  const r2 = dx * dx + dz * dz;
  return r2 >= stair.innerRadius * stair.innerRadius && r2 <= stair.outerRadius * stair.outerRadius;
}

/** Normalised raw angle around the spiral, measured from `entryAngle`
 *  in the spiral's walking direction. Returns a value in [0, 2π);
 *  step `i` occupies [i*stepAngle, (i+1)*stepAngle]. */
export function spiralRawAngle(stair: Staircase, worldX: number, worldZ: number): number {
  const dx = worldX - stair.centerX;
  const dz = worldZ - stair.centerZ;
  let theta = Math.atan2(dz, dx) - stair.entryAngle;
  if (stair.direction === -1) theta = -theta;
  return ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

/** Y the player's feet should sit at given a cumulative angle on this
 *  stair. Cumulative ∈ [0, 2π]; clamped outside that. The Y is
 *  continuous, no step jumps — the camera damp + the visible riser
 *  geometry give the staircase its stepped feel. */
export function stairHeightAt(stair: Staircase, cumulativeAngle: number): number {
  const t = Math.max(0, Math.min(1, cumulativeAngle / (Math.PI * 2)));
  return stair.lowerY + t * (stair.upperY - stair.lowerY);
}

/** Find the stair connected above this one (its upperFloor matches
 *  the next stair's lowerFloor) — used when the player walks past the
 *  top of one revolution and continues into the next storey's flight. */
export function findStairAbove(
  staircase: Staircase,
  all: readonly Staircase[],
): Staircase | undefined {
  return all.find((s) => s.lowerFloor === staircase.upperFloor);
}

/** Mirror of findStairAbove for descent. */
export function findStairBelow(
  staircase: Staircase,
  all: readonly Staircase[],
): Staircase | undefined {
  return all.find((s) => s.upperFloor === staircase.lowerFloor);
}
