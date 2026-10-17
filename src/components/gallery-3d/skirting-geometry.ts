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
 *  lay 5 mm under the level its walls start at until 17 October 2026,
 *  which left a slit under the board there: through it showed the floor
 *  slab of the room behind the wall, or the dark outside once room
 *  culling hid that room (room-culling.ts). It is level with every other
 *  floor now; the sink stays so no floor has to sit exactly on the
 *  board's foot. */
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
   *  behind could show through the wall as a dark line. */
  oneSided = false,
): THREE.BufferGeometry | null {
  return trimBoards(spans, floorY, 1, oneSided);
}

/** The same board turned over along the top of a wall, where it meets
 *  the room's ceiling at `ceilingY`: the dark line the skirting draws
 *  at the foot, drawn at the head too. Rico, 17 October 2026: "I'd
 *  like the black outlines also for the top part of the rooms". Always
 *  on the wall's own face (local +z). The room behind may have its
 *  ceiling at another height, and a board straddling the wall would
 *  hang across its plaster. */
export function buildCorniceGeometry(
  spans: ReadonlyArray<{ xMin: number; xMax: number }>,
  ceilingY: number,
): THREE.BufferGeometry | null {
  return trimBoards(spans, ceilingY, -1, true);
}

/** A board and its bead along `spans`, standing up from `baseY`
 *  (`dir` 1) or hanging down from it (`dir` -1). The board runs on
 *  `SKIRTING_SINK` past its base, into the floor or the plenum. */
function trimBoards(
  spans: ReadonlyArray<{ xMin: number; xMax: number }>,
  baseY: number,
  dir: 1 | -1,
  oneSided: boolean,
): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  const sides = oneSided ? 1 : 2;
  const z = (proud: number) => (oneSided ? proud / 2 : 0);
  for (const s of spans) {
    const w = s.xMax - s.xMin;
    if (w <= 0.01) continue;
    const cx = (s.xMin + s.xMax) / 2;
    const board = new THREE.BoxGeometry(w, SKIRTING_HEIGHT + SKIRTING_SINK, SKIRTING_PROUD * sides);
    board.translate(cx, baseY + (dir * (SKIRTING_HEIGHT - SKIRTING_SINK)) / 2, z(SKIRTING_PROUD));
    const cap = new THREE.BoxGeometry(w, SKIRTING_CAP_HEIGHT, SKIRTING_CAP_PROUD * sides);
    cap.translate(
      cx,
      baseY + dir * (SKIRTING_HEIGHT - SKIRTING_CAP_HEIGHT / 2),
      z(SKIRTING_CAP_PROUD),
    );
    if (oneSided) {
      dropBackFace(board);
      dropBackFace(cap);
    }
    parts.push(board, cap);
  }
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** Take the face at the wall (local -z) off a one-sided box. It lies in
 *  the wall's plane and faces through it: where the room behind draws
 *  its own wall on that line, the face shows in the other room and
 *  fights that wall for depth. A skirting hid it there behind the
 *  neighbour's own board; a cornice, at a ceiling height the neighbour
 *  may not share, did not (17 October 2026). BoxGeometry writes its
 *  faces in the order +x, -x, +y, -y, +z, -z, six indices each. */
function dropBackFace(box: THREE.BufferGeometry): void {
  const index = box.getIndex();
  if (!index) return;
  box.setIndex(Array.from(index.array).slice(0, 30));
  box.clearGroups();
}
