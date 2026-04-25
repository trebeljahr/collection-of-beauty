"use client";

import type { Staircase } from "@/lib/gallery-layout/types";
import {
  STAIR_FLIGHT_LENGTH,
  STAIR_LANDING_DEPTH,
  STAIR_STEPS_PER_FLIGHT,
} from "@/lib/gallery-layout/world-coords";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import { signBaseMaterial } from "./palette-materials";

// Shared materials — one "stair vocabulary" for every U-stair in the
// building. Allocated once at module load.
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
const ribMaterial = new THREE.MeshStandardMaterial({
  color: "#1f1611",
  roughness: 0.85,
  metalness: 0.05,
});

const RIB_THICKNESS = 0.1;
const RIB_HEIGHT = 1.0;
const RAMP_THICKNESS = 0.12;

/**
 * Render one U-stair flight pair: an ascending flight on the west half
 * (low x), a descending flight on the east half (high x), and a flat
 * landing platform at the north (low z) end. The flights' SOUTH ends
 * (high z) sit flush with their respective floors:
 *
 *      lower entry (south, west, lowerY)   upper entry (south, east, upperY)
 *                       │                                 │
 *                       ↓ walking north up the ramp       ↓ walking north down
 *                                                         (or south up to upper)
 *      ┌────────────────┬────────────────┐  ← landing at north (low z, midwayY)
 *
 * The cardinal convention in this codebase: north = low z, south = high z.
 * Both entries are on the south face so a player from either floor's
 * stairwell south door (grand-hall side) walks straight onto the stair.
 *
 * Step boxes are decorative — the underlying ramp is a continuous
 * inclined plane so the player's feet glide rather than jerk frame to
 * frame; the riser boxes just sell the look.
 */
export function StaircaseRenderer({ staircase }: { staircase: Staircase }) {
  const { centerX, centerZ, width, depth, lowerY, upperY } = staircase;
  const halfW = width / 2;
  const halfD = depth / 2;
  const flightWidth = width / 2;
  const halfRise = (upperY - lowerY) / 2;
  const midwayY = lowerY + halfRise;

  const flightCenterX = {
    west: centerX - flightWidth / 2,
    east: centerX + flightWidth / 2,
  };

  // Flights occupy z ∈ [landingMaxZ, southZ]. Landing occupies the low-z
  // strip, flights run from the landing's high-z edge to the footprint's
  // south face.
  const southZ = centerZ + halfD;
  const landingMaxZ = centerZ - halfD + STAIR_LANDING_DEPTH;
  const flightCenterZ = (landingMaxZ + southZ) / 2;
  // tiltAngle: top surface tilts up toward south (high z) on the west
  // flight (ascends south→north? no: lowerY at south, midwayY at north,
  // so the top surface DROPS toward the south as you walk south. We
  // rotate around X by +tilt to lift the +Z end up… wait, we want the
  // -Z end lifted. Use -tilt below.
  const tiltAngle = Math.atan2(halfRise, STAIR_FLIGHT_LENGTH);
  const slabLength = Math.hypot(STAIR_FLIGHT_LENGTH, halfRise);

  // Riser steps stacked on the ramp. Index from south (south = step 0,
  // entry tread). Walking north on the west flight ascends; walking
  // north on the east flight descends from upperY.
  const stepRise = halfRise / STAIR_STEPS_PER_FLIGHT;
  const treadDepth = STAIR_FLIGHT_LENGTH / STAIR_STEPS_PER_FLIGHT;

  const westSteps: React.ReactElement[] = [];
  const eastSteps: React.ReactElement[] = [];
  for (let i = 0; i < STAIR_STEPS_PER_FLIGHT; i++) {
    // Tread `i` sits at south end + i treads up the flight. Z decreases
    // (going north) as i increases.
    const treadCenterZ = southZ - (i + 0.5) * treadDepth;
    // West: lowerY at south, midwayY at north → tread top rises with i.
    const wTreadTopY = lowerY + (i + 1) * stepRise;
    westSteps.push(
      <mesh
        key={`w-${i}`}
        position={[flightCenterX.west, wTreadTopY - 0.05, treadCenterZ]}
      >
        <boxGeometry args={[flightWidth - 0.05, 0.1, treadDepth]} />
        <primitive object={stepMaterial} attach="material" />
      </mesh>,
    );
    // East: upperY at south, midwayY at north → tread top falls with i.
    const eTreadTopY = upperY - i * stepRise;
    eastSteps.push(
      <mesh
        key={`e-${i}`}
        position={[flightCenterX.east, eTreadTopY - 0.05, treadCenterZ]}
      >
        <boxGeometry args={[flightWidth - 0.05, 0.1, treadDepth]} />
        <primitive object={stepMaterial} attach="material" />
      </mesh>,
    );
  }

  // Landing platform at the north end, spanning both flights' width.
  const landingCenterZ = centerZ - halfD + STAIR_LANDING_DEPTH / 2;

  // Central rib between the two flights — skipped over the landing
  // section so the player can walk across to switch flights.
  const ribCenterY = midwayY + RIB_HEIGHT / 2 - 0.5;

  return (
    <group>
      {/* West flight ramp surface (south end low, north end high). */}
      <mesh
        position={[flightCenterX.west, lowerY + halfRise / 2, flightCenterZ]}
        rotation={[tiltAngle, 0, 0]}
      >
        <boxGeometry args={[flightWidth - 0.05, RAMP_THICKNESS, slabLength]} />
        <primitive object={stepMaterial} attach="material" />
      </mesh>
      {/* East flight ramp surface (south end high, north end mid). */}
      <mesh
        position={[flightCenterX.east, upperY - halfRise / 2, flightCenterZ]}
        rotation={[-tiltAngle, 0, 0]}
      >
        <boxGeometry args={[flightWidth - 0.05, RAMP_THICKNESS, slabLength]} />
        <primitive object={stepMaterial} attach="material" />
      </mesh>

      {westSteps}
      {eastSteps}

      {/* Landing — flat slab at midwayY across the full width. */}
      <mesh position={[centerX, midwayY - 0.05, landingCenterZ]}>
        <boxGeometry args={[width, 0.1, STAIR_LANDING_DEPTH]} />
        <primitive object={landingMaterial} attach="material" />
      </mesh>

      {/* Central rib between flights — forces the player to use the
          landing to switch sides instead of jumping the midline gap. */}
      <mesh position={[centerX, ribCenterY, flightCenterZ]}>
        <boxGeometry args={[RIB_THICKNESS, RIB_HEIGHT, STAIR_FLIGHT_LENGTH]} />
        <primitive object={ribMaterial} attach="material" />
      </mesh>

      {/* Destination signs at each entry, at the south end of each flight. */}
      <StairSign
        position={[flightCenterX.west, lowerY + 2.4, southZ - 0.1]}
        rotationY={0}
        label={`↑ ${staircase.upperLabel}`}
      />
      <StairSign
        position={[flightCenterX.east, upperY + 2.4, southZ - 0.1]}
        rotationY={0}
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

/** True if (worldX, worldZ) sits inside the stair footprint. The rib
 *  between flights is *not* excluded here — collision against the rib
 *  is enforced separately by `canCrossStairMidline` so the player can
 *  walk along either flight without being kicked off the stair. */
export function isInsideStair(stair: Staircase, worldX: number, worldZ: number): boolean {
  const halfW = stair.width / 2;
  const halfD = stair.depth / 2;
  const dx = worldX - stair.centerX;
  const dz = worldZ - stair.centerZ;
  return Math.abs(dx) <= halfW && Math.abs(dz) <= halfD;
}

/** Y the player's feet should sit at, given world XZ on the stair.
 *  West half rises lowerY (south) → midwayY (north), east half rises
 *  midwayY (north) → upperY (south), and the low-z strip is the flat
 *  midway landing. Returns null if the position is outside the
 *  footprint. */
export function stairHeightAt(
  stair: Staircase,
  worldX: number,
  worldZ: number,
): number | null {
  const halfW = stair.width / 2;
  const halfD = stair.depth / 2;
  const dx = worldX - stair.centerX;
  const dz = worldZ - stair.centerZ;
  if (Math.abs(dx) > halfW || Math.abs(dz) > halfD) return null;

  const halfRise = (stair.upperY - stair.lowerY) / 2;
  const midwayY = stair.lowerY + halfRise;

  // Landing strip at the far (-Z, north) end.
  if (dz <= -halfD + STAIR_LANDING_DEPTH) return midwayY;

  // Flight zone: t = 0 at the south end (player's floor entry), t = 1
  // at the landing (north).
  const t = (halfD - dz) / STAIR_FLIGHT_LENGTH;
  if (dx <= 0) {
    // West flight — ascending lowerY → midwayY as you walk north.
    return stair.lowerY + t * halfRise;
  }
  // East flight — south at upperY (upper-floor entry), north at midwayY.
  return stair.upperY - t * halfRise;
}

/** Pick which flight half corresponds to the player's current floor.
 *  Used to disambiguate when both stairsIn (descent) and stairsOut
 *  (ascent) overlap the same footprint XZ — west = ascent, east =
 *  descent. */
export function flightForFloor(
  stair: Staircase,
  floorIndex: number,
): "west" | "east" | null {
  if (floorIndex === stair.lowerFloor) return "west";
  if (floorIndex === stair.upperFloor) return "east";
  return null;
}

/** The midline between the two flights is a wall outside the landing
 *  strip — block crossings unless both endpoints are in the landing.
 *  Same idea as the per-edge wall mask, scoped to the stair's interior. */
export function canCrossStairMidline(
  stair: Staircase,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): boolean {
  const fromDx = fromX - stair.centerX;
  const toDx = toX - stair.centerX;
  if (Math.sign(fromDx) === Math.sign(toDx)) return true;
  if (fromDx === 0 || toDx === 0) return true;
  // Crossing midline — only allowed if BOTH endpoints sit in the
  // landing strip (low z).
  const halfD = stair.depth / 2;
  const fromInLanding = fromZ - stair.centerZ <= -halfD + STAIR_LANDING_DEPTH;
  const toInLanding = toZ - stair.centerZ <= -halfD + STAIR_LANDING_DEPTH;
  return fromInLanding && toInLanding;
}
