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
/** Moulded cap along the top: a thinner, slightly deeper bead. */
const CAP_HEIGHT = 0.022;
const CAP_PROUD = 0.02;

/** Board segments for the clear spans of a wall, in the wall's local
 *  frame (x along the wall, y up from `floorY`, z through the wall). */
export function buildSkirtingGeometry(
  spans: ReadonlyArray<{ xMin: number; xMax: number }>,
  floorY: number,
): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of spans) {
    const w = s.xMax - s.xMin;
    if (w <= 0.01) continue;
    const cx = (s.xMin + s.xMax) / 2;
    const board = new THREE.BoxGeometry(w, SKIRTING_HEIGHT, SKIRTING_PROUD * 2);
    board.translate(cx, floorY + SKIRTING_HEIGHT / 2, 0);
    const cap = new THREE.BoxGeometry(w, CAP_HEIGHT, CAP_PROUD * 2);
    cap.translate(cx, floorY + SKIRTING_HEIGHT - CAP_HEIGHT / 2, 0);
    parts.push(board, cap);
  }
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}
