"use client";

import type { Staircase } from "@/lib/gallery-layout/types";
import { STAIR_FLIGHT_LENGTH, STAIR_LANDING_DEPTH } from "@/lib/gallery-layout/world-coords";
import { Text } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { signBaseMaterial } from "./palette-materials";

// Shared materials — one "stair vocabulary" for every U-stair in the
// building. Allocated once at module load.
const stringerMaterial = new THREE.MeshStandardMaterial({
  color: "#2a1d14",
  roughness: 0.85,
  metalness: 0.05,
});
const treadMaterial = new THREE.MeshStandardMaterial({
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
  roughness: 0.9,
  metalness: 0.05,
});

const RIB_THICKNESS = 0.15;
/** No-go half-width around the rib for player collision. Includes the
 *  rib's own half-thickness plus a player-radius buffer so the camera
 *  doesn't clip into the rib's geometry. */
const RIB_NO_GO_HALF = 0.4;

/**
 * Build a side-view shape (X = length axis, Y = height) and extrude it
 * along the geometry's Z by `thickness`. Used for solid wedge / trapezoid
 * masses that anchor the stair flights to the floor.
 *
 *    south─top ┐
 *              │\\
 *              │ \\__ north─top
 *              │    │
 *    south─bot ┴────┴ north─bot
 *
 * `southHeight = 0` collapses the south side into a triangle.
 */
function makeStringerGeometry(
  length: number,
  southHeight: number,
  northHeight: number,
  thickness: number,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  if (southHeight > 0) shape.lineTo(0, southHeight);
  shape.lineTo(length, northHeight);
  shape.lineTo(length, 0);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
}

/**
 * Render one U-stair: solid stringer wedges below each flight, a
 * structural pier supporting the midway landing, and a tall central
 * rib between the two flights. The flights' top surfaces ARE the
 * stringer top faces — no separate ramp slabs — so there's no z-fight
 * and no "floating" look. Both entries sit on the south face: lower
 * floor at the south-west corner (Y=lowerY), upper floor at the
 * south-east corner (Y=upperY).
 *
 * Cardinal convention in this codebase: north = low z, south = high z.
 */
export function StaircaseRenderer({ staircase }: { staircase: Staircase }) {
  const { centerX, centerZ, width, depth, lowerY, upperY } = staircase;
  const halfD = depth / 2;
  const flightWidth = width / 2;
  const halfRise = (upperY - lowerY) / 2;
  const midwayY = lowerY + halfRise;

  // Footprint Z extents.
  const southZ = centerZ + halfD;
  const landingMaxZ = centerZ - halfD + STAIR_LANDING_DEPTH;
  const landingNorthZ = centerZ - halfD;

  // Stringer geometries.
  //  - West stringer: triangular wedge, south=0 (ramp meets floor),
  //    north=halfRise (ramp meets landing).
  //  - East stringer: trapezoid, south=halfRise*2 (ramp at upperY) →
  //    north=halfRise (ramp at midwayY). Both stringers extend down to
  //    floor Y, anchoring the flights as solid stone masses.
  const westStringerGeom = useMemo(
    () => makeStringerGeometry(STAIR_FLIGHT_LENGTH, 0, halfRise, flightWidth),
    [halfRise, flightWidth],
  );
  const eastStringerGeom = useMemo(
    () => makeStringerGeometry(STAIR_FLIGHT_LENGTH, halfRise * 2, halfRise, flightWidth),
    [halfRise, flightWidth],
  );
  // Central rib — same trapezoid silhouette as the east stringer
  // (south=upperY, north=midwayY), so the rib's top tracks the higher
  // ramp and reads as a chest-high handrail wall as the player walks
  // up the lower flight.
  const ribGeom = useMemo(
    () => makeStringerGeometry(STAIR_FLIGHT_LENGTH, halfRise * 2, halfRise, RIB_THICKNESS),
    [halfRise],
  );

  const flightCenterX = {
    west: centerX - flightWidth / 2,
    east: centerX + flightWidth / 2,
  };

  // Tread "lips" — thin contrast strips along each riser line so the
  // smooth stringer top reads as a flight of stairs instead of a
  // plain ramp. We anchor them slightly above the stringer surface to
  // dodge z-fighting (the ramp top is sloped, the lips are flat).
  const NUM_LIPS = 10;
  const tiltAngle = Math.atan2(halfRise, STAIR_FLIGHT_LENGTH);
  const treadDepth = STAIR_FLIGHT_LENGTH / NUM_LIPS;
  const lipThickness = 0.04;
  const westLips: React.ReactElement[] = [];
  const eastLips: React.ReactElement[] = [];
  for (let i = 1; i < NUM_LIPS; i++) {
    // Riser line `i` sits at i treads up from the south.
    const riserCenterZ = southZ - i * treadDepth;
    const wRiserY = lowerY + i * (halfRise / NUM_LIPS);
    westLips.push(
      <mesh
        key={`w-lip-${i}`}
        position={[flightCenterX.west, wRiserY + lipThickness / 2, riserCenterZ]}
        rotation={[tiltAngle, 0, 0]}
      >
        <boxGeometry args={[flightWidth - 0.05, lipThickness, 0.06]} />
        <primitive object={treadMaterial} attach="material" />
      </mesh>,
    );
    const eRiserY = upperY - i * (halfRise / NUM_LIPS);
    eastLips.push(
      <mesh
        key={`e-lip-${i}`}
        position={[flightCenterX.east, eRiserY + lipThickness / 2, riserCenterZ]}
        rotation={[-tiltAngle, 0, 0]}
      >
        <boxGeometry args={[flightWidth - 0.05, lipThickness, 0.06]} />
        <primitive object={treadMaterial} attach="material" />
      </mesh>,
    );
  }

  // Landing pier — solid block from floor to midwayY at the north end
  // of the footprint. Anchors the landing as a structural mass instead
  // of a thin slab floating in space, and the front face (south side)
  // gets a darker fascia so the seam between pier and stringers reads.
  const landingPierH = halfRise; // floor → midwayY
  const landingPierZCenter = (landingNorthZ + landingMaxZ) / 2;
  const landingPierY = lowerY + landingPierH / 2;

  return (
    <group>
      {/* West flight stringer — triangular wedge under the ramp. */}
      <mesh
        geometry={westStringerGeom}
        position={[centerX - flightWidth, lowerY, southZ]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <primitive object={stringerMaterial} attach="material" />
      </mesh>
      {/* East flight stringer — trapezoidal solid (south face full
          storey tall down to floor, north face joins the landing). */}
      <mesh
        geometry={eastStringerGeom}
        position={[centerX, lowerY, southZ]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <primitive object={stringerMaterial} attach="material" />
      </mesh>

      {/* Central rib between flights — handrail wall whose top tracks
          the higher (east) ramp. */}
      <mesh
        geometry={ribGeom}
        position={[centerX - RIB_THICKNESS / 2, lowerY, southZ]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <primitive object={ribMaterial} attach="material" />
      </mesh>

      {westLips}
      {eastLips}

      {/* Landing pier — solid block, top surface is the connecting
          platform between the two flights at midwayY. */}
      <mesh position={[centerX, landingPierY, landingPierZCenter]}>
        <boxGeometry args={[width, landingPierH, STAIR_LANDING_DEPTH]} />
        <primitive object={landingMaterial} attach="material" />
      </mesh>

      {/* Signs at each entry, set just past the south face. */}
      <StairSign
        position={[flightCenterX.west, lowerY + 2.4, southZ + 0.02]}
        rotationY={0}
        label={`↑ ${staircase.upperLabel}`}
      />
      <StairSign
        position={[flightCenterX.east, upperY + 2.4, southZ + 0.02]}
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

/** The rib between the two flights is a wall outside the landing
 *  strip — block targets that fall inside the rib's no-go zone, and
 *  block side-switching crossings, unless we're moving entirely within
 *  the landing strip (where the two flights merge into one walkable
 *  surface). */
export function canCrossStairMidline(
  stair: Staircase,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): boolean {
  const halfD = stair.depth / 2;
  const fromInLanding = fromZ - stair.centerZ <= -halfD + STAIR_LANDING_DEPTH;
  const toInLanding = toZ - stair.centerZ <= -halfD + STAIR_LANDING_DEPTH;
  if (fromInLanding && toInLanding) return true;

  const toDx = toX - stair.centerX;
  // Don't let the player wedge into the rib's footprint outside the
  // landing.
  if (Math.abs(toDx) < RIB_NO_GO_HALF) return false;

  // No side-switching outside the landing.
  const fromDx = fromX - stair.centerX;
  if (Math.sign(fromDx) !== Math.sign(toDx) && fromDx !== 0 && toDx !== 0) return false;
  return true;
}
