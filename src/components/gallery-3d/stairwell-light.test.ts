import { describe, expect, it } from "vitest";
import { artworkListings } from "@/lib/data";
import { layoutBlock } from "@/lib/gallery-layout/layout-block";
import { roomLighting } from "./stairwell-light";
import { CANS_PER_PATCH, MAX_CANS } from "./wash-cans";

// The plan's stair rooms against the pools' shader: every room's cans
// fit its uniforms, and every patch names every can that reaches it.
describe("roomLighting on the block plan", () => {
  const layout = layoutBlock(artworkListings);
  const rooms = layout.floors.flatMap((f) => f.rooms.filter((r) => r.isStairwell));

  it("keeps every stair room within the shader's cans and names every can a patch needs", () => {
    let mostCans = 0;
    let mostAt = "";
    let dropped = 0;
    let patches = 0;
    for (const room of rooms) {
      const lit = roomLighting(room, layout.floors, 1);
      const n = Math.max(lit.cans.length, lit.spill.cans.length);
      if (n > mostCans) {
        mostCans = n;
        mostAt = room.id;
      }
      dropped += lit.dropped;
      patches += lit.patches.length;
      for (const p of lit.patches) {
        if (p.cans.length === 0 || p.cans.length > CANS_PER_PATCH) dropped += 1;
      }
    }
    expect(rooms.length).toBeGreaterThan(10);
    expect(patches).toBeGreaterThan(rooms.length * 20);
    expect(mostCans, `${mostAt} holds ${mostCans} cans`).toBeLessThanOrEqual(MAX_CANS);
    expect(dropped).toBe(0);
  });

  it("gives a stair hall the cans of the storeys over and under it", () => {
    const hall = layout.floors[1].rooms.find((r) => r.isStairwell && r.endWall);
    expect(hall).toBeDefined();
    const lit = roomLighting(hall!, layout.floors, 1);
    const own = roomLighting(hall!, [layout.floors[1]], 1);
    expect(lit.cans.length).toBeGreaterThan(own.cans.length);
    // A can from another storey hangs under this floor or over its
    // ceiling.
    const away = lit.cans.filter((c) => c.floorY < -1 || c.floorY > 1);
    expect(away.length).toBeGreaterThan(0);
  });
});
