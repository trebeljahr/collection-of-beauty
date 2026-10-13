"use client";

import { useEffect, useMemo } from "react";
import type * as THREE from "three";
import type { RoomLayout } from "@/lib/gallery-layout/types";
import { buildDividerGeometry } from "./divider-geometry";
import { UNREFLECTED_LAYER } from "./floor-mirror";

/** A room's freestanding divider walls: plaster in the room's wall
 *  material, the back of a door screen in a darker one, and a skirting
 *  round each. See divider-geometry.ts. The plaster shows in the
 *  floor's reflection, the skirting does not, as on the room's own
 *  walls. */
export function RoomDividers({
  room,
  material,
  screenMaterial,
  trim,
}: {
  room: RoomLayout;
  material: THREE.Material;
  screenMaterial: THREE.Material;
  /** The skirting's wood, lit as the room is. */
  trim: THREE.Material;
}) {
  const geometry = useMemo(
    () =>
      buildDividerGeometry(room.dividers, room.cellBounds, room.worldRect.y, room.ceilingHeight),
    [room],
  );
  useEffect(
    () => () => {
      geometry?.wall.dispose();
      geometry?.screen?.dispose();
      geometry?.skirting.dispose();
    },
    [geometry],
  );
  if (!geometry) return null;
  return (
    <>
      <mesh geometry={geometry.wall} material={material} />
      {geometry.screen && <mesh geometry={geometry.screen} material={screenMaterial} />}
      <mesh geometry={geometry.skirting} material={trim} layers={UNREFLECTED_LAYER} />
    </>
  );
}
