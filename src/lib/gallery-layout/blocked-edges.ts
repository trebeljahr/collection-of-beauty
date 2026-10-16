// The collision grid's wall mask: which cell edges between rooms are
// walls. Read by the player's movement checks and the physics world.

import { writeDividerEdges } from "./fittings";
import type { Door, RoomLayout } from "./types";
import { CELL_SIZE, doorOpenHalfSpan } from "./world-coords";

/**
 * Build the per-edge wall mask the player uses for collision. Walls
 * sit on cell boundaries; if cells (x, z) and (x+1, z) belong to two
 * different rooms, a wall divides them — and that edge is blocked
 * unless one of the room's doors opens into it. A door opens every
 * edge its opening reaches (`doorOpenHalfSpan`): one for a 1.4 m door,
 * three for a portal, whose jambs the physics world closes again.
 *
 * Edges between a room and non-walkable space are NOT in this mask
 * (the cell `walkable` mask handles those). Edges between two cells of
 * one room are free, except where one of the room's dividers stands on
 * them: those are written last.
 */
export function computeBlockedEdges(
  grid: { x: number; z: number },
  rooms: RoomLayout[],
  cellOwner: Int16Array,
): { blockedEdgesEW: Uint8Array; blockedEdgesNS: Uint8Array } {
  const gx = grid.x;
  const gz = grid.z;
  const blockedEdgesEW = new Uint8Array((gx - 1) * gz);
  const blockedEdgesNS = new Uint8Array(gx * (gz - 1));
  // Does the door reach the edge whose midpoint is `offset` along the
  // wall from the door's centre?
  const reaches = (d: Door, offset: number) => Math.abs(offset) < doorOpenHalfSpan(d.width) - 0.01;

  for (let z = 0; z < gz; z++) {
    for (let x = 0; x < gx - 1; x++) {
      const a = cellOwner[z * gx + x];
      const b = cellOwner[z * gx + (x + 1)];
      if (a < 0 || b < 0 || a === b) continue;
      const edgeWorldX = (x + 1) * CELL_SIZE;
      const edgeWorldZ = (z + 0.5) * CELL_SIZE;
      const open =
        rooms[a].doors.some(
          (d) =>
            d.side === "east" &&
            Math.abs(d.worldX - edgeWorldX) < 0.01 &&
            reaches(d, d.worldZ - edgeWorldZ),
        ) ||
        rooms[b].doors.some(
          (d) =>
            d.side === "west" &&
            Math.abs(d.worldX - edgeWorldX) < 0.01 &&
            reaches(d, d.worldZ - edgeWorldZ),
        );
      if (!open) blockedEdgesEW[z * (gx - 1) + x] = 1;
    }
  }

  for (let z = 0; z < gz - 1; z++) {
    for (let x = 0; x < gx; x++) {
      const a = cellOwner[z * gx + x];
      const b = cellOwner[(z + 1) * gx + x];
      if (a < 0 || b < 0 || a === b) continue;
      const edgeWorldX = (x + 0.5) * CELL_SIZE;
      const edgeWorldZ = (z + 1) * CELL_SIZE;
      // a is at lower z = cardinal "north" cell; the shared wall is on
      // a's south face (high z) and on b's north face (low z).
      const open =
        rooms[a].doors.some(
          (d) =>
            d.side === "south" &&
            Math.abs(d.worldZ - edgeWorldZ) < 0.01 &&
            reaches(d, d.worldX - edgeWorldX),
        ) ||
        rooms[b].doors.some(
          (d) =>
            d.side === "north" &&
            Math.abs(d.worldZ - edgeWorldZ) < 0.01 &&
            reaches(d, d.worldX - edgeWorldX),
        );
      if (!open) blockedEdgesNS[z * gx + x] = 1;
    }
  }

  for (const room of rooms) {
    writeDividerEdges(room.dividers, { x: gx, z: gz }, blockedEdgesEW, blockedEdgesNS);
  }

  return { blockedEdgesEW, blockedEdgesNS };
}
