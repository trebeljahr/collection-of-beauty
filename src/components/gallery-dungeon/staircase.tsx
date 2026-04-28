"use client";

import { Text } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { Staircase } from "@/lib/gallery-layout/types";
import { signBaseMaterial } from "./palette-materials";

// Shared materials — one "stair vocabulary" for every spiral in the
// building. Allocated once at module load.
const treadMaterial = new THREE.MeshStandardMaterial({
  color: "#3a2a1f",
  roughness: 0.7,
  metalness: 0.1,
});
const railTopMaterial = new THREE.MeshStandardMaterial({
  // Aged brass — visibly metallic but not mirror-bright. Lower
  // metalness + higher roughness than polished brass, so the rail
  // catches highlights without screaming "shiny" at the player.
  color: "#a07a40",
  roughness: 0.55,
  metalness: 0.5,
});
const balusterMaterial = new THREE.MeshStandardMaterial({
  // Dark wrought iron for the verticals — strong contrast against
  // the brass top rail and the warm tread tones, so the railing as
  // a whole reads at a glance.
  color: "#0f0c08",
  roughness: 0.7,
  metalness: 0.4,
});

const TREAD_THICKNESS = 0.16;
const RAIL_HEIGHT = 1.05;
/** Vertical thickness of the rail bar. */
const RAIL_BAR_HEIGHT = 0.1;
/** Radial half-width of the rail bar — gives the rail real volume in
 *  every direction, so it stops reading as a paper strip and starts
 *  reading as a hand rail you could grip. */
const RAIL_BAR_HALF_WIDTH = 0.05;
const BALUSTER_SIZE = 0.07;
/** Step indices skipped on the OUTER rail — the gap is the player's
 *  entry/exit point onto the spiral, centred on the entry direction.
 *  Two steps' worth = ~33°, wide enough to walk through comfortably
 *  without scraping the rail posts on either side. */
const OUTER_RAIL_GAP_STEPS = 2;

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
  const ring = (which: 0 | 1 | 2 | 3, i: number) => which * (segments + 1) + i;

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

/** Merge all the spiral's tread wedges into one BufferGeometry. The
 *  tread tops are placed to match the discrete physics in
 *  `stairHeightAt` exactly: while the player walks the arc of step
 *  `i`, both their feet AND the tread under them sit at
 *  `lowerY + i * stepRise`. Step 0 is flush with the lower floor.
 *  When the player crosses cumulative=2π onto the next stair, that
 *  stair's step 0 is at `upperY`, giving the final +stepRise climb
 *  onto the upper floor with no visual gap or floating tread. */
function buildSpiralStepsGeometry(staircase: Staircase): THREE.BufferGeometry {
  const { innerRadius, outerRadius, numSteps, direction, lowerY, upperY, entryAngle } = staircase;
  const stepAngle = ((Math.PI * 2) / numSteps) * direction;
  const stepRise = (upperY - lowerY) / numSteps;
  const positions: number[] = [];
  const indices: number[] = [];
  const segPerStep = 4;

  for (let i = 0; i < numSteps; i++) {
    const aStart = entryAngle + i * stepAngle;
    const aEnd = entryAngle + (i + 1) * stepAngle;
    const lo = Math.min(aStart, aEnd);
    const hi = Math.max(aStart, aEnd);
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

/** Build a spiral railing as a CLOSED RECTANGULAR TUBE following the
 *  rail path. Each ring sample contributes 4 vertices — TO (top-out),
 *  TI (top-in), BI (bot-in), BO (bot-out) — and adjacent rings are
 *  stitched by 4 longitudinal faces (top, inner, bottom, outer) so
 *  the rail has real 3D volume in every direction. No DoubleSide
 *  hack: the tube is closed, every face has correct outward-facing
 *  normals, lighting is consistent.
 *
 *  Used for both the inner edge (around the open well) and the outer
 *  edge (between treads and the stairwell room). The outer rail
 *  skips a configurable number of steps at the entry direction to
 *  leave a gate for the player to walk onto the spiral. */
function buildSpiralRail(
  staircase: Staircase,
  side: "inner" | "outer",
  gapSteps: number,
): { rail: THREE.BufferGeometry; balusters: Array<[number, number, number]> } {
  const { innerRadius, outerRadius, numSteps, direction, lowerY, upperY, entryAngle } = staircase;
  const stepAngle = ((Math.PI * 2) / numSteps) * direction;
  const stepRise = (upperY - lowerY) / numSteps;
  // Inner rail sits a finger-width INSIDE the inner tread edge so the
  // player at the rim has the rail "in front of" them as they look
  // toward the well. Outer rail sits a finger-width INSIDE the outer
  // tread edge, same idea on the outside face.
  const railR = side === "inner" ? innerRadius + 0.07 : outerRadius - 0.07;
  const balR = side === "inner" ? innerRadius + 0.05 : outerRadius - 0.05;
  const positions: number[] = [];
  const indices: number[] = [];
  const segPerStep = 3;

  // Gap window — gapSteps consecutive step indices centred on the
  // entry angle (i=0). For gapSteps=2: skip step (numSteps−1) and
  // step 0; for gapSteps=1: skip step 0 only.
  const gapAfter = Math.ceil(gapSteps / 2);
  const gapBefore = Math.floor(gapSteps / 2);
  const inGap = (i: number) => gapSteps > 0 && (i < gapAfter || i >= numSteps - gapBefore);

  const balusters: Array<[number, number, number]> = [];
  // Track the start of each contiguous tube segment so we can cap
  // both ends — when a gap interrupts the rail, or when the loop
  // finishes, we close the last open segment with a flat end cap so
  // it doesn't read as an open tube end.
  let segmentStartIdx = -1;
  let prevBaseIdx = -1;

  const closeSegment = () => {
    if (segmentStartIdx === -1 || prevBaseIdx === -1) return;
    if (segmentStartIdx === prevBaseIdx) {
      // Single-sample segment, nothing to cap.
      segmentStartIdx = -1;
      prevBaseIdx = -1;
      return;
    }
    const s = segmentStartIdx;
    const e = prevBaseIdx;
    // Start cap (faces −tangent direction at the segment's first sample).
    indices.push(s + 0, s + 2, s + 1);
    indices.push(s + 0, s + 3, s + 2);
    // End cap (faces +tangent direction at the segment's last sample).
    indices.push(e + 0, e + 1, e + 2);
    indices.push(e + 0, e + 2, e + 3);
    segmentStartIdx = -1;
    prevBaseIdx = -1;
  };

  for (let i = 0; i < numSteps; i++) {
    if (inGap(i)) {
      closeSegment();
      continue;
    }
    const aStart = entryAngle + i * stepAngle;
    const aEnd = entryAngle + (i + 1) * stepAngle;
    const lo = Math.min(aStart, aEnd);
    const hi = Math.max(aStart, aEnd);
    const yTop = lowerY + i * stepRise + RAIL_HEIGHT;
    for (let s = 0; s <= segPerStep; s++) {
      const t = s / segPerStep;
      const theta = lo + (hi - lo) * t;
      const cx = railR * Math.cos(theta);
      const cz = railR * Math.sin(theta);
      // Outward radial unit vector at this angle.
      const ox = Math.cos(theta);
      const oz = Math.sin(theta);

      const baseIdx = positions.length / 3;
      // Vertex layout: 0=TO (top-outer), 1=TI (top-inner),
      //                2=BI (bot-inner), 3=BO (bot-outer).
      positions.push(
        cx + ox * RAIL_BAR_HALF_WIDTH,
        yTop,
        cz + oz * RAIL_BAR_HALF_WIDTH,
      );
      positions.push(
        cx - ox * RAIL_BAR_HALF_WIDTH,
        yTop,
        cz - oz * RAIL_BAR_HALF_WIDTH,
      );
      positions.push(
        cx - ox * RAIL_BAR_HALF_WIDTH,
        yTop - RAIL_BAR_HEIGHT,
        cz - oz * RAIL_BAR_HALF_WIDTH,
      );
      positions.push(
        cx + ox * RAIL_BAR_HALF_WIDTH,
        yTop - RAIL_BAR_HEIGHT,
        cz + oz * RAIL_BAR_HALF_WIDTH,
      );
      if (segmentStartIdx === -1) segmentStartIdx = baseIdx;

      if (prevBaseIdx !== -1) {
        const p = prevBaseIdx;
        const c = baseIdx;
        // Top face (+Y normal).
        indices.push(p + 0, p + 1, c + 1);
        indices.push(p + 0, c + 1, c + 0);
        // Bottom face (−Y normal).
        indices.push(p + 3, c + 3, c + 2);
        indices.push(p + 3, c + 2, p + 2);
        // Outer face (+radial normal).
        indices.push(p + 3, p + 0, c + 0);
        indices.push(p + 3, c + 0, c + 3);
        // Inner face (−radial normal).
        indices.push(p + 2, c + 2, c + 1);
        indices.push(p + 2, c + 1, p + 1);
      }
      prevBaseIdx = baseIdx;
    }
    // One baluster per step at the start angle.
    balusters.push([
      balR * Math.cos(aStart),
      lowerY + i * stepRise + (RAIL_HEIGHT - RAIL_BAR_HEIGHT) / 2,
      balR * Math.sin(aStart),
    ]);
  }
  // Cap the final segment that ran off the loop's end.
  closeSegment();
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return { rail: geom, balusters };
}

/**
 * Render one revolution of the open-well spiral. Treads are real
 * wedge geometry (top, bottom, inner curve, outer curve, riser caps)
 * so each step reads as a step rather than a smoothed ramp. Two
 * railings — one along the inner edge of the open well, one along
 * the outer edge — give the player a clear handhold on either side
 * as they climb. The outer rail has a one-step gap at the entry
 * direction so the player can step onto / off the spiral; the
 * directional signs themselves live on gate posts placed by the
 * stairwell-accents component, where they can sit flush against
 * substantial railing posts at floor level.
 */
export function StaircaseRenderer({ staircase }: { staircase: Staircase }) {
  const { centerX, centerZ } = staircase;

  const stepsGeom = useMemo(() => buildSpiralStepsGeometry(staircase), [staircase]);
  const innerRail = useMemo(() => buildSpiralRail(staircase, "inner", 0), [staircase]);
  const outerRail = useMemo(
    () => buildSpiralRail(staircase, "outer", OUTER_RAIL_GAP_STEPS),
    [staircase],
  );

  return (
    <group position={[centerX, 0, centerZ]}>
      {/* Treads — single merged mesh per stair. */}
      <mesh geometry={stepsGeom} castShadow receiveShadow>
        <primitive object={treadMaterial} attach="material" />
      </mesh>

      {/* Inner railing around the open well. */}
      <mesh geometry={innerRail.rail} castShadow>
        <primitive object={railTopMaterial} attach="material" />
      </mesh>
      {innerRail.balusters.map((p, i) => (
        <mesh key={`in-bal-${i}`} position={p} castShadow>
          <boxGeometry args={[BALUSTER_SIZE, RAIL_HEIGHT, BALUSTER_SIZE]} />
          <primitive object={balusterMaterial} attach="material" />
        </mesh>
      ))}

      {/* Outer railing along the outside of the spiral, with a
          one-step gap at the entry direction. */}
      <mesh geometry={outerRail.rail} castShadow>
        <primitive object={railTopMaterial} attach="material" />
      </mesh>
      {outerRail.balusters.map((p, i) => (
        <mesh key={`out-bal-${i}`} position={p} castShadow>
          <boxGeometry args={[BALUSTER_SIZE, RAIL_HEIGHT, BALUSTER_SIZE]} />
          <primitive object={balusterMaterial} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/** Sign panel for use on gate posts — exposed so the stairwell-accents
 *  component can mount them on the cutout-edge railing rather than on
 *  floating posts inside the stair. */
export function StairSign({
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
      {/* Sign plaque fits within the gate-post panel (0.85 m wide)
          so post + sign read as one architectural unit, not a + cross.
          Slightly taller than before to give the wrapped era titles
          room to breathe across two lines. */}
      <mesh>
        <boxGeometry args={[0.78, 0.42, 0.025]} />
        <primitive object={signBaseMaterial} attach="material" />
      </mesh>
      <Text
        position={[0, 0, 0.014]}
        fontSize={0.1}
        color="#f2e9d0"
        anchorX="center"
        anchorY="middle"
        textAlign="center"
        lineHeight={1.15}
        maxWidth={0.7}
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
 *  stair. Continuous along the spiral so on/off ramping is smooth and
 *  flush with the floor at both ends — at cumulative=0 the player is
 *  exactly on lowerY (= the floor below), at cumulative=2π exactly on
 *  upperY (= the floor above), with a continuous climb between. The
 *  visual rendered treads at lowerY + i*stepRise sit *under* the
 *  player while they walk that tread's arc; the top of that tread is
 *  the moving goal as they cross it. */
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
