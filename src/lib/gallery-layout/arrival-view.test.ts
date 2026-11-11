import { describe, expect, it } from "vitest";
import { artworkListings } from "@/lib/data";
import { clearOfFittings, dividerRect } from "./fittings";
import { grandStairsAt, grandSurfaceAt } from "./grand-stair";
import { blockArrivalView, layoutBlock } from "./layout-block";
import type { RoomLayout } from "./types";
import { CELL_SIZE, SPIRAL_OUTER_RADIUS, worldToCell } from "./world-coords";

// The map sends a visitor to any room of any floor (BigMapOverlay in
// components/gallery-3d/index.tsx). Each must land on floor of that room,
// off every stair and fitting, and face into the room: never a wall or a
// panel close ahead, never a bare stretch of wall.

const layout = layoutBlock(artworkListings);
const rooms = layout.floors.flatMap((floor) => floor.rooms.map((room) => ({ floor, room })));
const views = rooms.map(({ floor, room }) => ({
  floor,
  room,
  view: blockArrivalView(layout, room),
}));
const hasGrandStair = (room: RoomLayout) => room.isStairwell && room.floorOpening !== undefined;
const spiralIn = (room: RoomLayout) => {
  const b = room.cellBounds;
  return layout.allStaircases.find(
    (s) =>
      s.centerX > b.xMin * CELL_SIZE &&
      s.centerX < (b.xMax + 1) * CELL_SIZE &&
      s.centerZ > b.zMin * CELL_SIZE &&
      s.centerZ < (b.zMax + 1) * CELL_SIZE,
  );
};

/** Metres from the spot along the view to the first wall or divider. */
function clearAhead(room: RoomLayout, x: number, z: number, dx: number, dz: number): number {
  const b = room.cellBounds;
  const walls = room.dividers.map(dividerRect);
  for (let t = 0; t < 60; t += 0.05) {
    const px = x + dx * t;
    const pz = z + dz * t;
    if (
      px <= b.xMin * CELL_SIZE ||
      px >= (b.xMax + 1) * CELL_SIZE ||
      pz <= b.zMin * CELL_SIZE ||
      pz >= (b.zMax + 1) * CELL_SIZE
    ) {
      return t;
    }
    if (walls.some((r) => px >= r.xMin && px <= r.xMax && pz >= r.zMin && pz <= r.zMax)) return t;
  }
  return 60;
}

describe("arrival views", () => {
  it("has one for every room of every floor, stairs, court and salon included", () => {
    expect(rooms.length).toBe(layout.floors.reduce((n, f) => n + f.rooms.length, 0));
    const stairRooms = rooms.filter(({ room }) => room.isStairwell).map(({ room }) => room.id);
    expect(stairRooms).toContain("f0-hall-w");
    expect(stairRooms).toContain("f0-court");
    expect(stairRooms).toContain("f0-salon");
    expect(stairRooms).toContain("f3-stair-s");
  });

  it("lands on the room's own floor, off every stair and fitting", () => {
    const wrong: string[] = [];
    for (const { floor, room, view } of views) {
      if (hasGrandStair(room)) {
        const here = grandStairsAt(layout.grandStairs ?? [], view.x, view.z, floor.y);
        if (grandSurfaceAt(here, view.x, view.z, floor.y)?.floorIndex !== floor.index) {
          wrong.push(`${room.id}: not on the hall's floor`);
        }
        continue;
      }
      const cell = worldToCell(view.x, view.z);
      const owner = floor.cellOwner[cell.z * floor.gridSize.x + cell.x];
      if (floor.rooms[owner] !== room) wrong.push(`${room.id}: lands in another cell's room`);
      if (!clearOfFittings({ rooms: [room] }, view.x, view.z, 0.5)) {
        wrong.push(`${room.id}: in a fitting`);
      }
      const spiral = spiralIn(room);
      if (
        spiral &&
        Math.hypot(view.x - spiral.centerX, view.z - spiral.centerZ) < SPIRAL_OUTER_RADIUS + 1
      ) {
        wrong.push(`${room.id}: on the spiral`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("faces into the room: the stair, or 4 m and more of clear floor ahead", () => {
    const wrong: string[] = [];
    for (const { room, view } of views) {
      const len = Math.hypot(view.lookX - view.x, view.lookZ - view.z);
      const dx = (view.lookX - view.x) / len;
      const dz = (view.lookZ - view.z) / len;
      const spiral = spiralIn(room);
      if (hasGrandStair(room) || spiral) {
        // A stair's room faces its stair: the hall's middle, or the spiral.
        const cx = spiral?.centerX ?? (room.worldRect.xMin + room.worldRect.xMax) / 2;
        const cz = spiral?.centerZ ?? (room.worldRect.zMin + room.worldRect.zMax) / 2;
        const off = Math.abs(Math.atan2(cz - view.z, cx - view.x) - Math.atan2(dz, dx));
        if (Math.min(off, 2 * Math.PI - off) > 0.01) wrong.push(`${room.id}: not facing its stair`);
        continue;
      }
      const ahead = clearAhead(room, view.x, view.z, dx, dz);
      if (ahead < 4) wrong.push(`${room.id}: ${ahead.toFixed(1)} m ahead`);
      // Along the room or across a corner, never at a chance angle.
      const yaw = Math.atan2(dz, dx) / (Math.PI / 4);
      if (Math.abs(yaw - Math.round(yaw)) > 1e-6) wrong.push(`${room.id}: yaw off the room's axes`);
    }
    expect(wrong).toEqual([]);
  });

  it("puts a visitor sent to the court at the head of its floor's walkway", () => {
    const court = layout.grandStairs?.find((s) => s.design === "court");
    const off: string[] = [];
    let walkways = 0;
    for (const { room, view } of views) {
      if (!room.id.endsWith("-court")) continue;
      const bridge = court?.bridges.find((b) => b.floor === room.floorIndex)?.rect;
      if (!court || !bridge) continue;
      walkways++;
      // The walkway's rect is in the court's frame, which is the world's
      // turned by `turns` (0 here): the view runs along its middle line.
      const lx = view.x - court.centerX;
      const lz = view.z - court.centerZ;
      const alongX = bridge.xMax - bridge.xMin > bridge.zMax - bridge.zMin;
      if (Math.abs(alongX ? lz : lx) > 0.01) off.push(room.id);
    }
    expect(court?.turns).toBe(0);
    expect(walkways).toBeGreaterThan(1);
    expect(off).toEqual([]);
  });

  it("shows a gallery's works face on", () => {
    const half = (39.6 * Math.PI) / 180;
    const thin: string[] = [];
    for (const { room, view } of views) {
      if (room.isStairwell || room.placements.length === 0) continue;
      const yaw = Math.atan2(view.lookZ - view.z, view.lookX - view.x);
      let shown = 0;
      for (const p of room.placements) {
        const vx = p.position[0] - view.x;
        const vz = p.position[2] - view.z;
        let off = Math.abs(Math.atan2(vz, vx) - yaw);
        off = Math.min(off, 2 * Math.PI - off);
        const facing = -(vx * Math.sin(p.rotation[1]) + vz * Math.cos(p.rotation[1]));
        if (off <= half && facing > 0) shown++;
      }
      // A third of the room's works in view, or 8 of a larger room's.
      if (shown < Math.min(8, Math.ceil(room.placements.length / 3))) {
        thin.push(`${room.id}: ${shown} of ${room.placements.length}`);
      }
    }
    expect(thin).toEqual([]);
  });
});
