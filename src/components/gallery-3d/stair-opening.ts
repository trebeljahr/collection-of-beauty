import * as THREE from "three";
import type { WorldOpening } from "@/lib/gallery-layout/types";

/**
 * The hole a grand stair leaves in a stair hall's floor or ceiling, as
 * a path for a `THREE.Shape` drawn about the hall's centre. A shape is
 * drawn in XY and laid flat afterwards: turned down onto the floor its
 * +y is the world's -z (`zSign` -1), turned up under the ceiling it is
 * the world's +z (`zSign` 1).
 */
export function openingHole(
  opening: WorldOpening,
  centerX: number,
  centerZ: number,
  zSign: 1 | -1,
): THREE.Path {
  const hole = new THREE.Path();
  if (opening.kind === "disc") {
    hole.absarc(
      opening.x - centerX,
      zSign * (opening.z - centerZ),
      opening.r,
      0,
      Math.PI * 2,
      false,
    );
    return hole;
  }
  const x0 = opening.xMin - centerX;
  const x1 = opening.xMax - centerX;
  const a = zSign * (opening.zMin - centerZ);
  const b = zSign * (opening.zMax - centerZ);
  const y0 = Math.min(a, b);
  const y1 = Math.max(a, b);
  hole.moveTo(x0, y0);
  hole.lineTo(x0, y1);
  hole.lineTo(x1, y1);
  hole.lineTo(x1, y0);
  hole.closePath();
  return hole;
}
