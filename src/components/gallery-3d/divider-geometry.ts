// A room's freestanding divider walls as two meshes: plaster and
// skirting. Every other wall in the building is a zero-thickness plane
// between two rooms. A divider is seen end-on from inside one room, so
// it is built at its real thickness: two faces, a finished end wherever
// it stands free, and a skirting that runs round that end.
//
// All of a room's dividers are merged, so they cost two draw calls
// however many there are.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CellRect, Divider } from "@/lib/gallery-layout/types";
import { CELL_SIZE, DIVIDER_THICKNESS } from "@/lib/gallery-layout/world-coords";
import {
  SKIRTING_CAP_HEIGHT,
  SKIRTING_CAP_PROUD,
  SKIRTING_HEIGHT,
  SKIRTING_PROUD,
} from "./skirting-geometry";

/** Which ends of a divider are built off one of the room's walls. An
 *  end that is not stands free and gets a finished face. */
export function attachedEnds(divider: Divider, room: CellRect): { start: boolean; end: boolean } {
  const low = divider.axis === "x" ? room.xMin : room.zMin;
  const high = (divider.axis === "x" ? room.xMax : room.zMax) + 1;
  return { start: divider.start <= low, end: divider.end >= high };
}

/** A plane `w` wide and `h` tall, facing along `yaw`, centred on a
 *  point. Its UVs are metres along the wall and up from the floor, like
 *  the room walls' (`MetrePlane` in wall.tsx), so a wall pattern is the
 *  same size on a divider as on the wall behind it. */
function face(w: number, h: number, yaw: number, x: number, y: number, z: number) {
  const g = new THREE.PlaneGeometry(w, h);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) + w / 2, pos.getY(i) + h / 2);
  return g.rotateY(yaw).translate(x, y, z);
}

/**
 * Plaster and skirting for `dividers`, in world coordinates. `floorY`
 * is the room's floor and `height` its ceiling above it. Null when the
 * room has none.
 */
export function buildDividerGeometry(
  dividers: readonly Divider[],
  room: CellRect,
  floorY: number,
  height: number,
): { wall: THREE.BufferGeometry; skirting: THREE.BufferGeometry } | null {
  if (dividers.length === 0) return null;
  const walls: THREE.BufferGeometry[] = [];
  const boards: THREE.BufferGeometry[] = [];
  const t = DIVIDER_THICKNESS;
  const y = floorY + height / 2;

  for (const d of dividers) {
    const lo = d.start * CELL_SIZE;
    const hi = d.end * CELL_SIZE;
    const len = hi - lo;
    const mid = (lo + hi) / 2;
    const line = d.line * CELL_SIZE;
    const attached = attachedEnds(d, room);
    // `along` places a point on the divider's own axis, `across` on the
    // other one.
    const at = (along: number, across: number): [number, number, number] =>
      d.axis === "x" ? [along, y, across] : [across, y, along];
    // Yaw that turns a +z plane to face down the divider's axis, and
    // the quarter turn from there to face out of each side.
    const alongYaw = d.axis === "x" ? Math.PI / 2 : 0;

    walls.push(
      face(len, height, alongYaw - Math.PI / 2, ...at(mid, line + (d.axis === "x" ? t : -t) / 2)),
      face(len, height, alongYaw + Math.PI / 2, ...at(mid, line - (d.axis === "x" ? t : -t) / 2)),
    );
    if (!attached.start) walls.push(face(t, height, alongYaw + Math.PI, ...at(lo, line)));
    if (!attached.end) walls.push(face(t, height, alongYaw, ...at(hi, line)));

    // The board is one box round the divider's foot: it stands proud
    // of both faces and of a free end, and stops at the room wall
    // where the divider is built off one.
    for (const [boardH, proud, top] of [
      [SKIRTING_HEIGHT, SKIRTING_PROUD, SKIRTING_HEIGHT],
      [SKIRTING_CAP_HEIGHT, SKIRTING_CAP_PROUD, SKIRTING_HEIGHT],
    ] as const) {
      const from = lo - (attached.start ? 0 : proud);
      const to = hi + (attached.end ? 0 : proud);
      const size: [number, number, number] =
        d.axis === "x" ? [to - from, boardH, t + 2 * proud] : [t + 2 * proud, boardH, to - from];
      const centre = at((from + to) / 2, line);
      boards.push(
        new THREE.BoxGeometry(...size).translate(centre[0], floorY + top - boardH / 2, centre[2]),
      );
    }
  }

  const wall = mergeGeometries(walls, false);
  const skirting = mergeGeometries(boards, false);
  for (const g of [...walls, ...boards]) g.dispose();
  return { wall, skirting };
}
