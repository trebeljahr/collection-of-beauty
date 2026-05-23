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
// lets rooms keep their fixtures visible at all times while the point
// light + bulb glow *ramp* on as the player walks in (see the per-frame
// fade in the component body) rather than snapping. Only the active
// room's lights are ever mounted — a fading-out room keeps its light
// alive until it's fully dark, then unmounts — so the scene still
// carries a bounded handful of point lights at any instant.
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

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
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

// Seconds for a room's lights to ramp fully on or off as the player
// crosses the threshold. Short enough to feel responsive, long enough
// to read as a soft fade rather than a switch snapping.
const LIGHT_FADE_SECONDS = 0.35;

type Props = {
  /** World position of the ceiling mount (top of the rosette). */
  position: readonly [number, number, number];
  /** Era for material lookup + lamp tint colour. */
  era: Era;
  /** Drives the light: when it flips the point light + bulb glow ramp
   *  toward on (true) or off (false). The fixture geometry is always
   *  rendered regardless — an unlit room still shows its fixtures, the
   *  lights just fade up as the player walks in. */
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

  // Per-frame fade state. `level` is the eased 0..1 illumination amount,
  // held in a ref so the ramp doesn't churn React state every frame.
  // `lightMounted` gates the actual <pointLight> element: we mount it the
  // instant the room activates and keep it mounted while it still emits
  // anything, unmounting only once it's faded fully dark. That preserves
  // the "only the active (+ just-left) room carries point lights" budget
  // — three.js prices every mounted light into the fragment shader, so we
  // never want every room's lamps live at once.
  const level = useRef(lit ? 1 : 0);
  const [lightMounted, setLightMounted] = useState(lit);
  const lightRef = useRef<THREE.PointLight>(null);

  // Mount the point light synchronously the frame the room activates so
  // the ramp-up starts from this render rather than one frame late.
  if (lit && !lightMounted) setLightMounted(true);

  // Per-fixture bulb material so each lamp's glow can fade independently.
  // The shared palette `lampBulbOn` is reused across every room on the
  // floor (same era ⇒ same Palette identity), so mutating it would light
  // up bulbs in inactive rooms too — hence a clone per fixture. Bulb
  // materials are tiny (no textures), so the clone is far cheaper than
  // the shared-material trick that matters for walls/floors. Initialised
  // to match `lit` at mount; the frame loop owns it afterwards.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `lit` is read once for the initial paint; subsequent changes are driven by the per-frame fade, not a re-clone.
  const bulbMat = useMemo(() => {
    const m = mats.lampBulbOn.clone();
    if (!lit) {
      m.emissiveIntensity = 0;
      m.color.copy(mats.lampBulbOff.color);
    }
    return m;
  }, [mats]);

  // Dispose the cloned material when the fixture unmounts (floor swap) so
  // the GPU program/uniform allocation doesn't leak across floors.
  useEffect(() => () => bulbMat.dispose(), [bulbMat]);

  useFrame((_, dt) => {
    const target = lit ? 1 : 0;
    if (level.current === target) {
      // Settled. Once fully dark, drop the point light from the scene.
      if (target === 0 && lightMounted) setLightMounted(false);
      return;
    }
    const step = dt / LIGHT_FADE_SECONDS;
    level.current =
      level.current < target
        ? Math.min(target, level.current + step)
        : Math.max(target, level.current - step);
    const l = level.current;
    if (lightRef.current) lightRef.current.intensity = intensity * l;
    bulbMat.emissiveIntensity = mats.lampBulbOn.emissiveIntensity * l;
    bulbMat.color.lerpColors(mats.lampBulbOff.color, mats.lampBulbOn.color, l);
  });

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
      {/* Bulb sphere. Its per-fixture material (above) eases between the
          dim non-emissive "off" look and the emissive "on" glow in step
          with the point light, so the bulb brightens with the room
          instead of popping. */}
      <mesh position={[lx, bulbCenterY, lz]}>
        <primitive object={LAMP_BULB_GEOM} attach="geometry" />
        <primitive object={bulbMat} attach="material" />
      </mesh>
      {lightMounted && (
        <pointLight
          ref={lightRef}
          position={[lx, bulbCenterY, lz]}
          intensity={intensity * level.current}
          distance={distance}
          decay={2}
          color={era.palette.lampTint}
        />
      )}
    </group>
  );
}
