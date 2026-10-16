import { describe, expect, it } from "vitest";
import type { ArtworkListing } from "@/lib/data";
import { familyOf, frameReach, pickFrameDesign } from "./frame-design";
import {
  computeRoomRuns,
  distributePaintings,
  dividerWallMetres,
  estimateWallMetres,
  PAINTING_FLOOR_GAP,
  PAINTING_WALL_OFFSET,
  PLAQUE_FOOTPRINT,
  packRun,
  runLength,
  sideClearance,
  type WallRun,
} from "./place-paintings";
import type { FloorLayout, Placement, RoomLayout } from "./types";
import { CELL_SIZE, DOOR_TRIM, PORTAL_TRIM, PORTAL_WIDTH } from "./world-coords";

// Expected wall-margin and door clearance, mirrored from
// place-paintings.ts. Kept here rather than exported so the production
// module's surface stays minimal — if either moves, this test fails
// fast and we update.
const WALL_MARGIN = 0.5;
const DOOR_CLEARANCE = 0.5;

/** Where a hung work's claim on the wall starts and ends: its frame on
 *  the left, its frame and plaque on the right. */
function claim(p: Placement): [number, number] {
  const { left, right } = sideClearance(
    { artwork: p.artwork, wM: p.widthM, hM: p.heightM },
    p.frame,
  );
  return [p.position[0] - p.widthM / 2 - left, p.position[0] + p.widthM / 2 + right];
}

function makeRoom(args: {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  doors?: RoomLayout["doors"];
  dividers?: RoomLayout["dividers"];
  ceilingHeight?: number;
}): RoomLayout {
  const { xMin, xMax, zMin, zMax } = args;
  return {
    id: "r",
    floorIndex: 0,
    movement: "test",
    title: "test",
    description: "",
    isAnchor: false,
    roomNumber: 1,
    isStairwell: false,
    cellBounds: { xMin, xMax, zMin, zMax },
    worldRect: {
      xMin: xMin * CELL_SIZE,
      xMax: (xMax + 1) * CELL_SIZE,
      zMin: zMin * CELL_SIZE,
      zMax: (zMax + 1) * CELL_SIZE,
      y: 0,
    },
    doors: args.doors ?? [],
    ceilingHeight: args.ceilingHeight ?? 4.8,
    dividers: args.dividers ?? [],
    benches: [],
    placements: [],
    artworks: [],
    floorColor: "#fff",
  };
}

function makeWork(id: string, wM: number, hM: number) {
  return { artwork: { id } as ArtworkListing, wM, hM };
}

describe("computeRoomRuns", () => {
  it("insets each wall from both perpendicular walls", () => {
    const runs = computeRoomRuns(makeRoom({ xMin: 0, xMax: 2, zMin: 0, zMax: 2 }));
    // No doors → one run per wall, each the full wall minus two margins.
    expect(runs).toHaveLength(4);
    for (const run of runs) {
      expect(runLength(run)).toBeCloseTo(3 * CELL_SIZE - 2 * WALL_MARGIN, 9);
    }
  });

  it("splits a wall into two runs either side of a door", () => {
    const doorX = 1.5 * CELL_SIZE; // centre of the middle north cell
    const runs = computeRoomRuns(
      makeRoom({
        xMin: 0,
        xMax: 2,
        zMin: 0,
        zMax: 2,
        doors: [
          {
            side: "north",
            worldX: doorX,
            worldZ: 0,
            worldY: 0,
            width: 1.4,
            height: 2.4,
            portal: false,
            connectsTo: { kind: "room", roomId: "h" },
          },
        ],
      }),
    );
    const north = runs.filter((r) => r.normalZ === 1);
    expect(north).toHaveLength(2);
    // Neither run overlaps the door opening, its casing and the
    // clearance beyond it.
    const cutLo = doorX - 0.7 - DOOR_TRIM - DOOR_CLEARANCE;
    const cutHi = doorX + 0.7 + DOOR_TRIM + DOOR_CLEARANCE;
    for (const run of north) {
      // north wall has sign +1, so u is world x directly.
      expect(run.uMax <= cutLo + 1e-9 || run.uMin >= cutHi - 1e-9).toBe(true);
    }
  });
});

describe("packRun", () => {
  const [run] = computeRoomRuns(makeRoom({ xMin: 0, xMax: 3, zMin: 0, zMax: 3 })).filter(
    (r) => r.normalZ === 1,
  );

  it("gives every neighbouring pair the same gap regardless of width", () => {
    const placements = packRun(run, [
      makeWork("a", 0.3, 0.4),
      makeWork("b", 2.0, 1.5),
      makeWork("c", 0.5, 0.6),
      makeWork("d", 1.2, 1.0),
    ]);
    const sorted = [...placements].sort((a, b) => a.position[0] - b.position[0]);
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++)
      gaps.push(claim(sorted[i])[0] - claim(sorted[i - 1])[1]);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 9);
    expect(gaps[0]).toBeGreaterThan(0);
  });

  it("keeps every frame and its plaque inside the run", () => {
    const placements = packRun(run, [
      makeWork("a", 0.3, 0.4),
      makeWork("b", 2.0, 1.5),
      makeWork("c", 0.5, 0.6),
    ]);
    for (const p of placements) {
      const [lo, hi] = claim(p);
      expect(lo).toBeGreaterThanOrEqual(run.uMin - 1e-9);
      expect(hi).toBeLessThanOrEqual(run.uMax + 1e-9);
      // The claim holds a frame on both sides and the plaque on the right.
      expect(hi - lo).toBeGreaterThan(p.widthM + PLAQUE_FOOTPRINT);
    }
  });

  it("hangs the widest work in the middle of the run", () => {
    const placements = packRun(run, [
      makeWork("a", 0.3, 0.4),
      makeWork("wide", 2.0, 1.5),
      makeWork("c", 0.5, 0.6),
    ]);
    const sorted = [...placements].sort((a, b) => a.position[0] - b.position[0]);
    expect(sorted[1].artwork.id).toBe("wide");
  });

  it("centres a lone work on its run", () => {
    const placements = packRun(run, [makeWork("lonely", 0.4, 0.5)]);
    const p = placements[0];
    const [lo, hi] = claim(p);
    const leftMargin = lo - run.uMin;
    const rightMargin = run.uMax - hi;
    expect(leftMargin).toBeCloseTo(rightMargin, 9);
  });

  it("leaves a thin run's ends no barer than its middle", () => {
    // Two small works on a 9.4 m wall. Grouped in the middle at a set
    // gap, they left 3 m bare at each end.
    const placements = packRun(run, [makeWork("a", 0.4, 0.5), makeWork("b", 0.5, 0.6)]);
    const [first, second] = [...placements].sort((a, b) => a.position[0] - b.position[0]);
    const between = claim(second)[0] - claim(first)[1];
    expect(claim(first)[0] - run.uMin).toBeCloseTo(between, 9);
    expect(run.uMax - claim(second)[1]).toBeCloseTo(between, 9);
  });
});

describe("distributePaintings", () => {
  /** The bare stretches of a run, end to end: before its first work,
   *  between each pair, after its last. A run with nothing on it is one
   *  stretch. */
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
      .filter(([lo, hi]) => lo > run.uMin - 1e-6 && hi < run.uMax + 1e-6)
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

  /** Works in five sizes, large canvases and small sheets mixed, in the
   *  order a floor deals them. */
  function mixedWorks(count: number): ArtworkListing[] {
    const sizes = [
      [300, 220],
      [60, 45],
      [90, 120],
      [40, 55],
      [160, 120],
      [40, 55],
      [60, 45],
      [90, 120],
    ];
    return Array.from({ length: count }, (_, i) => {
      const [widthCm, heightCm] = sizes[i % sizes.length];
      return {
        id: `work-${i}`,
        width: 4000,
        height: Math.round((4000 * heightCm) / widthCm),
        realDimensions: { widthCm, heightCm },
      } as unknown as ArtworkListing;
    });
  }

  /** A 27.5 × 17.5 m room: a door a third of the way along its north
   *  wall, so the wall is a 6.9 m run and a 16.9 m one, and two panels
   *  standing clear of the walls. Nine runs, 4.4 to 26.9 m. */
  function hang(count: number) {
    const room = makeRoom({
      xMin: 0,
      xMax: 10,
      zMin: 0,
      zMax: 6,
      doors: [
        {
          side: "north",
          worldX: 3.5 * CELL_SIZE,
          worldZ: 0,
          worldY: 0,
          width: 2.4,
          height: 2.9,
          portal: false,
          connectsTo: { kind: "room", roomId: "x" },
        },
      ],
      dividers: [
        { axis: "x", line: 3, start: 2, end: 4 },
        { axis: "x", line: 4, start: 6, end: 8 },
      ],
    });
    room.artworks = mixedWorks(count);
    const stats = distributePaintings({ rooms: [room] } as unknown as FloorLayout);
    const perRun = computeRoomRuns(room).map((run) => blanks(run, room.placements));
    return { room, stats, perRun };
  }

  it("hangs every work of a room that has the wall for them", () => {
    const { room, stats } = hang(24);
    expect(stats.dropped).toBe(0);
    expect(room.placements).toHaveLength(24);
  });

  it("hangs every run of a room at about the same gap", () => {
    // 24 works on 102 m of wall, a third of it covered. Shared out by
    // the metres hung, the 26.9 m wall got the two large canvases and
    // stood bare for metres either side of them, while a panel with two
    // small sheets hung at a third of that gap.
    const { perRun } = hang(24);
    const all = perRun.flat().sort((a, b) => a - b);
    const median = all[Math.floor(all.length / 2)];
    expect(all[all.length - 1]).toBeLessThan(1.6 * median);
    expect(all[0]).toBeGreaterThan(0.5 * median);
  });

  it("hangs both sides of a door alike", () => {
    const { perRun } = hang(24);
    // The first two runs are the north wall's, west and east of the door.
    const [short, long] = perRun;
    expect(short[0] / long[0]).toBeGreaterThan(0.75);
    expect(short[0] / long[0]).toBeLessThan(1.33);
  });

  it("leaves no run bare while another holds two works", () => {
    // Fewer works than would fill the room: one to a run comes first.
    const { perRun } = hang(11);
    const bare = perRun.filter((gaps) => gaps.length === 1).length;
    expect(bare).toBe(0);
  });

  it("gives the long walls the large canvases", () => {
    const { room } = hang(24);
    const onPanel = room.placements.filter((p) => p.divider !== undefined);
    const widest = Math.max(...onPanel.map((p) => p.widthM));
    expect(widest).toBeLessThan(2);
  });
});

describe("the frames a room chose", () => {
  const [run] = computeRoomRuns(makeRoom({ xMin: 0, xMax: 3, zMin: 0, zMax: 3 })).filter(
    (r) => r.normalZ === 1,
  );
  // Four works whose own frames are slim, and one heavy frame from
  // another work to hang them all in.
  const ids = Array.from({ length: 300 }, (_, i) => `w${i}`);
  const reachOf = (id: string) => frameReach(pickFrameDesign({ id }), 0.8, 0.8);
  const slim = ids.filter((id) => reachOf(id) < 0.07).slice(0, 4);
  const heavy = pickFrameDesign({ id: ids.find((id) => reachOf(id) > 0.12) ?? "" });
  const works = slim.map((id) => makeWork(id, 0.8, 0.8));
  const frames = works.map(() => heavy);

  it("hangs them, and measures the wall with them", () => {
    expect(slim).toHaveLength(4);
    const placements = packRun(run, works, undefined, frames);
    expect(placements.map((p) => p.frame)).toEqual(frames);
    const sorted = [...placements].sort((a, b) => a.position[0] - b.position[0]);
    const gaps = sorted.slice(1).map((p, i) => claim(p)[0] - claim(sorted[i])[1]);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 9);
    // Hung in their own frames the same works stand closer together.
    const own = [...packRun(run, works)].sort((a, b) => a.position[0] - b.position[0]);
    expect(own.map((p) => p.frame)).toEqual([undefined, undefined, undefined, undefined]);
    expect(sorted[1].position[0] - sorted[0].position[0]).not.toBeCloseTo(
      own[1].position[0] - own[0].position[0],
      3,
    );
  });

  it("goes back to a work's own frame on a run the chosen ones overfill", () => {
    // A run that holds the works in their own frames and no more.
    const own = works.reduce((sum, work) => {
      const { left, right } = sideClearance(work);
      return sum + left + work.wM + right;
    }, 0);
    const full = { ...run, uMax: run.uMin + own + 0.1 * (works.length - 1) + 0.02 };
    const placements = packRun(full, works, undefined, frames);
    expect(placements.filter((p) => !p.frame).length).toBeGreaterThan(0);
    const sorted = [...placements].sort((a, b) => a.position[0] - b.position[0]);
    expect(claim(sorted[0])[0]).toBeGreaterThanOrEqual(full.uMin - 1e-9);
    expect(claim(sorted[sorted.length - 1])[1]).toBeLessThanOrEqual(full.uMax + 1e-9);
    const overlaps = sorted.slice(1).filter((p, i) => claim(p)[0] < claim(sorted[i])[1] - 1e-9);
    expect(overlaps).toEqual([]);
  });

  it("frames a room's works together when it hangs them", () => {
    // Post-Impressionists on their ochre wall: floor 9 of the tower.
    const artworks = Array.from({ length: 30 }, (_, i) => ({
      id: `p${i}`,
      movement: "Post-Impressionism",
      year: 1890,
      width: 1200,
      height: 1000,
      realDimensions: { widthCm: 90, heightCm: 75 },
    })) as unknown as ArtworkListing[];
    const room = { ...makeRoom({ xMin: 0, xMax: 5, zMin: 0, zMax: 5 }), floorIndex: 9, artworks };
    const stats = distributePaintings({ rooms: [room] } as unknown as FloorLayout);
    expect(stats.placed).toBe(artworks.length);
    expect(room.placements.filter((p) => !p.frame)).toEqual([]);

    const families = (designs: Array<NonNullable<Placement["frame"]>>) => {
      const counts = new Map<string | null, number>();
      for (const d of designs) {
        const family = familyOf(d.look, d.slots[0].finish);
        counts.set(family, (counts.get(family) ?? 0) + 1);
      }
      return Math.max(...counts.values()) / designs.length;
    };
    const hung = room.placements.flatMap((p) => (p.frame ? [p.frame] : []));
    const own = artworks.map((a) => pickFrameDesign(a));
    expect(families(own)).toBeLessThan(0.65);
    expect(families(hung)).toBeGreaterThan(0.8);
    // Nothing the colour of the wall.
    const lost = hung.map((d) => d.slots[0].finish).filter((f) => ["maple", "ash"].includes(f));
    expect(lost).toEqual([]);
  });
});

describe("divider runs", () => {
  // A 22.5 × 12.5 m room with one wing wall built off its north wall
  // and one panel standing free, both across the room (along z).
  const wing = { axis: "z" as const, line: 3, start: 0, end: 1 };
  const panel = { axis: "x" as const, line: 3, start: 5, end: 8 };
  const bounds = { xMin: 0, xMax: 8, zMin: 0, zMax: 4 };
  const room = makeRoom({ ...bounds, dividers: [wing, panel] });
  const runs = computeRoomRuns(room);

  it("offers both faces of a divider, half its thickness off the grid line", () => {
    const faces = runs.filter((r) => r.divider === 0);
    expect(faces).toHaveLength(2);
    const west = faces.find((r) => r.normalX === 1);
    const east = faces.find((r) => r.normalX === -1);
    expect(west?.surface).toBeCloseTo(3 * CELL_SIZE + 0.2, 9);
    expect(east?.surface).toBeCloseTo(3 * CELL_SIZE - 0.2, 9);
    for (const face of faces) {
      expect(face.axis).toBe("z");
      expect(runLength(face)).toBeCloseTo(CELL_SIZE - 2 * WALL_MARGIN, 9);
    }
  });

  it("hangs a work on a divider's face, facing out of it", () => {
    const face = runs.find((r) => r.divider === 1 && r.normalZ === 1);
    expect(face).toBeDefined();
    const [placement] = packRun(face as NonNullable<typeof face>, [makeWork("a", 1.2, 0.9)]);
    expect(placement.divider).toBe(1);
    // On the panel's south face, inside its length.
    expect(placement.position[2]).toBeCloseTo(3 * CELL_SIZE + 0.2 + PAINTING_WALL_OFFSET, 9);
    expect(placement.position[0]).toBeGreaterThan(5 * CELL_SIZE);
    expect(placement.position[0]).toBeLessThan(8 * CELL_SIZE);
    expect(placement.rotation[1]).toBe(0);
  });

  it("does not mark a work on a room wall", () => {
    const wall = runs.find((r) => r.divider === undefined);
    const [placement] = packRun(wall as NonNullable<typeof wall>, [makeWork("a", 1, 1)]);
    expect(placement.divider).toBeUndefined();
  });

  it("leaves a pier between a portal and a wing wall bare", () => {
    // Rico, 17 October 2026, of a small canvas on 1.15 m of wall between
    // a portal's casing and a wing wall: "too close to the divider wall
    // and also too close to the door frame". A portal centred on cell 1
    // and a wing wall on line 3: 1.66 m of plaster between the casing
    // and the wing wall's face, the shape of the wall he saw.
    const pier = computeRoomRuns(
      makeRoom({
        ...bounds,
        dividers: [wing],
        doors: [
          {
            side: "north",
            worldX: 1.5 * CELL_SIZE,
            worldZ: 0,
            worldY: 0,
            width: PORTAL_WIDTH,
            height: 3,
            portal: true,
            connectsTo: { kind: "room", roomId: "h" },
          },
        ],
      }),
    ).filter((r) => r.side === "north" && r.divider === undefined);
    // 1.86 m of plaster between the corner and the casing, 1.66 m
    // between the casing and the wing wall: neither hangs.
    expect(pier.map((r) => r.uMin)).toEqual([3 * CELL_SIZE + 0.2 + WALL_MARGIN]);
    const casing = 1.5 * CELL_SIZE + PORTAL_WIDTH / 2 + PORTAL_TRIM;
    expect(3 * CELL_SIZE - 0.2 - casing).toBeCloseTo(1.66, 9);
  });

  it("cuts the wall a wing wall is built off, and no other", () => {
    const north = runs.filter((r) => r.side === "north" && r.divider === undefined);
    expect(north).toHaveLength(2);
    // Each stops a margin short of the wing wall's face.
    expect(north[0].uMax).toBeCloseTo(3 * CELL_SIZE - 0.2 - WALL_MARGIN, 9);
    expect(north[1].uMin).toBeCloseTo(3 * CELL_SIZE + 0.2 + WALL_MARGIN, 9);
    const south = runs.filter((r) => r.side === "south" && r.divider === undefined);
    expect(south).toHaveLength(1);
  });

  it("counts the wall dividers add to the metre", () => {
    const length = (list: ReturnType<typeof computeRoomRuns>) =>
      list.reduce((sum, r) => sum + runLength(r), 0);
    const bare = length(computeRoomRuns(makeRoom(bounds)));
    expect(dividerWallMetres(bounds, [wing, panel])).toBeCloseTo(length(runs) - bare, 9);
    // The room's own walls are still what the estimate says they are.
    expect(bare).toBeCloseTo(estimateWallMetres(9 * CELL_SIZE, 5 * CELL_SIZE, 0), 9);
  });
});

describe("a door screen", () => {
  // A 17.5 m room with a screen in front of a door in its east wall:
  // on line 6, a cell in from the wall on line 7, its back to the door.
  const bounds = { xMin: 0, xMax: 6, zMin: 0, zMax: 6 };
  const screen = { axis: "z" as const, line: 6, start: 2.5, end: 4.5, bare: "high" as const };
  const sheet = (id: string, widthCm: number, heightCm: number) =>
    ({
      id,
      width: 4000,
      height: Math.round((4000 * heightCm) / widthCm),
      realDimensions: { widthCm, heightCm },
    }) as unknown as ArtworkListing;
  const hang = (artworks: ArtworkListing[]) => {
    const room = { ...makeRoom({ ...bounds, dividers: [screen] }), artworks };
    distributePaintings({ rooms: [room] } as unknown as FloorLayout);
    return room.placements;
  };

  it("offers the face toward the room and not the one toward the door", () => {
    const faces = computeRoomRuns(makeRoom({ ...bounds, dividers: [screen] })).filter(
      (r) => r.divider === 0,
    );
    expect(faces).toHaveLength(1);
    // Looking west, into the room, 0.2 m west of the line.
    expect(faces[0].normalX).toBe(-1);
    expect(faces[0].surface).toBeCloseTo(6 * CELL_SIZE - 0.2, 9);
    expect(runLength(faces[0])).toBeCloseTo(2 * CELL_SIZE - 2 * WALL_MARGIN, 9);
    expect(faces[0].feature).toBe(true);
    expect(dividerWallMetres(bounds, [screen])).toBeCloseTo(runLength(faces[0]), 9);
  });

  it("hangs it with one picture: the room's largest that fits", () => {
    const placements = hang([
      sheet("small", 60, 45),
      sheet("large", 240, 180),
      sheet("middle", 120, 90),
      // 4 m of wall less a frame and a plaque: too wide for it.
      ...Array.from({ length: 12 }, (_, i) => sheet(`more-${i}`, 90, 70)),
    ]);
    const onScreen = placements.filter((p) => p.divider === 0);
    expect(onScreen.map((p) => p.artwork.id)).toEqual(["large"]);
    // In the middle of the screen, facing west.
    expect(onScreen[0].position[2]).toBeCloseTo(3.5 * CELL_SIZE, 1);
    expect(onScreen[0].position[0]).toBeLessThan(6 * CELL_SIZE - 0.2);
    expect(placements).toHaveLength(15);
  });

  it("hangs it like any wall in a room of small sheets", () => {
    const placements = hang(Array.from({ length: 40 }, (_, i) => sheet(`print-${i}`, 40, 55)));
    expect(placements.filter((p) => p.divider === 0).length).toBeGreaterThan(1);
  });
});

describe("ceiling height and the hang", () => {
  it("caps a low room's works under its ceiling and off its floor", () => {
    const low = computeRoomRuns(
      makeRoom({ xMin: 0, xMax: 3, zMin: 0, zMax: 3, ceilingHeight: 4.0 }),
    );
    expect(low.every((r) => Math.abs(r.maxHeight - 2.6) < 1e-9)).toBe(true);
    const [placement] = packRun(low[0], [makeWork("tall", 1.6, 3.2)]);
    expect(placement.heightM).toBeCloseTo(2.6, 9);
    expect(placement.position[1] + placement.heightM / 2).toBeLessThan(4.0 - 0.3);
    // The canvas, not just its centre, clears the floor by the gap.
    expect(placement.position[1] - placement.heightM / 2).toBeGreaterThanOrEqual(
      PAINTING_FLOOR_GAP,
    );
  });

  it("does not hang taller works under a taller ceiling", () => {
    const standard = computeRoomRuns(makeRoom({ xMin: 0, xMax: 3, zMin: 0, zMax: 3 }));
    const tall = computeRoomRuns(
      makeRoom({ xMin: 0, xMax: 3, zMin: 0, zMax: 3, ceilingHeight: 5.7 }),
    );
    expect(standard[0].maxHeight).toBe(3.2);
    expect(tall[0].maxHeight).toBe(3.2);
  });
});

describe("estimateWallMetres", () => {
  it("takes a portal's extra width off the wall", () => {
    expect(estimateWallMetres(20, 10, 3, 1)).toBeCloseTo(
      estimateWallMetres(20, 10, 3) - 2.1 - 2 * (PORTAL_TRIM - DOOR_TRIM),
      9,
    );
  });
});
