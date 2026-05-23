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
// doesn't block illumination. `lit` is gated by the renderer so the
// scene only ever carries point lights for the rooms in play (the room
// the player is in plus its door-neighbours — see the lit set in
// index.tsx), keeping the active light count bounded. Geometry renders
// regardless, so an unlit room still shows its dark fixtures.
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
  /** Mounts the actual <pointLight>. Only the room the player occupies
   *  carries real point lights — three.js prices every mounted light
   *  into the fragment shader, so this stays a bounded handful (one
   *  room's lamps) rather than scaling with the pre-lit neighbour set. */
  lit: boolean;
  /** Lights the bulb's emissive material (free — a static material swap,
   *  no per-fragment cost). Door-neighbour rooms `glow` without `lit`,
   *  so the next room reads as lit through the doorway (glowing bulbs +
   *  the scene's ambient/hemisphere/env baseline) without paying for a
   *  point light until the player actually steps in. */
  glow: boolean;
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
  glow,
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
      {/* Bulb material swaps with `glow`: a dim non-emissive sphere when
          the room's off, an emissive sphere when on so the bulb reads as
          glowing — even in a pre-lit neighbour that carries no point
          light yet. */}
      <mesh position={[lx, bulbCenterY, lz]}>
        <primitive object={LAMP_BULB_GEOM} attach="geometry" />
        <primitive object={glow ? mats.lampBulbOn : mats.lampBulbOff} attach="material" />
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
