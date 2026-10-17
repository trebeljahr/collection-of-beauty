import { describe, expect, it } from "vitest";
import { artworkListings } from "@/lib/data";
import { layoutBlock } from "./layout-block";
import {
  BASE_POOL_BYTE_BUDGET,
  baseTextureBytes,
  baseVariantWidth,
  DETOUR_M,
  estimateTextureBytes,
  grantReveals,
  HOLD_M,
  PREFETCH_REACH_M,
  prefetchRooms,
  REVEAL_BYTE_BUDGET,
  type RevealClaim,
  roomRevealBytes,
} from "./reveal-budget";
import { FLOOR_SEPARATION } from "./world-coords";

const claim = (over: Partial<RevealClaim>): RevealClaim => ({
  cost: 10,
  distance: 0,
  rise: 0,
  doors: [],
  shaft: null,
  asks: true,
  holds: false,
  ...over,
});
const rooms = (entries: Record<string, Partial<RevealClaim>>) =>
  new Map(Object.entries(entries).map(([id, over]) => [id, claim(over)]));
const granted = (entries: Record<string, Partial<RevealClaim>>, budget: number) =>
  [...grantReveals(rooms(entries), budget)].sort();

describe("base texture cost", () => {
  it("takes the 480 px variant, or the smallest there is", () => {
    expect(baseVariantWidth({ variantWidths: [256, 480, 960, 1920] })).toBe(480);
    expect(baseVariantWidth({ variantWidths: [960, 1920] })).toBe(960);
    expect(baseVariantWidth({ variantWidths: null })).toBe(480);
  });

  it("is the variant's pixels, which a narrow source caps", () => {
    const widths = [256, 480, 960];
    expect(baseTextureBytes({ variantWidths: widths, width: 4000, height: 3000 })).toBe(
      estimateTextureBytes(480, 360),
    );
    expect(baseTextureBytes({ variantWidths: widths, width: 300, height: 600 })).toBe(
      estimateTextureBytes(300, 600),
    );
  });
});

describe("grantReveals", () => {
  it("grants every room that asks while the pool holds them", () => {
    expect(granted({ a: {}, b: { distance: 5 }, c: { distance: 9, asks: false } }, 100)).toEqual([
      "a",
      "b",
    ]);
  });

  it("gives the pool to the nearest rooms", () => {
    expect(
      granted(
        {
          far: { distance: 12, cost: 40 },
          near: { distance: 2, cost: 40 },
          own: { cost: 40 },
        },
        100,
      ),
    ).toEqual(["near", "own"]);
  });

  it("grants the first room whatever it costs", () => {
    expect(granted({ own: { cost: 500 }, next: { distance: 3, cost: 1 } }, 100)).toEqual(["own"]);
  });

  it("passes over a room that does not fit for a smaller one further off", () => {
    expect(
      granted(
        {
          own: { cost: 60 },
          large: { distance: 2, cost: 60 },
          small: { distance: 9, cost: 30 },
        },
        100,
      ),
    ).toEqual(["own", "small"]);
  });

  it("puts a room behind a wall after the rooms a door leads to", () => {
    const plan = {
      own: { cost: 40 },
      // Shares a wall with the visitor's room, and no door.
      walled: { distance: 1, cost: 40 },
      // Through a door at the far end of the room.
      doored: { distance: DETOUR_M - 1, cost: 40, doors: ["own"] },
    };
    expect(granted(plan, 100)).toEqual(["doored", "own"]);
    // In a doorway the visitor stands in both rooms.
    expect(
      granted({ ...plan, own: { cost: 40, distance: 0.5 }, walled: { cost: 40 } }, 100),
    ).toEqual(["own", "walled"]);
  });

  it("does not count a door to the storey overhead", () => {
    const plan = {
      // The stairwell a storey up: the visitor is under its floor.
      "upper-well": { cost: 0, rise: FLOOR_SEPARATION, asks: false },
      "upper-room": { distance: 6, rise: FLOOR_SEPARATION, cost: 60, doors: ["upper-well"] },
      "lower-well": { cost: 0, asks: false },
      "lower-room": { distance: 6, cost: 60, doors: ["lower-well"] },
    };
    expect(granted(plan, 100)).toEqual(["lower-room"]);
    // Three quarters of the way up the spiral both storeys are at hand,
    // and the nearer floor wins.
    const climbing = {
      ...plan,
      "upper-well": { ...plan["upper-well"], rise: 0.25 * FLOOR_SEPARATION },
      "upper-room": { ...plan["upper-room"], rise: 0.25 * FLOOR_SEPARATION },
      "lower-well": { ...plan["lower-well"], rise: 0.75 * FLOOR_SEPARATION - 0.01 },
      "lower-room": { ...plan["lower-room"], rise: 0.75 * FLOOR_SEPARATION - 0.01 },
    };
    expect(granted(climbing, 100)).toEqual(["upper-room"]);
  });

  it("ranks the storeys of a hall as one room", () => {
    const hall = (storey: number, over: Partial<RevealClaim> = {}) => ({
      cost: 30,
      shaft: "hall",
      rise: storey * FLOOR_SEPARATION,
      ...over,
    });
    // From the hall's floor: every storey before the gallery its door
    // leads to.
    expect(
      granted(
        {
          "hall-0": hall(0),
          "hall-1": hall(1),
          "hall-2": hall(2),
          gallery: { cost: 30, distance: 5, doors: ["hall-0"] },
        },
        100,
      ),
    ).toEqual(["hall-0", "hall-1", "hall-2"]);
    // From that gallery: the hall behind its door on every storey,
    // before a second gallery further off.
    expect(
      granted(
        {
          own: { cost: 20, doors: ["hall-0", "second"] },
          "hall-0": hall(0, { cost: 20, distance: 8, doors: ["own"] }),
          "hall-1": hall(1, { cost: 20, distance: 8 }),
          "hall-2": hall(2, { cost: 20, distance: 8 }),
          second: { cost: 40, distance: 10, doors: ["own"] },
        },
        100,
      ),
    ).toEqual(["hall-0", "hall-1", "hall-2", "own"]);
  });

  it("keeps a room in full until another is 3 m nearer", () => {
    const at = (held: number, other: number, holds: "held" | "other") =>
      granted(
        {
          own: { cost: 40 },
          held: { distance: held, cost: 40, doors: ["own"], holds: holds === "held" },
          other: { distance: other, cost: 40, doors: ["own"], holds: holds === "other" },
        },
        100,
      );
    expect(at(8, 8 - HOLD_M + 0.1, "held")).toEqual(["held", "own"]);
    expect(at(8, 8 - HOLD_M - 0.1, "held")).toEqual(["other", "own"]);
    // And the room that took its place keeps it on the way back.
    expect(at(8 - HOLD_M + 0.1, 8, "other")).toEqual(["other", "own"]);
  });
});

describe("the plans against the pool", () => {
  it("leaves room in the pool beside the works in full", () => {
    expect(REVEAL_BYTE_BUDGET).toBeLessThan(BASE_POOL_BYTE_BUDGET);
  });

  it("fits any one room of the plan", () => {
    // The room the visitor stands in is granted whatever it costs. A
    // room over the budget would be the pool overrun this module stops.
    let largest = { id: "", bytes: 0 };
    for (const floor of layoutBlock(artworkListings).floors) {
      for (const room of floor.rooms) {
        const bytes = roomRevealBytes(room);
        if (bytes > largest.bytes) largest = { id: room.id, bytes };
      }
    }
    expect(largest.bytes, largest.id).toBeGreaterThan(0);
    expect(largest.bytes, largest.id).toBeLessThanOrEqual(REVEAL_BYTE_BUDGET);
  });
});

describe("prefetchRooms", () => {
  const prefetch = (
    entries: Record<string, Partial<RevealClaim> & { eligible?: boolean }>,
    grantedIds: string[] = [],
  ) =>
    prefetchRooms(
      new Map(
        Object.entries(entries).map(([id, { eligible = true, ...over }]) => [
          id,
          { ...claim(over), eligible },
        ]),
      ),
      new Set(grantedIds),
    );

  it("lists the near rooms not in full, nearest first", () => {
    expect(
      prefetch(
        {
          own: { doors: ["next", "far"] },
          next: { distance: 20, doors: ["own"] },
          far: { distance: 30, doors: ["own"] },
          beyond: { distance: PREFETCH_REACH_M + 1, doors: ["own"] },
        },
        ["own"],
      ),
    ).toEqual(["next", "far"]);
  });

  it("counts a room behind a wall further off", () => {
    const reach = PREFETCH_REACH_M - DETOUR_M;
    expect(
      prefetch({
        own: { asks: false, cost: 0 },
        behind: { distance: reach - 1 },
        behindFar: { distance: reach + 1 },
      }),
    ).toEqual(["behind"]);
  });

  it("skips rooms with no works and storeys that show none", () => {
    expect(
      prefetch({
        own: { cost: 0 },
        upstairs: { distance: 2, eligible: false },
        next: { distance: 4 },
      }),
    ).toEqual(["next"]);
  });
});
