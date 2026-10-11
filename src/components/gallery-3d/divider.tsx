"use client";

import { useEffect, useMemo } from "react";
import type * as THREE from "three";
import type { RoomLayout } from "@/lib/gallery-layout/types";
import { buildDividerGeometry } from "./divider-geometry";
import { UNREFLECTED_LAYER } from "./floor-mirror";
import { darkWoodTrimMaterial } from "./palette-materials";

/** A room's freestanding divider walls: plaster in the room's wall
 *  material and a skirting round each. See divider-geometry.ts. The
 *  plaster shows in the floor's reflection, the skirting does not, as
 *  on the room's own walls. */
export function RoomDividers({ room, material }: { room: RoomLayout; material: THREE.Material }) {
  const geometry = useMemo(
    () =>
      buildDividerGeometry(room.dividers, room.cellBounds, room.worldRect.y, room.ceilingHeight),
    [room],
  );
  useEffect(
    () => () => {
      geometry?.wall.dispose();
      geometry?.skirting.dispose();
    },
    [geometry],
  );
  if (!geometry) return null;
  return (
    <>
      <mesh geometry={geometry.wall} material={material} />
      <mesh
        geometry={geometry.skirting}
        material={darkWoodTrimMaterial}
        layers={UNREFLECTED_LAYER}
      />
    </>
  );
}
