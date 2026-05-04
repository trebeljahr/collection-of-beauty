"use client";

// Single ceiling-pendant lamp fixture used by both rooms and hallways.
// Geometry (rosette → canopy → stem → bulb) is shared at module scope
// so 4 lamps per active room + 1 per N corridor cells across multiple
// floors all reference the same BufferGeometries. The stem geometry is
// authored at unit length and scaled per-fixture, so a single buffer
// covers both the long room pendants and the short hallway flush-mounts.
//
// The light is a point light at the bulb's centre; Three.js point lights
// don't cast shadows by default, so the surrounding fixture geometry
// doesn't block illumination. Splitting `lit` from the geometry render
// lets rooms keep their fixtures visible at all times while only
// switching the point light on when the player walks in.
//
// Anatomy of one fixture, top-down (Y descending from ceiling):
//
//   y=0           ceiling plane
//                 ┌───────────────┐  rosette  (wide flat disc, partially
//   y=-0.03       └───────────────┘            embedded into the ceiling)
//                   ╲           ╱    canopy   (truncated cone narrowing
//   y=-0.09          ╲_________╱              from rosette to stem)
//                        │
//                        │            stem    (thin straight rod, scaled
//                        │                     per fixture from a unit-
//                        │                     length geometry)
//                       ◯◯
//                   ◯◯◯◯◯◯◯◯           bulb    (basic-material sphere;
//                       ◯◯                     point light at centre)

import * as THREE from "three";
import type { Era } from "@/lib/gallery-eras";
import { getPaletteMaterials } from "./palette-materials";

const LAMP_ROSETTE_GEOM = new THREE.CylinderGeometry(0.13, 0.13, 0.03, 24);
const LAMP_CANOPY_GEOM = new THREE.CylinderGeometry(0.1, 0.04, 0.06, 24);
// Authored at length 1.0 so the mesh's Y scale = stem length in metres.
const LAMP_STEM_GEOM = new THREE.CylinderGeometry(0.015, 0.015, 1.0, 8);
const LAMP_BULB_GEOM = new THREE.SphereGeometry(0.18, 18, 12);

const BULB_RADIUS = 0.18;
// Y of the canopy's lower face relative to the mount Y. The stem starts
// here and the bulb's top must sit at or below this line, otherwise the
// bulb would intersect the canopy.
const CANOPY_BOTTOM_OFFSET = 0.09;
// Below this we skip the stem mesh entirely — visually indistinguishable
// from a flush mount, and avoids a near-zero-length cylinder that would
// just z-fight with the canopy/bulb.
const MIN_VISIBLE_STEM = 0.005;

type Props = {
  /** World position of the ceiling mount (top of the rosette). */
  position: readonly [number, number, number];
  /** Era for material lookup + lamp tint colour. */
  era: Era;
  /** When false the point light isn't rendered, but the geometry still
   *  is — so an unlit room still shows its fixtures, the lights just
   *  switch on as the player walks in. */
  lit: boolean;
  /** How far the bulb's centre hangs below the ceiling, in metres.
   *  Anything below ~0.27 collapses the stem to zero (canopy + bulb
   *  flush). 0.65 is a comfortable room pendant; 0.30 is a corridor
   *  flush-mount. */
  bulbDrop?: number;
  intensity?: number;
  distance?: number;
};

export function LampFixture({
  position,
  era,
  lit,
  bulbDrop = 0.65,
  intensity = 16,
  distance = 12,
}: Props) {
  const mats = getPaletteMaterials(era.palette);
  const [lx, ly, lz] = position;
  const stemTopY = ly - CANOPY_BOTTOM_OFFSET;
  const bulbCenterY = ly - bulbDrop;
  const bulbTopY = bulbCenterY + BULB_RADIUS;
  const stemLen = Math.max(0, stemTopY - bulbTopY);
  const stemCenterY = (stemTopY + bulbTopY) / 2;

  return (
    <group>
      <mesh position={[lx, ly - 0.015, lz]}>
        <primitive object={LAMP_ROSETTE_GEOM} attach="geometry" />
        <primitive object={mats.lampHousing} attach="material" />
      </mesh>
      <mesh position={[lx, ly - 0.06, lz]}>
        <primitive object={LAMP_CANOPY_GEOM} attach="geometry" />
        <primitive object={mats.lampHousing} attach="material" />
      </mesh>
      {stemLen > MIN_VISIBLE_STEM && (
        <mesh position={[lx, stemCenterY, lz]} scale={[1, stemLen, 1]}>
          <primitive object={LAMP_STEM_GEOM} attach="geometry" />
          <primitive object={mats.lampHousing} attach="material" />
        </mesh>
      )}
      {/* Bulb material swaps with `lit`: a dim non-emissive sphere
          when the room's off, an emissive sphere when on so the bulb
          visibly glows as the player enters. */}
      <mesh position={[lx, bulbCenterY, lz]}>
        <primitive object={LAMP_BULB_GEOM} attach="geometry" />
        <primitive object={lit ? mats.lampBulbOn : mats.lampBulbOff} attach="material" />
      </mesh>
      {lit && (
        <pointLight
          position={[lx, bulbCenterY, lz]}
          intensity={intensity}
          distance={distance}
          decay={2}
          color={era.palette.lampTint}
        />
      )}
    </group>
  );
}
