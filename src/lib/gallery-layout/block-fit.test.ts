import { describe, expect, it } from "vitest";
import { artworkListings } from "@/lib/data";
import { BLOCK_PLAN, BLOCK_WALL_COVERAGE, layoutBlock } from "./layout-block";
import { computeRoomRuns, runLength, sideClearance, type WallRun } from "./place-paintings";
import { eraOfRoom } from "./room-era";
import type { Placement, RoomLayout } from "./types";

// The block plan against the catalogue it hangs. Rico, 13 October 2026:
// "Rooms shouldn't read as sparse and room layout/sizes should fit the
// number of images that there are." A failure here after a change to
// the catalogue means an era no longer fits its rooms: give it other
// rooms (`BLOCK_PLAN[].zones`) or other walls in them (`styles`).

const layout = layoutBlock(artworkListings);

const wallOf = (room: RoomLayout) =>
  computeRoomRuns(room).reduce((sum, run) => sum + runLength(run), 0);
/** Wall a hung work covers: canvas, frame and plaque. */
const claimOf = (p: Placement) => {
  const { left, right } = sideClearance({ artwork: p.artwork, wM: p.widthM, hM: p.heightM });
  return left + p.widthM + right;
};
const hungOf = (room: RoomLayout) => room.placements.reduce((sum, p) => sum + claimOf(p), 0);

/** Each era of each floor with the rooms it hangs in. */
const zones = layout.floors.flatMap((floor) =>
  BLOCK_PLAN[floor.index].zones.map((zone) => ({
    zone,
    floor: floor.index,
    target: zone.coverage ?? BLOCK_WALL_COVERAGE,
    rooms: floor.rooms.filter((r) => !r.isStairwell && eraOfRoom(r).id === zone.era),
  })),
);

/** The bare stretches of a run: before its first work, between each
 *  pair, after its last. */
function blanks(run: WallRun, placements: Placement[]): number[] {
  const claims = placements
    .filter((p) => {
      const across = run.axis === "x" ? p.position[2] : p.position[0];
      return (
        Math.abs(across - run.surface) < 0.05 &&
        Math.abs(p.rotation[1] - run.rotationY) < 1e-6 &&
        p.divider === run.divider
      );
    })
    .map((p) => {
      const u = run.sign * (run.axis === "x" ? p.position[0] : p.position[2]);
      const { left, right } = sideClearance({ artwork: p.artwork, wM: p.widthM, hM: p.heightM });
      return [u - p.widthM / 2 - left, u + p.widthM / 2 + right];
    })
    .filter(([lo, hi]) => lo > run.uMin - 0.01 && hi < run.uMax + 0.01)
    .sort((a, b) => a[0] - b[0]);
  const out: number[] = [];
  let cursor = run.uMin;
  for (const [lo, hi] of claims) {
    out.push(lo - cursor);
    cursor = hi;
  }
  out.push(run.uMax - cursor);
  return out;
}

describe("the block plan and the catalogue", () => {
  it("gives every era the wall its works cover", () => {
    // Within 0.05 under the share of wall the plan asks for. Three
    // rooms for the 69 Gothic works were 0.12 under it.
    const thin = zones
      .map(({ zone, floor, target, rooms }) => {
        const cover =
          rooms.reduce((s, r) => s + hungOf(r), 0) / rooms.reduce((s, r) => s + wallOf(r), 0);
        return { name: `floor ${floor + 1} ${zone.era}`, cover, target };
      })
      .filter(({ cover, target }) => cover < target - 0.05 || cover > target + 0.02)
      .map(({ name, cover, target }) => `${name}: ${cover.toFixed(2)} of ${target}`);
    expect(thin).toEqual([]);
  });

  it("hangs the rooms of an era alike", () => {
    // The great hall is composed from the era's largest works and
    // hangs fuller.
    const uneven = zones.flatMap(({ zone, floor, target, rooms }) =>
      rooms
        .filter((r) => !(r.isAnchor && r.dividers.length === 0))
        .map((r) => ({ id: r.id, cover: hungOf(r) / wallOf(r) }))
        .filter(({ cover }) => Math.abs(cover - target) > 0.07)
        .map(({ id, cover }) => `floor ${floor + 1} ${zone.era} ${id}: ${cover.toFixed(2)}`),
    );
    expect(uneven).toEqual([]);
  });

  it("leaves no stretch of wall bare for 3.5 m", () => {
    let widest = 0;
    let where = "";
    for (const { rooms } of zones) {
      for (const room of rooms) {
        for (const run of computeRoomRuns(room)) {
          for (const blank of blanks(run, room.placements)) {
            if (blank > widest) {
              widest = blank;
              where = `${room.id} ${run.side}`;
            }
          }
        }
      }
    }
    expect(widest, where).toBeLessThan(3.5);
  });
});
