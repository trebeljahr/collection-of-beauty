// Skirting board along the foot of a wall. Walls are zero-thickness
// planes shared by the rooms either side, so the board is built to
// straddle the plane: each box sticks out on both faces, and both rooms
// get a skirting from one mesh. Doorways are left open. One merged
// geometry per wall keeps it to a single draw call.
//
// A skirting is the cheapest single cue that a plane is a wall standing
// on a floor: it draws the junction the eye otherwise has to infer from
// shading alone, which is what the flat-lit rooms were missing.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Board: height and how far it stands off the wall on each side. */
export const SKIRTING_HEIGHT = 0.15;
export const SKIRTING_PROUD = 0.014;
/** How far the board runs on below the floor. The stairwell's floor
 *  lies 5 mm under the level its walls start at, which left a slit
 *  under the board there: through it showed the floor slab of the room
 *  behind the wall, or the dark outside once room culling hid that room
 *  (room-culling.ts). */
export const SKIRTING_SINK = 0.012;
/** Moulded cap along the top: a thinner, slightly deeper bead. */
export const SKIRTING_CAP_HEIGHT = 0.022;
export const SKIRTING_CAP_PROUD = 0.02;

/** Board segments for the clear spans of a wall, in the wall's local
 *  frame (x along the wall, y up from `floorY`, z through the wall). */
export function buildSkirtingGeometry(
  spans: ReadonlyArray<{ xMin: number; xMax: number }>,
  floorY: number,
  /** The board stands on the wall's own face only (local +z). For a
   *  wall each room draws for itself: straddling, the board of the room
   *  behind a stair hall's sheer wall showed through it as a dark line
   *  at every storey. */
  oneSided = false,
): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  const sides = oneSided ? 1 : 2;
  const z = (proud: number) => (oneSided ? proud / 2 : 0);
  for (const s of spans) {
    const w = s.xMax - s.xMin;
    if (w <= 0.01) continue;
    const cx = (s.xMin + s.xMax) / 2;
    const board = new THREE.BoxGeometry(w, SKIRTING_HEIGHT + SKIRTING_SINK, SKIRTING_PROUD * sides);
    board.translate(cx, floorY + (SKIRTING_HEIGHT - SKIRTING_SINK) / 2, z(SKIRTING_PROUD));
    const cap = new THREE.BoxGeometry(w, SKIRTING_CAP_HEIGHT, SKIRTING_CAP_PROUD * sides);
    cap.translate(cx, floorY + SKIRTING_HEIGHT - SKIRTING_CAP_HEIGHT / 2, z(SKIRTING_CAP_PROUD));
    parts.push(board, cap);
  }
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}
