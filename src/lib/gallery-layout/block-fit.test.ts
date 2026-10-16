import { describe, expect, it } from "vitest";
import { artworkListings } from "@/lib/data";
import { assignEra } from "@/lib/gallery-eras";
import { trustworthyRealSize } from "@/lib/real-size";
import { frameExtents, pickFrameDesign } from "./frame-design";
import { giantSize, tallSize } from "./giants";
import { BLOCK_PLAN, BLOCK_SPIRALS, BLOCK_WALL_COVERAGE, layoutBlock } from "./layout-block";
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

  it("hangs no work smaller than its real size", () => {
    // Rico, 17 October 2026: "I want the paintings in their real
    // sizes", in the galleries as in the halls. A work whose size is
    // trusted hangs at that size or not at all.
    const shrunk: string[] = [];
    for (const floor of layout.floors) {
      for (const room of floor.rooms) {
        for (const p of room.placements) {
          const size = trustworthyRealSize(p.artwork);
          if (!size) continue;
          const real = Math.max(size.widthCm, size.heightCm) / 100;
          const hung = Math.max(p.widthM, p.heightM);
          if (hung < real - 1e-6) shrunk.push(`${room.id} ${p.artwork.id}: ${hung} of ${real}`);
        }
      }
    }
    expect(shrunk).toEqual([]);
  });

  it("hangs tall works in the spiral rooms, of their own floor, in mirrored pairs", () => {
    // Rico, 17 October 2026: "the spiral stair case rooms could also
    // hold tall paintings nicely". Every floor whose eras have tall
    // works no gallery hung fills both its spiral storeys.
    const spirals = layout.allRooms.filter((r) =>
      BLOCK_SPIRALS.some((s) => r.id.endsWith(`-${s.key}`)),
    );
    const wrong: string[] = [];
    for (const room of spirals) {
      const eras = BLOCK_PLAN[room.floorIndex].zones.map((z) => z.era);
      for (const p of room.placements) {
        if (!giantSize(p.artwork) && !tallSize(p.artwork))
          wrong.push(`${room.id} ${p.artwork.id}: not tall`);
        if (!eras.includes(assignEra(p.artwork)!))
          wrong.push(`${room.id} ${p.artwork.id}: other floor`);
        if (!p.giant) wrong.push(`${room.id} ${p.artwork.id}: has a picture light`);
      }
      // A work on a side wall has its pair on the other, their frames
      // standing at one height.
      const sides = room.placements.filter(
        (p) => Math.abs(Math.abs(p.rotation[1]) - Math.PI / 2) < 1e-6,
      );
      const bottom = (p: Placement) =>
        p.position[1] -
        p.heightM / 2 -
        frameExtents(p.frame ?? pickFrameDesign(p.artwork), p.widthM, p.heightM).bottom;
      for (const p of sides) {
        const twin = sides.find(
          (q) =>
            q !== p &&
            Math.abs(q.position[2] - p.position[2]) < 1e-6 &&
            Math.abs(bottom(q) - bottom(p)) < 1e-6,
        );
        if (!twin) wrong.push(`${room.id} ${p.artwork.id}: no pair`);
      }
    }
    expect(wrong).toEqual([]);
    const counts = spirals.map((r) => `${r.id} ${r.placements.length}`);
    const full = spirals.filter((r) => r.floorIndex < 3 && r.placements.length >= 6);
    expect(full.length, counts.join(", ")).toBe(6);
  });
});
