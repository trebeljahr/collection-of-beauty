"use client";

import * as THREE from "three";
import type { Staircase } from "@/lib/gallery-layout/types";
import { CELL_SIZE, FLOOR_SEPARATION } from "@/lib/gallery-layout/world-coords";

/**
 * Render a straight flight of stairs connecting two floors. The stair's
 * entryRect/exitRect live in world space; we build 12 stacked boxes
 * spanning them, plus thin rail walls along each side.
 *
 * Player physics reads the stair as a diagonal surface — see
 * `stairHeightAt` below, which tells the Player how high the ground is
 * at any (x, z) inside the stair footprint.
 */
export function StaircaseRenderer({
  staircase,
}: {
  staircase: Staircase;
}) {
  const { entryRect, exitRect, steps } = staircase;
  const width = entryRect.xMax - entryRect.xMin;
  const runStart = entryRect.zMin;
  const runEnd = exitRect.zMax;
  const totalRun = runEnd - runStart;
  const stepRun = totalRun / steps.length;
  const stepRise = FLOOR_SEPARATION / steps.length;
  const cx = (entryRect.xMin + entryRect.xMax) / 2;

  return (
    <group>
      {/* Each "step" is a box whose top face is at the walked Y. */}
      {steps.map((s, i) => {
        const stepCenterZ = runStart + (i + 0.5) * stepRun;
        const stepTopY = s.y;
        // Thicken downward so the step-box extends from the top face
        // down past the previous step's top. Keeps the stair visually
        // solid with no gaps.
        const boxHeight = stepRise * 2 + 0.1;
        return (
          <mesh
            key={`step-${i}`}
            position={[cx, stepTopY - boxHeight / 2, stepCenterZ]}
          >
            <boxGeometry args={[width, boxHeight, stepRun + 0.02]} />
            <meshStandardMaterial
              color="#3a2a1f"
              roughness={0.7}
              metalness={0.1}
            />
          </mesh>
        );
      })}
      {/* Flanking rail walls. Each rail is a thin box along the stair's
          Z axis, with the top edge tracking the flight's ascent. We use
          a single slanted box per side (simpler than per-step). */}
      <RailWall
        side="west"
        xEdge={entryRect.xMin}
        zStart={runStart}
        zEnd={runEnd}
        yStart={entryRect.y + 0.05}
        yEnd={exitRect.y + 0.05}
      />
      <RailWall
        side="east"
        xEdge={entryRect.xMax}
        zStart={runStart}
        zEnd={runEnd}
        yStart={entryRect.y + 0.05}
        yEnd={exitRect.y + 0.05}
      />
    </group>
  );
}

function RailWall({
  xEdge,
  zStart,
  zEnd,
  yStart,
  yEnd,
}: {
  side: "east" | "west";
  xEdge: number;
  zStart: number;
  zEnd: number;
  yStart: number;
  yEnd: number;
}) {
  const len = zEnd - zStart;
  const rise = yEnd - yStart;
  const slope = Math.atan2(rise, len);
  const wallH = 3.6; // tall enough to enclose the flight visually
  const mid = new THREE.Vector3(
    xEdge,
    (yStart + yEnd) / 2 + wallH / 2,
    (zStart + zEnd) / 2,
  );
  const diagLen = Math.hypot(len, rise) + 0.2;

  return (
    <mesh position={mid} rotation={[slope, 0, 0]}>
      <boxGeometry args={[0.08, wallH, diagLen]} />
      <meshStandardMaterial
        color="#1f1611"
        roughness={0.85}
        metalness={0.05}
      />
    </mesh>
  );
}

/**
 * Given a stair and a world-space (x, z) that falls inside its
 * footprint, return the Y the player's feet should be at. Used by the
 * Player component to ride the ramp smoothly.
 */
export function stairHeightAt(
  staircase: Staircase,
  worldX: number,
  worldZ: number,
): number | null {
  const { entryRect, exitRect } = staircase;
  if (worldX < entryRect.xMin || worldX > entryRect.xMax) return null;
  const runStart = entryRect.zMin;
  const runEnd = exitRect.zMax;
  if (worldZ < runStart || worldZ > runEnd) return null;
  const t = (worldZ - runStart) / (runEnd - runStart);
  return entryRect.y + t * (exitRect.y - entryRect.y);
}

/** True if (worldX, worldZ) falls inside the stair footprint. */
export function isInsideStair(
  staircase: Staircase,
  worldX: number,
  worldZ: number,
): boolean {
  const { entryRect, exitRect } = staircase;
  return (
    worldX >= entryRect.xMin &&
    worldX <= entryRect.xMax &&
    worldZ >= entryRect.zMin &&
    worldZ <= exitRect.zMax
  );
}

// Silence unused-import warning during the M4 integration step.
export const _cellSize = CELL_SIZE;
